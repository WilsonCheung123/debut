// Shelf mode for the books (SPEC 0.2), modelled on press.stripe.com: the
// cluster is focused ("books"), the row lifts to eye level and spreads out
// with air between the spines, the wheel / trackpad scrolls along it with
// inertia (the spines sway with the scroll), the book under the pointer
// leans out toward the viewer and shows its title, a click pulls that book
// off the shelf and turns its cover to the camera while its panel slides in;
// Esc or the chevron closes the book (then the shelf), and everything returns
// to the row exactly.
//
// What was taken from Stripe's canvas bundle (v1-Canvas / chunk-4UVTTYZA):
// a long lens and a frontal camera; every transform approaches its target
// exponentially at ~10–15 % per frame (no spring); the hovered spine is pulled
// toward the camera the same way; scroll input adds a short velocity kick to
// the books' rotation that decays within a few frames; the open book is held
// at a casual three-quarter angle (their x −0.5, y 0.35, z 0.15 rad). The
// numbers here are ours; the feel is theirs.
//
// Transforms: this class writes each book's `ShelfPose` (books.ts adds it to
// the engine's motion layer in gsap's tick, before the engine composes
// transforms) and the root's motion (lift and the scroll shift).
import * as THREE from 'three';
import gsap from 'gsap';
import type { ObjectCtx } from '../objects/types';
import type { PanelSpec } from './types';
import { state } from '../state';

export interface ShelfPose { x: number; z: number; lift: number; yaw: number; pitch: number; roll: number }

export interface ShelfBook {
  id: string;
  title: string;
  author: string;
  /** thickness, height, depth (metres). */
  size: [number, number, number];
  mesh: THREE.Mesh;
  group: THREE.Group;
  /** Local x of the book in the row (its base position). */
  restX: number;
  /** The offset this class writes (books.ts composes it into the motion layer). */
  pose: ShelfPose;
  panel(): PanelSpec;
}

export interface ShelfOptions {
  /** Local x of the row's centre (the camera looks here). */
  rowCentreX: number;
  bookends: { left: THREE.Object3D; right: THREE.Object3D; restLeft: number; restRight: number };
}

/** Air between spines on the shelf (metres). */
const GAP = 0.052;
/** The row rises this much (metres) into the camera's eye line. */
const LIFT = 0.10;
/** The hovered book: out toward the viewer and leaning. */
const HOVER = { z: 0.034, pitch: THREE.MathUtils.degToRad(11) };
/** The open book: pulled off the shelf toward the camera, cover turned to it at a casual angle. */
// (yaw -90 deg turns the front cover to +z, the camera; a little less so the cover squares up to a camera that sits right of the book)
const OPEN = { z: 0.165, yaw: -(Math.PI / 2 - THREE.MathUtils.degToRad(12)), pitch: -THREE.MathUtils.degToRad(5), roll: THREE.MathUtils.degToRad(3) };
/** The other books while one is open: a step back. */
const RECEDE_Z = -0.018;
/** Metres of shelf per CSS pixel of wheel travel. */
const WHEEL = 0.00055;
/** Scroll past the ends is allowed this far and springs back. */
const OVERSCROLL = 0.035;
/** How far past the view's edge the end books can scroll inward, as a fraction of the visible half-width. */
const END_REACH = 0.5;

const CSS = `
#shelf { position: absolute; inset: 0; pointer-events: none; opacity: 0; }
#shelf .shelf-back {
  position: absolute; top: 24px; left: 24px; width: 44px; height: 44px; display: inline-grid; place-items: center;
  pointer-events: auto; border: 0; background: transparent; color: var(--cream); border-radius: 22px; cursor: pointer; opacity: .75;
  transition: opacity .15s ease, background-color .15s ease;
}
#shelf .shelf-back:hover { opacity: 1; background: rgba(255,255,255,.06); }
#shelf .shelf-back:focus-visible { outline: 2px solid var(--cream); outline-offset: 2px; opacity: 1; }
#shelf .shelf-caption {
  position: absolute; left: 0; top: 0; transform: translate3d(-50%, 0, 0); text-align: center; white-space: nowrap; opacity: 0;
  font-family: var(--serif); font-size: 22px; line-height: 1.2; color: var(--cream); text-shadow: 0 1px 2px rgba(0,0,0,.85), 0 0 16px rgba(0,0,0,.7);
  will-change: transform, opacity;
}
#shelf .shelf-caption small {
  display: block; margin-top: 5px; font-family: var(--sans); font-size: 12px; font-weight: 500; letter-spacing: 0.14em;
  text-transform: lowercase; font-variant-caps: all-small-caps; color: rgba(242,234,216,.72);
}
#shelf .shelf-hint {
  position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); white-space: nowrap;
  font-family: var(--sans); font-size: 12px; font-weight: 500; letter-spacing: 0.14em; text-transform: lowercase; font-variant-caps: all-small-caps;
  color: rgba(242,234,216,.5); text-shadow: 0 1px 2px rgba(0,0,0,.8); transition: opacity .4s ease;
}
#shelf.open .shelf-hint { opacity: 0; }
`;
let styled = false;

