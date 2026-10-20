// The music state and the YouTube integration (SPEC 0.2 "Music", 4.9).
//
// One YouTube player, driven through the IFrame Player API, lives in a
// "dock": a fixed element in #ui that is laid over the turntable panel's slot
// while that panel is open and parked offscreen (still alive, still playing)
// when it is not. The iframe never moves in the DOM, so closing the panel
// does not reload it and the music keeps going: the record spins at rest,
// and the Austen trick (engine/focus.ts) has something to pause.
//
// Verified against developers.google.com/youtube/iframe_api_reference (2026-10):
//   script  https://www.youtube.com/iframe_api   (async)
//   window.onYouTubeIframeAPIReady()
//   new YT.Player(element, { width, height, videoId, playerVars, events })  — element is REPLACED by the iframe
//   playerVars: playsinline, rel, origin, enablejsapi, iv_load_policy, playlist (comma ids), list + listType ('playlist')
//   events: onReady, onStateChange (data: -1 unstarted, 0 ENDED, 1 PLAYING, 2 PAUSED, 3 BUFFERING, 5 CUED),
//           onError (2, 5, 100, 101, 150, 153), onAutoplayBlocked
//   player.playVideo() / pauseVideo() / nextVideo() / previousVideo() / getPlayerState() /
//          getPlaylist() / getPlaylistIndex() / getVideoData() / destroy()
//   (modestbranding is deprecated since 2023 and does nothing.)
//
// Autoplay policy: the player is CUED, never loaded; the first play is the
// visitor's click (our toggle, the record, or the player's own button).
//
// state.music.isPlaying is the single source of truth (the engine writes it
// directly for the trick; QA stubs it). The player's onStateChange sets it;
// the visitor's own toggle sets it when the player cannot be reached.

import { state } from './state';
import { TRACKS, YOUTUBE_PLAYLIST, type Track } from './content/music';

export { PLAYLIST_URL, PLAYLIST_TITLE } from './content/music';
const API_SRC = 'https://www.youtube.com/iframe_api';
/** How long to wait for the API / the player before falling back to the visitor's toggle. */
const API_TIMEOUT = 9000;
/** A video ending inside a playlist reports ENDED, then the next one buffers: wait this long before lifting the arm. */
const ENDED_GRACE = 1500;

export type MusicStatus = 'idle' | 'loading' | 'ready' | 'fallback';
export type MusicSource = 'embed' | 'visitor' | 'engine';

export const PlayerState = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

interface YTPlayer {
  playVideo(): void; pauseVideo(): void; nextVideo(): void; previousVideo(): void; destroy(): void;
  cuePlaylist(ids: string[] | { list: string; listType?: 'playlist'; index?: number }): void;
  getPlayerState(): number;
  getPlaylist(): string[] | null;
  getPlaylistIndex(): number;
  getVideoData?(): { video_id?: string; title?: string; author?: string } | undefined;
  getIframe(): HTMLIFrameElement;
}
interface YTEvent { data: number; target: YTPlayer }
interface YTNamespace {
  Player: new (el: HTMLElement | string, opts: {
    width?: string | number; height?: string | number; videoId?: string;
    playerVars?: Record<string, string | number>;
    events?: { onReady?(e: YTEvent): void; onStateChange?(e: YTEvent): void; onError?(e: YTEvent): void; onAutoplayBlocked?(e: YTEvent): void };
  }) => YTPlayer;
}
declare global {
  interface Window { onYouTubeIframeAPIReady?: () => void; YT?: YTNamespace }
}

type Listener = (playing: boolean, source: MusicSource) => void;
type StatusListener = (status: MusicStatus) => void;
type TrackListener = (track: TrackInfo) => void;
export interface TrackInfo { index: number; count: number; title: string; artist: string }

