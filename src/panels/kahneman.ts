// Thinking, Fast and Slow (SPEC 4.2): a custom panel in two steps.
//
//   1. Adelson's checker-shadow, with a proof the visitor performs: press and
//      hold the picture and everything but squares A and B dissolves into the
//      paper while a bar of the same grey bridges them. Let go and the
//      illusion comes straight back.
//   2. "Now a mental one." The anchoring experiment: group A or B (persisted
//      in localStorage), one anchored older/younger question, one numeric
//      guess, POST /api/anchor, then three numbers side by side with the
//      visitor's own guess highlighted in their group's column. The real
//      answer (78) is shown even when the API is unreachable.
//
// Routing: the books builder sets `focus.panel = kahnemanPanel()` on the
// Thinking, Fast and Slow book (panel id KAHNEMAN_PANEL_ID).
//
// Why the squares are painted here rather than trusted from the SVG: in
// Chromium the supplied asset renders A at #6e6e6e and B at #7a7a7a (B sits
// under 30-odd blurred shadow layers rather than all 37). The claim must be
// literally true of the pixels on screen, so the panel overlays both squares
// in one flat grey (#6f6f6f, A's native shade) and redraws the A/B labels from
// the asset's own glyph paths. The illusion is unchanged: B still sits among
// shadowed darks and still looks lighter.
import gsap from 'gsap';
import type { PanelFactory, PanelCtx } from './types';

export const KAHNEMAN_PANEL_ID = 'kahneman';

export interface KahnemanOptions {
  kicker?: string;
  title?: string;
  author?: string;
  blurb?: string;
}

const TEXT = {
  author: 'Daniel Kahneman',
  blurb: 'Self-awareness for your visual and mental illusions.',
  claim: 'Squares A and B are the same shade.',
  promptPointer: 'press and hold the picture',
  promptTouch: 'touch and hold the picture',
  promptHeld: 'now let go',
  mental: 'Now a mental one.',
  q1: (anchor: number) => `Was Gandhi older or younger than ${anchor} when he died?`,
  q2: 'How old was Gandhi when he died?',
  invalid: 'a whole number between 0 and 150',
  fetching: 'you answered this one before; fetching the averages',
  explain: "The first number was random and obviously wrong. It still pulled your guess toward it. That's anchoring: the mind starts from whatever it was handed and doesn't adjust far enough.",
  close: 'Like squares A and B: you can know the number is irrelevant and still be moved by it.',
  unavailable: 'The averages are unavailable right now.',
} as const;

type Group = 'A' | 'B';
const ANCHOR: Record<Group, number> = { A: 114, B: 35 };
const REAL_ANSWER = 78;
const KEY_GROUP = 'kahneman.group';
const KEY_GUESS = 'kahneman.guess';
const API_TIMEOUT_MS = 8000;

interface GroupStats { mean: number | null; n: number }
interface Stats { A: GroupStats; B: GroupStats }

