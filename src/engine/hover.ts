import * as THREE from 'three';
import gsap from 'gsap';
import type { TableObject, Motion } from '../objects/types';
import type { Picker } from './picking';
import { state } from '../state';

interface Rig {
  obj: TableObject;
  base: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  saved: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  hover: { t: number; tiltX: number; tiltZ: number; wantX: number; wantZ: number };
  motion: Motion;
  /** Half-extent of the hit shapes on the table plane, for normalising the cursor offset. */
  radius: number;
  dirty: boolean;
}

const EULER = new THREE.Euler();
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Hover lift and the per-object transform composition. The engine owns each
 * object's `group` transform: layout pose + hover spring + the focus-layer
 * Motion that objects may tween. Nothing else writes to `group`.
 */
export class Hover {
  private rigs = new Map<string, Rig>();
  /** The object under the pointer / keyboard focus (label shown), or null. */
  current: TableObject | null = null;
  /** The focused object: kept lifted until release(). */
  held: TableObject | null = null;
  onChange: ((obj: TableObject | null) => void) | null = null;
  private readonly onTable = new THREE.Vector3();

  register(obj: TableObject): void {
    obj.group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    for (const h of obj.hit) {
      h.traverse((n) => {
        const m = n as THREE.Mesh;
        if (!m.isMesh || !m.geometry) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
        box.union(tmp);
      });
    }
    const size = box.isEmpty() ? new THREE.Vector3(0.1, 0.1, 0.1) : box.getSize(new THREE.Vector3());
    this.rigs.set(obj.id, {
      obj,
      base: { position: obj.group.position.clone(), quaternion: obj.group.quaternion.clone() },
      saved: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
      hover: { t: 0, tiltX: 0, tiltZ: 0, wantX: 0, wantZ: 0 },
      motion: { lift: 0, yaw: 0, pitch: 0, roll: 0, x: 0, z: 0 },
      radius: Math.max(0.02, Math.max(size.x, size.z) / 2),
      dirty: false,
    });
  }

  motion(id: string): Motion {
    const r = this.rigs.get(id);
    if (!r) throw new Error(`unknown object ${id}`);
    return r.motion;
  }

  /** Enter / leave with the damped spring. Passing the same object is a no-op. */
  set(obj: TableObject | null): void {
    if (obj === this.current) return;
    const prev = this.current;
    this.current = obj;
    if (prev && prev !== this.held) this.settle(prev);
    if (obj) this.lift(obj);
    state.hovered = obj ? obj.id : null;
    this.onChange?.(obj);
  }

  /** Keeps an object lifted through focus (no label). */
  hold(obj: TableObject): void {
    this.held = obj;
    if (this.current !== obj) { this.set(null); this.lift(obj); }
    else this.set(null);
  }

  /** Lets the focused object settle (450 ms, no overshoot). */
  release(): void {
    const h = this.held;
    this.held = null;
    if (h && h !== this.current) this.settle(h);
  }

  private lift(obj: TableObject): void {
    const r = this.rigs.get(obj.id);
    if (!r) return;
    r.dirty = true;
    if (state.reducedMotion) { r.hover.t = 0; obj.hover?.onHover?.(true); return; }
    gsap.killTweensOf(r.hover);
    const spring = obj.hover?.spring;
    gsap.to(r.hover, { t: 1, duration: spring?.duration ?? 0.35, ease: `back.out(${spring?.overshoot ?? 1.7})`, overwrite: true });
    obj.hover?.onHover?.(true);
  }

  private settle(obj: TableObject): void {
    const r = this.rigs.get(obj.id);
    if (!r) return;
    r.dirty = true;
    gsap.killTweensOf(r.hover);
    if (state.reducedMotion) { r.hover.t = 0; obj.hover?.onHover?.(false); return; }
    const settle = 0.45 * ((obj.hover?.spring?.duration ?? 0.35) / 0.35);
    gsap.to(r.hover, { t: 0, duration: settle, ease: 'power2.out', overwrite: true });
    obj.hover?.onHover?.(false);
  }

