import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ObjectCtx, TableObject } from './types';
import { roundedBox, hitProxy, solid } from './helpers';
import { makeCanvasTexture, hash2, plastic, metal } from '../materials';
import { pinocchioPanel, type PuppetItem } from '../panels/pinocchio';

// The wooden puppet (SPEC 4.8): our own marionette, not Disney's character.
// Pale wood with grain, ball joints at shoulders, elbows, wrists, waist, hips
// and knees, a long conical nose, a painted collar, a painted face and hair.
// He stands on a small round oak base (a slim steel stand rod at his back
// keeps the lean honest), head turned toward the camera, an instant camera on
// his left palm and a phone in his right hand. Six threads run from his head,
// wrists and knees to a wooden cross-bar controller lying on the table behind
// him. Hit meshes are named by item ('puppet' | 'camera' | 'phone') so the
// engine's in-focus click routing tells us which item was clicked.
//
// Layout: group origin at the bottom centre of the base, y up, +z toward the
// puppet's front. The figure group sits on the base top (y = BASE_H) and holds
// the lean; everything above the base is built in figure space.

const BASE_R = 0.046;
const BASE_H = 0.012;
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const Q0 = new THREE.Quaternion();

type Bucket = THREE.BufferGeometry[];
const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const mat = (p: THREE.Vector3, q = Q0, s = ONE): THREE.Matrix4 => new THREE.Matrix4().compose(p, q, s);
const euler = (x: number, y: number, z: number): THREE.Quaternion => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
/** Places a part and drops its index (CapsuleGeometry is non-indexed in r186; merged parts must all match). */
const put = (bucket: Bucket, geo: THREE.BufferGeometry, m: THREE.Matrix4): void => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
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