// --- geometry of public/checker-shadow.svg (viewBox units) ------------------
// Square A is the dark square at grid (1,0); B is the light square at (2,2).
// A's corners come straight from the asset's dark-square path; B's are the
// shared corners of its four dark neighbours (they agree to 0.00). The bridge
// is a screen-vertical bar of the same grey, drawn as a stroked line whose
// ends sit 3 units inside A and B (over the patches, so the slanted square
// edges need no matching and there is no anti-aliasing seam); it is revealed
// with stroke-dashoffset, an attribute tween that needs no geometry queries.
const VIEWBOX = { w: 267.47, h: 203.43 };
const SQUARE_A = '132.39,50.04 165.52,57.16 147.46,76.49 114.02,69.18';
const SQUARE_B = '128.48,96.78 163.2,104.5 144.6,124.95 109.56,117.03';
const BRIDGE = { x: 138.15, y1: 69.82, y2: 103.6, width: 15 };
const BRIDGE_LEN = +(BRIDGE.y2 - BRIDGE.y1).toFixed(2);
const GREY = '#6f6f6f';
const GLYPH_A = 'm131.15 65.775 10.827-6.4947 1.3907 0.30265-3.0883 8.1788-1.4706-0.32003 1.0066-2.4615-4.0791-0.88768-3.2159 1.9808zm5.7224-2.3892 3.3072 0.7197 0.9429-2.246q0.42775-1.0238 0.77628-1.6664-0.86735 0.66252-1.8781 1.2818z';
const GLYPH_B = 'm128.93 113.7 7.0726-7.6641 3.8575 0.82134q1.1783 0.25088 1.6696 0.63696 0.50312 0.38235 0.45423 0.95366-0.037 0.56758-0.5243 1.0956-0.4535 0.49142-1.2116 0.84918-0.75812 0.35775-1.7266 0.47056 0.74467 0.4025 0.78915 0.99995 0.0515 0.59894-0.56602 1.2681-0.49692 0.53848-1.2349 0.93805-0.72613 0.39584-1.4066 0.55121-0.68044 0.15536-1.4814 0.1412-0.7891-0.0179-1.771-0.22696zm5.4614-4.154 2.2233 0.47339q0.90476 0.19264 1.3795 0.18739 0.62514-4e-3 1.1307-0.21587 0.51256-0.20988 0.88404-0.61243 0.35218-0.38163 0.37205-0.72143 0.0247-0.34503-0.33471-0.54666-0.35458-0.20685-1.4627-0.4428l-2.055-0.43755zm-3.2661 3.5393 2.56 0.54507q0.65929 0.14037 0.95957 0.16053 0.52781 0.0373 0.97851-0.0419 0.45069-0.0792 0.90979-0.31295 0.46391-0.239 0.80161-0.60495 0.3956-0.42869 0.39049-0.80509-2.9e-4 -0.38162-0.41052-0.61909-0.3984-0.2412-1.3803-0.45027l-2.3776-0.50624z';

const STYLE = `
#panel .content .kahneman .illusion { margin: 4px 0 0; }
#panel .content .kahneman .trick {
  display: block; position: relative; width: 100%; aspect-ratio: ${VIEWBOX.w} / ${VIEWBOX.h};
  padding: 0; border: 0; background: transparent; border-radius: 4px; min-height: 0; min-width: 0;
  cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: none;
}
#panel .content .kahneman .trick:hover { background: transparent; }
#panel .content .kahneman .trick:focus-visible { outline-offset: 4px; }
#panel .content .kahneman .trick img, #panel .content .kahneman .trick svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; pointer-events: none; }
#panel .content .kahneman .field { fill: var(--paper); }
#panel .content .kahneman figcaption { margin-top: 10px; }
#panel .content .kahneman .claim { margin: 0 0 4px; }
#panel .content .kahneman .prompt { transition: color .2s ease; }
#panel .content .kahneman .trick:hover + figcaption .prompt, #panel .content .kahneman[data-held] .prompt { color: var(--ink-soft); }
#panel .content .kahneman h2 { margin-top: 1.5em; }
#panel .content .kahneman .stage { position: relative; }
#panel .content .kahneman .stage > * { outline: none; }
#panel .content .kahneman .q { display: block; margin: 0 0 14px; }
#panel .content .kahneman .choices { display: flex; gap: 10px; }
#panel .content .kahneman .choices button { flex: 1 1 0; }
#panel .content .kahneman .row { display: flex; gap: 10px; align-items: stretch; }
#panel .content .kahneman .row input { flex: 1 1 auto; font-variant-numeric: tabular-nums; }
#panel .content .kahneman .row button { flex: 0 0 auto; }
#panel .content .kahneman .hint { min-height: 1.3em; margin: 8px 0 0; font-size: 14px; font-style: italic; color: var(--ink-faint); }
#panel .content .kahneman .placeholder { margin: 0; }
#panel .content .kahneman .cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0 0 18px; align-items: start; }
#panel .content .kahneman .col { position: relative; padding: 10px 8px 10px; border-radius: 4px; box-shadow: inset 0 0 0 1px transparent; transition: background-color .5s ease, box-shadow .5s ease; }
#panel .content .kahneman .col .kicker { display: block; }
#panel .content .kahneman .num { display: block; font-family: var(--serif); font-size: 34px; line-height: 1.1; margin: 6px 0 4px; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
#panel .content .kahneman .n { display: block; font-family: var(--sans); font-size: 12px; line-height: 1.35; color: var(--ink-faint); }
#panel .content .kahneman .you { display: block; font-family: var(--sans); font-size: 12px; line-height: 1.35; color: var(--maroon); margin-top: 4px; opacity: 0; transition: opacity .5s ease; }
#panel .content .kahneman .col.mine { box-shadow: inset 0 0 0 1px rgba(110,42,42,.18); }
#panel .content .kahneman .col.mine.lit { background: rgba(110,42,42,.06); box-shadow: inset 0 0 0 1px rgba(110,42,42,.32); }
#panel .content .kahneman .col.mine.lit .you { opacity: 1; }
#panel .content .kahneman .col.answer .num { color: var(--ink); }
#panel .content .kahneman .unavailable { font-style: italic; color: var(--ink-soft); }
#panel .content .kahneman .closing { color: var(--ink-soft); }
`;