export class Shelf {
  private active = false;
  /** 0 in the row, 1 spread on the shelf (tweened over the camera move). */
  private spread = 0;
  private openId: string | null = null;
  private hovered = -1;
  private pointerOwns = true;
  private readonly spreadX: number[];
  private readonly scroll = { pos: 0, target: 0, min: 0, max: 0, lean: 0, kick: 0, prev: 0 };
  /** True from enter() until the camera has arrived or the visitor scrolls: the target follows the left-end parking. */
  private parking = false;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly v = new THREE.Vector3();
  private readonly ray = new THREE.Ray();
  private readonly plane = new THREE.Plane();
  private readonly rootWorld = new THREE.Vector3();
  private readonly cur: { z: number; pitch: number; open: number }[];
  private el: HTMLDivElement | null = null;
  private caption: HTMLDivElement | null = null;
  private captionFor = -1;
  private unbind: (() => void)[] = [];
  private readonly canvas: HTMLCanvasElement;

  constructor(private readonly ctx: ObjectCtx, private readonly books: ShelfBook[], private readonly opts: ShelfOptions) {
    this.canvas = ctx.renderer.domElement;
    // the spread row, centred where the compact row was
    const total = books.reduce((a, b) => a + b.size[0], 0) + GAP * (books.length - 1);
    let x = opts.rowCentreX - total / 2;
    this.spreadX = books.map((b) => { const c = x + b.size[0] / 2; x += b.size[0] + GAP; return c; });
    this.cur = books.map(() => ({ z: 0, pitch: 0, open: 0 }));
  }

  get isActive(): boolean { return this.active; }
  get open(): string | null { return this.openId; }

  // ----------------------------------------------------------------- enter / exit

  enter(): void {
    if (this.active) return;
    this.active = true;
    this.openId = null;
    this.hovered = -1;
    this.pointerOwns = true;
    this.scroll.kick = 0; this.scroll.lean = 0;
    this.scroll.pos = this.scroll.target = this.scroll.prev = 0;
    this.parking = true; // the row glides to its left-end parking as the camera arrives (the bounds need the focus camera)
    gsap.killTweensOf(this);
    const dur = state.reducedMotion ? 0 : 0.9;
    gsap.to(this, { spread: 1, duration: dur, ease: 'power3.inOut', overwrite: true });
    this.mountDom();
    this.bind();
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.openId = null;
    this.hovered = -1;
    this.canvas.style.cursor = '';
    this.unbindAll();
    gsap.killTweensOf(this);
    gsap.to(this, { spread: 0, duration: state.reducedMotion ? 0 : 0.8, ease: 'power3.inOut', overwrite: true });
    const el = this.el;
    this.el = null;
    this.caption = null;
    if (el) gsap.to(el, { opacity: 0, duration: state.reducedMotion ? 0 : 0.2, ease: 'power1.in', onComplete: () => el.remove() });
  }

  /** Esc / click outside / chevron while the shelf is focused: close the open book and stay. */
  dismiss(): boolean {
    if (!this.active || !this.openId) return false;
    this.closeBook();
    return true;
  }

  dispose(): void { this.exit(); }

  // ----------------------------------------------------------------- books

  private index(id: string): number { return this.books.findIndex((b) => b.id === id); }

  /** A click on a book's mesh while the shelf is focused (routed by the engine). */
  clickBook(id: string): void {
    if (!this.active || this.spread < 0.6) return;
    const i = this.index(id);
    if (i < 0) return;
    if (this.openId === id) return;
    if (this.openId) {
      this.closeBook();
      gsap.delayedCall(0.26, () => { if (this.active && !this.openId) this.openBook(i); });
      return;
    }
    this.openBook(i);
  }

