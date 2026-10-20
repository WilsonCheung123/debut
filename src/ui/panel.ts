import gsap from 'gsap';
import { isFactory, type PanelSpec, type PanelCtx } from '../panels/types';
import { noiseDataUrl } from '../materials/canvas';
import { api } from '../api';
import { state } from '../state';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

export interface PanelOpenOptions {
  objectId: string;
  onClose: () => void;
}

/**
 * The paper panel: a right-side card on landscape, a bottom sheet on portrait.
 * One instance, reused. Content is plain html or a custom factory.
 */
export class Panel {
  readonly el: HTMLElement;
  private readonly paper: HTMLDivElement;
  private readonly kickerEl: HTMLSpanElement;
  private readonly titleEl: HTMLHeadingElement;
  private readonly body: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly handle: HTMLDivElement;
  private readonly back: HTMLButtonElement;
  private cleanup: (() => void) | null = null;
  private onClose: (() => void) | null = null;
  private tween: gsap.core.Tween | gsap.core.Timeline | null = null;
  isOpen = false;
  /** True while the panel is a bottom sheet (portrait). Set by resize. */
  sheet = false;
  /** Sheet detents: opens at half (50% of the height); the handle drags it to full (70%). */
  static readonly DETENTS = { half: 0.5, full: 0.7 } as const;
  private detent: 'half' | 'full' = 'half';
  /** The sheet's height as a fraction of the viewport at open time (camera framing uses it). */
  get sheetFraction(): number { return Panel.DETENTS.half; }