function merge(bucket: Bucket): THREE.BufferGeometry {
  const g = mergeGeometries(bucket, false);
  if (!g) throw new Error('puppet: merge failed');
  for (const b of bucket) b.dispose();
  g.computeBoundingBox();
  g.computeBoundingSphere();
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

const PALE = { base: '#e3cba3', dark: 'rgba(125,86,46,A)', light: 'rgba(255,243,218,A)' };
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

export function createPuppet(ctx: ObjectCtx): TableObject {
  const group = new THREE.Group();
  group.name = 'puppet';
  const hit: THREE.Object3D[] = [];
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(d: T): T => { disposables.push(d); return d; };

  // ---- materials ---------------------------------------------------------
  const paleTex = own(woodTexture(11, PALE));
  const oakTex = own(woodTexture(5, OAK));
  const headTex = own(headTexture());
  const paleWood = own(new THREE.MeshStandardMaterial({ map: paleTex, bumpMap: paleTex, bumpScale: 0.0006, roughness: 0.62, metalness: 0 }));
  const headWood = own(new THREE.MeshStandardMaterial({ map: headTex, bumpMap: headTex, bumpScale: 0.0004, roughness: 0.6, metalness: 0 }));
  const oak = own(new THREE.MeshStandardMaterial({ map: oakTex, bumpMap: oakTex, bumpScale: 0.0008, roughness: 0.66, metalness: 0 }));
  const darkPaint = plastic({ color: 0x3a2a1e, roughness: 0.5 });        // shoes
  const collarPaint = plastic({ color: 0x4b6a84, roughness: 0.55 });     // the painted collar
  const steel = metal({ color: 0x4a4642, roughness: 0.45 });             // stand rod
  const white = plastic({ color: 0xe8e2d6, roughness: 0.5 });            // camera body
  const black = plastic({ color: 0x1c1a18, roughness: 0.45 });           // camera lens block, slot, finder
  const lensGlass = own(new THREE.MeshStandardMaterial({ color: 0x1a1f26, roughness: 0.16, metalness: 0 }));
  const frame = metal({ color: 0x55585c, roughness: 0.4 });              // phone frame
  const darkGlass = own(new THREE.MeshPhysicalMaterial({ color: 0x191a1d, roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 }));
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
  const LEAN = { x: THREE.MathUtils.degToRad(2.5), z: THREE.MathUtils.degToRad(3.5) };
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
  put(dark, roundedBox(0.017, 0.011, 0.036, 0.004), mat(V(0.015, 0.0055, 0.008), euler(0, THREE.MathUtils.degToRad(6), 0)));
  put(dark, roundedBox(0.017, 0.011, 0.036, 0.004), mat(V(-0.018, 0.0055, 0.006), euler(0, THREE.MathUtils.degToRad(-16), 0)));

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
  put(painted, new THREE.CylinderGeometry(0.0215, 0.019, 0.0035, 36), mat(V(0, 0.1865, 0.001), Q0, V(1, 1, 0.86)));

  // head (its own mesh: painted face) and the nose, merged into the body
  const headPos = V(0, 0.222, 0.002);
  const headQ = euler(THREE.MathUtils.degToRad(-6), THREE.MathUtils.degToRad(-12), THREE.MathUtils.degToRad(5));
  const headM = mat(headPos, headQ);
  const head = solid(new THREE.Mesh(own(new THREE.SphereGeometry(0.024, 40, 28)), headWood), 'puppet');
  head.position.copy(headPos);
  head.quaternion.copy(headQ);
  head.scale.set(1, 1.08, 0.96);
  figure.add(head);
  hit.push(head);
  // nose: a long cone from the face, base just inside the sphere
  put(body, new THREE.ConeGeometry(0.0042, 0.031, 18), headM.clone().multiply(mat(V(0, -0.001, 0.034), euler(Math.PI / 2, 0, 0))));

  // arms: left holds the camera (palm up, chest height); right holds the phone (lower, turned to the viewer)
  const elbowL = V(0.047, 0.140, 0.012), wristL = V(0.034, 0.150, 0.044);
  const elbowR = V(-0.048, 0.138, 0.010), wristR = V(-0.054, 0.110, 0.034);
  for (const [sh, el, wr] of [[shL, elbowL, wristL], [shR, elbowR, wristR]] as const) {
    limb(body, sh, el, 0.0074);
    ball(body, el, 0.0085);
    limb(body, el, wr, 0.0064);
    ball(body, wr, 0.0062);
  }

  // left hand node: palm up under the camera, thumb on the camera's inner side, fingertips on the outer side
  const handL = new THREE.Group();
  handL.position.copy(wristL);
  handL.rotation.set(THREE.MathUtils.degToRad(-8), THREE.MathUtils.degToRad(-14), THREE.MathUtils.degToRad(-6));
  figure.add(handL);
  handL.updateMatrix();
  put(body, roundedBox(0.016, 0.008, 0.022, 0.0035), handL.matrix.clone().multiply(mat(V(0, -0.004, 0.011))));
  limb(body, V(-0.016, -0.003, 0.006), V(-0.0225, 0.010, 0.010), 0.0032, handL.matrix);
  limb(body, V(0.012, -0.003, 0.009), V(0.0185, 0.007, 0.013), 0.0029, handL.matrix);

  // the instant camera: origin at its bottom centre (a nudge tips it on the palm)
  const camera = new THREE.Group();
  camera.name = 'camera';
  camera.position.set(-0.002, 0, 0.013);
  handL.add(camera);
  const CAM = { w: 0.034, h: 0.028, d: 0.024 };
  const camWhite: Bucket = [];
  const camBlack: Bucket = [];
  put(camWhite, roundedBox(CAM.w, CAM.h, CAM.d, 0.003), mat(V(0, CAM.h / 2, 0)));
  put(camWhite, new THREE.CylinderGeometry(0.0025, 0.0025, 0.0016, 16), mat(V(0.011, CAM.h + 0.0008, 0.003)));          // shutter button
  put(camBlack, roundedBox(0.017, 0.016, 0.006, 0.0015), mat(V(0, CAM.h * 0.46, CAM.d / 2 + 0.002)));                   // lens block
  put(camBlack, new THREE.CylinderGeometry(0.0065, 0.0065, 0.004, 24), mat(V(0, CAM.h * 0.46, CAM.d / 2 + 0.006), euler(Math.PI / 2, 0, 0))); // lens ring
  put(camBlack, roundedBox(0.026, 0.0024, 0.0016, 0.0006), mat(V(0, CAM.h - 0.0045, CAM.d / 2 + 0.0004)));              // print slot
  put(camBlack, roundedBox(0.0052, 0.0046, 0.003, 0.0008), mat(V(0.0115, CAM.h * 0.80, CAM.d / 2 + 0.001)));           // viewfinder
  put(camBlack, roundedBox(0.0052, 0.0046, 0.002, 0.0008), mat(V(0.0115, CAM.h * 0.80, -CAM.d / 2 - 0.0005)));         // eyepiece
  const camBody = solid(new THREE.Mesh(own(merge(camWhite)), white), 'camera');
  const camParts = solid(new THREE.Mesh(own(merge(camBlack)), black), 'camera');
  const lens = new THREE.Mesh(own(new THREE.CylinderGeometry(0.0046, 0.0046, 0.0012, 24)), lensGlass);
  lens.name = 'camera';
  lens.position.set(0, CAM.h * 0.46, CAM.d / 2 + 0.0082);
  lens.rotation.x = Math.PI / 2;
  const camProxy = hitProxy(0.042, 0.036, 0.034, 'camera:proxy');
  camProxy.position.set(0, CAM.h / 2, 0.003);
  camera.add(camBody, camParts, lens, camProxy);
  hit.push(camBody, camParts, lens, camProxy);

  // right hand node: palm behind the phone, thumb over its front edge, fingertips at its far edge
  const handR = new THREE.Group();
  handR.position.copy(wristR);
  handR.rotation.set(THREE.MathUtils.degToRad(-14), THREE.MathUtils.degToRad(-28), THREE.MathUtils.degToRad(4));
  figure.add(handR);
  handR.updateMatrix();
  put(body, roundedBox(0.014, 0.022, 0.008, 0.0035), handR.matrix.clone().multiply(mat(V(0, 0.004, -0.004))));
  limb(body, V(0.009, -0.007, 0.004), V(0.0035, 0.004, 0.0078), 0.0028, handR.matrix);
  limb(body, V(-0.0122, -0.006, 0.0045), V(-0.0122, 0.010, 0.005), 0.0026, handR.matrix);

  // the phone: origin at its centre (a nudge wags it)
  const phone = new THREE.Group();
  phone.name = 'phone';
  phone.position.set(0, 0.004, 0.0035);
  handR.add(phone);
  const PH = { w: 0.019, h: 0.038, d: 0.0045 };
  const phoneBody = solid(new THREE.Mesh(own(roundedBox(PH.w, PH.h, PH.d, 0.0022)), frame), 'phone');
  const glassBucket: Bucket = [];
  put(glassBucket, roundedBox(PH.w - 0.0015, PH.h - 0.0015, 0.0008, 0.0016), mat(V(0, 0, PH.d / 2 - 0.0001)));
  put(glassBucket, roundedBox(PH.w - 0.0015, PH.h - 0.0015, 0.0008, 0.0016), mat(V(0, 0, -PH.d / 2 + 0.0001)));
  const phoneGlass = solid(new THREE.Mesh(own(merge(glassBucket)), darkGlass), 'phone');
  const bump = new THREE.Mesh(own(roundedBox(0.0056, 0.0056, 0.0012, 0.0012)), black);
  bump.name = 'phone';
  bump.position.set(-0.0055, PH.h / 2 - 0.0062, -PH.d / 2 - 0.0004);
  const phoneProxy = hitProxy(0.028, 0.046, 0.016, 'phone:proxy');
  phone.add(phoneBody, phoneGlass, bump, phoneProxy);
  hit.push(phoneBody, phoneGlass, bump, phoneProxy);

  // merged figure meshes
  const bodyMesh = solid(new THREE.Mesh(own(merge(body)), paleWood), 'puppet');
  const darkMesh = solid(new THREE.Mesh(own(merge(dark)), darkPaint), 'puppet');
  const collarMesh = solid(new THREE.Mesh(own(merge(painted)), collarPaint), 'puppet');
  figure.add(bodyMesh, darkMesh, collarMesh);
  hit.push(bodyMesh, darkMesh, collarMesh);
  const figureProxy = hitProxy(0.078, 0.245, 0.06, 'puppet:proxy');
  figureProxy.position.set(0, 0.1225, 0.004);
  figure.add(figureProxy);
  hit.push(figureProxy);

  // base and rod (group space)
  const baseMesh = solid(new THREE.Mesh(own(merge(baseBucket)), oak), 'puppet');
  const rodMesh = solid(new THREE.Mesh(own(merge(rodBucket)), steel), 'puppet');
  group.add(baseMesh, rodMesh);
  hit.push(baseMesh, rodMesh);

  // ---- the controller: a wooden cross lying on the table behind him ----------
  const bar = new THREE.Group();
  bar.position.set(0.014, 0, -0.108);
  bar.rotation.y = THREE.MathUtils.degToRad(22);
  group.add(bar);
  const barBucket: Bucket = [];
  put(barBucket, roundedBox(0.118, 0.008, 0.008, 0.0025), mat(V(0, 0.004, 0)));
  put(barBucket, roundedBox(0.008, 0.007, 0.064, 0.0025), mat(V(0, 0.0115, 0)));
  const barMesh = solid(new THREE.Mesh(own(merge(barBucket)), oak), 'puppet');
  bar.add(barMesh);
  hit.push(barMesh);
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
    { from: barAnchor(0, 0.015, 0.031), to: wristL.clone().add(V(0, 0.005, 0)), phase: 1.15 },
    { from: barAnchor(0, 0.015, -0.031), to: wristR.clone().add(V(0, 0.005, 0)), phase: 0.8 },
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

  // ---- nudges (in-focus clicks) ------------------------------------------------
  const rock = new Spring(1.5, 0.14);     // the figure sways about its base
  const tip = new Spring(2.6, 0.2);       // the camera tips on the palm
  const wag = new Spring(2.4, 0.2);       // the phone wags in the hand
  const panel = pinocchioPanel();
  const itemOf = (hitName: string): PuppetItem => hitName.startsWith('camera') ? 'camera' : hitName.startsWith('phone') ? 'phone' : 'puppet';
  const nudge = (item: PuppetItem): void => {
    if (ctx.state.reducedMotion) return;
    if (item === 'puppet') { rock.kick(-0.55); sway.kick(0.03); }
    else if (item === 'camera') {
      tip.kick(-1.1);
      gsap.to(camera.position, { y: 0.004, duration: 0.16, ease: 'power2.out', yoyo: true, repeat: 1, overwrite: true });
    } else {
      wag.kick(1.3);
      gsap.to(phone.position, { y: 0.008, duration: 0.16, ease: 'power2.out', yoyo: true, repeat: 1, overwrite: true });
    }
  };

  let lastY: number | null = null;
  const contactMat = contact.material as THREE.MeshBasicMaterial;

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
      const moving = sway.active || rock.active || tip.active || wag.active;
      if (!moving) return;
      figure.rotation.z = LEAN.z + rock.step(dt);
      camera.rotation.x = tip.step(dt);
      phone.rotation.z = wag.step(dt);
      writeStrings(sway.step(dt));
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
