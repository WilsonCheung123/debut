import gsap from 'gsap';

/** The hover label: small caps, cream on nothing, at the object's anchor. */
export class Label {
  readonly el: HTMLDivElement;
  private text = '';
  private w = 0;
  private h = 0;
  visible = false;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'label';
    this.el.setAttribute('aria-hidden', 'true');
    root.append(this.el);
  }

  show(text: string): void {
    if (this.text !== text) {
      this.text = text;
      this.el.textContent = text;
      this.w = this.el.offsetWidth;
      this.h = this.el.offsetHeight;
    }
    if (this.visible) return;
    this.visible = true;
    gsap.to(this.el, { opacity: 1, duration: 0.12, ease: 'power1.out', overwrite: true });
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    gsap.to(this.el, { opacity: 0, duration: 0.12, ease: 'power1.in', overwrite: true });
  }

  /** Places the label above an anchor (CSS px), clamped inside the viewport. */
  place(x: number, y: number): void {
    if (!this.visible && +this.el.style.opacity === 0) return;
    const pad = 12;
    const gap = 14;
    let left = x - this.w / 2;
    let top = y - gap - this.h;
    left = Math.max(pad, Math.min(innerWidth - this.w - pad, left));
    if (top < pad) top = y + gap; // no room above: sit below the anchor
    top = Math.min(innerHeight - this.h - pad, top);
    this.el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  }
}
