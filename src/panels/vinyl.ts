// The turntable's panel (SPEC 0.2 "Music", 4.9): the YouTube player through
// the IFrame Player API, loaded lazily on the turntable's first focus, with
// the current track's title and previous / play-pause / next controls that
// drive the API (or, when the player cannot be reached, set the music state
// the record spins to). The player itself lives in music.ts's dock and is laid
// over the 16:9 slot here, so it survives the panel closing.
import type { PanelFactory, PanelCtx } from './types';
import { music, PLAYLIST_URL, PLAYLIST_TITLE, type MusicStatus, type TrackInfo } from '../music';
import { brackets } from '../content/types';

const CSS = `
#panel .content .vinyl-panel .vinyl-slot { position: relative; aspect-ratio: 16 / 9; border-radius: 12px; background: #111; overflow: hidden; }
#panel .content .vinyl-panel .vinyl-slot .skeleton { position: absolute; inset: 0; background: linear-gradient(100deg, #1a1a1a 35%, #262626 50%, #1a1a1a 65%); background-size: 240% 100%; animation: vinyl-shimmer 1.8s ease-in-out infinite; }
#panel .content .vinyl-panel .vinyl-slot .skeleton::after { content: ''; position: absolute; left: 50%; top: 50%; width: 68px; height: 48px; margin: -24px 0 0 -34px; border-radius: 12px; background: rgba(255,255,255,.07); }
#panel .content .vinyl-panel .vinyl-off { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 24px; color: #d9d2c4; font-family: var(--sans); font-size: 14px; line-height: 1.5; box-sizing: border-box; }
#panel .content .vinyl-panel .vinyl-off a { color: #f2ead8; }
#panel .content .vinyl-panel .vinyl-now { display: flex; align-items: baseline; gap: 10px; margin: 14px 2px 0; min-height: 24px; }
#panel .content .vinyl-panel .vinyl-title { font-size: 18px; line-height: 1.3; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#panel .content .vinyl-panel .vinyl-artist { font-family: var(--sans); font-size: 12.5px; color: var(--ink-faint); white-space: nowrap; }
#panel .content .vinyl-panel .vinyl-count { font-family: var(--sans); font-size: 12px; letter-spacing: .04em; color: var(--ink-faint); margin-left: auto; white-space: nowrap; font-variant-numeric: tabular-nums; }
#panel .content .vinyl-panel .vinyl-row { display: flex; align-items: center; gap: 8px; margin: 10px 0 4px; }
#panel .content .vinyl-panel .vinyl-row button { display: inline-flex; align-items: center; justify-content: center; }
#panel .content .vinyl-panel .vinyl-skip { flex: 0 0 44px; width: 44px; padding: 0; color: var(--ink-soft); }
#panel .content .vinyl-panel .vinyl-skip svg { width: 18px; height: 18px; display: block; }
#panel .content .vinyl-panel .vinyl-skip[disabled] { opacity: .35; cursor: default; }
#panel .content .vinyl-panel .vinyl-toggle { flex: 0 0 auto; gap: 9px; padding: 9px 14px 9px 12px; min-width: 112px; }
#panel .content .vinyl-panel .vinyl-toggle .dot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 50%; background: #9a9283; transition: background-color .25s ease, box-shadow .25s ease; }
#panel .content .vinyl-panel .vinyl-toggle[aria-pressed="true"] .dot { background: #2f8f5b; box-shadow: 0 0 0 3px rgba(47,143,91,.18); animation: vinyl-pulse 2.4s ease-in-out infinite; }
#panel .content .vinyl-panel .vinyl-note { font-family: var(--sans); font-size: 12.5px; line-height: 1.45; color: var(--ink-faint); margin: 8px 2px 0; }
#panel .content .vinyl-panel .vinyl-after { margin-top: 18px; }
@keyframes vinyl-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
@keyframes vinyl-pulse { 0%, 100% { box-shadow: 0 0 0 3px rgba(47,143,91,.18); } 50% { box-shadow: 0 0 0 5px rgba(47,143,91,.08); } }
@media (prefers-reduced-motion: reduce) { .vinyl-panel .vinyl-slot .skeleton, .vinyl-panel .vinyl-toggle .dot { animation: none !important; } }
`;

const PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M18 5l-9 7 9 7z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14M6 5l9 7-9 7z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';

let styled = false;
function ensureStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.append(s);
}