class Music {
  status: MusicStatus = 'idle';
  /** True once the player has reported a playback state at least once (then the record follows YouTube). */
  reportsState = false;
  /** The last onError code (101/150: embedding disallowed for that video; the player moves on). */
  lastError: number | null = null;
  private player: YTPlayer | null = null;
  private dock: HTMLDivElement | null = null;
  private slot: HTMLElement | null = null;
  private raf = 0;
  private timer = 0;
  private endedTimer = 0;
  private expectTimer = 0;
  private readonly listeners = new Set<Listener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly trackListeners = new Set<TrackListener>();
  /** What the player last said (null until it has said anything). */
  private playerState: number | null = null;
  private trackInfo: TrackInfo = { index: 0, count: YOUTUBE_PLAYLIST ? 0 : TRACKS.length, title: TRACKS[0]?.title ?? '', artist: TRACKS[0]?.artist ?? '' };

  constructor() {
    state.music.pause = () => this.pause();
  }

  get playing(): boolean { return state.music.isPlaying; }
  get track(): TrackInfo { return this.trackInfo; }

  /** Sets the playing state (the player, the visitor's toggle, or the engine) and tells listeners. */
  setPlaying(v: boolean, source: MusicSource = 'visitor'): void {
    state.music.isPlaying = v;
    this.notify(source);
  }

  private notify(source: MusicSource): void {
    for (const fn of this.listeners) { try { fn(state.music.isPlaying, source); } catch (e) { console.error(e); } }
  }

  onChange(fn: Listener): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  onStatus(fn: StatusListener): () => void { this.statusListeners.add(fn); return () => { this.statusListeners.delete(fn); }; }
  onTrack(fn: TrackListener): () => void { this.trackListeners.add(fn); return () => { this.trackListeners.delete(fn); }; }

  private setStatus(s: MusicStatus): void {
    if (s === this.status) return;
    this.status = s;
    for (const fn of this.statusListeners) { try { fn(s); } catch (e) { console.error(e); } }
  }

  /** Pauses the player (if it is up) and marks the music stopped. The Austen trick calls this. */
  pause(): void {
    clearTimeout(this.expectTimer);
    try { this.player?.pauseVideo(); } catch (e) { console.error(e); }
    this.setPlaying(false, 'engine');
  }

  /**
   * Play through the API. The state is set optimistically (the record starts
   * at once) and corrected by onStateChange / onAutoplayBlocked; if the
   * player has been reporting state and stays silent, the optimism is
   * withdrawn after a moment.
   */
  resume(): void {
    try { this.player?.playVideo(); } catch (e) { console.error(e); }
    this.setPlaying(true, 'visitor');
    clearTimeout(this.expectTimer);
    if (this.player) {
      this.expectTimer = window.setTimeout(() => {
        const s = this.playerState;
        if (state.music.isPlaying && s !== PlayerState.PLAYING && s !== PlayerState.BUFFERING) this.setPlaying(false, 'embed');
      }, 4000);
    }
  }

  toggle(): void {
    if (this.playing) this.pause(); else this.resume();
  }

  next(): void { try { this.player?.nextVideo(); } catch (e) { console.error(e); } }
  previous(): void { try { this.player?.previousVideo(); } catch (e) { console.error(e); } }

