import gsap from 'gsap';
import { state } from '../state';

export interface BubbleContent {
  prompt: string;
  answer: string;
  link: { text: string; href: string };
}

export type BubbleEvent = 'show' | 'expand' | 'hide';

/**
 * The iMessage-style message bubble (Austen trick only). Bottom-centre, a
 * grey received-message bubble with one button; tapping it grows the bubble
 * to the answer's final size (measured from an invisible copy of the full
 * text, so typing never reflows it) and types the answer at 28 ms per
 * character with a caret, then fades in a quiet link.
 */
export class Bubble {
  static instance: Bubble | null = null;
  readonly el: HTMLDivElement;
  private typing: gsap.core.Tween | null = null;
  private outside: ((e: PointerEvent) => void) | null = null;
  private readonly listeners = new Set<(ev: BubbleEvent) => void>();
  visible = false;
  expanded = false;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'bubble';
    this.el.hidden = true;
    root.append(this.el);
    Bubble.instance = this;
  }

  on(fn: (ev: BubbleEvent) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  private emit(ev: BubbleEvent): void {
    for (const fn of this.listeners) { try { fn(ev); } catch (e) { console.error(e); } }
  }

  show(content: BubbleContent): void {
    this.hide(true);
    this.visible = true;
    this.expanded = false;
    this.el.hidden = false;
    this.el.className = 'ask';
    this.el.style.cssText = '';
    this.el.innerHTML = `${TAIL}<div class="box"><button type="button" class="ask-btn">${esc(content.prompt)}</button></div>`;
    const btn = this.el.querySelector<HTMLButtonElement>('.ask-btn')!;
    btn.addEventListener('click', () => this.expand(content));
    if (state.reducedMotion) gsap.fromTo(this.el, { opacity: 0 }, { opacity: 1, duration: 0.2, overwrite: true });
    else gsap.fromTo(this.el, { opacity: 0, y: 10, scale: 0.86 }, { opacity: 1, y: 0, scale: 1, duration: 0.42, ease: 'back.out(1.5)', overwrite: true });
    // dismiss on click outside (next tick so the opening click does not count)
    setTimeout(() => {
      if (!this.visible) return;
      this.outside = (e) => { if (!this.el.contains(e.target as Node)) this.hide(); };
      window.addEventListener('pointerdown', this.outside, true);
    }, 0);
    this.emit('show');
  }

  private expand(content: BubbleContent): void {
    if (this.expanded) return;
    this.expanded = true;
    const from = this.el.querySelector<HTMLDivElement>('.box')!.getBoundingClientRect();
    this.el.className = 'answer';
    this.el.innerHTML = `${TAIL}<div class="box"><div class="inner">
      <p class="typed" aria-hidden="true"><span class="ghost">${esc(content.answer)}</span><span class="live"><span class="text"></span><span class="caret"></span></span></p>
      <p class="after"><a href="${esc(content.link.href)}" target="_blank" rel="noopener">${esc(content.link.text)}</a></p>
      <p class="sr-only" aria-live="polite">${esc(content.answer)} ${esc(content.link.text)}</p>
    </div></div>`;
    const box = this.el.querySelector<HTMLDivElement>('.box')!;
    const inner = this.el.querySelector<HTMLDivElement>('.inner')!;
    const text = this.el.querySelector<HTMLSpanElement>('.text')!;
    const caret = this.el.querySelector<HTMLSpanElement>('.caret')!;
    const after = this.el.querySelector<HTMLParagraphElement>('.after')!;
    // the final size comes from the ghost copy; grow from the ask bubble's box to it
    gsap.killTweensOf(this.el);
    gsap.set(this.el, { clearProps: 'transform,opacity' });
    const to = box.getBoundingClientRect();
    const full = content.answer;
    const counter = { n: 0 };
    const finish = (): void => {
      text.textContent = full;
      caret.classList.add('done');
      gsap.to(after, { opacity: 1, duration: 0.45, delay: 0.25 });
    };
    const startTyping = (): void => {
      this.typing = gsap.to(counter, {
        n: full.length, duration: full.length * 0.028, ease: 'none',
        onUpdate: () => { text.textContent = full.slice(0, Math.floor(counter.n)); },
        onComplete: () => { this.typing = null; finish(); },
      });
    };
    if (state.reducedMotion) {
      gsap.fromTo(inner, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      startTyping();
    } else {
      box.style.width = `${from.width}px`;
      box.style.height = `${from.height}px`;
      gsap.set(inner, { opacity: 0 });
      gsap.to(box, {
        width: to.width, height: to.height, duration: 0.42, ease: 'power3.out',
        onComplete: () => { box.style.width = ''; box.style.height = ''; },
      });
      gsap.to(inner, { opacity: 1, duration: 0.25, delay: 0.16 });
      gsap.delayedCall(0.24, startTyping);
    }
    // a click on the bubble while typing completes it (bound on the next tick so the
    // click that opened the answer does not count)
    setTimeout(() => {
      this.el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('a')) return;
        if (this.typing) this.typing.progress(1);
      });
    }, 0);
    this.emit('expand');
  }

  hide(instant = false): void {
    if (!this.visible) return;
    this.visible = false;
    if (this.outside) { window.removeEventListener('pointerdown', this.outside, true); this.outside = null; }
    if (this.typing) { this.typing.kill(); this.typing = null; }
    const done = (): void => { this.el.hidden = true; this.el.innerHTML = ''; this.el.style.cssText = ''; };
    gsap.killTweensOf(this.el);
    if (instant || state.reducedMotion) { done(); this.emit('hide'); return; }
    gsap.to(this.el, { opacity: 0, y: 8, duration: 0.2, ease: 'power2.in', overwrite: true, onComplete: done });
    this.emit('hide');
  }
}

/** The bubble's tail, drawn here rather than borrowed: a small curl at the bottom-left. */
const TAIL = '<svg class="tail" viewBox="0 0 20 20" aria-hidden="true"><path d="M12 2 C12 10, 8 15.5, 0.5 19 C6 19.5, 14 18, 18 12 Z"/></svg>';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