function injectStyle(): void {
  if (document.getElementById('kahneman-style')) return;
  const s = document.createElement('style');
  s.id = 'kahneman-style';
  s.textContent = STYLE;
  document.head.append(s);
}

const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* private mode: the group lasts the session */ } },
};

function withTimeout<T>(p: Promise<T>, ms = API_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function figureHtml(): string {
  const { w, h } = VIEWBOX;
  return `
<figure class="illusion">
  <button class="trick" type="button" aria-label="Adelson's checker-shadow illusion. Press and hold to isolate squares A and B.">
    <img src="/checker-shadow.svg" alt="" draggable="false" decoding="async" />
    <svg viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">
      <defs>
        <mask id="kahneman-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}">
          <rect x="0" y="0" width="${w}" height="${h}" fill="#fff" />
          <polygon points="${SQUARE_A}" fill="#000" />
          <polygon points="${SQUARE_B}" fill="#000" />
        </mask>
      </defs>
      <g fill="${GREY}"><polygon points="${SQUARE_A}" /><polygon points="${SQUARE_B}" /></g>
      <g fill="#505050"><path d="${GLYPH_A}" /><path d="${GLYPH_B}" /></g>
      <rect class="field" x="0" y="0" width="${w}" height="${h}" mask="url(#kahneman-mask)" opacity="0" />
      <line class="bridge" x1="${BRIDGE.x}" y1="${BRIDGE.y1}" x2="${BRIDGE.x}" y2="${BRIDGE.y2}" stroke="${GREY}" stroke-width="${BRIDGE.width}" stroke-dasharray="${BRIDGE_LEN}" stroke-dashoffset="${BRIDGE_LEN}" />
    </svg>
  </button>
  <figcaption>
    <p class="claim">${TEXT.claim}</p>
    <p class="kicker prompt"></p>
  </figcaption>
</figure>`;
}

/**
 * The press-and-hold proof. A paused timeline: the bridge grows from A to B
 * (360 ms) while the rest of the picture fades to the paper (420 ms, from
 * 100 ms). Hold plays it, release reverses it slightly faster; reduced
 * motion jumps to either end.
 */
function mountIllusion(root: HTMLElement, ctx: PanelCtx, g: gsap.Context): void {
  const btn = root.querySelector<HTMLButtonElement>('.trick')!;
  const field = root.querySelector<SVGRectElement>('.field')!;
  const bridge = root.querySelector<SVGLineElement>('.bridge')!;
  const prompt = root.querySelector<HTMLElement>('.prompt')!;
  const idle = ctx.state.isTouch ? TEXT.promptTouch : TEXT.promptPointer;
  prompt.textContent = idle;

  let tl: gsap.core.Timeline | null = null;
  g.add(() => {
    tl = gsap.timeline({ paused: true })
      .fromTo(bridge, { attr: { 'stroke-dashoffset': BRIDGE_LEN } }, { attr: { 'stroke-dashoffset': 0 }, duration: 0.36, ease: 'power2.out' }, 0)
      .fromTo(field, { opacity: 0 }, { opacity: 1, duration: 0.42, ease: 'sine.inOut' }, 0.1);
  });

  const setPrompt = (text: string): void => {
    if (prompt.textContent === text) return;
    if (ctx.state.reducedMotion) { prompt.textContent = text; return; }
    g.add(() => {
      gsap.to(prompt, { opacity: 0, duration: 0.12, overwrite: true, onComplete: () => {
        prompt.textContent = text;
        gsap.to(prompt, { opacity: 1, duration: 0.22 });
      } });
    });
  };

  let held = false;
  const hold = (): void => {
    if (held) return;
    held = true;
    root.dataset.held = '1';
    if (ctx.state.reducedMotion) tl?.progress(1); else tl?.timeScale(1).play();
    setPrompt(TEXT.promptHeld);
  };
  const release = (): void => {
    if (!held) return;
    held = false;
    delete root.dataset.held;
    if (ctx.state.reducedMotion) tl?.progress(0); else tl?.timeScale(1.2).reverse();
    setPrompt(idle);
  };

  btn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    hold();
  });
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('lostpointercapture', release);
  btn.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (!e.repeat) hold();
  });
  btn.addEventListener('keyup', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    release();
  });
  btn.addEventListener('blur', release);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  // a pointer released outside the figure (capture lost on some browsers) must still let go
  g.add(() => {
    const onWindowUp = (): void => release();
    window.addEventListener('pointerup', onWindowUp);
    window.addEventListener('pointercancel', onWindowUp);
    return () => { window.removeEventListener('pointerup', onWindowUp); window.removeEventListener('pointercancel', onWindowUp); };
  });
}