export function vinylPanel(): PanelFactory {
  return {
    kicker: 'the turntable',
    title: PLAYLIST_TITLE,
    mount(ctx: PanelCtx) {
      ensureStyle();
      const root = document.createElement('div');
      root.className = 'vinyl-panel';
      root.innerHTML = `
        <p class="byline">a playlist, on YouTube</p>
        <div class="vinyl-slot"><div class="skeleton" aria-hidden="true"></div></div>
        <div class="vinyl-now"><span class="vinyl-title"></span><span class="vinyl-artist"></span><span class="vinyl-count"></span></div>
        <div class="vinyl-row">
          <button type="button" class="vinyl-skip vinyl-prev" aria-label="Previous track" disabled>${PREV}</button>
          <button type="button" class="vinyl-toggle" aria-pressed="false"><span class="dot" aria-hidden="true"></span><span class="txt">paused</span></button>
          <button type="button" class="vinyl-skip vinyl-next" aria-label="Next track" disabled>${NEXT}</button>
        </div>
        <p class="vinyl-note"></p>
        <p class="vinyl-after">${brackets('[a line about this playlist, or nothing]')}</p>`;
      ctx.body.append(root);
      const slot = root.querySelector<HTMLDivElement>('.vinyl-slot')!;
      const toggle = root.querySelector<HTMLButtonElement>('.vinyl-toggle')!;
      const prev = root.querySelector<HTMLButtonElement>('.vinyl-prev')!;
      const next = root.querySelector<HTMLButtonElement>('.vinyl-next')!;
      const txt = toggle.querySelector<HTMLSpanElement>('.txt')!;
      const note = root.querySelector<HTMLParagraphElement>('.vinyl-note')!;
      const title = root.querySelector<HTMLSpanElement>('.vinyl-title')!;
      const artist = root.querySelector<HTMLSpanElement>('.vinyl-artist')!;
      const count = root.querySelector<HTMLSpanElement>('.vinyl-count')!;

      const renderPlaying = (): void => {
        const on = ctx.state.music.isPlaying;
        toggle.setAttribute('aria-pressed', String(on));
        txt.textContent = on ? 'playing' : 'paused';
        toggle.setAttribute('aria-label', on ? 'Playing. Pause the music' : 'Paused. Play the music');
      };
      const renderTrack = (t: TrackInfo): void => {
        title.textContent = t.title;
        artist.textContent = t.artist;
        count.textContent = t.count > 1 ? `${t.index + 1} / ${t.count}` : '';
      };
      const renderStatus = (status: MusicStatus): void => {
        const ready = status === 'ready';
        prev.disabled = !ready;
        next.disabled = !ready;
        if (status === 'fallback') {
          if (music.hooks.hasController()) {
            // the player exists but never said it was ready: show it, let the visitor tell the record
            slot.innerHTML = '';
            music.attach(slot);
            note.textContent = 'YouTube is not telling the table what it is doing. The record follows this switch: flip it when you press play.';
          } else {
            slot.innerHTML = `<div class="vinyl-off"><span>YouTube did not answer, so the player is not here right now.</span><span><a href="${PLAYLIST_URL}" target="_blank" rel="noopener">open the playlist on YouTube</a></span></div>`;
            note.textContent = 'The record follows this switch anyway.';
          }
        } else if (ready) {
          slot.innerHTML = '';
          note.textContent = music.reportsState
            ? 'The record follows the player. It keeps playing when you step back from the table.'
            : 'Press play here or in the player; the record follows. It keeps playing when you step back from the table.';
        } else {
          note.textContent = 'Loading the player.';
        }
      };

      toggle.addEventListener('click', () => { music.toggle(); renderPlaying(); });
      prev.addEventListener('click', () => music.previous());
      next.addEventListener('click', () => music.next());
      const offChange = music.onChange(() => { renderPlaying(); if (music.status === 'ready') renderStatus('ready'); });
      const offStatus = music.onStatus((s) => { renderStatus(s); if (s === 'ready') music.attach(slot); });
      const offTrack = music.onTrack(renderTrack);
      renderPlaying();
      renderTrack(music.track);
      renderStatus(music.status);

      // lazy: the first focus of the turntable loads the API; later focuses only re-attach
      music.load();
      if (music.status === 'ready') music.attach(slot);

      return () => {
        offChange();
        offStatus();
        offTrack();
        music.detach();
      };
    },
  };
}