  /** Computes the tilt target for the hovered object from the pointer. */
  updateTilt(picker: Picker, dt: number): void {
    const k = 1 - Math.pow(0.85, dt * 60);
    for (const r of this.rigs.values()) {
      const active = r.obj === this.current || r.obj === this.held;
      const tiltDeg = r.obj.hover?.tilt ?? 3;
      const mode = r.obj.hover?.tiltMode ?? 'cursor';
      if (active && !state.reducedMotion) {
        if (mode === 'forward') {
          r.hover.wantX = THREE.MathUtils.degToRad(tiltDeg);
          r.hover.wantZ = 0;
        } else if (picker.pointer.inside && r.obj === this.current && !state.isTouch) {
          const p = picker.pointerOnTable(picker.pointer.x, picker.pointer.y, this.onTable);
          if (p) {
            r.obj.group.getWorldPosition(V);
            const nx = THREE.MathUtils.clamp((p.x - V.x) / r.radius, -1, 1);
            const nz = THREE.MathUtils.clamp((p.z - V.z) / r.radius, -1, 1);
            r.hover.wantX = -nz * THREE.MathUtils.degToRad(tiltDeg);
            r.hover.wantZ = nx * THREE.MathUtils.degToRad(tiltDeg);
          }
        } else {
          r.hover.wantX = 0; r.hover.wantZ = 0;
        }
      } else {
        r.hover.wantX = 0; r.hover.wantZ = 0;
      }
      if (r.hover.tiltX !== r.hover.wantX || r.hover.tiltZ !== r.hover.wantZ) {
        r.hover.tiltX += (r.hover.wantX - r.hover.tiltX) * k;
        r.hover.tiltZ += (r.hover.wantZ - r.hover.tiltZ) * k;
        if (Math.abs(r.hover.tiltX - r.hover.wantX) < 1e-5) r.hover.tiltX = r.hover.wantX;
        if (Math.abs(r.hover.tiltZ - r.hover.wantZ) < 1e-5) r.hover.tiltZ = r.hover.wantZ;
        r.dirty = true;
      }
    }
  }

  /** Composes base + hover + motion into each group's transform. */
  apply(): void {
    for (const r of this.rigs.values()) {
      const h = r.hover, m = r.motion, g = r.obj.group;
      const moving = h.t !== 0 || m.lift !== 0 || m.yaw !== 0 || m.pitch !== 0 || m.roll !== 0 || m.x !== 0 || m.z !== 0;
      if (!moving && !r.dirty) continue;
      r.dirty = moving;
      const lift = (r.obj.hover?.lift ?? 0.012) * h.t + m.lift;
      g.position.set(r.base.position.x + m.x, r.base.position.y + lift, r.base.position.z + m.z);
      EULER.set(h.tiltX * h.t + m.pitch, m.yaw, h.tiltZ * h.t + m.roll, 'YXZ');
      Q.setFromEuler(EULER);
      g.quaternion.copy(Q).multiply(r.base.quaternion);
      void UP;
    }
  }

  /**
   * Runs `fn` with every lifted/tilted object temporarily at its rest
   * transform, so picking is a pure function of pointer and camera. Objects
   * mid-focus (motion layer) are left alone: hover is not resolved then.
   */
  atRest<T>(fn: () => T): T {
    const touched: Rig[] = [];
    for (const r of this.rigs.values()) {
      const h = r.hover;
      if (h.t === 0 && h.tiltX === 0 && h.tiltZ === 0) continue;
      const g = r.obj.group;
      r.saved.position.copy(g.position);
      r.saved.quaternion.copy(g.quaternion);
      g.position.copy(r.base.position);
      g.quaternion.copy(r.base.quaternion);
      g.updateMatrixWorld(true);
      touched.push(r);
    }
    try {
      return fn();
    } finally {
      for (const r of touched) {
        const g = r.obj.group;
        g.position.copy(r.saved.position);
        g.quaternion.copy(r.saved.quaternion);
        g.updateMatrixWorld(true);
      }
    }
  }

  /** Current lift fraction (0..1) of an object, for QA. */
  liftOf(id: string): number { return this.rigs.get(id)?.hover.t ?? 0; }
}