/** One visible step at a time; height and content crossfade together so nothing jumps. */
class Stage {
  private current: HTMLElement | null = null;
  constructor(private readonly el: HTMLElement, private readonly reduced: boolean, private readonly g: gsap.Context) {}

  show(next: HTMLElement, after?: () => void): void {
    const prev = this.current;
    this.current = next;
    if (!prev) { this.el.append(next); after?.(); return; }
    if (this.reduced) { prev.replaceWith(next); after?.(); return; }
    const h1 = this.el.offsetHeight;
    this.g.add(() => {
      gsap.killTweensOf([this.el, prev]);
      prev.style.position = 'absolute';
      prev.style.left = '0'; prev.style.right = '0'; prev.style.top = '0';
      prev.style.pointerEvents = 'none';
      this.el.append(next);
      const h2 = next.offsetHeight;
      this.el.style.height = `${h1}px`;
      this.el.style.overflow = 'hidden';
      gsap.set(next, { opacity: 0, y: 8 });
      gsap.to(prev, { opacity: 0, duration: 0.18, ease: 'power1.in', onComplete: () => prev.remove() });
      gsap.to(this.el, { height: h2, duration: 0.36, ease: 'power2.inOut', onComplete: () => {
        this.el.style.height = '';
        this.el.style.overflow = '';
        after?.();
      } });
      gsap.to(next, { opacity: 1, y: 0, duration: 0.3, delay: 0.14, ease: 'power2.out' });
    });
  }
}