  constructor(root: HTMLElement) {
    this.el = document.createElement('aside');
    this.el.id = 'panel';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-labelledby', 'panel-title');
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="paper">
        <div class="handle" aria-hidden="true"></div>
        <header>
          <button class="back" type="button" aria-label="Back to the table">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <span class="kicker"></span>
        </header>
        <div class="body" tabindex="-1">
          <h1 id="panel-title"></h1>
          <div class="content"></div>
        </div>
      </div>`;
    root.append(this.el);
    this.paper = this.el.querySelector('.paper')!;
    this.kickerEl = this.el.querySelector('.kicker')!;
    this.titleEl = this.el.querySelector('#panel-title')!;
    this.body = this.el.querySelector('.body')!;
    this.content = this.el.querySelector('.content')!;
    this.handle = this.el.querySelector('.handle')!;
    this.back = this.el.querySelector('.back')!;
    this.paper.style.setProperty('--grain', `url(${noiseDataUrl(128, 1, 11)})`);
    this.back.addEventListener('click', () => this.requestClose());
    this.el.addEventListener('keydown', (e) => this.trapTab(e));
    this.bindSheetDrag();
  }

  /** The panel's current width in CSS px (for camera framing). 0 when a sheet. */
  get widthPx(): number {
    return this.sheet ? 0 : Math.min(440, innerWidth - 48);
  }

  setSheet(sheet: boolean): void {
    if (sheet === this.sheet) return;
    this.sheet = sheet;
    this.el.classList.toggle('sheet', sheet);
    if (this.isOpen) this.setDetent('half', false);
  }

  open(spec: PanelSpec, opts: PanelOpenOptions): void {
    this.killTween();
    this.destroyContent();
    this.onClose = opts.onClose;
    this.kickerEl.textContent = spec.kicker;
    this.titleEl.textContent = spec.title;
    this.content.innerHTML = '';
    this.body.scrollTop = 0;
    if (isFactory(spec)) {
      const ctx: PanelCtx = {
        body: this.content,
        paper: this.paper,
        close: () => this.requestClose(),
        scrollTo: (el) => this.scrollTo(el),
        api,
        state,
        isSheet: this.sheet,
        objectId: opts.objectId,
      };
      const r = spec.mount(ctx);
      this.cleanup = typeof r === 'function' ? r : null;
    } else {
      this.content.innerHTML = spec.html;
    }
    this.el.hidden = false;
    this.isOpen = true;
    this.setDetent('half', false);
    this.el.style.transform = '';
    const from = state.reducedMotion
      ? { opacity: 0 }
      : this.sheet ? { opacity: 0, y: 32 } : { opacity: 0, x: 24 };
    gsap.set(this.paper, { x: 0, y: 0, opacity: 0 });
    this.tween = gsap.fromTo(this.paper, from, {
      opacity: 1, x: 0, y: 0, duration: 0.42, ease: 'expo.out', overwrite: true,
      onComplete: () => { this.tween = null; },
    });
    // keyboard users land on the back chevron; mouse users see no ring (:focus-visible)
    this.back.focus({ preventScroll: true });
  }

  /** Closes (240 ms power2.in). Resolves after the leave animation. */
  close(): Promise<void> {
    if (!this.isOpen) return Promise.resolve();
    this.isOpen = false;
    this.killTween();
    const to = state.reducedMotion ? { opacity: 0 } : this.sheet ? { opacity: 0, y: 32 } : { opacity: 0, x: 24 };
    return new Promise((resolve) => {
      this.tween = gsap.to(this.paper, {
        ...to, duration: 0.24, ease: 'power2.in', overwrite: true,
        onComplete: () => {
          this.tween = null;
          this.el.hidden = true;
          this.destroyContent();
          resolve();
        },
      });
    });
  }

  /** Scrolls the body so `el` sits near the top. */
  scrollTo(el: HTMLElement): void {
    const top = el.offsetTop - 12;
    this.body.scrollTo({ top, behavior: state.reducedMotion ? 'auto' : 'smooth' });
  }

  private requestClose(): void {
    this.onClose?.();
  }

  private destroyContent(): void {
    try { this.cleanup?.(); } catch (e) { console.error(e); }
    this.cleanup = null;
    this.content.innerHTML = '';
  }

  private killTween(): void {
    if (this.tween) { this.tween.kill(); this.tween = null; }
  }

  private trapTab(e: KeyboardEvent): void {
    if (e.key !== 'Tab' || !this.isOpen) return;
    const items = Array.from(this.el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || !this.el.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }

  private setDetent(d: 'half' | 'full', animate: boolean): void {
    this.detent = d;
    if (!this.sheet) { gsap.set(this.paper, { clearProps: 'maxHeight' }); return; } // the side card is full height
    const vh = `${Panel.DETENTS[d] * 100}dvh`;
    if (!animate || state.reducedMotion) { gsap.set(this.paper, { maxHeight: vh }); return; }
    gsap.to(this.paper, { maxHeight: vh, duration: 0.36, ease: 'power3.out', overwrite: 'auto' });
  }

  /** Bottom-sheet drag: pull the handle up to expand to 70%, down to go back to 50% or to close. */
  private bindSheetDrag(): void {
    let startY = 0, dy = 0, dragging = false, t0 = 0;
    const onMove = (e: PointerEvent): void => {
      if (!dragging) return;
      dy = e.clientY - startY;
      if (dy >= 0) gsap.set(this.paper, { y: dy });
      else gsap.set(this.paper, { y: Math.max(dy, -60) * 0.3 }); // light resistance upward
    };
    const end = (): void => {
      if (!dragging) return;
      dragging = false;
      window.removeEventListener('pointermove', onMove);
      const velocity = dy / Math.max(1, performance.now() - t0);
      gsap.to(this.paper, { y: 0, duration: 0.3, ease: 'power3.out' });
      if (dy < -40 || velocity < -0.5) { if (this.detent === 'half') this.setDetent('full', true); return; }
      if (this.detent === 'full' && (dy > 60 || velocity > 0.5)) { this.setDetent('half', true); return; }
      if (dy > 90 || velocity > 0.6) this.requestClose();
    };
    this.handle.addEventListener('pointerdown', (e) => {
      if (!this.sheet) return;
      dragging = true; startY = e.clientY; dy = 0; t0 = performance.now();
      this.killTween();
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', end, { once: true });
      window.addEventListener('pointercancel', end, { once: true });
    });
  }
}
