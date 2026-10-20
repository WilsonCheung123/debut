// The music state and the Spotify integration (SPEC 4.9).
//
// One Spotify playlist embed, driven through Spotify's iFrame API, lives in a
// "dock": a fixed element in #ui that is laid over the turntable panel's slot
// while that panel is open and parked offscreen (still alive, still playing)
// when it is not. The iframe never moves in the DOM, so closing the panel
// does not reload it and the music keeps going: the record spins at rest,
// and the Austen trick (engine/focus.ts) has something to pause.
//
// Verified against developer.spotify.com (iFrame API reference, 2026-10):
//   script  https://open.spotify.com/embed/iframe-api/v1   (async)
//   window.onSpotifyIframeApiReady(IFrameAPI)
//   IFrameAPI.createController(element, { uri, width, height }, cb)  — element is REPLACED by the iframe
//   controller.addListener('ready' | 'playback_started' | 'playback_update', e => e.data)
//   playback_update: { playingURI, isPaused, isBuffering, duration, position }
//   controller.play() / pause() / resume() / togglePlay() / destroy()
//
// state.music.isPlaying is the single source of truth (the engine writes it
// directly for the trick; QA stubs it). The embed's playback_update events set
// it; the visitor's own toggle sets it when the embed cannot report state.

import { state } from './state';

export const PLAYLIST_ID = '2UsGkMoSFLxP51roLefR0v';
export const PLAYLIST_URI = `spotify:playlist:${PLAYLIST_ID}`;
export const PLAYLIST_URL = `https://open.spotify.com/playlist/${PLAYLIST_ID}`;
export const EMBED_HEIGHT = 352;
const API_SRC = 'https://open.spotify.com/embed/iframe-api/v1';
/** How long to wait for the API / the embed before falling back to the visitor's toggle. */
const API_TIMEOUT = 9000;

export type MusicStatus = 'idle' | 'loading' | 'ready' | 'fallback';
export type MusicSource = 'embed' | 'visitor' | 'engine';

interface PlaybackEvent { data: { playingURI?: string; isPaused?: boolean; isBuffering?: boolean; duration?: number; position?: number } }
interface EmbedController {
  play(): void; pause(): void; resume(): void; togglePlay(): void; destroy(): void;
  addListener(event: 'ready' | 'playback_started' | 'playback_update', fn: (e: PlaybackEvent) => void): void;
}
interface IFrameAPI {
  createController(el: HTMLElement, opts: { uri: string; width?: string | number; height?: string | number }, cb: (c: EmbedController) => void): void;
}
declare global {
  interface Window { onSpotifyIframeApiReady?: (api: IFrameAPI) => void }
}

type Listener = (playing: boolean, source: MusicSource) => void;
type StatusListener = (status: MusicStatus) => void;

class Music {
  status: MusicStatus = 'idle';
  /** True once the embed has reported playback state at least once (then the record follows Spotify). */
  reportsState = false;
  private controller: EmbedController | null = null;
  private dock: HTMLDivElement | null = null;
  private slot: HTMLElement | null = null;
  private raf = 0;
  private timer = 0;
  private readonly listeners = new Set<Listener>();
  private readonly statusListeners = new Set<StatusListener>();
  /** What the embed last said (null until it has said anything). */
  private embedPaused: boolean | null = null;
  private expectTimer = 0;

  constructor() {
    state.music.pause = () => this.pause();
  }

  get playing(): boolean { return state.music.isPlaying; }

  /** Sets the playing state (the embed, the visitor's toggle, or the engine) and tells listeners. */
  setPlaying(v: boolean, source: MusicSource = 'visitor'): void {
    state.music.isPlaying = v;
    this.notify(source);
  }

  private notify(source: MusicSource): void {
    for (const fn of this.listeners) { try { fn(state.music.isPlaying, source); } catch (e) { console.error(e); } }
  }

  onChange(fn: Listener): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  onStatus(fn: StatusListener): () => void { this.statusListeners.add(fn); return () => { this.statusListeners.delete(fn); }; }

  private setStatus(s: MusicStatus): void {
    if (s === this.status) return;
    this.status = s;
    for (const fn of this.statusListeners) { try { fn(s); } catch (e) { console.error(e); } }
  }

  /** Pauses the embed (if it is up) and marks the music stopped. The Austen trick calls this. */
  pause(): void {
    try { this.controller?.pause(); } catch (e) { console.error(e); }
    this.setPlaying(false, 'engine');
  }

  /**
   * Resume / play through the API. The state is set optimistically and
   * corrected by playback_update; if the embed has been reporting state and
   * stays paused (Safari blocks play() without a gesture inside the iframe),
   * the optimism is withdrawn after a moment.
   */
  resume(): void {
    // forget the last report: only a report that arrives after this call counts as a refusal
    this.embedPaused = null;
    try { this.controller?.resume(); } catch (e) { console.error(e); }
    this.setPlaying(true, 'visitor');
    clearTimeout(this.expectTimer);
    this.expectTimer = window.setTimeout(() => {
      if (this.reportsState && this.embedPaused === true && state.music.isPlaying) this.setPlaying(false, 'embed');
    }, 4000);
  }