function questionOne(group: Group, onChoice: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'step q1';
  el.innerHTML = `
<p class="q">${TEXT.q1(ANCHOR[group])}</p>
<div class="choices">
  <button type="button" data-choice="older">Older</button>
  <button type="button" data-choice="younger">Younger</button>
</div>`;
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    el.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    onChoice();
  }));
  return el;
}

function questionTwo(onSubmit: (guess: number) => void): HTMLElement {
  const el = document.createElement('form');
  el.className = 'step q2 guess';
  el.noValidate = true;
  el.innerHTML = `
<label class="q" for="kahneman-guess">${TEXT.q2}</label>
<div class="row">
  <input id="kahneman-guess" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="3" aria-describedby="kahneman-hint" />
  <button type="submit">Submit</button>
</div>
<p class="hint" id="kahneman-hint" aria-live="polite"></p>`;
  const input = el.querySelector<HTMLInputElement>('input')!;
  const submit = el.querySelector<HTMLButtonElement>('button')!;
  const hint = el.querySelector<HTMLElement>('.hint')!;
  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = input.value.trim();
    const n = /^\d{1,3}$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(n) || n < 0 || n > 150) {
      hint.textContent = TEXT.invalid;
      input.focus({ preventScroll: true });
      input.select();
      return;
    }
    hint.textContent = '';
    submit.disabled = true;
    input.readOnly = true;
    onSubmit(n);
  });
  return el;
}

function columnHtml(group: Group, stats: Stats | null, mine: boolean, guess: number): string {
  const s = stats ? stats[group] : null;
  const hasMean = !!s && s.mean !== null && s.n > 0;
  const count = !s ? '' : s.n === 0 ? 'no one yet' : `average of ${s.n} ${s.n === 1 ? 'guess' : 'guesses'}`;
  return `
<div class="col${mine ? ' mine' : ''}">
  <span class="kicker">saw ${ANCHOR[group]}</span>
  <span class="num"${hasMean ? ` data-to="${s!.mean}"` : ''}>${hasMean ? '0' : '—'}</span>
  <span class="n">${count || ' '}</span>
  ${mine ? `<span class="you">you said ${guess}</span>` : ''}
</div>`;
}

function reveal(stats: Stats | null, group: Group, guess: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'step reveal';
  el.tabIndex = -1;
  el.innerHTML = `
<div class="cols">
  ${columnHtml('A', stats, group === 'A', guess)}
  ${columnHtml('B', stats, group === 'B', guess)}
  <div class="col answer">
    <span class="kicker">the real answer</span>
    <span class="num" data-to="${REAL_ANSWER}">0</span>
    <span class="n">1869 to 1948</span>
  </div>
</div>
${stats ? '' : `<p class="unavailable">${TEXT.unavailable}</p>`}
<p class="explain">${TEXT.explain}</p>
<p class="closing">${TEXT.close}</p>`;
  return el;
}

/** Counts the three numbers up (staggered), then lights the visitor's column. */
function animateReveal(el: HTMLElement, reduced: boolean, g: gsap.Context): void {
  const nums = Array.from(el.querySelectorAll<HTMLElement>('.num[data-to]'));
  const mine = el.querySelector<HTMLElement>('.col.mine');
  if (reduced) {
    for (const n of nums) { const to = Number(n.dataset.to); n.textContent = to.toFixed(Number.isInteger(to) ? 0 : 1); }
    mine?.classList.add('lit');
    return;
  }
  g.add(() => {
    nums.forEach((n, i) => {
      const to = Number(n.dataset.to);
      const decimals = Number.isInteger(to) ? 0 : 1;
      const o = { v: 0 };
      gsap.to(o, { v: to, duration: 1.1, delay: 0.25 + i * 0.16, ease: 'power3.out', onUpdate: () => { n.textContent = o.v.toFixed(decimals); } });
    });
    gsap.delayedCall(1.15, () => mine?.classList.add('lit'));
  });
}

