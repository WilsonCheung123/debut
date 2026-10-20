import * as THREE from 'three';
import gsap from 'gsap';
import type { TableObject, ObjectCtx } from '../objects/types';
import type { CameraRig, CamPose } from './camera';
import type { Lights } from './lights';
import type { Hover } from './hover';
import type { Picker } from './picking';
import type { Overlay } from '../ui/overlay';
import type { Label } from '../ui/label';
import type { Panel } from '../ui/panel';
import type { Bubble } from '../ui/bubble';
import type { A11yList } from '../ui/a11y';
import { focus as focusFrames } from '../layout';
import { state } from '../state';
import { austen } from '../content/austen';

export interface TimelineMark { ev: string; id?: string; t: number }

interface Deps {
  rig: CameraRig;
  lights: Lights;
  hover: Hover;
  picker: Picker;
  overlay: Overlay;
  label: Label;
  panel: Panel;
  bubble: Bubble;
  a11y: A11yList;
  objects: TableObject[];
  ctx: ObjectCtx;
}

const T = {
  camera: 0.9, cameraBack: 0.8, dim: 0.6, panelAt: 0.45, label: 0.12, cut: 0.2,
} as const;

/**
 * The focus choreography (SPEC 3): label out, camera + dim together, panel at
 * 450 ms, hash, trap; exit in reverse. Also hash routing, Esc, click routing
 * (in-focus clicks go to the object's onClickInside), and the Austen trick.
 */
export class Focus {
  readonly timeline: TimelineMark[] = [];
  private byId = new Map<string, TableObject>();
  private busyUntil = 0;
  private pushed = false;
  private origin: HTMLButtonElement | null = null;
  private seq = 0;
  private readonly bounds = new THREE.Box3();
  private readonly centre = new THREE.Vector3();
  private austenTimer = 0;
  private focusPose: CamPose | null = null;
  /** history.back() is asynchronous: a focus that follows an exit waits for it. */
  private backPending: Promise<void> | null = null;
  private resolveBack: (() => void) | null = null;

