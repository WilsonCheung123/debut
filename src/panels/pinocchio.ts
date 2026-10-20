// The puppet's panel (SPEC 4.8), in the "Think different" register: an intro,
// three sections (the puppet, the instant camera, the phone) and a coda. The
// puppet's in-focus clicks call goTo(item), which scrolls the mounted panel to
// that item's section and lights its margin rule for a moment.
//
// Facts checked 2026-10-19: Disney's Character Model Department (late 1937,
// Joe Grant) sculpted clay figures cast in plaster, with copies for the
// animators; Pinocchio opened in 1940 as the studio's second feature; the
// Polaroid Model 95 went on sale at Jordan Marsh in Boston in late 1948 and
// sold out the same day; the SX-70 was unveiled in April 1972; the iPhone was
// announced on 9 January 2007 and went on sale on 29 June 2007.
import type { PanelFactory, PanelCtx } from './types';

export type PuppetItem = 'puppet' | 'camera' | 'phone';

export interface PinocchioPanel extends PanelFactory {
  /** Scrolls the mounted panel to an item's section (no-op when closed). */
  goTo(item: PuppetItem): void;
}

const STYLE_ID = 'pinocchio-style';
const CSS = `
.pinocchio .pin-section { position: relative; margin-top: 2.1em; scroll-margin-top: 12px; }
.pinocchio .pin-section::before {
  content: ''; position: absolute; left: -16px; top: 2px; bottom: 6px; width: 2px; border-radius: 1px;
  background: var(--maroon); opacity: 0; transition: opacity .35s ease;
}
.pinocchio .pin-section.lit::before { opacity: .6; }
.pinocchio .pin-section .kicker { margin: 0 0 2px; }
.pinocchio .pin-section h2 { margin: 0 0 0.55em; }
.pinocchio .pin-why { font-style: italic; color: var(--ink-soft); margin-top: -0.3em; }
.pinocchio .pin-coda { margin-top: 2.4em; padding-top: 1.5em; border-top: 1px solid var(--paper-line); }
.pinocchio .pin-coda blockquote { margin-top: 0; }
.pinocchio .pin-sign { font-family: var(--sans); font-size: 12px; letter-spacing: 0.08em; text-transform: lowercase;
  font-variant-caps: all-small-caps; color: var(--ink-faint); margin-top: 1.6em; }
`;

interface Section { item: PuppetItem; kicker: string; title: string; body: string; why: string }

const INTRO = [
  'Before a single frame of <em>Pinocchio</em> was drawn, Disney’s model shop sculpted him. Animators could turn him in their hands, study him from every angle, and watch how light fell on his face. The object came before the drawing.',
  'The three objects here each did something like that for everyone else. Each introduced a cultural moment, and each redefined how people live with technology.',
];

const SECTIONS: Section[] = [
  {
    item: 'puppet',
    kicker: 'the puppet · Disney, 1940',
    title: 'Animation as a serious art',
    body: '<em>Pinocchio</em> opened in 1940, Disney’s second feature, and argued scene by scene that animation was a serious art: water that bent light, a wooden boy you worried about. Behind it sat the Character Model Department, founded in 1937, casting plaster maquettes so every animator drew the same boy. A maquette is a tool of craft: a thing you can hold, made so you can make a thing you can only watch.',
    why: 'Get the object right first; everything after has something to be true to.',
  },
  {
    item: 'camera',
    kicker: 'the instant camera · Polaroid, 1948',
    title: 'The photograph you could hold',
    body: 'In 1948 Edwin Land’s first Land Camera went on sale in a Boston department store and sold out the same day. You pressed the shutter and, a minute later, held the photograph. Polaroid made the camera, the film and the chemistry as one system, and the SX-70 of 1972 folded all of it into a jacket pocket. Land insisted on the whole experience, not just the clever part.',
    why: 'The product is everything the person touches, start to finish.',
  },
  {
    item: 'phone',
    kicker: 'the phone · Apple, 2007',
    title: 'The computer that fit a life',
    body: 'On 9 January 2007 Steve Jobs announced three things, a widescreen iPod, a phone and an internet device, and then said they were one. It went on sale that June. What arrived was not a better phone but a computer that fit a life: in a pocket, under a thumb, with you at breakfast and in the dark. Nearly every screen you touch today is a descendant.',
    why: 'The bar for “insanely good” was set in public, and it has not moved.',
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

export function pinocchioPanel(): PinocchioPanel {
  let mounted: { ctx: PanelCtx; sections: Map<PuppetItem, HTMLElement> } | null = null;
  let litTimer = 0;
  let lit: HTMLElement | null = null;

  const unlight = (): void => {
    clearTimeout(litTimer);
    litTimer = 0;
    lit?.classList.remove('lit');
    lit = null;
  };

  return {
    kicker: 'the puppet',
    title: 'The object comes first',
    mount(ctx: PanelCtx) {
      ensureStyle();
      const root = document.createElement('div');
      root.className = 'pinocchio';
      const intro = document.createElement('div');
      intro.className = 'pin-intro';
      intro.innerHTML = INTRO.map((t) => `<p>${t}</p>`).join('');
      root.append(intro);

      const sections = new Map<PuppetItem, HTMLElement>();
      for (const s of SECTIONS) {
        const el = document.createElement('section');
        el.className = 'pin-section';
        el.id = `pin-${s.item}`;
        el.innerHTML = `<p class="kicker">${s.kicker}</p><h2>${s.title}</h2><p>${s.body}</p><p class="pin-why">${s.why}</p>`;
        root.append(el);
        sections.set(s.item, el);
      }

      const coda = document.createElement('div');
      coda.className = 'pin-coda';
      coda.innerHTML =
        `<blockquote><p>${CODA.quote}</p><cite>${CODA.cite}</cite></blockquote>` +
        `<p>${CODA.goal}</p>` +
        `<p class="pin-sign">${CODA.sign}</p>`;
      root.append(coda);

      ctx.body.append(root);
      mounted = { ctx, sections };
      return () => { unlight(); mounted = null; };
    },
    goTo(item) {
      if (!mounted) return;
      const el = mounted.sections.get(item);
      if (!el) return;
      mounted.ctx.scrollTo(el);
      unlight();
      lit = el;
      el.classList.add('lit');
      litTimer = window.setTimeout(unlight, 1600);
    },
  };
}