function mountAnchoring(root: HTMLElement, ctx: PanelCtx, g: gsap.Context): () => void {
  const stageEl = root.querySelector<HTMLElement>('.stage')!;
  const stage = new Stage(stageEl, ctx.state.reducedMotion, g);
  let cancelled = false;
  const setStep = (s: 'q1' | 'q2' | 'reveal'): void => { root.dataset.step = s; };

  // assignment on load, persisted so the visitor stays in their group
  let group = store.get(KEY_GROUP) as Group | null;
  if (group !== 'A' && group !== 'B') {
    group = Math.random() < 0.5 ? 'A' : 'B';
    store.set(KEY_GROUP, group);
  }
  const grp: Group = group;

  const showReveal = (stats: Stats | null, guess: number): void => {
    if (cancelled) return;
    const keepFocus = stageEl.contains(document.activeElement);
    const el = reveal(stats, grp, guess);
    setStep('reveal');
    stage.show(el, () => {
      if (cancelled) return;
      el.scrollIntoView({ block: 'nearest', behavior: ctx.state.reducedMotion ? 'auto' : 'smooth' });
    });
    if (keepFocus) el.focus({ preventScroll: true });
    animateReveal(el, ctx.state.reducedMotion, g);
  };

  const stored = store.get(KEY_GUESS);
  const prior = stored === null ? NaN : Number(stored);
  if (Number.isFinite(prior)) {
    // a returning visitor is not asked twice: straight to the reveal with today's averages
    setStep('reveal');
    const p = document.createElement('p');
    p.className = 'step kicker placeholder';
    p.textContent = TEXT.fetching;
    stage.show(p);
    // only a slow fetch shows the placeholder; a quick one crossfades straight to the reveal
    if (!ctx.state.reducedMotion) g.add(() => { gsap.fromTo(p, { opacity: 0 }, { opacity: 1, duration: 0.3, delay: 0.4 }); });
    withTimeout(ctx.api.get<Stats>('/api/anchor/stats'))
      .then((s) => showReveal(s && s.A && s.B ? s : null, prior), () => showReveal(null, prior));
  } else {
    setStep('q1');
    stage.show(questionOne(grp, () => {
      if (cancelled) return;
      setStep('q2');
      const q2 = questionTwo((guess) => {
        if (cancelled) return;
        withTimeout(ctx.api.post<{ ok: boolean; stats?: Stats }>('/api/anchor', { group: grp, guess }))
          .then((r) => r && r.stats && r.stats.A && r.stats.B ? r.stats : null, () => null)
          .then((stats) => {
            if (cancelled) return;
            store.set(KEY_GUESS, String(guess));
            showReveal(stats, guess);
          });
      });
      stage.show(q2);
      // the input is ready as the step fades in
      g.add(() => { gsap.delayedCall(ctx.state.reducedMotion ? 0 : 0.16, () => { if (!cancelled) q2.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }); }); });
    }));
  }

  return () => { cancelled = true; };
}

export function kahnemanPanel(opts: KahnemanOptions = {}): PanelFactory {
  return {
    kicker: opts.kicker ?? 'a book',
    title: opts.title ?? 'Thinking, Fast and Slow',
    mount(ctx: PanelCtx) {
      injectStyle();
      const root = document.createElement('div');
      root.className = 'kahneman';
      root.innerHTML = `
<p class="byline">${opts.author ?? TEXT.author}</p>
<p>${opts.blurb ?? TEXT.blurb}</p>
${figureHtml()}
<h2>${TEXT.mental}</h2>
<div class="stage" aria-live="polite"></div>`;
      ctx.body.append(root);
      const g = gsap.context(() => { /* every tween of this mount is registered here */ });
      mountIllusion(root, ctx, g);
      const stopAnchoring = mountAnchoring(root, ctx, g);
      return () => {
        stopAnchoring();
        g.revert(); // kills every tween of this mount and runs the registered cleanups (window listeners)
      };
    },
  };
}

export default kahnemanPanel;
