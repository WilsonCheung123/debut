// The Pride and Prejudice panel with the Austen letter (SPEC 0.2).
//
// If music is playing when this panel opens (from the table or the shelf),
// the panel pauses it (the engine's own pause at focus:settled is the
// backstop, engine/focus.ts) and, a moment later, a letter slides in over the
// paper: folded sheet, a small wax seal, set in Pinyon Script (a copperplate
// hand; public/fonts/pinyon-script-latin.woff2, Google Fonts, OFL). A short
// heading says why a letter. Dismissing it folds it away; a quiet line at the
// end of the panel brings it back. Music does not auto-resume.
//
// Test hook (?qa=1): window.__austen.letter() shows the letter on demand.
import type { PanelFactory, PanelCtx, PanelContent } from './types';
import { bookPanel, type BookContent } from '../content/types';
import { austen } from '../content/austen';
import { state, flags } from '../state';
import gsap from 'gsap';

/** Wilson's words for the book, as in SPEC 4.1 (src/content/books.ts supersedes this). */
export const prideAndPrejudice: BookContent = {
  id: 'book.pride-and-prejudice',
  title: 'Pride and Prejudice',
  author: 'Jane Austen',
  blurb: "You might wonder what a 19th-century feminist novelist has to do with a guy from Hong Kong in the 21st century who's into tech. Welp. So much.",
};

/** Delay after the panel lands before the letter slides in. */
const LETTER_AT = 900;

const CSS = `
@font-face { font-family: 'Pinyon Script'; font-style: normal; font-weight: 400; font-display: swap; src: url('/fonts/pinyon-script-latin.woff2') format('woff2'); }
#panel .content .austen-again { margin-top: 1.6em; }
#panel .content .austen-again button { font-family: var(--sans); font-size: 13px; letter-spacing: 0.02em; text-transform: none; font-variant-caps: normal; color: var(--ink-faint); background: none; border: 0; border-radius: 0; padding: 12px 0; min-height: 44px; cursor: pointer; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; text-decoration-color: rgba(29,26,23,.3); }
#panel .content .austen-again button:hover { color: var(--ink); text-decoration-color: currentColor; background: none; }

#panel .letter {
  position: absolute; inset: 0; z-index: 3; display: flex; flex-direction: column; box-sizing: border-box;
  background: #f8f2e4; color: #2a2320; border-radius: 6px; overflow: hidden;
  box-shadow: 0 -18px 48px rgba(0,0,0,.28), 0 0 0 1px rgba(90,70,40,.12) inset;
  will-change: transform, opacity;
}
#panel .letter::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
  background-image: var(--grain); background-size: 128px 128px; opacity: 0.05; mix-blend-mode: multiply;
}
/* the fold: two creases across the sheet, each a hairline of shadow and a hairline of light */
#panel .letter::after {
  content: ''; position: absolute; left: 0; right: 0; top: 0; bottom: 0; pointer-events: none; z-index: 0;
  background:
    linear-gradient(180deg, rgba(0,0,0,0) 0, rgba(0,0,0,0) calc(33.3% - 1px), rgba(70,50,30,.10) calc(33.3% - 1px), rgba(70,50,30,.10) 33.3%, rgba(255,255,255,.55) 33.3%, rgba(255,255,255,.55) calc(33.3% + 1px), rgba(0,0,0,0) calc(33.3% + 1px),
      rgba(0,0,0,0) calc(66.6% - 1px), rgba(255,255,255,.55) calc(66.6% - 1px), rgba(255,255,255,.55) 66.6%, rgba(70,50,30,.10) 66.6%, rgba(70,50,30,.10) calc(66.6% + 1px), rgba(0,0,0,0) calc(66.6% + 1px)),
    linear-gradient(180deg, rgba(60,40,20,.045) 0, rgba(60,40,20,0) 12%, rgba(60,40,20,0) 33.3%, rgba(60,40,20,.035) 34%, rgba(60,40,20,0) 46%, rgba(60,40,20,0) 66.6%, rgba(60,40,20,.03) 67%, rgba(60,40,20,0) 80%);
}
#panel .letter header { position: relative; z-index: 1; display: flex; align-items: center; gap: 10px; padding: 14px 16px 0; flex: 0 0 auto; }
#panel .letter .fold {
  position: relative; width: 44px; height: 44px; display: inline-grid; place-items: center; margin-left: -10px;
  border: 0; background: transparent; color: #5a4e42; border-radius: 22px; cursor: pointer; transition: color .15s ease;
}
#panel .letter .fold::before { content: ''; position: absolute; width: 36px; height: 36px; border-radius: 18px; background: rgba(0,0,0,0); transition: background-color .15s ease; }
#panel .letter .fold svg { position: relative; }
#panel .letter .fold:hover { color: #2a2320; }
#panel .letter .fold:hover::before { background: rgba(0,0,0,.05); }
#panel .letter .fold:focus-visible { outline: 2px solid var(--maroon); outline-offset: 2px; }
#panel .letter .sheet { position: relative; z-index: 1; flex: 1 1 auto; overflow-y: auto; padding: 6px 30px 36px; }
#panel .letter .why { font-family: var(--serif); font-style: italic; font-size: 14.5px; line-height: 1.5; color: #6b5f52; margin: 6px 0 22px; padding-bottom: 16px; border-bottom: 1px solid rgba(90,70,40,.16); }
#panel .letter .hand { font-family: 'Pinyon Script', 'Snell Roundhand', 'Apple Chancery', 'URW Chancery L', cursive; font-size: 24px; line-height: 1.5; color: #2e2420; }
#panel .letter .hand p { margin: 0 0 0.9em; text-wrap: pretty; }
#panel .letter .hand p.salutation { margin-bottom: 0.7em; }
#panel .letter .hand p.signoff { margin: 1.1em 0 0; }
#panel .letter .hand p.signature { font-size: 30px; margin: 0 0 0.6em 1.4em; }
#panel .letter .hand em { font-style: normal; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 4px; text-decoration-color: rgba(46,36,32,.45); }
#panel .letter .seal {
  position: relative; width: 34px; height: 34px; margin: 6px 0 14px; border-radius: 50%;
  background: radial-gradient(circle at 38% 34%, #a0322b 0, #7b2320 55%, #5d1a18 100%);
  box-shadow: 0 1px 2px rgba(0,0,0,.35), inset 0 1px 1px rgba(255,255,255,.18), inset 0 -2px 3px rgba(0,0,0,.25);
}
#panel .letter .seal::after {
  content: 'W'; position: absolute; inset: 0; display: grid; place-items: center; font-family: var(--serif); font-size: 15px; font-weight: 500; color: rgba(255,220,200,.55);
  text-shadow: 0 -1px 0 rgba(0,0,0,.45);
}
#panel .letter .after { margin: 0; }
#panel .letter .after a { font-family: var(--sans); font-size: 13px; letter-spacing: 0.02em; color: #6b5f52; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; text-decoration-color: rgba(42,35,32,.3); display: inline-block; padding: 12px 0; }
#panel .letter .after a:hover { color: #2a2320; text-decoration-color: currentColor; }
@media (prefers-reduced-motion: reduce) { #panel .letter { transition: none; } }
`;
let styled = false;

