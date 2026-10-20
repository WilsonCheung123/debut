// The puppet's panel (SPEC 0.2 "Puppet"): an intro view (the verbatim intro,
// then the Elon quote and Wilson's goal, then a hint to click one of the
// three) and three item views (the puppet, the instant camera, the phone),
// each with a back link to the intro. The puppet's in-focus clicks call
// goTo(item); the hint's three names do the same from the keyboard.
//
// Facts checked 2026-10-20: Disney's Character Model Department was set up in
// late 1937 under Joe Grant; it sculpted characters in clay and cast them in
// plaster so the animators had maquettes on their desks (Pinocchio, 1940).
// The Polaroid Model 95 went on sale at Jordan Marsh, Boston, on 26 November
// 1948 and the first lot sold out that day; the SX-70 was introduced in 1972.
// The iPhone was announced on 9 January 2007 and went on sale on 29 June 2007;
// Apple's billionth iPhone was sold in July 2016.
import gsap from 'gsap';
import type { PanelFactory, PanelCtx } from './types';

export type PuppetItem = 'puppet' | 'camera' | 'phone';

export interface PinocchioPanel extends PanelFactory {
  /** Shows an item's description (no-op when closed). */
  goTo(item: PuppetItem): void;
  /** Back to the intro (no-op when closed). */
  home(): void;
  /** The view currently shown, for tests. */
  readonly view: 'intro' | PuppetItem | null;
}

const STYLE_ID = 'pinocchio-style';
const CSS = `
.pinocchio .pin-view { will-change: opacity, transform; }
.pinocchio .pin-intro-text p { font-size: 19px; line-height: 1.5; }
.pinocchio .pin-coda { margin-top: 2em; padding-top: 1.4em; border-top: 1px solid var(--paper-line); }
.pinocchio .pin-coda blockquote { margin-top: 0; }
.pinocchio .pin-sign { font-family: var(--sans); font-size: 12px; letter-spacing: 0.08em; text-transform: lowercase;
  font-variant-caps: all-small-caps; color: var(--ink-faint); margin-top: 1.4em; }
.pinocchio .pin-hint { margin-top: 2.2em; color: var(--ink-faint); font-style: italic; }
#panel .content .pinocchio button.pin-link {
  display: inline-block; min-height: 0; min-width: 0; padding: 12px 0; margin: -12px 0; line-height: 20px; border: 0; border-radius: 0; background: none;
  font: inherit; color: var(--ink-soft); cursor: pointer; letter-spacing: 0; text-transform: none; font-variant-caps: normal;
  text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; text-decoration-color: var(--ink-faint);
}
#panel .content .pinocchio button.pin-link:hover { color: var(--ink); text-decoration-color: var(--ink); }
#panel .content .pinocchio button.pin-back { display: inline-flex; align-items: center; gap: 6px; margin: -8px 0 1.2em; padding: 12px 0; line-height: 20px;
  font-family: var(--sans); font-size: 12px; letter-spacing: 0.08em; text-transform: lowercase; font-variant-caps: all-small-caps;
  color: var(--ink-faint); text-decoration: none; }
#panel .content .pinocchio button.pin-back:hover { color: var(--ink); }
#panel .content .pinocchio button.pin-back::before { content: '\\2190'; font-family: var(--sans); font-size: 14px; }
.pinocchio .pin-item .kicker { margin: 0 0 2px; }
.pinocchio .pin-item h2 { margin: 0 0 0.55em; }
.pinocchio .pin-why { font-style: italic; color: var(--ink-soft); }
`;

interface Section { item: PuppetItem; kicker: string; title: string; body: string; why: string }

/** SPEC 0.2, verbatim (including its lowercase product names). */
const INTRO = 'A puppet, an iphone, a polaroid. A puppet, an iphone, a polaroid. A puppet, an iphone... are you getting it? These are not three separate things. This is one thing, and we are calling it an insanely great product.';

