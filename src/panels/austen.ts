// The Pride and Prejudice panel with the Austen trick's panel side (SPEC 4.9).
//
// The trick itself is the engine's (engine/focus.ts): music playing + this
// book focused → pause, then the message bubble 600 ms later. This panel
// wraps the book's content (the books builder's words) and adds the one
// thing the panel owes the trick: once the bubble has been shown and then
// dismissed (a click anywhere in the panel dismisses it), a quiet
// "why did my music stop?" line at the end of the panel brings it back.
//
// The books builder references this as the book's panel:
//   focus.panel = austenPanel(bookPanel(prideAndPrejudiceContent))
import type { PanelFactory, PanelCtx, PanelContent } from './types';
import { bookPanel, type BookContent } from '../content/types';
import { austen } from '../content/austen';
import { Bubble } from '../ui/bubble';

/** Wilson's words for the book, as in SPEC 4.1 (the books builder's content file supersedes this). */
export const prideAndPrejudice: BookContent = {
  id: 'book.pride-and-prejudice',
  title: 'Pride and Prejudice',
  author: 'Jane Austen',
  blurb: "You might wonder what a 19th-century feminist novelist has to do with a guy from Hong Kong in the 21st century who's into tech. Welp. So much.",
};

const CSS = `
#panel .content .austen-again { margin-top: 1.6em; }
#panel .content .austen-again button { font-family: var(--sans); font-size: 13px; letter-spacing: 0.02em; text-transform: none; font-variant-caps: normal; color: var(--ink-faint); background: none; border: 0; border-radius: 0; padding: 12px 0; min-height: 44px; cursor: pointer; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; text-decoration-color: rgba(29,26,23,.3); }
#panel .content .austen-again button:hover { color: var(--ink); text-decoration-color: currentColor; background: none; }
`;
let styled = false;

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
      again.innerHTML = `<button type="button">${austen.prompt}</button>`;
      ctx.body.append(again);
      const bubble = Bubble.instance;
      let fired = false;
      again.querySelector('button')!.addEventListener('click', () => { bubble?.show(austen); });
      const off = bubble?.on((ev) => {
        if (ev === 'show') { fired = true; again.hidden = true; }
        else if (ev === 'hide' && fired) again.hidden = false;
      });
      return () => { off?.(); };
    },
  };
}
