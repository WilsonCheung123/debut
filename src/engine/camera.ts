import * as THREE from 'three';
import gsap from 'gsap';
import { camera as camLayout, type FocusFrame } from '../layout';

export interface CamPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  /** View offset as a fraction of the viewport (0 = centred). Positive offX shifts content left. */
  offX: number;
  offY: number;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Unit vector from a target toward a camera at azimuth/elevation (degrees). */
export function dirFrom(azDeg: number, elDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azDeg);
  const el = THREE.MathUtils.degToRad(elDeg);
  return out.set(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/**
 * The camera rig. Owns a PerspectiveCamera and a `pose` that gsap tweens
 * (rest <-> focus), plus the pointer parallax applied on top at rest.
 */
export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(34, 1, 0.04, 30);
  /** The tweened pose. Tweens write here; update() applies it. */
  readonly pose: CamPose = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 34, offX: 0, offY: 0 };
  readonly rest: CamPose = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 34, offX: 0, offY: 0 };
  /** 'rest' allows parallax; anything else does not. */
  mode: 'rest' | 'focus' | 'moving' = 'rest';
  /** Pointer in NDC (-1..1); parallax only follows it at rest on fine pointers. */
  readonly pointer = new THREE.Vector2(0, 0);
  parallaxEnabled = true;
  private readonly parallax = new THREE.Vector2(0, 0);
  private width = 1;
  private height = 1;
  private tween: gsap.core.Tween | null = null;
  private readonly fitCam = new THREE.PerspectiveCamera(34, 1, 0.04, 30);
  private readonly v = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly right = new THREE.Vector3();
  /** Points the rest pose must frame (set from the objects' bounds at boot). */
  private mustSee: THREE.Vector3[] = camLayout.rest.mustSee.map((p) => new THREE.Vector3(...p));

  get portrait(): boolean { return this.height > this.width; }
  get aspect(): number { return this.width / this.height; }

  /** Replaces the points the rest pose frames (the objects' real bounds). Call fitRest afterwards. */
  setMustSee(points: THREE.Vector3[]): void {
    if (points.length) this.mustSee = points.map((p) => p.clone());
  }

  /** Recomputes the rest pose for a viewport so everything in mustSee fits with a margin. */
  fitRest(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    const cfg = this.portrait ? camLayout.rest.portrait : camLayout.rest.landscape;
    const target = new THREE.Vector3(...camLayout.rest.target);
    const dir = dirFrom(cfg.az, cfg.el);
    const pts = this.mustSee;
    const cam = this.fitCam;
    cam.aspect = this.camera.aspect;
    cam.fov = cfg.fov;
    cam.updateProjectionMatrix();
    const limit = 1 - cfg.margin * 2;
    const fits = (d: number): boolean => {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld(true);
      for (const p of pts) {
        this.v.copy(p).project(cam);
        if (Math.abs(this.v.x) > limit || Math.abs(this.v.y) > limit || this.v.z > 1) return false;
      }
      return true;
    };
    let lo = 0.6, hi = 10;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid; else lo = mid;
    }
    this.rest.position.copy(target).addScaledVector(dir, hi);
    this.rest.target.copy(target);
    this.rest.fov = cfg.fov;
    this.rest.offX = 0;
    this.rest.offY = 0;
  }

  /**
   * Builds the focus pose for an object from its world bounds and a layout
   * frame. `frame.dist` is the preferred (minimum) distance; the camera pulls
   * back further when the object would not fit the free area with a margin:
   * the full height left of the panel on landscape, the band above the sheet
   * on portrait. Nothing is ever clipped by the panel or the sheet.
   */
  resolveFocus(frame: FocusFrame, bounds: THREE.Box3, framing: { fx: number; fy: number; fitW: number; fitH: number }): CamPose {
    const centre = bounds.getCenter(new THREE.Vector3());
    if (frame.targetOffset) centre.add(new THREE.Vector3(...frame.targetOffset));
    let dist = frame.dist;
    if (this.portrait) dist *= frame.portraitDist ?? camLayout.portraitDistance;
    const dir = dirFrom(frame.az, frame.el);
    const restFov = this.rest.fov;
    const fov = THREE.MathUtils.clamp(frame.fov ?? restFov, restFov - 4, restFov);
    // fit: screen extents of the box seen from elevation el (worst-case yaw)
    const size = bounds.getSize(new THREE.Vector3());
    const el = THREE.MathUtils.degToRad(frame.el);
    const footprint = Math.max(size.x, size.z);
    const halfW = footprint / 2;
    const halfH = (size.y * Math.cos(el) + footprint * Math.sin(el)) / 2;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const needH = halfH / (framing.fitH * tanHalf);
    const needW = halfW / (framing.fitW * tanHalf * this.aspect);
    dist = Math.max(dist, needH, needW);
    return {
      position: centre.clone().addScaledVector(dir, dist),
      target: centre,
      fov,
      offX: 0.5 - framing.fx,
      offY: 0.5 - framing.fy,
    };
  }

  /**
   * Where the focused object sits on screen (viewport fractions) and how much
   * of the half-viewport it may fill (NDC fractions), given the panel's width
   * on landscape or the sheet's height fraction on portrait.
   */
  framing(panelWidth: number, sheetFraction = 0.5): { fx: number; fy: number; fitW: number; fitH: number } {
    if (this.portrait) {
      const band = 1 - sheetFraction;              // free band at the top
      return { fx: 0.5, fy: band / 2, fitW: 0.86, fitH: band * 0.72 };
    }
    const free = Math.max(0, this.width - panelWidth - 24);
    const fx = THREE.MathUtils.clamp((free / 2) / this.width, 0.24, 0.5);
    const freeFrac = free / this.width;
    return { fx, fy: 0.5, fitW: Math.max(0.3, freeFrac * 0.78), fitH: 0.72 };
  }

  /** Tweens the pose. Resolves when done. */
  tweenTo(to: CamPose, duration: number, ease: string): Promise<void> {
    this.killTween();
    this.mode = 'moving';
    const from = clonePose(this.pose);
    return new Promise((resolve) => {
      const p = this.pose;
      this.tween = gsap.to(
        { t: 0 },
        {
          t: 1,
          duration,
          ease,
          onUpdate: function (this: gsap.core.Tween) {
            const t = (this.targets()[0] as { t: number }).t;
            p.position.lerpVectors(from.position, to.position, t);
            p.target.lerpVectors(from.target, to.target, t);
            p.fov = from.fov + (to.fov - from.fov) * t;
            p.offX = from.offX + (to.offX - from.offX) * t;
            p.offY = from.offY + (to.offY - from.offY) * t;
          },
          onComplete: () => { this.tween = null; resolve(); },
        },
      );
    });
  }

  applyImmediate(to: CamPose): void {
    this.killTween();
    copyPose(this.pose, to);
  }

  killTween(): void {
    if (this.tween) { this.tween.kill(); this.tween = null; }
  }

  /** Applies pose + parallax to the camera. Call once per frame before render. */
  update(dt: number): void {
    const cam = this.camera;
    const p = this.pose;
    // parallax target: pointer at rest, zero otherwise; lerped 8% per frame (60 fps normalised)
    const want = this.mode === 'rest' && this.parallaxEnabled && !this.portrait ? this.pointer : ZERO2;
    const k = 1 - Math.pow(1 - camLayout.parallaxLerp, dt * 60);
    this.parallax.lerp(want, k);
    const yaw = THREE.MathUtils.degToRad(camLayout.parallaxDeg) * this.parallax.x;
    const pitch = THREE.MathUtils.degToRad(camLayout.parallaxDeg) * this.parallax.y;
    this.v.copy(p.position).sub(p.target);
    if (yaw !== 0 || pitch !== 0) {
      this.q.setFromAxisAngle(UP, -yaw);
      this.v.applyQuaternion(this.q);
      this.right.crossVectors(this.v, UP).normalize();
      this.q.setFromAxisAngle(this.right, pitch);
      this.v.applyQuaternion(this.q);
    }
    cam.position.copy(p.target).add(this.v);
    cam.lookAt(p.target);
    if (cam.fov !== p.fov) { cam.fov = p.fov; cam.updateProjectionMatrix(); }
    const ox = Math.round(p.offX * this.width);
    const oy = Math.round(p.offY * this.height);
    const view = cam.view;
    if (!view || view.offsetX !== ox || view.offsetY !== oy || view.fullWidth !== this.width || view.fullHeight !== this.height) {
      cam.setViewOffset(this.width, this.height, ox, oy, this.width, this.height);
    }
  }
}

const ZERO2 = new THREE.Vector2(0, 0);

export function clonePose(p: CamPose): CamPose {
  return { position: p.position.clone(), target: p.target.clone(), fov: p.fov, offX: p.offX, offY: p.offY };
}
export function copyPose(dst: CamPose, src: CamPose): void {
  dst.position.copy(src.position);
  dst.target.copy(src.target);
  dst.fov = src.fov;
  dst.offX = src.offX;
  dst.offY = src.offY;
}