const SECTIONS: Section[] = [
  {
    item: 'puppet',
    kicker: 'the puppet · Disney, late 1930s',
    title: 'The thing you could hold',
    body: 'In the late 1930s, before Pinocchio’s animators drew a frame that counted, Disney’s model department sculpted him in clay and cast him in plaster. The maquette sat on every desk so that a hundred hands could draw one boy, turn him toward the light, and agree on where his nose ended. Animation had been a cartoon’s business; Disney insisted it could carry a feature, and the way to carry it was to make the character real before making him move. Every studio that followed built a model shop. Every character you have ever cried over was once a lump of clay on a turntable.',
    why: 'Why it matters to me: get the object right first, and everything after has something to be true to.',
  },
  {
    item: 'camera',
    kicker: 'the instant camera · Polaroid, 1948',
    title: 'A photograph, a minute later',
    body: 'In 1948 Edwin Land put the first instant camera on sale in a Boston department store, and the lot sold out that day. You pressed the shutter and, a minute later, held the picture. The photograph stopped being something a lab sent back and became something that happened in the room, passed hand to hand while the moment was still warm. In 1972 the SX-70 folded the whole system, camera, film and chemistry, into a jacket pocket. Land’s rule was that the experience had to be whole, with nothing left for the customer to figure out.',
    why: 'Why it matters to me: the product is everything the person touches, start to finish.',
  },
  {
    item: 'phone',
    kicker: 'the phone · Apple, 2007',
    title: 'The computer that fit a life',
    body: 'On 9 January 2007 Steve Jobs announced a widescreen iPod, a phone and an internet device, then said they were one thing. It went on sale that June. There was no keyboard, no stylus, nothing to learn: you touched what you wanted. What arrived was not a better phone but a computer that fit a life, in a pocket, under a thumb, with you at breakfast and in the dark. Within a decade Apple had sold a billion of them, and nearly every screen you now touch is a descendant.',
    why: 'Why it matters to me: the bar for insanely good was set in public, and it has not moved.',
  },
];

const CODA = {
  quote: 'Life needs to be more than just solving problems every day. You need to wake up and be excited about the future.',
  cite: 'Elon Musk',
  goal: 'My goal is to make products that are so insanely good that one day, walking down a random street, I’ll see someone using one. If you know anyone I should talk to, or have anything cool, send them my way.',
  sign: 'This is a reminder of the pursuit of excellence.',
};

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.append(s);
}

export function pinocchioPanel(opts: { onSelect?(item: PuppetItem): void } = {}): PinocchioPanel {
  let mounted: { ctx: PanelCtx; root: HTMLElement } | null = null;
  let view: 'intro' | PuppetItem | null = null;

  const render = (next: 'intro' | PuppetItem, animate: boolean): void => {
    if (!mounted) return;
    const { ctx, root } = mounted;
    const el = document.createElement('div');
    el.className = 'pin-view';
    if (next === 'intro') {
      el.innerHTML =
        `<div class="pin-intro-text"><p>${INTRO}</p></div>` +
        `<div class="pin-coda"><blockquote><p>${CODA.quote}</p><cite>${CODA.cite}</cite></blockquote>` +
        `<p>${CODA.goal}</p><p class="pin-sign">${CODA.sign}</p></div>` +
        `<p class="pin-hint">Click <button type="button" class="pin-link" data-item="puppet">the puppet</button>, ` +
        `<button type="button" class="pin-link" data-item="phone">the phone</button> or ` +
        `<button type="button" class="pin-link" data-item="camera">the camera</button>.</p>`;
      for (const b of el.querySelectorAll<HTMLButtonElement>('button[data-item]')) {
        b.addEventListener('click', () => { const item = b.dataset.item as PuppetItem; show(item, true); opts.onSelect?.(item); });
      }
    } else {
      const s = SECTIONS.find((x) => x.item === next)!;
      el.innerHTML =
        `<button type="button" class="pin-back">back to the three</button>` +
        `<section class="pin-item" id="pin-${s.item}"><p class="kicker">${s.kicker}</p><h2>${s.title}</h2><p>${s.body}</p><p class="pin-why">${s.why}</p></section>`;
      el.querySelector('button.pin-back')!.addEventListener('click', () => show('intro', true));
    }
    root.replaceChildren(el);
    ctx.body.scrollTop = 0;
    view = next;
    if (animate && !ctx.state.reducedMotion) gsap.fromTo(el, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out' });
  };
  const show = (next: 'intro' | PuppetItem, animate: boolean): void => {
    if (!mounted || next === view) return;
    render(next, animate);
  };

  return {
    kicker: 'the puppet',
    title: 'Three objects',
    get view() { return view; },
    mount(ctx: PanelCtx) {
      ensureStyle();
      const root = document.createElement('div');
      root.className = 'pinocchio';
      ctx.body.append(root);
      mounted = { ctx, root };
      render('intro', false);
      return () => { mounted = null; view = null; };
    },
    goTo(item) { show(item, true); },
    home() { show('intro', true); },
  };
}
