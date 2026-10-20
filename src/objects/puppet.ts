import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ObjectCtx, TableObject } from './types';
import { roundedBox, hitProxy, solid } from './helpers';
import { makeCanvasTexture, hash2, plastic, metal, standard } from '../materials';
import { pinocchioPanel, type PuppetItem } from '../panels/pinocchio';
import { flags } from '../state';
import { HIT_LAYER } from '../engine/picking';

// The wooden puppet (SPEC 4.8, round 2 in 0.2): our own marionette, not
// Disney's character. Pale wood with grain, ball joints, a long conical nose,
// a painted collar, a painted face and hair. He stands on a small round oak
// base (a slim steel stand rod at his back keeps the lean honest), head turned
// toward the camera, an instant camera cradled palm-up in his left hand and a
// phone held screen-out in his right. Six threads run from his head, wrists
// and knees to a wooden cross-bar controller lying on the table behind him.
//
// Hands. Each hand is built in the held item's own local space, so the grip is
// a function of the item's box: the palm sits CLEAR metres off one face, each
// finger is a capsule chain swept around a box edge at exactly CLEAR from the
// surface (straight run, quarter arcs around the rounded corners, straight
// run), the thumb the same around the opposite edge. Nothing of the hand can
// touch the glass; `__puppet.clearance()` (?qa=1) measures it from the final
// mesh so the scenario asserts it.
//
// In focus, hovering the figure, the phone or the camera lifts it a few mm and
// names it (a DOM tag styled like the hover label); clicking opens that item's
// description in the panel. Hit meshes are named by item ('puppet' | 'camera'
// | 'phone') so the engine's in-focus click routing tells us which was clicked.
//
// Layout: group origin at the bottom centre of the base, y up, +z toward the
// puppet's front. The figure group sits on the base top (y = BASE_H) and holds
// the lean; everything above the base is built in figure space.

const BASE_R = 0.046;
const BASE_H = 0.012;
const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const ONE = new THREE.Vector3(1, 1, 1);
const Q0 = new THREE.Quaternion();
const deg = THREE.MathUtils.degToRad;

/** The phone: a modern glass slab, oversized for legibility (SPEC 0.2). Centre at its origin. */
const PH = { w: 0.028, h: 0.058, d: 0.0066, r: 0.0045, edge: 0.0009 };
/** The instant camera: white body, black lens block. Centre at its origin. */
const CAM = { w: 0.046, h: 0.036, d: 0.030, r: 0.004 };
const FINGER_R = 0.0024;
const THUMB_R = 0.0028;
/** Gap between any part of a hand and the held item's surface. */
const CLEAR = 0.0012;

type Bucket = THREE.BufferGeometry[];
const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const mat = (p: THREE.Vector3, q = Q0, s = ONE): THREE.Matrix4 => new THREE.Matrix4().compose(p, q, s);
const euler = (x: number, y: number, z: number): THREE.Quaternion => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
/** Places a part and drops its index (CapsuleGeometry is non-indexed in r186; merged parts must all match). */
const put = (bucket: Bucket, geo: THREE.BufferGeometry, m: THREE.Matrix4): void => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  g.applyMatrix4(m);
  bucket.push(g);
};
const ball = (bucket: Bucket, p: THREE.Vector3, r: number, pre?: THREE.Matrix4): void =>
  put(bucket, new THREE.SphereGeometry(r, 20, 14), pre ? pre.clone().multiply(mat(p)) : mat(p));

/** A capsule limb from a to b; its caps reach r/2 into the joint balls at each end. */
function limb(bucket: Bucket, a: THREE.Vector3, b: THREE.Vector3, r: number, pre?: THREE.Matrix4): void {
  const len = a.distanceTo(b);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - r), 4, 14);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize());
  const m = mat(a.clone().add(b).multiplyScalar(0.5), q);
  put(bucket, g, pre ? pre.clone().multiply(m) : m);
}

/** A capsule whose caps are centred exactly on a and b: a sphere of radius r swept along the segment. */
function seg(bucket: Bucket, a: THREE.Vector3, b: THREE.Vector3, r: number, pre?: THREE.Matrix4): void {
  const len = a.distanceTo(b);
  const g = new THREE.CapsuleGeometry(r, len, 4, 14);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize());
  const m = mat(a.clone().add(b).multiplyScalar(0.5), q);
  put(bucket, g, pre ? pre.clone().multiply(m) : m);
}

/** Points on an arc: centre + R (cos a · e0 + sin a · e1), a from a0 to a1 degrees, n steps. */
function arc(c: THREE.Vector3, e0: THREE.Vector3, e1: THREE.Vector3, R: number, a0: number, a1: number, n: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = deg(a0 + ((a1 - a0) * i) / n);
    out.push(c.clone().addScaledVector(e0, R * Math.cos(a)).addScaledVector(e1, R * Math.sin(a)));
  }
  return out;
}

/**
 * A finger: exact capsules along a polyline (smooth at every joint) with
 * slightly larger joint balls at the named points, each pushed `away` from the
 * held item by its extra radius so the clearance is the chain's, not the ball's.
 */
function finger(bucket: Bucket, pts: THREE.Vector3[], r: number, pre: THREE.Matrix4, joints: [number, THREE.Vector3][]): void {
  for (let i = 0; i + 1 < pts.length; i++) seg(bucket, pts[i], pts[i + 1], r, pre);
  for (const [j, away] of joints) ball(bucket, pts[j].clone().addScaledVector(away, r * 0.22), r * 1.22, pre);
}

function merge(bucket: Bucket): THREE.BufferGeometry {
  const g = mergeGeometries(bucket, false);
  if (!g) throw new Error('puppet: merge failed');
  for (const b of bucket) b.dispose();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** A rounded rectangle (w × h, corner r) centred on the origin. */
function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A slab with rounded corners (in x-y) and softly bevelled edges, extruded along z and centred on the origin. */
function slab(w: number, h: number, d: number, corner: number, bevel: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * bevel, h - 2 * bevel, Math.max(0.0002, corner - bevel)), {
    depth: d - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10,
  });
  g.translate(0, 0, -(d - 2 * bevel) / 2);
  return g;
}

