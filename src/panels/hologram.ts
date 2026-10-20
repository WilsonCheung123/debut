// The hologram's panel (SPEC 4.7): "Realm" kicker, a short description of the
// studio, then the five films as a list with posters; choosing one switches
// the projector; "watch with sound" swaps the list for the Mux player inside
// the panel, with a way back. The object hands in a controller; the panel
// never touches three.js.
import type { PanelFactory, PanelCtx } from './types';
import { esc, p, link, kicker } from '../content/types';
import { REALM, thumbnailUrl, playerUrl, type Film } from '../content/hologram';

export interface HologramController {
  readonly films: Film[];
  /** Index into films of what the projector shows. */
  readonly selected: number;
  /** Switch the projector (crossfade). */
  select(i: number): void;
  /** Freeze the projector while the sound player is open; release on the way back. */
  hold(on: boolean): void;
  /** Subscribe to selection changes; returns an unsubscribe. */
  onChange(cb: (i: number) => void): () => void;
}

const CSS = `
#panel .content .holo .films { list-style: none; margin: 0 0 14px; padding: 0; }
#panel .content .holo .films li { margin: 0; }
#panel .content .holo .film {
  display: flex; align-items: center; gap: 14px; text-align: left;
  width: calc(100% + 16px); margin: 0 -8px; padding: 8px 10px 8px 8px; min-height: 44px; box-sizing: border-box;
  border: 1px solid transparent; background: transparent; border-radius: 6px;
  font: inherit; letter-spacing: 0; text-transform: none; font-variant-caps: normal; color: inherit; cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease;
}
#panel .content .holo .film:hover { background: rgba(255,255,255,.45); }
#panel .content .holo .film[aria-pressed="true"] { background: rgba(255,255,255,.62); border-color: var(--paper-line); }
#panel .content .holo .film img {
  flex: 0 0 104px; width: 104px; aspect-ratio: 16 / 9; height: auto; object-fit: cover; display: block;
  border-radius: 3px; background: #1a1d20; box-shadow: 0 1px 2px rgba(0,0,0,.25);
}
#panel .content .holo .film .meta { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1 1 auto; }
#panel .content .holo .film .name { font-family: var(--serif); font-size: 17px; line-height: 1.25; }
#panel .content .holo .film .sub, #panel .content .holo .film .now {
  font-family: var(--sans); font-size: 12px; letter-spacing: 0.06em; text-transform: lowercase; font-variant-caps: all-small-caps; color: var(--ink-faint);
}
#panel .content .holo .film .now { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; color: #1f7f99; opacity: 0; transition: opacity .2s ease; }
#panel .content .holo .film .now::before { content: ''; width: 6px; height: 6px; border-radius: 3px; background: #2bb3d6; box-shadow: 0 0 6px rgba(43,179,214,.8); }
#panel .content .holo .film[aria-pressed="true"] .now { opacity: 1; }
#panel .content .holo .list > .kicker { margin: 0 0 6px; }
#panel .content .holo .actions { margin: 0 0 1.2em; }
#panel .content .holo .watch > .kicker { margin: 0 0 8px; }
#panel .content .holo .frame {
  position: relative; width: 100%; aspect-ratio: 16 / 9; margin: 0 0 14px;
  background: #0b0a09; border-radius: 4px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,.25);
}
#panel .content .holo .frame iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; }
`;

function injectCss(): void {
  if (document.getElementById('hologram-panel-css')) return;
  const s = document.createElement('style');
  s.id = 'hologram-panel-css';
  s.textContent = CSS;
  document.head.append(s);
}

export function hologramPanel(ctl: HologramController): PanelFactory {
  return {
    kicker: REALM.kicker,
    title: REALM.title,
    mount(ctx: PanelCtx) {
      injectCss();
      const root = document.createElement('div');
      root.className = 'holo';
      root.innerHTML = REALM.paragraphs.map(p).join('') + `<p>${link(REALM.url, 'realmfilm.art')}</p>`;

      // the list
      const listWrap = document.createElement('div');
      listWrap.className = 'list';
      listWrap.innerHTML = kicker(REALM.listKicker);
      const list = document.createElement('ol');
      list.className = 'films';
      const buttons: HTMLButtonElement[] = [];
      ctl.films.forEach((f, i) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'film';
        b.dataset.index = String(i);
        b.innerHTML =
          `<img src="${esc(thumbnailUrl(f))}" alt="" crossorigin="anonymous" loading="lazy" decoding="async" width="480" height="270" />` +
          `<span class="meta"><span class="name">${esc(f.title)}</span><span class="sub">${esc(f.kind)} · ${esc(f.duration)}</span></span>` +
          `<span class="now" aria-hidden="true">projecting</span>`;
        b.addEventListener('click', () => ctl.select(i));
        li.append(b);
        list.append(li);
        buttons.push(b);
      });
      const mark = (i: number): void => {
        buttons.forEach((b, j) => {
          b.setAttribute('aria-pressed', String(i === j));
          b.setAttribute('aria-label', `${ctl.films[j].title}${i === j ? ', on the projector' : ''}`);
        });
      };
      mark(ctl.selected);
      const unsubscribe = ctl.onChange(mark);

      const actions = document.createElement('p');
      actions.className = 'actions';
      const sound = document.createElement('button');
      sound.type = 'button';
      sound.className = 'sound';
      sound.textContent = 'watch with sound';
      actions.append(sound);
      listWrap.append(list, actions);

      // the player, swapped in for the list
      const watch = document.createElement('div');
      watch.className = 'watch';
      watch.hidden = true;
      root.append(listWrap, watch);
      ctx.body.append(root);

      const closePlayer = (): void => {
        watch.innerHTML = '';      // removing the iframe stops the sound
        watch.hidden = true;
        listWrap.hidden = false;
        ctl.hold(false);
        sound.focus({ preventScroll: true });
      };
      const openPlayer = (): void => {
        const f = ctl.films[ctl.selected];
        watch.innerHTML =
          kicker(f.title) +
          `<div class="frame"><iframe src="${esc(playerUrl(f))}" title="${esc(f.title)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>` +
          `<p class="actions"><button type="button" class="back-to-films">back to the films</button></p>`;
        const back = watch.querySelector<HTMLButtonElement>('.back-to-films')!;
        back.addEventListener('click', closePlayer);
        listWrap.hidden = true;
        watch.hidden = false;
        ctl.hold(true);
        ctx.scrollTo(watch);
        back.focus({ preventScroll: true });
      };
      sound.addEventListener('click', openPlayer);

      return () => {
        unsubscribe();
        watch.innerHTML = '';
        ctl.hold(false);
      };
    },
  };
}