  private openBook(i: number): void {
    const b = this.books[i];
    this.openId = b.id;
    this.hovered = -1;
    this.setCaption(-1);
    this.canvas.style.cursor = '';
    this.el?.classList.add('open');
    this.ctx.openPanel('books', b.panel(), () => this.closeBook());
  }

  private closeBook(): void {
    if (!this.openId) return;
    this.openId = null;
    this.el?.classList.remove('open');
    void this.ctx.closePanel();
    if (this.pointerOwns) this.evalHover();
  }

  // ----------------------------------------------------------------- input

  private bind(): void {
    const onWheel = (e: WheelEvent): void => {
      if (!this.active) return;
      if (this.openId) return; // the panel scrolls itself
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
      const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
      this.scrollBy(d * WHEEL);
    };
    const onMove = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') return;
      this.pointerOwns = true;
      this.ndc.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
      this.evalHover();
    };
    const onLeave = (): void => { if (this.pointerOwns) this.setHovered(-1); };
    const onKey = (e: KeyboardEvent): void => {
      if (!this.active) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (this.openId) return;
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const from = this.hovered >= 0 ? this.hovered : (dir > 0 ? -1 : this.books.length);
        const next = THREE.MathUtils.clamp(from + dir, 0, this.books.length - 1);
        this.pointerOwns = false;
        this.setHovered(next);
        this.reveal(next);
      } else if (e.key === 'Enter' && !this.openId && this.hovered >= 0 && !this.pointerOwns) {
        e.preventDefault();
        this.openBook(this.hovered);
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    this.canvas.addEventListener('pointermove', onMove, { passive: true });
    this.canvas.addEventListener('pointerleave', onLeave);
    window.addEventListener('keydown', onKey);
    this.unbind.push(
      () => window.removeEventListener('wheel', onWheel),
      () => this.canvas.removeEventListener('pointermove', onMove),
      () => this.canvas.removeEventListener('pointerleave', onLeave),
      () => window.removeEventListener('keydown', onKey),
    );
  }

  private unbindAll(): void {
    for (const u of this.unbind) u();
    this.unbind = [];
  }

  /** Moves the shelf by `m` metres (positive = toward the right end); past the ends it springs back. */
  scrollBy(m: number): void {
    if (!this.active) return;
    const s = this.scroll;
    this.parking = false;
    s.target = THREE.MathUtils.clamp(s.target + m, s.min - OVERSCROLL, s.max + OVERSCROLL);
    s.kick = THREE.MathUtils.clamp(s.kick + m * 2.2, -0.22, 0.22);
  }

  /** Scrolls so book `i` sits well inside the view. */
  private reveal(i: number): void {
    const s = this.scroll;
    this.parking = false;
    const x = this.spreadX[i] - this.opts.rowCentreX; // view-centred local x of the book, at scroll 0
    const half = this.visibleHalf() * 0.72;
    if (x - s.target < -half) s.target = THREE.MathUtils.clamp(x + half, s.min, s.max);
    else if (x - s.target > half) s.target = THREE.MathUtils.clamp(x - half, s.min, s.max);
  }

  /** The pointer: which book's mesh is under it (the books as they are now; the leaning book grows, so this is stable). */
  private evalHover(): void {
    if (!this.active || this.openId || this.spread < 0.6) return;
    this.raycaster.setFromCamera(this.ndc, this.ctx.camera);
    const hits = this.raycaster.intersectObjects(this.books.map((b) => b.mesh), false);
    const id = hits.length ? hits[0].object.name : null;
    this.setHovered(id ? this.index(id) : -1);
  }

  /** QA: hover by id without a pointer. */
  hoverById(id: string | null): void {
    this.pointerOwns = false;
    const i = id ? this.index(id) : -1;
    if (i >= 0) this.reveal(i); // like the keyboard: a book the script names scrolls into view
    this.setHovered(i);
  }

  private setHovered(i: number): void {
    if (i === this.hovered) return;
    this.hovered = i;
    this.canvas.style.cursor = i >= 0 ? 'pointer' : '';
    this.setCaption(i);
  }

  // ----------------------------------------------------------------- per frame

  private readonly edge = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();
  /** Half the visible width (metres) at the row's depth: the view's centre to its right edge. */
  private visibleHalf(): number {
    const z = this.rowWorldZ();
    const e = this.pointAt(1, 0.5, z, this.edge);
    const m = this.pointAt(0.5, 0.5, z, this.mid);
    return e && m ? Math.max(0.1, Math.abs(e.x - m.x)) : 0.27;
  }

