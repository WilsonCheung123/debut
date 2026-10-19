import * as THREE from 'three';
import type { ObjectCtx, TableObject } from './types';
import { metal, plastic, makeCanvasTexture } from '../materials';
import { solid } from './helpers';

// The desk lamp (engine phase, final): an articulated lamp at the back-right,
// head aimed at the table centre, and the dust motes drifting in its cone.
// Not clickable (hit is empty). The key light is attached at headWorld().

export interface LampObject extends TableObject {
  /** World position of the bulb, for the key light. */
  headWorld(): THREE.Vector3;
  /** World point the head aims at. */
  aimWorld(): THREE.Vector3;
  setDustCount(n: number): void;
}

const HEAD = new THREE.Vector3(0, 0.38, -0.19);
const AIM = new THREE.Vector3(0, 0, -0.74);

export function createLamp(ctx: ObjectCtx): LampObject {
  const group = new THREE.Group();
  group.name = 'lamp';
  const dark = metal({ color: 0x2c2a27, roughness: 0.42 });
  const brassy = metal({ color: 0x6d6457, roughness: 0.5 });

  const base = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.016, 40), dark), 'lamp-base');
  base.position.y = 0.008;
  const collar = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.02, 24), brassy));
  collar.position.y = 0.026;
  group.add(base, collar);

  const elbow = new THREE.Vector3(0, 0.25, 0.06);
  const start = new THREE.Vector3(0, 0.03, 0);
  group.add(arm(start, elbow, 0.0085, dark), joint(elbow, 0.016, brassy));
  group.add(arm(elbow, HEAD.clone().add(new THREE.Vector3(0, 0.012, 0.02)), 0.0075, dark), joint(HEAD.clone().add(new THREE.Vector3(0, 0.012, 0.02)), 0.014, brassy));

  // the shade: a lathe, open toward the aim point, with a warm lit interior
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector2(0.018 + t * t * 0.052 + t * 0.012, t * 0.1));
  }
  const shadeGeo = new THREE.LatheGeometry(pts, 48);
  const shadeMat = metal({ color: 0x33302c, roughness: 0.4 }).clone();
  shadeMat.emissive = new THREE.Color(0x2a160a);
  shadeMat.emissiveIntensity = 0.5;
  const shade = solid(new THREE.Mesh(shadeGeo, shadeMat), 'lamp-shade');
  const inner = new THREE.Mesh(shadeGeo, plastic({ color: 0x7a5a3a, roughness: 0.6, emissive: 0xffa24a, emissiveIntensity: 0.45 }));
  inner.material = (inner.material as THREE.MeshStandardMaterial).clone();
  (inner.material as THREE.MeshStandardMaterial).side = THREE.BackSide;
  inner.scale.setScalar(0.985);
  const head = new THREE.Group();
  head.add(shade, inner);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.017, 20, 14), plastic({ color: 0xfff1d6, emissive: 0xffc88a, emissiveIntensity: 2.6, roughness: 0.3 }));
  bulb.position.y = 0.04;
  head.add(bulb);
  const cap = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 24), dark));
  cap.position.y = 0.11;
  head.add(cap);
  head.position.copy(HEAD);
  // lathe opens along +y; aim it so +y points away from the aim point
  const up = HEAD.clone().sub(AIM).normalize();
  head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  group.add(head);

  // dust motes in the cone (local space; the group is rotated toward the table)
  const dust = createDust(ctx.isPhone ? 60 : 200, HEAD, AIM);
  group.add(dust.points);

  const v = new THREE.Vector3();
  return {
    id: 'lamp',
    label: 'Desk lamp',
    group,
    hit: [],
    anchor: new THREE.Vector3(0, 0.5, 0),
    focus: { camera: ctx.focusPose('lamp'), panel: null },
    update(dt, t) { dust.update(dt, t); },
    headWorld() { return group.localToWorld(v.copy(HEAD).add(new THREE.Vector3(0, -0.015, -0.01))).clone(); },
    aimWorld() { return group.localToWorld(v.copy(AIM)).clone(); },
    setDustCount(n) { dust.setCount(n); },
  };
}

function arm(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const m = solid(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 16), mat));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
function joint(p: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const m = solid(new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat));
  m.position.copy(p);
  return m;
}

interface Dust { points: THREE.Points; update(dt: number, t: number): void; setCount(n: number): void }

/** ~200 motes drifting slowly inside the lamp cone: additive points, low alpha. */
function createDust(count: number, apex: THREE.Vector3, aim: THREE.Vector3): Dust {
  const axis = aim.clone().sub(apex);
  const length = axis.length();
  axis.normalize();
  const u = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0)).normalize();
  if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
  const w = new THREE.Vector3().crossVectors(axis, u).normalize();
  const n = count;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n * 4); // along, radial, angle, speed
  const sprite = makeCanvasTexture({
    width: 32, height: 32,
    draw(c, W, H) {
      const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
      g.addColorStop(0, 'rgba(255,235,200,1)');
      g.addColorStop(0.35, 'rgba(255,225,180,0.55)');
      g.addColorStop(1, 'rgba(255,220,170,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    },
  });
  const place = (i: number, along: number): void => {
    const r = Math.sqrt(Math.random()) * (0.03 + along * 0.42);
    const a = Math.random() * Math.PI * 2;
    seed[i * 4] = along; seed[i * 4 + 1] = r; seed[i * 4 + 2] = a; seed[i * 4 + 3] = 0.6 + Math.random() * 0.8;
  };
  for (let i = 0; i < n; i++) place(i, Math.random());
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: sprite, size: 0.005, sizeAttenuation: true, transparent: true, opacity: 0.34,
    color: 0xffd6a4, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'dust';
  points.frustumCulled = false;
  const p = new THREE.Vector3();
  const write = (i: number, t: number): void => {
    const along = seed[i * 4], r = seed[i * 4 + 1], a = seed[i * 4 + 2] + t * 0.05 * seed[i * 4 + 3];
    const sway = Math.sin(t * 0.7 * seed[i * 4 + 3] + i) * 0.004;
    p.copy(apex).addScaledVector(axis, along * length)
      .addScaledVector(u, Math.cos(a) * r + sway)
      .addScaledVector(w, Math.sin(a) * r);
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
  };
  let active = n;
  return {
    points,
    update(dt, t) {
      for (let i = 0; i < active; i++) {
        // drift slowly down the cone (toward the table), wrap at the end
        seed[i * 4] += dt * 0.012 * seed[i * 4 + 3];
        if (seed[i * 4] > 1) place(i, 0.02);
        write(i, t);
      }
      geo.attributes.position.needsUpdate = true;
    },
    setCount(c) {
      active = Math.max(0, Math.min(n, c));
      geo.setDrawRange(0, active);
    },
  };
}