/** The letter's body, with `*Persuasion*` in italics (an em element; rendered as an underlined title in the hand). */
function handHtml(text: string): string {
  return esc(text).replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function austenPanel(content: PanelContent = bookPanel(prideAndPrejudice)): PanelFactory {
  return {
    kicker: content.kicker,
    title: content.title,
    mount(ctx: PanelCtx) {
      if (!styled) { styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); }
      ctx.body.innerHTML = content.html;
      const again = document.createElement('p');
      again.className = 'austen-again';
      again.hidden = true;
      again.innerHTML = '<button type="button">why did my music stop?</button>';
      ctx.body.append(again);

      let letter: HTMLDivElement | null = null;
      let timer = 0;
      const hide = (): void => {
        const el = letter;
        if (!el) return;
        letter = null;
        again.hidden = false;
        const done = (): void => el.remove();
        if (state.reducedMotion) { gsap.to(el, { opacity: 0, duration: 0.2, onComplete: done }); return; }
        gsap.to(el, { y: '104%', duration: 0.42, ease: 'power3.in', onComplete: done });
      };
      const show = (): void => {
        if (letter) return;
        again.hidden = true;
        const el = document.createElement('div');
        el.className = 'letter';
        el.setAttribute('role', 'region');
        el.setAttribute('aria-label', 'A letter');
        el.innerHTML = `
          <header>
            <button class="fold" type="button" aria-label="Fold the letter away">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <span class="kicker">a letter</span>
          </header>
          <div class="sheet">
            <p class="why">${esc(austen.heading)}</p>
            <div class="hand">
              <p class="salutation">${esc(austen.salutation)}</p>
              ${austen.body.map((p) => `<p>${handHtml(p)}</p>`).join('')}
              <p class="signoff">${esc(austen.signoff)}</p>
              <p class="signature">${esc(austen.signature)}</p>
            </div>
            <div class="seal" aria-hidden="true"></div>
            <p class="after"><a href="${esc(austen.link.href)}" target="_blank" rel="noopener">${esc(austen.link.text)}</a></p>
          </div>`;
        el.querySelector('.fold')!.addEventListener('click', hide);
        ctx.paper.append(el);
        letter = el;
        if (state.reducedMotion) gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.25 });
        else gsap.fromTo(el, { y: '104%' }, { y: '0%', duration: 0.62, ease: 'expo.out' });
        (el.querySelector('.fold') as HTMLButtonElement).focus({ preventScroll: true });
      };
      again.querySelector('button')!.addEventListener('click', show);

      // the trick: the music was playing when the book opened
      if (state.music.isPlaying) {
        try { state.music.pause?.(); } catch (e) { console.error(e); }
        state.music.isPlaying = false;
        void document.fonts?.load('24px "Pinyon Script"').catch(() => []);
        timer = window.setTimeout(show, LETTER_AT);
      }
      if (flags.qa) (window as unknown as { __austen: unknown }).__austen = { letter: show, fold: hide, get shown() { return letter !== null; } };
      return () => {
        clearTimeout(timer);
        letter?.remove();
        letter = null;
        if (flags.qa) delete (window as unknown as { __austen?: unknown }).__austen;
      };
    },
  };
}