  private rowWorldZ(): number {
    this.opts.bookends.left.getWorldPosition(this.v);
    return this.v.z + 0.02;
  }

  /** The world point on the plane z = `z` seen at viewport fractions (fx, fy). */
  private pointAt(fx: number, fy: number, z: number, out: THREE.Vector3): THREE.Vector3 | null {
    const cam = this.ctx.camera;
    this.v.set(fx * 2 - 1, 1 - fy * 2, 0.5).unproject(cam);
    this.ray.origin.copy(cam.position);
    this.ray.direction.copy(this.v).sub(cam.position).normalize();
    this.plane.set(new THREE.Vector3(0, 0, 1), -z);
    return this.ray.intersectPlane(this.plane, out);
  }

  tick(dt: number): void {
    const sp = this.spread;
    const root = this.ctx.motion('books');
    if (sp === 0 && !this.active) {
      if (root.lift !== 0 || root.x !== 0) { root.lift = 0; root.x = 0; }
      for (const b of this.books) { const p = b.pose; p.x = p.z = p.lift = p.yaw = p.pitch = p.roll = 0; }
      this.opts.bookends.left.position.x = this.opts.bookends.restLeft;
      this.opts.bookends.right.position.x = this.opts.bookends.restRight;
      return;
    }
    const s = this.scroll;
    this.books[0].group.parent?.getWorldPosition(this.rootWorld);
    const k = state.reducedMotion ? 1 : 1 - Math.pow(0.84, dt * 60);
    const kh = state.reducedMotion ? 1 : 1 - Math.pow(0.86, dt * 60);

    // scroll bounds from the real view width; the first tick parks the row at its left end
    if (this.active) {
      const half = this.visibleHalf();
      const total = this.spreadX[this.spreadX.length - 1] - this.spreadX[0] + this.books[0].size[0] / 2 + this.books[this.books.length - 1].size[0] / 2 + 0.06;
      // the row parks with its first book at the view's left edge and scrolls past either end until the
      // end book sits well inside the view (round 3: the old bounds, the end books pinned at the edges, felt constrained)
      const edge = Math.max(0, total / 2 - half);
      const over = edge + half * END_REACH;
      s.min = -over; s.max = over;
      // the bounds are only right once the focus camera is in place (the spread tween runs with it): until then,
      // or until the visitor scrolls, the target tracks the parking so the row settles with its first book at the view's left edge
      if (this.parking) { s.target = -edge; if (sp > 0.995) this.parking = false; }
      // past the ends: ease back once the wheel is quiet
      if (s.target < s.min) s.target += (s.min - s.target) * Math.min(1, dt * 8);
      else if (s.target > s.max) s.target += (s.max - s.target) * Math.min(1, dt * 8);
    }
    if (!this.active) s.target = 0;
    s.pos += (s.target - s.pos) * (this.active ? k : Math.min(1, dt * 6));
    // the sway: a kick per wheel event that decays within a few frames (Stripe), plus the row's own velocity
    s.kick *= Math.pow(0.5, dt * 60);
    const vel = dt > 0 ? (s.pos - s.prev) / dt : 0;
    s.prev = s.pos;
    const leanTarget = state.reducedMotion ? 0 : THREE.MathUtils.clamp(s.kick * 0.6 + vel * 0.12, -0.16, 0.16);
    s.lean += (leanTarget - s.lean) * (state.reducedMotion ? 1 : 1 - Math.pow(0.8, dt * 60));

    root.lift = LIFT * sp;
    root.x = -s.pos * sp;

    // the open book's place: the centre of the free area left of the panel, at its own depth
    let openX = 0, openY = 0;
    const openIdx = this.openId ? this.index(this.openId) : -1;
    if (openIdx >= 0) {
      const b = this.books[openIdx];
      const panelW = state.portrait ? 0 : Math.min(440, innerWidth - 48);
      const fx = state.portrait ? 0.5 : Math.max(0.24, (innerWidth - panelW - 24) / 2 / innerWidth);
      const fy = state.portrait ? 0.3 : 0.5;
      const z = this.rootWorld.z + b.group.position.z + OPEN.z;
      const p = this.pointAt(fx, fy, z, this.v);
      // the root's world position already carries the scroll shift and the lift
      if (p) { openX = p.x - this.rootWorld.x - b.restX; openY = p.y - this.rootWorld.y - b.size[1] / 2; }
    }

    for (let i = 0; i < this.books.length; i++) {
      const b = this.books[i], p = b.pose, c = this.cur[i];
      const isOpen = i === openIdx;
      const isHover = !this.openId && i === this.hovered;
      c.open += ((isOpen ? 1 : 0) - c.open) * kh;
      const hz = isHover ? HOVER.z : (this.openId && !isOpen ? RECEDE_Z : 0);
      c.z += (hz - c.z) * kh;
      c.pitch += ((isHover ? HOVER.pitch : 0) - c.pitch) * kh;
      const o = THREE.MathUtils.smoothstep(c.open, 0, 1);
      const shelfX = (this.spreadX[i] - b.restX) * sp;
      p.x = shelfX + (openX - shelfX) * o;
      p.z = c.z * sp + OPEN.z * o;
      p.lift = openY * o;
      p.yaw = OPEN.yaw * o;
      p.pitch = c.pitch * sp * (1 - o) + OPEN.pitch * o;
      p.roll = s.lean * sp * (1 - o) + OPEN.roll * o;
    }
    // the bookends ride with the row's ends
    const first = this.books[0], last = this.books[this.books.length - 1];
    const be = this.opts.bookends;
    be.left.position.x = be.restLeft + (this.spreadX[0] - first.restX) * sp;
    be.right.position.x = be.restRight + (this.spreadX[this.spreadX.length - 1] - last.restX) * sp;
    this.placeCaption();
  }

