// The turntable's panel (SPEC 4.9): the Spotify playlist embed through the
// iFrame API, loaded lazily on the turntable's first focus, with a status
// toggle that mirrors (or, when the embed cannot report state, sets) the
// music state the record spins to. The embed itself lives in music.ts's dock
// and is laid over the slot here, so it survives the panel closing.
import type { PanelFactory, PanelCtx } from './types';
import { music, PLAYLIST_URL, EMBED_HEIGHT, type MusicStatus } from '../music';
import { brackets } from '../content/types';

export const PLAYLIST_TITLE = 'lol'; // the playlist's name on Spotify (oEmbed, 2026-10)

const CSS = `
.vinyl-panel .vinyl-slot { position: relative; height: ${EMBED_HEIGHT}px; border-radius: 12px; background: #262626; overflow: hidden; }
.vinyl-panel .vinyl-slot .skeleton { position: absolute; inset: 0; background: linear-gradient(100deg, #262626 35%, #2f2f2f 50%, #262626 65%); background-size: 240% 100%; animation: vinyl-shimmer 1.8s ease-in-out infinite; }
.vinyl-panel .vinyl-slot .skeleton::before { content: ''; position: absolute; left: 16px; top: 16px; width: 88px; height: 88px; border-radius: 6px; background: rgba(255,255,255,.06); }
.vinyl-panel .vinyl-slot .skeleton::after { content: ''; position: absolute; left: 120px; top: 24px; width: 46%; height: 12px; border-radius: 6px; background: rgba(255,255,255,.08); box-shadow: 0 24px 0 -2px rgba(255,255,255,.05); }
.vinyl-panel .vinyl-slot.off { background: #262626; }
.vinyl-panel .vinyl-off { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 24px; color: #d9d2c4; font-family: var(--sans); font-size: 14px; line-height: 1.5; box-sizing: border-box; }
.vinyl-panel .vinyl-off a { color: #f2ead8; }
.vinyl-panel .vinyl-row { display: flex; align-items: center; gap: 12px; margin: 14px 0 4px; }
.vinyl-panel .vinyl-toggle { display: inline-flex; align-items: center; gap: 9px; padding: 9px 14px 9px 12px; }
.vinyl-panel .vinyl-toggle .dot { width: 8px; height: 8px; border-radius: 50%; background: #9a9283; transition: background-color .25s ease, box-shadow .25s ease; }
.vinyl-panel .vinyl-toggle[aria-pressed="true"] .dot { background: #2f8f5b; box-shadow: 0 0 0 3px rgba(47,143,91,.18); animation: vinyl-pulse 2.4s ease-in-out infinite; }
.vinyl-panel .vinyl-note { font-family: var(--sans); font-size: 12.5px; line-height: 1.45; color: var(--ink-faint); margin: 0; }
.vinyl-panel .vinyl-after { margin-top: 18px; }
@keyframes vinyl-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
@keyframes vinyl-pulse { 0%, 100% { box-shadow: 0 0 0 3px rgba(47,143,91,.18); } 50% { box-shadow: 0 0 0 5px rgba(47,143,91,.08); } }
@media (prefers-reduced-motion: reduce) { .vinyl-panel .vinyl-slot .skeleton, .vinyl-panel .vinyl-toggle .dot { animation: none !important; } }
`;

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
        <p class="byline">a playlist, on Spotify</p>
        <div class="vinyl-slot"><div class="skeleton" aria-hidden="true"></div></div>
        <div class="vinyl-row">
          <button type="button" class="vinyl-toggle" aria-pressed="false"><span class="dot" aria-hidden="true"></span><span class="txt">paused</span></button>
          <p class="vinyl-note"></p>
        </div>
        <p class="vinyl-after">${brackets('[a line about this playlist, or nothing]')}</p>`;
      ctx.body.append(root);
      const slot = root.querySelector<HTMLDivElement>('.vinyl-slot')!;
      const toggle = root.querySelector<HTMLButtonElement>('.vinyl-toggle')!;
      const txt = toggle.querySelector<HTMLSpanElement>('.txt')!;
      const note = root.querySelector<HTMLParagraphElement>('.vinyl-note')!;

      const renderPlaying = (): void => {
        const on = ctx.state.music.isPlaying;
        toggle.setAttribute('aria-pressed', String(on));
        txt.textContent = on ? 'playing' : 'paused';
        toggle.setAttribute('aria-label', on ? 'Playing. Pause the music' : 'Paused. Play the music');
      };
      const renderStatus = (status: MusicStatus): void => {
        slot.classList.toggle('off', status === 'fallback');
        if (status === 'fallback') {
          if (music.hooks.hasController()) {
            // the embed exists but never said it was ready: show it, let the visitor tell the record
            slot.innerHTML = '';
            music.attach(slot);
            note.textContent = 'Spotify is not telling the table what it is doing. The record follows this switch: flip it when you press play.';
          } else {
            slot.innerHTML = `<div class="vinyl-off"><span>Spotify did not answer, so the player is not here right now.</span><span><a href="${PLAYLIST_URL}" target="_blank" rel="noopener">open the playlist on Spotify</a></span></div>`;
            note.textContent = 'The record follows this switch anyway.';
          }
        } else if (status === 'ready') {
          slot.innerHTML = '';
          note.textContent = music.reportsState
            ? 'The record follows Spotify. It keeps playing when you step back from the table.'
            : 'Press play in the player; the record follows. It keeps playing when you step back from the table.';
        } else {
          note.textContent = 'Loading the player.';
        }
      };

      toggle.addEventListener('click', () => { music.toggle(); renderPlaying(); });
      const offChange = music.onChange(() => { renderPlaying(); if (music.status === 'ready') renderStatus('ready'); });
      const offStatus = music.onStatus((s) => { renderStatus(s); if (s === 'ready') music.attach(slot); });
      renderPlaying();
      renderStatus(music.status);

      // lazy: the first focus of the turntable loads the API; later focuses only re-attach
      music.load();
      if (music.status === 'ready') music.attach(slot);

      return () => {
        offChange();
        offStatus();
        music.detach();
      };
    },
  };
}