/** Pale, close-grained wood on a canvas: base tone, fine lines running along v (the limb axis), soft bands, noise. */
function drawWood(c: CanvasRenderingContext2D, w: number, h: number, seed: number, base: string, dark: string, light: string): void {
  c.fillStyle = base;
  c.fillRect(0, 0, w, h);
  for (let i = 0; i < 150; i++) {
    const x0 = hash2(i, 1, seed) * w;
    const amp = 1 + hash2(i, 2, seed) * 5;
    const freq = 0.004 + hash2(i, 3, seed) * 0.012;
    const phase = hash2(i, 4, seed) * Math.PI * 2;
    const d = hash2(i, 5, seed);
    const a = 0.05 + d * 0.11;
    c.strokeStyle = d > 0.55 ? dark.replace('A', a.toFixed(3)) : light.replace('A', (a * 0.7).toFixed(3));
    c.lineWidth = 0.5 + hash2(i, 6, seed) * 1.5;
    c.beginPath();
    for (let y = 0; y <= h; y += 6) {
      const x = x0 + Math.sin(y * freq + phase) * amp + Math.sin(y * freq * 2.9 + phase) * amp * 0.3;
      if (y === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const x = (i / 5) * w;
    const g = c.createLinearGradient(x, 0, x + w / 5, 0);
    const t = hash2(i, 9, seed);
    g.addColorStop(0, `rgba(90,60,30,${0.03 + t * 0.06})`);
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(255,240,215,${0.03 + t * 0.04})`);
    c.fillStyle = g;
    c.fillRect(x, 0, w / 5, h);
  }
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (hash2(i & 511, i >> 9, seed + 3) - 0.5) * 10;
    d[i] += n; d[i + 1] += n * 0.95; d[i + 2] += n * 0.85;
  }
  c.putImageData(img, 0, 0);
}

// A touch warmer and more saturated than before: under the cool window fill
// the old tone fell to grey at rest (HANDOFF); this one stays wood.
const PALE = { base: '#e6c99a', dark: 'rgba(125,86,46,A)', light: 'rgba(255,243,218,A)' };
const OAK = { base: '#b4895a', dark: 'rgba(80,48,22,A)', light: 'rgba(240,210,160,A)' };

function woodTexture(seed: number, tone: typeof PALE): THREE.CanvasTexture {
  return makeCanvasTexture({ width: 512, height: 512, repeat: [1, 1], anisotropy: 8, draw: (c, w, h) => drawWood(c, w, h, seed, tone.base, tone.dark, tone.light) });
}

/**
 * The head's texture: the same pale wood, with the face painted on. Sphere
 * UVs: the +z face is at u = 0.25, v = 1 is the top of the head.
 */
function headTexture(): THREE.CanvasTexture {
  return makeCanvasTexture({
    width: 512, height: 512, anisotropy: 8,
    draw(c, w, h) {
      drawWood(c, w, h, 17, PALE.base, PALE.dark, PALE.light);
      // hair: a painted cap, hairline higher at the face (u .25) and lower at the back (u .75), with a wavy edge
      c.fillStyle = '#3d2b1d';
      c.beginPath();
      c.moveTo(0, 0);
      for (let x = 0; x <= w; x += 4) {
        const u = x / w;
        const back = 0.5 - 0.5 * Math.cos((u - 0.25) * Math.PI * 2);
        const y = h * (0.175 + 0.075 * back) + Math.sin(u * 42) * 3 + Math.sin(u * 11) * 4;
        c.lineTo(x, y);
      }
      c.lineTo(w, 0);
      c.closePath();
      c.fill();
      // a few lighter strokes in the hair (carved strands)
      c.strokeStyle = 'rgba(120,88,60,0.35)';
      c.lineWidth = 2;
      for (let i = 0; i < 22; i++) {
        const x = hash2(i, 21, 3) * w;
        c.beginPath();
        c.moveTo(x, 0);
        c.quadraticCurveTo(x + (hash2(i, 22, 3) - 0.5) * 30, h * 0.09, x + (hash2(i, 23, 3) - 0.5) * 40, h * 0.17);
        c.stroke();
      }
      const ex = [0.186, 0.314].map((u) => u * w);
      const ey = 0.42 * h;
      // cheeks: faint pink
      for (const x of ex) {
        const g = c.createRadialGradient(x + (x < w / 2 ? -8 : 8), ey + 40, 0, x, ey + 40, 30);
        g.addColorStop(0, 'rgba(214,110,96,0.22)');
        g.addColorStop(1, 'rgba(214,110,96,0)');
        c.fillStyle = g;
        c.fillRect(x - 40, ey, 80, 80);
      }
      // eyes: dark ovals with a highlight, thin brows above
      for (const x of ex) {
        c.fillStyle = '#241a14';
        c.beginPath();
        c.ellipse(x, ey, 6.5, 8.5, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(255,248,235,0.9)';
        c.beginPath();
        c.arc(x - 2.2, ey - 3, 2.1, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(60,40,28,0.8)';
        c.lineWidth = 2.2;
        c.beginPath();
        c.arc(x, ey - 4, 13, Math.PI * 1.18, Math.PI * 1.82);
        c.stroke();
      }
      // a small, slightly lopsided smile
      c.strokeStyle = '#4a3024';
      c.lineWidth = 2.4;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(0.25 * w + 2, 0.66 * h, 15, Math.PI * 0.12, Math.PI * 0.88);
      c.stroke();
    },
  });
}

/**
 * The phone's screen, as an emissive map on the glass: off, with a faint glow
 * (a sleeping lock screen) and a soft diagonal band where the lamp reflects.
 * The map is mapped onto the extruded glass cap through the texture transform
 * (ExtrudeGeometry UVs are the shape's own x, y).
 */
function screenTexture(): THREE.CanvasTexture {
  const t = makeCanvasTexture({
    width: 256, height: 512, anisotropy: 4,
    draw(c, w, h) {
      c.fillStyle = '#000';
      c.fillRect(0, 0, w, h);
      // the faint glow: brighter toward the top, blue-grey
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(70,86,110,0.5)');
      g.addColorStop(0.5, 'rgba(36,44,58,0.35)');
      g.addColorStop(1, 'rgba(12,16,22,0.3)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // the lamp, reflected: a wide soft band from the top-right down to the left
      c.save();
      c.translate(w * 0.62, h * 0.3);
      c.rotate(-0.55);
      const r = c.createLinearGradient(-w * 0.25, 0, w * 0.25, 0);
      r.addColorStop(0, 'rgba(255,226,180,0)');
      r.addColorStop(0.5, 'rgba(255,226,180,0.55)');
      r.addColorStop(1, 'rgba(255,226,180,0)');
      c.fillStyle = r;
      c.fillRect(-w * 0.25, -h, w * 0.5, h * 2);
      c.restore();
      // a second, thinner band
      c.save();
      c.translate(w * 0.3, h * 0.55);
      c.rotate(-0.55);
      const r2 = c.createLinearGradient(-w * 0.08, 0, w * 0.08, 0);
      r2.addColorStop(0, 'rgba(255,226,180,0)');
      r2.addColorStop(0.5, 'rgba(255,226,180,0.22)');
      r2.addColorStop(1, 'rgba(255,226,180,0)');
      c.fillStyle = r2;
      c.fillRect(-w * 0.08, -h, w * 0.16, h * 2);
      c.restore();
    },
  });
  // shape coordinates → 0..1 (the extruded cap spans ±w/2, ±h/2)
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(1 / PH.w, 1 / PH.h);
  t.offset.set(0.5, 0.5);
  return t;
}

/** A soft radial contact shadow (alpha only). */
function contactTexture(): THREE.CanvasTexture {
  return makeCanvasTexture({
    width: 128, height: 128, anisotropy: 1,
    draw(c, w, h) {
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.62)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.42)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    },
  });
}

/** A damped spring: kick() adds velocity, step() integrates. Used for nudges and the string sway. */
class Spring {
  x = 0; v = 0;
  constructor(private readonly hz: number, private readonly zeta: number) {}
  kick(dv: number): void { this.v += dv; }
  get active(): boolean { return Math.abs(this.x) > 1e-5 || Math.abs(this.v) > 1e-4; }
  step(dt: number): number {
    const w = Math.PI * 2 * this.hz;
    const a = -w * w * this.x - 2 * this.zeta * w * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    if (!this.active) { this.x = 0; this.v = 0; }
    return this.x;
  }
}

const TAG_STYLE_ID = 'puppet-tag-style';
const TAG_CSS = `
.puppet-tag {
  position: absolute; left: 0; top: 0; pointer-events: none !important;
  font-family: var(--sans); font-size: 13px; font-weight: 500;
  letter-spacing: 0.14em; text-transform: lowercase; font-variant-caps: all-small-caps;
  color: var(--cream); white-space: nowrap; opacity: 0;
  text-shadow: 0 1px 2px rgba(0,0,0,.85), 0 0 14px rgba(0,0,0,.7);
  will-change: transform, opacity;
}`;

const ITEM_NAME: Record<PuppetItem, string> = { puppet: 'the puppet', phone: 'the phone', camera: 'the camera' };

/** Signed distance from a point to a rounded box (half extents hx, hy, hz, edge radius r) centred on the origin. */
function roundedBoxDistance(p: THREE.Vector3, hx: number, hy: number, hz: number, r: number): number {
  const qx = Math.abs(p.x) - (hx - r), qy = Math.abs(p.y) - (hy - r), qz = Math.abs(p.z) - (hz - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

export function createPuppet(ctx: ObjectCtx): TableObject {
  const group = new THREE.Group();
  group.name = 'puppet';
  const hit: THREE.Object3D[] = [];
  /** Visible hit meshes only (no proxies): what in-focus hover resolves against. */
  const visibleHit: THREE.Object3D[] = [];
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(d: T): T => { disposables.push(d); return d; };

  // ---- materials ---------------------------------------------------------
  const paleTex = own(woodTexture(11, PALE));
  const oakTex = own(woodTexture(5, OAK));
  const headTex = own(headTexture());
  const paleWood = own(standard({ map: paleTex, bumpMap: paleTex, bumpScale: 0.0006, roughness: 0.6, metalness: 0 }));
  const headWood = own(standard({ map: headTex, bumpMap: headTex, bumpScale: 0.0004, roughness: 0.58, metalness: 0 }));
  const oak = own(standard({ map: oakTex, bumpMap: oakTex, bumpScale: 0.0008, roughness: 0.66, metalness: 0 }));
  const darkPaint = plastic({ color: 0x3a2a1e, roughness: 0.5 });        // shoes
  const collarPaint = plastic({ color: 0x4b6a84, roughness: 0.55 });     // the painted collar
  const steel = metal({ color: 0x4a4642, roughness: 0.45 });             // stand rod
  const white = plastic({ color: 0xece6da, roughness: 0.48 });           // camera body, the print
  const black = plastic({ color: 0x1c1a18, roughness: 0.42 });           // lens block, finder, slot, the phone's camera bump
  const silver = metal({ color: 0xb9b6ae, roughness: 0.32 });            // lens ring, shutter button
  const frosted = own(standard({ color: 0xd4d8dc, roughness: 0.22, metalness: 0, emissive: 0x4a4c4e, emissiveIntensity: 0.6 })); // flash window
  const lensGlass = own(new THREE.MeshPhysicalMaterial({ color: 0x0f1318, roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 }));
  const frame = metal({ color: 0x8e8b86, roughness: 0.36 });             // phone frame (titanium)
  const screenTex = own(screenTexture());
  const screenGlass = own(new THREE.MeshPhysicalMaterial({
    color: 0x0a0b0e, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06,
    emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 0.6,
  }));
  const thread = own(new THREE.LineBasicMaterial({ color: 0xd9ccb2, transparent: true, opacity: 0.8 }));

  // ---- base + stand rod ----------------------------------------------------
  const baseBucket: Bucket = [];
  const profile = [V(0, 0, 0), V(BASE_R - 0.003, 0, 0), V(BASE_R, 0.003, 0), V(BASE_R, BASE_H - 0.004, 0), V(BASE_R - 0.004, BASE_H, 0), V(0, BASE_H, 0)]
    .map((p) => new THREE.Vector2(p.x, p.y));
  put(baseBucket, new THREE.LatheGeometry(profile, 56), mat(V(0, 0, 0)));

  const rodBucket: Bucket = [];
  const rodFoot = V(0, BASE_H, -0.030);
  const rodMid = V(0, 0.118, -0.030);
  const rodEnd = V(0, 0.134, -0.017);
  put(rodBucket, new THREE.CylinderGeometry(0.007, 0.009, 0.003, 20), mat(V(0, BASE_H + 0.0015, -0.030)));
  limb(rodBucket, rodFoot, rodMid, 0.0022);
  limb(rodBucket, rodMid, rodEnd, 0.0022);
  ball(rodBucket, rodMid, 0.0028);

  // ---- the figure (figure space: origin at the base top) -------------------
  const figure = new THREE.Group();
  figure.name = 'figure';
  figure.position.y = BASE_H;
  const LEAN = { x: deg(2.5), z: deg(3.5) };
  figure.rotation.set(LEAN.x, 0, LEAN.z);
  group.add(figure);

  const body: Bucket = [];
  const dark: Bucket = [];
  const painted: Bucket = [];

  // legs + shoes
  const hipL = V(0.015, 0.100, 0), hipR = V(-0.015, 0.100, 0);
  const kneeL = V(0.016, 0.056, 0.004), kneeR = V(-0.017, 0.056, 0.002);
  const ankleL = V(0.015, 0.011, 0.000), ankleR = V(-0.018, 0.011, -0.002);
  for (const [hip, knee, ankle] of [[hipL, kneeL, ankleL], [hipR, kneeR, ankleR]] as const) {
    limb(body, hip, knee, 0.0078);
    ball(body, knee, 0.0095);
    limb(body, knee, ankle, 0.0068);
    ball(body, ankle, 0.0062);
  }
  put(dark, roundedBox(0.017, 0.011, 0.036, 0.004), mat(V(0.015, 0.0055, 0.008), euler(0, deg(6), 0)));
  put(dark, roundedBox(0.017, 0.011, 0.036, 0.004), mat(V(-0.018, 0.0055, 0.006), euler(0, deg(-16), 0)));

  // pelvis, hip balls, waist ball, torso
  put(body, roundedBox(0.044, 0.024, 0.026, 0.006), mat(V(0, 0.110, 0)));
  ball(body, hipL, 0.0095);
  ball(body, hipR, 0.0095);
  ball(body, V(0, 0.124, 0), 0.012);
  const torsoProfile = [[0, 0.128], [0.017, 0.128], [0.0205, 0.140], [0.026, 0.158], [0.0272, 0.168], [0.0245, 0.178], [0.016, 0.1835], [0, 0.185]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  put(body, new THREE.LatheGeometry(torsoProfile, 40), mat(V(0, 0, 0), Q0, V(1, 1, 0.74)));

  // shoulders, neck, collar
  const shL = V(0.030, 0.176, 0), shR = V(-0.030, 0.176, 0);
  ball(body, shL, 0.0105);
  ball(body, shR, 0.0105);
  limb(body, V(0, 0.182, 0), V(0, 0.200, 0.001), 0.0065);
  put(painted, new THREE.CylinderGeometry(0.0135, 0.013, 0.0032, 24), mat(V(0, 0.1865, 0.001)));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    put(painted, new THREE.SphereGeometry(0.0072, 16, 10), mat(V(Math.cos(a) * 0.0165, 0.1865, 0.001 + Math.sin(a) * 0.0145), Q0, V(1, 0.4, 1)));
  }

  // head (its own mesh: painted face) and the nose, merged into the body
  const headPos = V(0, 0.222, 0.002);
  const headQ = euler(deg(-6), deg(-12), deg(5));
  const headM = mat(headPos, headQ);
  const head = solid(new THREE.Mesh(own(new THREE.SphereGeometry(0.024, 40, 28)), headWood), 'puppet');
  head.position.copy(headPos);
  head.quaternion.copy(headQ);
  head.scale.set(1, 1.08, 0.96);
  figure.add(head);
  hit.push(head);
  visibleHit.push(head);
  // nose: a long cone from the face, base just inside the sphere
  put(body, new THREE.ConeGeometry(0.0042, 0.037, 18), headM.clone().multiply(mat(V(0, -0.001, 0.0365), euler(Math.PI / 2, 0, 0))));

  // arms: the left cradles the camera palm-up at chest height, the right holds the phone screen-out at the hip
  const elbowL = V(0.052, 0.137, 0.008), wristL = V(0.054, 0.118, 0.040);
  const elbowR = V(-0.050, 0.138, 0.012), wristR = V(-0.064, 0.106, 0.030);
  for (const [sh, el, wr] of [[shL, elbowL, wristL], [shR, elbowR, wristR]] as const) {
    limb(body, sh, el, 0.0074);
    ball(body, el, 0.0085);
    limb(body, el, wr, 0.0064);
    ball(body, wr, 0.0062);
  }

  // ---- left hand + the instant camera -----------------------------------------
  // Hand space: origin at the wrist ball. The camera's centre sits at CAM_POS;
  // the hand is drawn in camera-local space (origin at the camera's centre).
  const handL = new THREE.Group();
  handL.position.copy(wristL);
  handL.rotation.set(deg(-8), deg(-6), deg(4));
  figure.add(handL);
  handL.updateMatrix();
  const CAM_POS = V(-0.020, 0.030, 0.008);
  const camPre = handL.matrix.clone().multiply(mat(CAM_POS));
  {
    const yb = -(CAM.h / 2 + CLEAR + FINGER_R);
    const cxi = -(CAM.w / 2 - CAM.r), cy = -(CAM.h / 2 - CAM.r);
    const R = CAM.r + CLEAR + FINGER_R;
    // palm under the base, from the wrist end inward
    put(body, roundedBox(0.024, 0.0056, 0.020, 0.0025), camPre.clone().multiply(mat(V(0.004, -(CAM.h / 2 + CLEAR + 0.0028), 0))));
    // four fingers: under the base, around the inner bottom edge, up the inner side
    for (const z of [0.0095, 0.0032, -0.0032, -0.0095]) {
      const pts = [V(cxi + 0.012, yb, z), ...arc(V(cxi, cy, z), X, Y, R, -90, -180, 3), V(cxi - R, cy + 0.011, z)];
      finger(body, pts, FINGER_R, camPre, [[0, V(0, -1, 0)], [4, V(-1, 0, 0)]]);
    }
    // thumb: along the bottom to the back edge, around it, up the back
    const ybt = -(CAM.h / 2 + CLEAR + THUMB_R);
    const czi = -(CAM.d / 2 - CAM.r);
    const Rt = CAM.r + CLEAR + THUMB_R;
    const tp = [V(0.006, ybt, czi + 0.009), ...arc(V(0.006, cy, czi), Z, Y, Rt, -90, -180, 3), V(0.006, cy + 0.010, czi - Rt)];
    finger(body, tp, THUMB_R, camPre, [[0, V(0, -1, 0)], [4, V(0, 0, -1)]]);
  }

  const camera = new THREE.Group();
  camera.name = 'camera';
  camera.position.copy(CAM_POS);
  handL.add(camera);
  {
    const camWhite: Bucket = [];
    const camBlack: Bucket = [];
    const camSilver: Bucket = [];
    const camGlass: Bucket = [];
    const F = CAM.d / 2; // the front face
    put(camWhite, roundedBox(CAM.w, CAM.h, CAM.d, CAM.r), mat(V(0, 0, 0)));
    put(camWhite, roundedBox(0.040, 0.030, 0.002, 0.0015), mat(V(0, 0, F + 0.0005)));                                    // raised front plate
    put(camBlack, roundedBox(0.022, 0.020, 0.004, 0.002), mat(V(0, 0.001, F + 0.0025)));                                    // lens block
    put(camBlack, new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 32), mat(V(0, 0.001, F + 0.0065), euler(Math.PI / 2, 0, 0))); // barrel
    put(camSilver, new THREE.CylinderGeometry(0.0079, 0.0079, 0.0016, 32), mat(V(0, 0.001, F + 0.0096), euler(Math.PI / 2, 0, 0))); // ring
    put(camBlack, new THREE.CylinderGeometry(0.0066, 0.0066, 0.0012, 32), mat(V(0, 0.001, F + 0.0098), euler(Math.PI / 2, 0, 0)));  // inner bezel
    put(camGlass, new THREE.CylinderGeometry(0.0058, 0.0058, 0.001, 32), mat(V(0, 0.001, F + 0.0101), euler(Math.PI / 2, 0, 0)));   // the glass
    put(camBlack, roundedBox(0.0075, 0.006, 0.003, 0.001), mat(V(-0.0155, 0.011, F + 0.0015)));                              // viewfinder
    put(camGlass, roundedBox(0.0048, 0.0036, 0.0008, 0.0004), mat(V(-0.0155, 0.011, F + 0.0031)));                            // its glass
    put(camBlack, roundedBox(0.0075, 0.006, 0.002, 0.001), mat(V(-0.0155, 0.011, -F - 0.0005)));                              // eyepiece
    put(camSilver, new THREE.CylinderGeometry(0.0036, 0.0036, 0.0022, 24), mat(V(0.0158, -0.0045, F + 0.0018), euler(Math.PI / 2, 0, 0))); // shutter button
    put(camBlack, roundedBox(0.036, 0.0014, 0.0024, 0.0005), mat(V(0, CAM.h / 2 + 0.0003, -0.004)));                           // print slot
    const printQ = euler(deg(7), 0, 0);
    put(camWhite, roundedBox(0.032, 0.015, 0.0012, 0.0004), mat(V(0, CAM.h / 2 + 0.0065, -0.004), printQ));                   // the print, emerging
    put(camGlass, roundedBox(0.027, 0.0085, 0.0005, 0.0003), mat(V(0, CAM.h / 2 + 0.0085, -0.004 + 0.0008), printQ));           // its picture
    const camBody = solid(new THREE.Mesh(own(merge(camWhite)), white), 'camera');
    const camParts = solid(new THREE.Mesh(own(merge(camBlack)), black), 'camera');
    const camMetal = new THREE.Mesh(own(merge(camSilver)), silver);
    camMetal.name = 'camera';
    const camLens = new THREE.Mesh(own(merge(camGlass)), lensGlass);
    camLens.name = 'camera';
    const flash = new THREE.Mesh(own(roundedBox(0.010, 0.0062, 0.0024, 0.001)), frosted);
    flash.name = 'camera';
    flash.position.set(0.0155, 0.011, F + 0.0012);
    const camProxy = hitProxy(CAM.w + 0.008, CAM.h + 0.016, CAM.d + 0.012, 'camera:proxy');
    camProxy.position.set(0, 0.004, 0.004);
    camera.add(camBody, camParts, camMetal, camLens, flash, camProxy);
    hit.push(camBody, camParts, camMetal, camLens, flash, camProxy);
    visibleHit.push(camBody, camParts, camMetal, camLens, flash);
  }

  // ---- right hand + the phone -------------------------------------------------
  // Hand space: origin at the wrist ball; the phone's centre at PH_POS, screen
  // toward +z. The hand is drawn in phone-local space: palm behind, four
  // fingers around the inner (+x) edge with their tips in front of the glass,
  // the thumb up the outer (-x) edge.
  const handR = new THREE.Group();
  handR.position.copy(wristR);
  handR.rotation.set(deg(-16), deg(-6), deg(-6));
  figure.add(handR);
  handR.updateMatrix();
  const PH_POS = V(0.012, 0.018, 0.011);
  const phonePre = handR.matrix.clone().multiply(mat(PH_POS));
  {
    const zb = -(PH.d / 2 + CLEAR + FINGER_R), zf = PH.d / 2 + CLEAR + FINGER_R;
    const cx = PH.w / 2 - PH.edge, czb = -PH.d / 2 + PH.edge, czf = PH.d / 2 - PH.edge;
    const R = PH.edge + CLEAR + FINGER_R;
    put(body, roundedBox(0.016, 0.026, 0.0056, 0.0025), phonePre.clone().multiply(mat(V(-0.004, -0.002, -(PH.d / 2 + CLEAR + 0.0028)))));
    for (const y of [0.009, 0.003, -0.003, -0.009]) {
      const pts = [V(cx - 0.009, y, zb), ...arc(V(cx, y, czb), X, Z, R, -90, 0, 3), ...arc(V(cx, y, czf), X, Z, R, 0, 90, 3), V(cx - 0.0055, y, zf)];
      finger(body, pts, FINGER_R, phonePre, [[0, V(0, 0, -1)], [4, V(1, 0, 0)]]);
    }
    const zbt = -(PH.d / 2 + CLEAR + THUMB_R);
    const Rt = PH.edge + CLEAR + THUMB_R;
    const yT = 0.002;
    const tp = [V(-cx + 0.007, yT, zbt), ...arc(V(-cx, yT, czb), X, Z, Rt, -90, -180, 3), V(-cx - Rt, yT + 0.017, czb + 0.0012)];
    finger(body, tp, THUMB_R, phonePre, [[0, V(0, 0, -1)], [4, V(-1, 0, 0)]]);
  }

  const phone = new THREE.Group();
  phone.name = 'phone';
  phone.position.copy(PH_POS);
  handR.add(phone);
  {
    const frameBucket: Bucket = [];
    put(frameBucket, slab(PH.w, PH.h, PH.d, PH.r, PH.edge), mat(V(0, 0, 0)));
    put(frameBucket, roundedBox(0.0009, 0.0062, 0.0022, 0.0004), mat(V(-PH.w / 2 - 0.0002, 0.0125, 0)));   // volume up
    put(frameBucket, roundedBox(0.0009, 0.0062, 0.0022, 0.0004), mat(V(-PH.w / 2 - 0.0002, 0.0045, 0)));   // volume down
    put(frameBucket, roundedBox(0.0009, 0.0036, 0.0022, 0.0004), mat(V(-PH.w / 2 - 0.0002, 0.0195, 0)));   // action button
    put(frameBucket, roundedBox(0.0009, 0.0080, 0.0022, 0.0004), mat(V(PH.w / 2 + 0.0002, 0.0100, 0)));    // power
    const phoneBody = solid(new THREE.Mesh(own(merge(frameBucket)), frame), 'phone');
    // the glass: a rounded slab proud of the frame by 0.3 mm, so the metal reads as a thin rim around it
    const glassGeo = own(slab(PH.w - 0.0014, PH.h - 0.0014, 0.0010, PH.r - 0.0007, 0.0002));
    const phoneGlass = solid(new THREE.Mesh(glassGeo, screenGlass), 'phone');
    phoneGlass.position.z = PH.d / 2 - 0.0002;
    // camera bump on the back, top-left as seen from the front (so top-right from behind)
    const bumpBucket: Bucket = [];
    const bz = -PH.d / 2 - 0.0007;
    put(bumpBucket, slab(0.0115, 0.0115, 0.0014, 0.0032, 0.0003), mat(V(0.0062, PH.h / 2 - 0.0092, bz)));
    put(bumpBucket, new THREE.CylinderGeometry(0.0028, 0.0028, 0.0012, 20), mat(V(0.0035, PH.h / 2 - 0.0065, bz - 0.0008), euler(Math.PI / 2, 0, 0)));
    put(bumpBucket, new THREE.CylinderGeometry(0.0028, 0.0028, 0.0012, 20), mat(V(0.0089, PH.h / 2 - 0.0119, bz - 0.0008), euler(Math.PI / 2, 0, 0)));
    const bump = new THREE.Mesh(own(merge(bumpBucket)), black);
    bump.name = 'phone';
    const phoneProxy = hitProxy(PH.w + 0.010, PH.h + 0.010, 0.018, 'phone:proxy');
    phone.add(phoneBody, phoneGlass, bump, phoneProxy);
    hit.push(phoneBody, phoneGlass, bump, phoneProxy);
    visibleHit.push(phoneBody, phoneGlass, bump);
  }

  // merged figure meshes
  const bodyGeo = own(merge(body));
  const bodyMesh = solid(new THREE.Mesh(bodyGeo, paleWood), 'puppet');
  const darkMesh = solid(new THREE.Mesh(own(merge(dark)), darkPaint), 'puppet');
  const collarMesh = solid(new THREE.Mesh(own(merge(painted)), collarPaint), 'puppet');
  figure.add(bodyMesh, darkMesh, collarMesh);
  hit.push(bodyMesh, darkMesh, collarMesh);
  visibleHit.push(bodyMesh, darkMesh, collarMesh);
  const figureProxy = hitProxy(0.064, 0.245, 0.05, 'puppet:proxy');
  figureProxy.position.set(0, 0.1225, 0.004);
  figure.add(figureProxy);
  hit.push(figureProxy);

  // base and rod (group space)
  const baseMesh = solid(new THREE.Mesh(own(merge(baseBucket)), oak), 'puppet');
  const rodMesh = solid(new THREE.Mesh(own(merge(rodBucket)), steel), 'puppet');
  group.add(baseMesh, rodMesh);
  hit.push(baseMesh, rodMesh);
  visibleHit.push(baseMesh, rodMesh);

  // ---- the controller: a wooden cross lying on the table behind him ----------
  const bar = new THREE.Group();
  bar.position.set(-0.012, 0, -0.118);
  bar.rotation.y = deg(10);
  group.add(bar);
  const barBucket: Bucket = [];
  put(barBucket, roundedBox(0.118, 0.008, 0.008, 0.0025), mat(V(0, 0.004, 0)));
  put(barBucket, roundedBox(0.008, 0.007, 0.064, 0.0025), mat(V(0, 0.0115, 0)));
  const barMesh = solid(new THREE.Mesh(own(merge(barBucket)), oak), 'puppet');
  bar.add(barMesh);
  hit.push(barMesh);
  visibleHit.push(barMesh);
  const barProxy = hitProxy(0.13, 0.03, 0.08, 'puppet:bar-proxy');
  barProxy.position.y = 0.01;
  bar.add(barProxy);
  hit.push(barProxy);
  bar.updateMatrix();

  // ---- strings: six threads from the figure to the bar -----------------------
  // bar-local anchors → group space; figure-local anchors → group space each time the figure moves
  const barAnchor = (x: number, y: number, z: number): THREE.Vector3 => V(x, y, z).applyMatrix4(bar.matrix);
  const temples = [V(0.0215, 0.011, 0), V(-0.0215, 0.011, 0)].map((p) => p.applyMatrix4(headM));
  const strings: { from: THREE.Vector3; to: THREE.Vector3; phase: number }[] = [
    { from: barAnchor(0.057, 0.008, 0), to: temples[0], phase: 1.0 },
    { from: barAnchor(-0.057, 0.008, 0), to: temples[1], phase: 0.9 },
    { from: barAnchor(0, 0.015, 0.031), to: wristL.clone().add(V(0, 0.005, -0.003)), phase: 1.15 },
    { from: barAnchor(0, 0.015, -0.031), to: wristR.clone().add(V(0, 0.005, -0.003)), phase: 0.8 },
    { from: barAnchor(0.03, 0.008, 0), to: kneeL.clone().add(V(0.009, 0.002, 0)), phase: 1.05 },
    { from: barAnchor(-0.03, 0.008, 0), to: kneeR.clone().add(V(-0.009, 0.002, 0)), phase: 0.95 },
  ];
  const SEGS = 10;
  const stringPos = new Float32Array(strings.length * SEGS * 2 * 3);
  const stringGeo = own(new THREE.BufferGeometry());
  stringGeo.setAttribute('position', new THREE.BufferAttribute(stringPos, 3));
  const stringMesh = new THREE.LineSegments(stringGeo, thread);
  stringMesh.name = 'strings';
  stringMesh.frustumCulled = false;
  group.add(stringMesh);
  const sway = new Spring(2.1, 0.16);
  const pA = new THREE.Vector3(), pB = new THREE.Vector3(), dir = new THREE.Vector3(), side = new THREE.Vector3(), pt = new THREE.Vector3();
  const writeStrings = (amp: number): void => {
    figure.updateMatrix();
    let k = 0;
    for (const s of strings) {
      pA.copy(s.from);
      pB.copy(s.to).applyMatrix4(figure.matrix);
      dir.subVectors(pB, pA);
      const len = dir.length();
      dir.normalize();
      side.crossVectors(dir, UP);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0); else side.normalize();
      for (let i = 0; i < SEGS; i++) {
        for (const f of [i / SEGS, (i + 1) / SEGS]) {
          const bow = Math.sin(f * Math.PI);
          pt.lerpVectors(pA, pB, f)
            .addScaledVector(UP, -0.0025 * bow * len / 0.2)
            .addScaledVector(side, amp * s.phase * bow);
          stringPos[k++] = pt.x; stringPos[k++] = pt.y; stringPos[k++] = pt.z;
        }
      }
    }
    stringGeo.attributes.position.needsUpdate = true;
    stringGeo.computeBoundingSphere();
  };
  writeStrings(0);

  // ---- contact shadow: stays on the table while the group lifts --------------
  const contact = new THREE.Mesh(own(new THREE.CircleGeometry(BASE_R * 1.7, 48)), own(new THREE.MeshBasicMaterial({ map: own(contactTexture()), transparent: true, depthWrite: false })));
  contact.name = 'contact-shadow';
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.0012;
  contact.renderOrder = -1;
  group.add(contact);

  // ---- in-focus hover: lift + tag ---------------------------------------------
  // Each item has a lift (hover) and a bump (click nudge), composed in update().
  const rise: Record<PuppetItem, { lift: number; bump: number }> = {
    puppet: { lift: 0, bump: 0 }, camera: { lift: 0, bump: 0 }, phone: { lift: 0, bump: 0 },
  };
  const itemOf = (hitName: string): PuppetItem => hitName.startsWith('camera') ? 'camera' : hitName.startsWith('phone') ? 'phone' : 'puppet';
  const canvas = ctx.renderer.domElement;
  let hovered: PuppetItem | null = null;
  let pendingPointer: { x: number; y: number } | null = null;
  let pointerInside = false;
  const raycaster = new THREE.Raycaster();
  raycaster.layers.set(0);
  raycaster.layers.enable(HIT_LAYER);
  const ndc = new THREE.Vector2();

  if (!document.getElementById(TAG_STYLE_ID)) {
    const s = document.createElement('style');
    s.id = TAG_STYLE_ID;
    s.textContent = TAG_CSS;
    document.head.append(s);
  }
  const tag = document.createElement('div');
  tag.className = 'puppet-tag';
  tag.setAttribute('aria-hidden', 'true');
  (document.getElementById('ui') ?? document.body).append(tag);
  let tagShown = false;

  const setHovered = (item: PuppetItem | null): void => {
    if (item === hovered) return;
    const prev = hovered;
    hovered = item;
    const dur = ctx.state.reducedMotion ? 0 : 0.35;
    if (prev) gsap.to(rise[prev], { lift: 0, duration: dur * 1.3, ease: 'power2.out', overwrite: 'auto' });
    if (item) gsap.to(rise[item], { lift: 0.004, duration: dur, ease: 'back.out(1.6)', overwrite: 'auto' });
    canvas.style.cursor = item ? 'pointer' : '';
    if (item) {
      tag.textContent = ITEM_NAME[item];
      tagShown = true;
      gsap.to(tag, { opacity: 1, duration: 0.12, ease: 'power1.out', overwrite: true });
    } else if (tagShown) {
      tagShown = false;
      gsap.to(tag, { opacity: 0, duration: 0.12, ease: 'power1.in', overwrite: true });
    }
  };

  const onMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || ctx.state.focused !== 'puppet') return;
    pointerInside = true;
    pendingPointer = { x: e.clientX, y: e.clientY };
  };
  const onLeave = (): void => { pointerInside = false; pendingPointer = null; if (ctx.state.focused === 'puppet') setHovered(null); };
  canvas.addEventListener('pointermove', onMove, { passive: true });
  canvas.addEventListener('pointerleave', onLeave);

  const resolveHover = (): void => {
    if (!pendingPointer) return;
    const { x, y } = pendingPointer;
    pendingPointer = null;
    if (!pointerInside) { setHovered(null); return; }
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, ctx.camera);
    const hits = raycaster.intersectObjects(visibleHit, false);
    setHovered(hits.length ? itemOf(hits[0].object.name) : null);
  };

  // the tag sits beside the item: above the head, left of the phone, right of the camera
  const tagWorld = new THREE.Vector3();
  const placeTag = (): void => {
    if (!tagShown || !hovered) return;
    let dx = 0, dy = 0, align: 'centre' | 'left' | 'right' = 'centre';
    if (hovered === 'puppet') { head.localToWorld(tagWorld.set(0, 0.028, 0)); dy = -16; }
    else if (hovered === 'phone') { phone.localToWorld(tagWorld.set(-PH.w / 2 - 0.004, 0.004, 0)); align = 'right'; dx = -10; }
    else { camera.localToWorld(tagWorld.set(CAM.w / 2 + 0.004, 0.006, 0)); align = 'left'; dx = 10; }
    tagWorld.project(ctx.camera);
    const sx = (tagWorld.x + 1) / 2 * innerWidth + dx, sy = (1 - tagWorld.y) / 2 * innerHeight + dy;
    const w = tag.offsetWidth, h = tag.offsetHeight;
    let left = align === 'centre' ? sx - w / 2 : align === 'right' ? sx - w : sx;
    let top = align === 'centre' ? sy - h : sy - h / 2;
    left = Math.max(12, Math.min(innerWidth - w - 12, left));
    top = Math.max(12, Math.min(innerHeight - h - 12, top));
    tag.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  };

  // ---- nudges (in-focus clicks) ------------------------------------------------
  const rock = new Spring(1.5, 0.14);     // the figure sways about its base
  const tip = new Spring(2.6, 0.2);       // the camera tips on the palm (small: the fingers are 1.2 mm away)
  const wag = new Spring(2.4, 0.2);       // the phone nods in the hand
  const nudge = (item: PuppetItem): void => {
    if (ctx.state.reducedMotion) return;
    if (item === 'puppet') { rock.kick(-0.55); sway.kick(0.03); }
    else if (item === 'camera') tip.kick(-0.45);
    else wag.kick(0.3);
    gsap.to(rise[item], { bump: 0.004, duration: 0.16, ease: 'power2.out', yoyo: true, repeat: 1, overwrite: 'auto' });
  };
  const panel = pinocchioPanel({ onSelect: nudge });

  let lastY: number | null = null;
  const contactMat = contact.material as THREE.MeshBasicMaterial;

  // Test hooks (?qa=1 only): the screen point of each item (so a scenario can hover and click it while
  // focused), the measured hand-to-item clearance, and a close-up render from any angle.
  if (flags.qa) {
    const w = new THREE.Vector3();
    const clearance = (): { phone: number; camera: number } => {
      // every vertex of the body mesh (fingers, palms, wrists, arms) in each item's local space
      const pos = bodyGeo.attributes.position;
      const p = new THREE.Vector3();
      const out = { phone: Infinity, camera: Infinity };
      const specs: [PuppetItem, THREE.Matrix4, number, number, number, number][] = [
        ['phone', phonePre.clone().invert(), PH.w / 2, PH.h / 2, PH.d / 2, PH.edge],
        ['camera', camPre.clone().invert(), CAM.w / 2, CAM.h / 2, CAM.d / 2, CAM.r],
      ];
      for (const [item, inv, hx, hy, hz, r] of specs) {
        let best = Infinity;
        for (let i = 0; i < pos.count; i++) {
          p.fromBufferAttribute(pos, i).applyMatrix4(inv);
          const d = roundedBoxDistance(p, hx, hy, hz, r);
          if (d < best) best = d;
        }
        if (item === 'phone') out.phone = best; else out.camera = best;
      }
      return out;
    };
    const snapCam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
    (window as unknown as { __puppet: unknown }).__puppet = {
      point(item: PuppetItem): { x: number; y: number } {
        if (item === 'camera') camera.localToWorld(w.set(0, 0, CAM.d / 2));
        else if (item === 'phone') phone.localToWorld(w.set(0, 0.004, PH.d / 2));
        else head.getWorldPosition(w);
        w.project(ctx.camera);
        return { x: (w.x + 1) / 2 * innerWidth, y: (1 - w.y) / 2 * innerHeight };
      },
      hovered: () => hovered,
      clearance,
      /** Renders the scene from `dist` metres off an item's centre at azimuth/elevation (degrees) and returns a PNG data URL. */
      snap(item: PuppetItem, az: number, el: number, dist: number, fov = 30): string {
        const target = new THREE.Vector3();
        if (item === 'camera') camera.getWorldPosition(target);
        else if (item === 'phone') phone.getWorldPosition(target);
        else figure.localToWorld(target.set(0, 0.13, 0.02));
        const a = deg(az), e = deg(el);
        snapCam.position.set(target.x - Math.sin(a) * Math.cos(e) * dist, target.y + Math.sin(e) * dist, target.z + Math.cos(a) * Math.cos(e) * dist);
        snapCam.aspect = innerWidth / innerHeight;
        snapCam.fov = fov;
        snapCam.updateProjectionMatrix();
        snapCam.lookAt(target);
        ctx.renderer.render(ctx.scene, snapCam);
        return canvas.toDataURL('image/png');
      },
    };
  }

  return {
    id: 'puppet',
    label: 'Puppet',
    group,
    hit,
    anchor: new THREE.Vector3(0, 0.262, 0),
    hover: { lift: 0.012, tilt: 2 },
    focus: {
      camera: ctx.focusPose('puppet'),
      panel,
      onExit() {
        setHovered(null);
        pendingPointer = null;
      },
      onClickInside(hitName) {
        const item = itemOf(hitName);
        panel.goTo(item);
        nudge(item);
      },
    },
    update(dt) {
      // the contact shadow counters the engine's lift so it stays on the table, softening as he rises
      const lift = group.position.y;
      contact.position.y = 0.0012 - lift;
      const l = Math.max(0, lift);
      contactMat.opacity = 1 / (1 + 55 * l);
      const sc = 1 + 3 * l;
      contact.scale.set(sc, sc, 1);
      // a lift or a settle sets the threads swaying (impulse from the group's vertical velocity)
      if (lastY !== null && dt > 0 && !ctx.state.reducedMotion) {
        const vy = (lift - lastY) / dt;
        if (Math.abs(vy) > 1e-4) sway.kick(-vy * 0.5);
      }
      lastY = lift;
      resolveHover();
      placeTag();
      // in-focus lifts and bumps
      figure.position.y = BASE_H + rise.puppet.lift + rise.puppet.bump;
      camera.position.y = CAM_POS.y + rise.camera.lift + rise.camera.bump;
      phone.position.y = PH_POS.y + rise.phone.lift + rise.phone.bump;
      const moving = sway.active || rock.active || tip.active || wag.active;
      if (!moving) return;
      figure.rotation.z = LEAN.z + rock.step(dt);
      camera.rotation.x = tip.step(dt);
      phone.rotation.x = wag.step(dt);
      writeStrings(sway.step(dt));
    },
    dispose() {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      tag.remove();
      for (const d of disposables) d.dispose();
    },
  };
}