  toggle(): void {
    if (this.playing) this.pause(); else this.resume();
  }

  /**
   * Loads the iFrame API and creates the embed, once, on first call (the
   * turntable's first focus). Safe to call again: it only re-attaches.
   */
  load(): void {
    if (this.status !== 'idle') return;
    this.setStatus('loading');
    const dock = this.ensureDock();
    const target = document.createElement('div');
    dock.append(target);
    const giveUp = (): void => { if (this.status === 'loading') this.setStatus('fallback'); };
    this.timer = window.setTimeout(giveUp, API_TIMEOUT);

    window.onSpotifyIframeApiReady = (api) => {
      if (this.status !== 'loading') return;
      try {
        api.createController(target, { uri: PLAYLIST_URI, width: '100%', height: EMBED_HEIGHT }, (controller) => {
          this.controller = controller;
          controller.addListener('ready', () => {
            clearTimeout(this.timer);
            this.setStatus('ready');
          });
          controller.addListener('playback_update', (e) => {
            const paused = e?.data?.isPaused;
            if (typeof paused !== 'boolean') return;
            this.reportsState = true;
            this.embedPaused = paused;
            if (paused === state.music.isPlaying) this.setPlaying(!paused, 'embed');
          });
          controller.addListener('playback_started', () => {
            this.reportsState = true;
            this.embedPaused = false;
            if (!state.music.isPlaying) this.setPlaying(true, 'embed');
          });
        });
      } catch (e) {
        console.error(e);
        giveUp();
      }
    };
    const script = document.createElement('script');
    script.src = API_SRC;
    script.async = true;
    script.onerror = () => { clearTimeout(this.timer); giveUp(); };
    document.head.append(script);
  }

  private ensureDock(): HTMLDivElement {
    if (this.dock) return this.dock;
    const dock = document.createElement('div');
    dock.id = 'spotify-dock';
    dock.setAttribute('aria-hidden', 'true');
    dock.style.cssText = 'position:absolute;left:0;top:0;width:384px;height:352px;overflow:hidden;border-radius:12px;visibility:hidden;pointer-events:none;transform:translate(-200vw,0);will-change:transform;z-index:3;';
    (document.getElementById('ui') ?? document.body).append(dock);
    this.dock = dock;
    return dock;
  }

  /** Lays the dock over `slot` (inside the panel) every frame until detach(). */
  attach(slot: HTMLElement): void {
    const dock = this.ensureDock();
    this.slot = slot;
    dock.removeAttribute('aria-hidden');
    const paper = slot.closest<HTMLElement>('.paper');
    const body = slot.closest<HTMLElement>('.body');
    const sync = (): void => {
      if (this.slot !== slot) return;
      const r = slot.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) { dock.style.visibility = 'hidden'; dock.style.pointerEvents = 'none'; }
      else {
        dock.style.transform = `translate(${Math.round(r.left)}px, ${Math.round(r.top)}px)`;
        dock.style.width = `${Math.round(r.width)}px`;
        dock.style.height = `${Math.round(r.height)}px`;
        // clip to the scrolling body so the embed does not float over the panel's header or edge
        if (body) {
          const b = body.getBoundingClientRect();
          const top = Math.max(0, b.top - r.top), bottom = Math.max(0, r.bottom - b.bottom);
          dock.style.clipPath = top > 0 || bottom > 0 ? `inset(${top}px 0 ${bottom}px 0 round 12px)` : '';
        }
        const op = paper ? Number(getComputedStyle(paper).opacity) : 1;
        dock.style.opacity = String(op);
        dock.style.visibility = op > 0.02 ? 'visible' : 'hidden';
        dock.style.pointerEvents = op > 0.9 ? 'auto' : 'none';
      }
      this.raf = requestAnimationFrame(sync);
    };
    cancelAnimationFrame(this.raf);
    sync();
  }

  /** Parks the dock offscreen (the iframe stays alive and keeps playing). */
  detach(): void {
    this.slot = null;
    cancelAnimationFrame(this.raf);
    if (!this.dock) return;
    this.dock.style.visibility = 'hidden';
    this.dock.style.pointerEvents = 'none';
    this.dock.style.clipPath = '';
    this.dock.style.transform = 'translate(-200vw, 0)';
    this.dock.setAttribute('aria-hidden', 'true');
  }

  /** Test hooks (window.__table.music): QA drives the trick without Spotify. */
  get hooks() {
    return {
      setPlaying: (v: boolean) => this.setPlaying(v, 'visitor'),
      get playing() { return state.music.isPlaying; },
      status: () => this.status,
      reportsState: () => this.reportsState,
      hasController: () => this.controller !== null,
      /** What the embed itself last reported (null before its first playback_update). */
      embedPaused: () => this.embedPaused,
      resume: () => this.resume(),
      pause: () => this.pause(),
    };
  }
}

export const music = new Music();