  /**
   * Loads the IFrame API and creates the player, once, on first call (the
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

    const create = (): void => {
      if (this.status !== 'loading' || !window.YT?.Player) return;
      try {
        const playerVars: Record<string, string | number> = { playsinline: 1, rel: 0, iv_load_policy: 3, enablejsapi: 1, origin: location.origin };
        // a playlist id goes in the player vars; an id list is cued once the player is ready
        // (cuePlaylist, not the videoId + playlist vars: getPlaylist() would then leave the first video out)
        if (YOUTUBE_PLAYLIST) { playerVars.listType = 'playlist'; playerVars.list = YOUTUBE_PLAYLIST; }
        this.player = new window.YT.Player(target, {
          width: '100%', height: '100%', playerVars,
          events: {
            onReady: (e) => {
              clearTimeout(this.timer);
              if (!YOUTUBE_PLAYLIST) { try { e.target.cuePlaylist(TRACKS.map((t) => t.id)); } catch (err) { console.error(err); } }
              this.setStatus('ready');
              this.syncTrack();
            },
            onStateChange: (e) => this.onStateChange(e.data),
            onError: (e) => { this.lastError = e.data; },
            onAutoplayBlocked: () => { this.playerState = PlayerState.CUED; if (state.music.isPlaying) this.setPlaying(false, 'embed'); },
          },
        });
      } catch (e) {
        console.error(e);
        giveUp();
      }
    };

    if (window.YT?.Player) { create(); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); create(); };
    const script = document.createElement('script');
    script.src = API_SRC;
    script.async = true;
    script.onerror = () => { clearTimeout(this.timer); giveUp(); };
    document.head.append(script);
  }

  private onStateChange(s: number): void {
    this.reportsState = true;
    this.playerState = s;
    clearTimeout(this.endedTimer);
    if (s === PlayerState.PLAYING) {
      clearTimeout(this.expectTimer);
      if (!state.music.isPlaying) this.setPlaying(true, 'embed');
    } else if (s === PlayerState.PAUSED || s === PlayerState.CUED) {
      if (state.music.isPlaying) this.setPlaying(false, 'embed');
    } else if (s === PlayerState.ENDED) {
      // inside a playlist the next video follows within a second; only a real end stops the record
      this.endedTimer = window.setTimeout(() => {
        if (this.playerState === PlayerState.ENDED && state.music.isPlaying) this.setPlaying(false, 'embed');
      }, ENDED_GRACE);
    }
    // BUFFERING: no change (a stall mid-track must not lift the arm)
    this.syncTrack();
  }

  /** Reads which video is up and tells the panel (title from the config when the id is ours, else from the player). */
  private syncTrack(): void {
    const p = this.player;
    if (!p) return;
    let info: TrackInfo | null = null;
    try {
      const ids = p.getPlaylist() ?? [];
      const index = Math.max(0, p.getPlaylistIndex());
      const data = p.getVideoData?.();
      const id = data?.video_id ?? ids[index];
      const known: Track | undefined = TRACKS.find((t) => t.id === id);
      info = {
        index, count: ids.length || TRACKS.length,
        title: known?.title ?? data?.title ?? this.trackInfo.title,
        artist: known?.artist ?? data?.author ?? '',
      };
    } catch { return; }
    if (!info || (info.index === this.trackInfo.index && info.title === this.trackInfo.title && info.count === this.trackInfo.count)) return;
    this.trackInfo = info;
    for (const fn of this.trackListeners) { try { fn(info); } catch (e) { console.error(e); } }
  }

  private ensureDock(): HTMLDivElement {
    if (this.dock) return this.dock;
    const dock = document.createElement('div');
    dock.id = 'music-dock';
    dock.setAttribute('aria-hidden', 'true');
    dock.style.cssText = 'position:absolute;left:0;top:0;width:384px;height:216px;overflow:hidden;border-radius:12px;background:#111;visibility:hidden;pointer-events:none;transform:translate(-200vw,0);will-change:transform;z-index:3;';
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
        // clip to the scrolling body so the player does not float over the panel's header or edge
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

  /** Test hooks (window.__table.music): QA drives the trick without YouTube. */
  get hooks() {
    return {
      setPlaying: (v: boolean) => this.setPlaying(v, 'visitor'),
      get playing() { return state.music.isPlaying; },
      status: () => this.status,
      reportsState: () => this.reportsState,
      hasController: () => this.player !== null,
      /** What the player itself last reported (YT.PlayerState number; null before its first onStateChange). */
      playerState: () => this.playerState,
      lastError: () => this.lastError,
      track: () => this.trackInfo,
      resume: () => this.resume(),
      pause: () => this.pause(),
      next: () => this.next(),
      previous: () => this.previous(),
    };
  }
}

export const music = new Music();