  // ----------------------------------------------------------------- dom

  private mountDom(): void {
    if (!styled) { styled = true; const st = document.createElement('style'); st.textContent = CSS; document.head.append(st); }
    const ui = document.getElementById('ui');
    if (!ui) return;
    const el = document.createElement('div');
    el.id = 'shelf';
    el.innerHTML = `
      <button class="shelf-back" type="button" aria-label="Back to the table">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="shelf-caption" aria-live="polite"></div>
      <div class="shelf-hint">${state.isTouch ? 'tap a book' : 'scroll along the shelf · click a book · esc to return'}</div>`;
    ui.append(el);
    el.querySelector('.shelf-back')!.addEventListener('click', () => this.ctx.exit());
    this.el = el;
    this.caption = el.querySelector('.shelf-caption');
    gsap.to(el, { opacity: 1, duration: state.reducedMotion ? 0 : 0.5, delay: state.reducedMotion ? 0 : 0.4, ease: 'power1.out' });
  }

  private setCaption(i: number): void {
    const cap = this.caption;
    if (!cap) return;
    if (i < 0) { gsap.to(cap, { opacity: 0, duration: 0.12, ease: 'power1.in', overwrite: true }); return; }
    const b = this.books[i];
    if (this.captionFor !== i) {
      cap.innerHTML = `${esc(b.title)}<small>${esc(b.author)}</small>`;
      this.captionFor = i;
    }
    gsap.to(cap, { opacity: 1, duration: 0.16, ease: 'power1.out', overwrite: true });
  }

  /** The caption sits under the hovered book, following it as the row scrolls. */
  private placeCaption(): void {
    const cap = this.caption;
    if (!cap || this.hovered < 0) return;
    const b = this.books[this.hovered];
    this.v.set(0, 0, b.size[2] / 2);
    b.group.localToWorld(this.v);
    this.v.y = this.rootWorld.y - 0.012;
    this.v.project(this.ctx.camera);
    const x = (this.v.x + 1) / 2 * innerWidth;
    const y = (1 - this.v.y) / 2 * innerHeight + 22;
    cap.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(Math.min(innerHeight - 90, y))}px, 0) translateX(-50%)`;
  }

  /** QA snapshot. */
  snapshot(): { active: boolean; spread: number; open: string | null; hovered: string | null; scroll: number; min: number; max: number; lean: number; settled: boolean } {
    return {
      active: this.active, spread: this.spread, open: this.openId,
      hovered: this.hovered >= 0 ? this.books[this.hovered].id : null,
      scroll: this.scroll.pos, min: this.scroll.min, max: this.scroll.max, lean: this.scroll.lean,
      // QA: the row has stopped moving (a scripted click aimed at a gliding book misses; a person's cannot)
      settled: Math.abs(this.scroll.pos - this.scroll.target) < 0.0015 && this.scroll.target >= this.scroll.min - 0.001 && this.scroll.target <= this.scroll.max + 0.001,
    };
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
