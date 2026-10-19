import gsap from 'gsap';

export interface BubbleContent {
  prompt: string;
  answer: string;
  link: { text: string; href: string };
}

/**
 * The iMessage-style message bubble (Austen trick only). Bottom-centre, grey,
 * one button; tapping it expands a white bubble that types the answer at
 * 28 ms per character with a blinking caret, then shows a quiet link.
 */
export class Bubble {
  readonly el: HTMLDivElement;
  private typing: gsap.core.Tween | null = null;
  private outside: ((e: PointerEvent) => void) | null = null;
  visible = false;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'bubble';
    this.el.hidden = true;
    root.append(this.el);
  }

  show(content: BubbleContent): void {
    this.hide(true);
    this.visible = true;
    this.el.hidden = false;
    this.el.className = 'ask';
    this.el.innerHTML = `<button type="button" class="ask-btn">${esc(content.prompt)}</button>`;
    const btn = this.el.querySelector<HTMLButtonElement>('.ask-btn')!;
    btn.addEventListener('click', () => this.expand(content));
    gsap.fromTo(this.el, { opacity: 0, y: 12, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: 'back.out(1.6)', overwrite: true });
    // dismiss on click outside (next tick so the opening click does not count)
    setTimeout(() => {
      if (!this.visible) return;
      this.outside = (e) => { if (!this.el.contains(e.target as Node)) this.hide(); };
      window.addEventListener('pointerdown', this.outside, true);
    }, 0);
  }

  private expand(content: BubbleContent): void {
    this.el.className = 'answer';
    this.el.innerHTML = `<p class="typed" aria-live="polite"><span class="text"></span><span class="caret" aria-hidden="true"></span></p><p class="after"><a href="${esc(content.link.href)}" target="_blank" rel="noopener">${esc(content.link.text)}</a></p>`;
    const text = this.el.querySelector<HTMLSpanElement>('.text')!;
    const caret = this.el.querySelector<HTMLSpanElement>('.caret')!;
    const after = this.el.querySelector<HTMLParagraphElement>('.after')!;
    gsap.fromTo(this.el, { scale: 0.98 }, { scale: 1, duration: 0.3, ease: 'power3.out' });
    const full = content.answer;
    const state = { n: 0 };
    const finish = (): void => {
      text.textContent = full;
      caret.classList.add('done');
      gsap.to(after, { opacity: 1, duration: 0.4, delay: 0.2 });
    };
    this.typing = gsap.to(state, {
      n: full.length, duration: full.length * 0.028, ease: 'none',
      onUpdate: () => { text.textContent = full.slice(0, Math.floor(state.n)); },
      onComplete: () => { this.typing = null; finish(); },
    });
    // a click on the bubble while typing completes it (bound on the next tick so the
    // click that opened the answer does not count)
    setTimeout(() => {
      this.el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('a')) return;
        if (this.typing) this.typing.progress(1);
      });
    }, 0);
  }

  hide(instant = false): void {
    if (!this.visible) return;
    this.visible = false;
    if (this.outside) { window.removeEventListener('pointerdown', this.outside, true); this.outside = null; }
    if (this.typing) { this.typing.kill(); this.typing = null; }
    const done = (): void => { this.el.hidden = true; this.el.innerHTML = ''; };
    if (instant) { gsap.killTweensOf(this.el); done(); return; }
    gsap.to(this.el, { opacity: 0, y: 8, duration: 0.2, ease: 'power2.in', overwrite: true, onComplete: done });
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