  constructor(private readonly d: Deps) {
    for (const o of d.objects) this.byId.set(o.id, o);
    window.addEventListener('hashchange', () => this.onHash());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.focused) { e.preventDefault(); this.exit(); }
    });
  }

  get focused(): TableObject | null { return state.focused ? this.byId.get(state.focused) ?? null : null; }
  /** True during the first 450 ms of a transition (clicks are ignored then). */
  get busy(): boolean { return performance.now() < this.busyUntil; }

  mark(ev: string, id?: string): void {
    this.timeline.push({ ev, id, t: Math.round(performance.now() * 10) / 10 });
  }

  /** Focus an object. Switching from another object exits it first. */
  async focus(id: string, opts: { viaHash?: boolean; origin?: HTMLButtonElement | null } = {}): Promise<void> {
    const obj = this.byId.get(id);
    if (!obj || obj.hit.length === 0 || state.focused === id) return;
    const seq = ++this.seq;
    if (state.focused) {
      await this.exit({ switching: true });
      if (seq !== this.seq) return;
    }
    if (this.backPending) {
      await this.backPending;
      if (seq !== this.seq || state.focused) return;
    }
    const d = this.d;
    state.focused = id;
    this.origin = opts.origin ?? null;
    this.mark('focus:start', id);
    this.busyUntil = performance.now() + T.panelAt * 1000;

    d.label.hide();
    d.hover.hold(obj);

    // resolve the pose from the object's real bounds and the viewport framing
    const frame = focusFrames[id] ?? { dist: 0.4, az: 8, el: 30 };
    d.picker.worldBounds(obj, this.bounds);
    const framing = d.rig.framing(d.panel.widthPx, d.panel.sheetFraction);
    const pose = d.rig.resolveFocus(frame, this.bounds, framing);
    this.focusPose = pose;
    this.bounds.getCenter(this.centre);
    d.lights.aimKeeper(this.centre, pose.position);
    d.overlay.setEye(framing.fx, framing.fy);

    // url + a11y
    if (!opts.viaHash) {
      const url = `#${encodeURIComponent(id)}`;
      if (this.pushed) history.replaceState({ table: id }, '', url);
      else { history.pushState({ table: id }, '', url); this.pushed = true; }
    }
    d.a11y.setExpanded(id);

    obj.focus.onEnter?.(d.ctx);
    const openPanel = (): void => {
      if (state.focused !== id || obj.focus.deferPanel) return;
      this.mark('panel:open', id);
      if (obj.focus.panel) d.panel.open(obj.focus.panel, { objectId: id, onClose: () => this.exit() });
    };

    if (state.reducedMotion) {
      d.rig.mode = 'moving';
      await d.overlay.cut(() => { d.rig.applyImmediate(pose); d.rig.mode = 'focus'; }, T.cut);
      if (seq !== this.seq) return;
      gsap.to(d.lights, { dim: 1, duration: 0.2, ease: 'power2.out', overwrite: 'auto' });
      d.overlay.tweenDepth(1, 0.2);
      openPanel();
      this.mark('focus:settled', id);
    } else {
      gsap.to(d.lights, { dim: 1, duration: T.dim, ease: 'power2.out', overwrite: 'auto' });
      d.overlay.tweenDepth(1, T.dim);
      gsap.delayedCall(T.panelAt, openPanel);
      await d.rig.tweenTo(pose, T.camera, 'power3.inOut');
      if (seq !== this.seq || state.focused !== id) return;
      d.rig.mode = 'focus';
      this.mark('focus:settled', id);
    }

    // The Austen trick: music playing + Pride and Prejudice → pause, then the bubble.
    if (id === 'book.pride-and-prejudice' && state.music.isPlaying) {
      try { state.music.pause?.(); } catch (e) { console.error(e); }
      state.music.isPlaying = false;
      clearTimeout(this.austenTimer);
      this.austenTimer = window.setTimeout(() => {
        if (state.focused === id) { this.mark('bubble:show', id); d.bubble.show(austen); }
      }, 600);
    }
  }

  /** Opens the focused object's panel now (objects that defer it past +450 ms: the ID after its flip). */
  openPanel(id: string): void {
    const obj = this.byId.get(id);
    if (!obj || state.focused !== id || !obj.focus.panel || this.d.panel.isOpen) return;
    this.mark('panel:open', id);
    this.d.panel.open(obj.focus.panel, { objectId: id, onClose: () => this.exit() });
  }

  /** Re-runs the camera to the focused object's current pose (after a flip, say). */
  reframe(id: string, duration = 0.6): void {
    const obj = this.byId.get(id);
    if (!obj || state.focused !== id) return;
    const d = this.d;
    const frame = focusFrames[id] ?? { dist: 0.4, az: 8, el: 30 };
    d.picker.worldBounds(obj, this.bounds);
    const pose = d.rig.resolveFocus(frame, this.bounds, d.rig.framing(d.panel.widthPx, d.panel.sheetFraction));
    this.focusPose = pose;
    if (state.reducedMotion) { d.rig.applyImmediate(pose); return; }
    d.rig.tweenTo(pose, duration, 'power2.inOut').then(() => { if (state.focused === id) d.rig.mode = 'focus'; });
  }

  /** Exit to rest. */
  async exit(opts: { viaHash?: boolean; switching?: boolean } = {}): Promise<void> {
    const obj = this.focused;
    if (!obj) return;
    const d = this.d;
    const seq = ++this.seq;
    const id = obj.id;
    this.mark('exit:start', id);
    state.focused = null;
    this.focusPose = null;
    clearTimeout(this.austenTimer);
    d.bubble.hide();
    d.a11y.setExpanded(null);
    obj.focus.onExit?.(d.ctx);
    d.hover.release();
    this.busyUntil = performance.now() + 240;

    if (!opts.viaHash && !opts.switching) {
      if (this.pushed) {
        this.pushed = false;
        this.ignoreNextEmptyHash = true;
        this.backPending = new Promise((resolve) => {
          const done = (): void => { this.backPending = null; this.resolveBack = null; resolve(); };
          this.resolveBack = done;
          window.setTimeout(done, 600); // never wait on a browser that does not deliver the event
        });
        history.back();
      } else {
        history.replaceState(null, '', location.pathname + location.search);
      }
    }

    const closing = d.panel.close();
    gsap.to(d.lights, { dim: 0, duration: T.dim, ease: 'power2.inOut', overwrite: 'auto' });
    d.overlay.tweenDepth(0, T.dim);
    if (state.reducedMotion) {
      d.rig.mode = 'moving';
      await closing;
      await d.overlay.cut(() => { d.rig.applyImmediate(d.rig.rest); }, T.cut);
    } else {
      await Promise.all([closing, d.rig.tweenTo(d.rig.rest, T.cameraBack, 'power3.inOut')]);
    }
    if (seq !== this.seq) return;
    if (!state.focused) d.rig.mode = 'rest';
    this.mark('exit:settled', id);
    // keyboard: focus returns to the originating button
    const origin = this.origin;
    this.origin = null;
    if (origin && !opts.switching) origin.focus({ preventScroll: true });
  }

  private ignoreNextEmptyHash = false;

  private onHash(): void {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) {
      if (this.ignoreNextEmptyHash) { this.ignoreNextEmptyHash = false; this.resolveBack?.(); return; }
      if (state.focused) { this.pushed = false; void this.exit({ viaHash: true }); }
      return;
    }
    if (this.byId.has(id) && state.focused !== id) {
      this.pushed = true; // the entry exists in history already
      void this.focus(id, { viaHash: true });
    }
  }

  /** Deep link on load: returns the id named by the hash, if valid. */
  deepLink(): string | null {
    const id = decodeURIComponent(location.hash.slice(1));
    return id && this.byId.has(id) ? id : null;
  }

  /** Canvas click routing. */
  routeClick(clientX: number, clientY: number): void {
    const d = this.d;
    if (this.busy) return;
    const focused = this.focused;
    if (!focused) {
      const minPx = state.isTouch ? 44 : 0;
      const pick = d.hover.atRest(() => d.picker.pickAt(clientX, clientY, minPx));
      if (pick) void this.focus(pick.obj.id);
      return;
    }
    const hit = d.picker.raycastObject(focused, clientX, clientY);
    if (hit && focused.focus.onClickInside) {
      this.mark('click:inside', hit.name || focused.id);
      focused.focus.onClickInside(hit.name, d.ctx);
      return;
    }
    void this.exit();
  }

  /** Resizing while focused: re-apply the pose for the new viewport (no tween). */
  onResize(): void {
    const obj = this.focused;
    if (!obj) return;
    const d = this.d;
    const frame = focusFrames[obj.id] ?? { dist: 0.4, az: 8, el: 30 };
    d.picker.worldBounds(obj, this.bounds);
    const framing = d.rig.framing(d.panel.widthPx, d.panel.sheetFraction);
    const pose = d.rig.resolveFocus(frame, this.bounds, framing);
    this.focusPose = pose;
    d.overlay.setEye(framing.fx, framing.fy);
    if (d.rig.mode === 'focus') d.rig.applyImmediate(pose);
  }

  get currentFocusPose(): CamPose | null { return this.focusPose; }
}
