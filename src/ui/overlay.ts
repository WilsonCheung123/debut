import gsap from 'gsap';

/**
 * The CSS overlay on the canvas: a radial vignette whose clear "eye" follows
 * the focused object, plus a black layer for reduced-motion camera cuts.
 * depth 0 = rest, 1 = focused. During warm-up depth starts above 1.
 */
export class Overlay {
  readonly el: HTMLDivElement;
  private readonly vignette: HTMLDivElement;
  private readonly cutEl: HTMLDivElement;
  depth = 1.6;
  private eye = { x: 50, y: 50 };
  private last = { depth: NaN, x: NaN, y: NaN };

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'overlay';
    this.el.setAttribute('aria-hidden', 'true');
    this.vignette = document.createElement('div');
    this.vignette.className = 'vignette';
    this.cutEl = document.createElement('div');
    this.cutEl.className = 'cut';
    this.el.append(this.vignette, this.cutEl);
    root.append(this.el);
    this.apply();
  }

  /** Where the clear centre of the vignette sits, as viewport fractions. */
  setEye(fx: number, fy: number): void {
    this.eye.x = Math.round(fx * 1000) / 10;
    this.eye.y = Math.round(fy * 1000) / 10;
  }

  tweenDepth(to: number, duration: number, ease = 'power2.out'): gsap.core.Tween {
    return gsap.to(this, { depth: to, duration, ease, overwrite: 'auto' });
  }

  /** Fades to black, calls `mid`, fades back (reduced-motion camera cut). */
  cut(mid: () => void, duration = 0.2): Promise<void> {
    return new Promise((resolve) => {
      gsap.timeline({ onComplete: resolve })
        .to(this.cutEl, { opacity: 1, duration: duration / 2, ease: 'power1.in' })
        .call(mid)
        .to(this.cutEl, { opacity: 0, duration: duration / 2, ease: 'power1.out' });
    });
  }

  apply(): void {
    const d = Math.max(0, this.depth);
    if (d === this.last.depth && this.eye.x === this.last.x && this.eye.y === this.last.y) return;
    this.last = { depth: d, x: this.eye.x, y: this.eye.y };
    const s = this.vignette.style;
    const inner = Math.max(6, 34 - 16 * Math.min(d, 1));
    const outerAlpha = Math.min(0.97, 0.62 + 0.3 * d);
    s.setProperty('--vx', `${this.eye.x}%`);
    s.setProperty('--vy', `${this.eye.y}%`);
    s.setProperty('--vin', `${inner}%`);
    s.setProperty('--vout', String(outerAlpha));
    s.opacity = String(Math.min(1, 0.6 + 0.4 * d));
  }
}
