import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ObjectCtx, TableObject } from './types';
import { hitProxy, solid } from './helpers';
import { makeCanvasTexture, grain, hash2 } from '../materials';
import { jarPanel } from '../panels/jar';

// The jar (SPEC 4.10): a glass jar with a slotted metal lid and a few folded
// and crumpled paper slips inside. Glass is a MeshPhysicalMaterial with
// transmission (refraction of what is behind and inside it); if the quality
// tier drops, it swaps to a cheap transparent glass with the same environment
// reflection. The panel is the slip of paper in src/panels/jar.ts; a
// successful submit calls dropSlip(), which folds a small 3D slip through the
// slot and lets it fall onto the pile.

// Dimensions (metres). Group origin: bottom centre, sitting on y = 0.
const R = 0.044;          // body radius
const H_BODY = 0.094;     // where the shoulder starts
const R_NECK = 0.0355;    // neck / rim radius
const H_RIM = 0.116;      // top of the glass rim
const WALL = 0.0032;      // glass wall
const BASE = 0.005;       // glass bottom
const LID = { r: 0.0395, skirt: 0.015, top: 0.1235, plate: 0.0022, bevel: 0.0011, slotW: 0.036, slotH: 0.0042 };
const INNER_R = R - WALL;

export function createJar(ctx: ObjectCtx): TableObject {
  const group = new THREE.Group();
  group.name = 'jar';
  const disposables: { dispose(): void }[] = [];

  // --- environment for the glass and the lid: a dark room with the lamp as one warm highlight
  performance.mark('jar:start');
  const envTex = makeCanvasTexture({
    width: 256, height: 128, anisotropy: 1,
    draw(c, w, h) {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#08080a'); g.addColorStop(0.48, '#131110'); g.addColorStop(0.6, '#2b1d12'); g.addColorStop(1, '#0c0907');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      // the lit table, below the horizon
      let r = c.createRadialGradient(w * 0.4, h * 0.74, 2, w * 0.4, h * 0.74, w * 0.4);
      r.addColorStop(0, 'rgba(150,90,40,0.85)'); r.addColorStop(1, 'rgba(150,90,40,0)');
      c.fillStyle = r; c.fillRect(0, 0, w, h);
      // the lamp: behind and above the jar (equirect u from atan2(z, x))
      r = c.createRadialGradient(w * 0.28, h * 0.31, 1, w * 0.28, h * 0.31, 26);
      r.addColorStop(0, 'rgba(255,232,190,1)'); r.addColorStop(0.25, 'rgba(255,200,130,0.85)'); r.addColorStop(1, 'rgba(255,170,90,0)');
      c.fillStyle = r; c.fillRect(0, 0, w, h);
      // a faint cool window far to the left (the seam of the map)
      c.fillStyle = 'rgba(70,95,130,0.28)';
      c.fillRect(0, h * 0.3, w * 0.05, h * 0.3); c.fillRect(w * 0.95, h * 0.3, w * 0.05, h * 0.3);
    },
  });
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(ctx.renderer);
  const envRT = pmrem.fromEquirectangular(envTex);
  pmrem.dispose();
  envTex.dispose();
  const envMap = envRT.texture;
  performance.mark('jar:env');
  disposables.push(envRT);

  // --- glass
  const glassGeo = new THREE.LatheGeometry(glassProfile(), 64);
  disposables.push(glassGeo);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xf3f7f4, roughness: 0.06, metalness: 0,
    transmission: 1, thickness: 0.014, ior: 1.5,
    attenuationColor: new THREE.Color(0xcfe3d6), attenuationDistance: 0.1,
    envMap, envMapIntensity: 1.0, specularIntensity: 1,
    side: THREE.FrontSide,
  });
  // the fallback when the quality tier drops: no transmission pass, fresnel from the physical model + the same reflection
  const cheapGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xe6efec, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.2,
    envMap, envMapIntensity: 1.4, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.1,
    side: THREE.FrontSide, depthWrite: false,
  });
  disposables.push(glassMat, cheapGlassMat);
  const glass = solid(new THREE.Mesh(glassGeo, glassMat), 'jar-glass');
  // half-tone shadow: a checker alpha map on the depth material, blurred by the PCF filter into a lighter shadow than an opaque body
  const dither = makeCanvasTexture({
    width: 64, height: 64, colorSpace: THREE.NoColorSpace, repeat: [48, 14], anisotropy: 1,
    draw(c, w, h) { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (((x + y) / 2) % 2 === 0) c.fillRect(x, y, 2, 2); },
  });
  dither.magFilter = dither.minFilter = THREE.NearestFilter;
  dither.generateMipmaps = false;
  disposables.push(dither);
  const glassDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: dither, alphaTest: 0.5 });
  disposables.push(glassDepth);
  glass.customDepthMaterial = glassDepth;
  group.add(glass);

  // --- lid: a brushed metal plate with a slot cut through it, and a skirt over the rim
  const lidMat = new THREE.MeshStandardMaterial({ color: 0xb6b0a4, metalness: 1, roughness: 0.4, envMap, envMapIntensity: 0.75 });
  const brush = makeCanvasTexture({
    width: 256, height: 4, colorSpace: THREE.NoColorSpace, repeat: [36, 1], anisotropy: 4,
    draw(c, w, h) { for (let x = 0; x < w; x++) { const v = 95 + Math.round(hash2(x, 0, 21) * 70); c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(x, 0, 1, h); } },
  });
  disposables.push(brush, lidMat);
  const skirtMat = lidMat.clone();
  skirtMat.roughnessMap = brush;
  skirtMat.bumpMap = brush;
  skirtMat.bumpScale = 0.0006;
  disposables.push(skirtMat);

  const plateGeo = lidPlateGeometry();
  plateGeo.rotateX(-Math.PI / 2);
  plateGeo.translate(0, LID.top - LID.plate - LID.bevel, 0);
  const plate = solid(new THREE.Mesh(plateGeo, lidMat), 'jar-lid');
  const skirtPts = [new THREE.Vector2(LID.r - 0.0012, 0), new THREE.Vector2(LID.r, 0.0012), new THREE.Vector2(LID.r, LID.skirt)];
  const skirtGeo = new THREE.LatheGeometry(skirtPts, 64);
  skirtGeo.translate(0, LID.top - LID.plate - LID.bevel - LID.skirt + 0.0015, 0);
  const skirt = solid(new THREE.Mesh(skirtGeo, skirtMat), 'jar-lid-skirt');
  disposables.push(plateGeo, skirtGeo);
  group.add(plate, skirt);

  // --- the slips inside: one merged mesh, one paper material
  const slipTex = makeCanvasTexture({
    width: 256, height: 256, anisotropy: 4,
    draw(c, w, h) {
      c.fillStyle = '#f0e8d8'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(110,105,140,0.16)'; c.lineWidth = 1;
      for (let y = 24; y < h; y += 26) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(w, y + 0.5); c.stroke(); }
      // pencil lines that read as handwriting from a distance
      c.strokeStyle = 'rgba(58,52,46,0.5)'; c.lineWidth = 1.5; c.lineCap = 'round'; c.lineJoin = 'round';
      for (let line = 0; line < 8; line++) {
        const y0 = 18 + line * 26 + 4 * hash2(line, 1, 3);
        let x = 12 + 28 * hash2(line, 2, 3);
        const end = w - 16 - 70 * hash2(line, 3, 3);
        c.beginPath(); c.moveTo(x, y0);
        let k = 0;
        while (x < end) {
          const dx = 3 + 5 * hash2(line, k, 5);
          const dy = (hash2(line, k, 7) - 0.5) * 10;
          x += dx;
          c.quadraticCurveTo(x - dx / 2, y0 + dy * 1.3, x, y0 + dy * 0.35);
          k++;
          if (hash2(line, k, 9) < 0.16) { x += 5 + 6 * hash2(line, k, 11); c.moveTo(x, y0); }
        }
        c.stroke();
      }
      grain(c, w, h, 0.05, 4);
    },
  });
  const slipMat = new THREE.MeshStandardMaterial({ map: slipTex, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  disposables.push(slipTex, slipMat);

  const pile: THREE.BufferGeometry[] = [];
  const put = (g: THREE.BufferGeometry, x: number, floorY: number, z: number, yaw: number, pitch = 0, roll = 0): void => {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
    g.applyMatrix4(m);
    g.computeBoundingBox();
    g.translate(x, floorY - g.boundingBox!.min.y, z);
    if (g.index) g.dispose();
  };
  const d2r = THREE.MathUtils.DEG2RAD;
  put(foldedSlip(1, 52 * d2r), 0.010, BASE, -0.004, 28 * d2r);                 // a tent on the floor
  put(foldedSlip(2, 78 * d2r), -0.013, BASE, -0.013, 80 * d2r, 0, -78 * d2r);  // folded nearly shut, lying on its side
  put(crumpledSlip(3, 0.0125), -0.011, BASE, 0.010, 0);
  put(crumpledSlip(4, 0.011), 0.015, BASE + 0.004, 0.014, 0);
  put(curledSlip(5), 0.003, BASE + 0.016, -0.009, 14 * d2r, 12 * d2r, 0);
  put(foldedSlip(6, 24 * d2r), -0.002, BASE + 0.020, 0.009, -38 * d2r, 0, 7 * d2r); // open, on top
  put(crumpledSlip(7, 0.0115), -0.004, BASE + 0.028, -0.016, 0);
  const pileGeo = mergeGeometries(pile, false);
  for (const g of pile) g.dispose();
  disposables.push(pileGeo);
  const slips = solid(new THREE.Mesh(pileGeo, slipMat), 'jar-slips');
  group.add(slips);

  // --- hit targets: the glass and the lid, plus a generous proxy
  const proxy = hitProxy(0.1, 0.14, 0.1, 'jar:proxy');
  proxy.position.y = 0.07;
  group.add(proxy);

  // --- the slip that drops in after a submit
  const extra: THREE.Mesh[] = [];
  const landing = [
    { x: 0.006, z: 0.004, floor: BASE + 0.036, yaw: -20 }, { x: -0.010, z: -0.004, floor: BASE + 0.040, yaw: 35 },
    { x: 0.010, z: -0.010, floor: BASE + 0.042, yaw: 75 }, { x: -0.004, z: 0.012, floor: BASE + 0.045, yaw: -60 },
    { x: 0.002, z: -0.002, floor: BASE + 0.050, yaw: 10 },
  ];
  const tmpM = new THREE.Matrix4();
  const tmpB = new THREE.Box3();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3();
  function dropSlip(): Promise<void> {
    const open = 82 * d2r;
    const geo = foldedSlip(100 + extra.length, open, 0.040, 0.028, 'x').toNonIndexed();
    const m = solid(new THREE.Mesh(geo, slipMat), 'jar-slip-new');
    disposables.push(geo);
    const spot = landing[extra.length % landing.length];
    extra.push(m);
    group.add(m);
    // landing pose: the folded slip lies on one face; its lowest point rests on `floor`
    const restRot = { x: -open, y: spot.yaw * d2r, z: 0 };
    tmpE.set(restRot.x, restRot.y, restRot.z, 'YXZ');
    tmpM.compose(zero, tmpQ.setFromEuler(tmpE), one);
    geo.computeBoundingBox();
    tmpB.copy(geo.boundingBox!).applyMatrix4(tmpM);
    const landY = spot.floor - tmpB.min.y;
    const done = (): void => {
      m.position.set(spot.x, landY, spot.z);
      m.rotation.set(restRot.x, restRot.y, restRot.z, 'YXZ');
      window.dispatchEvent(new CustomEvent('jar:dropped', { detail: { slips: extra.length } })); // QA hook: the slip has landed
    };
    if (ctx.state.reducedMotion) { done(); return Promise.resolve(); }
    // start above the slot, edge-on: the crease runs along x, the halves nearly shut
    m.position.set(0, LID.top + 0.028, 0);
    m.rotation.set(0, 0, 0, 'YXZ');
    return new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: () => { done(); resolve(); } });
      tl.to(m.position, { y: LID.top - 0.03, duration: 0.5, ease: 'power1.in' });                 // through the slot
      tl.to(m.position, { x: spot.x, z: spot.z, y: landY + 0.004, duration: 0.5, ease: 'power2.in' }, '>-0.02');
      tl.to(m.rotation, { x: restRot.x, y: restRot.y, duration: 0.5, ease: 'power1.inOut' }, '<');
      tl.to(m.position, { y: landY, duration: 0.16, ease: 'bounce.out' });
    });
  }

  const panel = jarPanel({ drop: dropSlip });
  let cheap = false;

  return {
    id: 'jar',
    label: 'The jar',
    group,
    hit: [glass, plate, skirt, proxy],
    anchor: new THREE.Vector3(0, LID.top + 0.004, 0),
    // a jar is heavier than a card: smaller lift, less tilt, a slower spring with little overshoot
    hover: { lift: 0.009, tilt: 1.6, spring: { duration: 0.46, overshoot: 1.05 } },
    focus: {
      camera: ctx.focusPose('jar'),
      panel,
    },
    update() {
      if (!cheap && ctx.state.quality === 'low') { cheap = true; glass.material = cheapGlassMat; }
    },
    dispose() {
      for (const m of extra) { m.geometry.dispose(); }
      for (const d of disposables) d.dispose();
    },
  };
}

/** The glass as one closed solid of revolution: up the outside, over the rim, down the inside. */
function glassProfile(): THREE.Vector2[] {
  const p: [number, number][] = [];
  p.push([0, 0.0012], [0.026, 0.0012], [0.033, 0.0004], [0.038, 0], [0.0415, 0.001], [0.0432, 0.0035], [R, 0.009]);
  p.push([R, H_BODY]);
  const sh = 0.013;                                      // shoulder height
  for (let i = 1; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; p.push([R_NECK + (R - R_NECK) * Math.cos(a), H_BODY + sh * Math.sin(a)]); }
  p.push([R_NECK, H_RIM - 0.004], [R_NECK + 0.0012, H_RIM - 0.0025], [R_NECK + 0.0012, H_RIM - 0.0009], [R_NECK + 0.0004, H_RIM]);
  p.push([R_NECK - WALL + 0.0004, H_RIM], [R_NECK - WALL, H_RIM - 0.0009]);
  const ish = sh - 0.002;
  p.push([R_NECK - WALL, H_BODY + ish]);
  for (let i = 5; i >= 0; i--) { const a = (i / 6) * Math.PI / 2; p.push([R_NECK - WALL + (R - R_NECK) * Math.cos(a), H_BODY + ish * Math.sin(a)]); }
  p.push([INNER_R, 0.011], [INNER_R - 0.0015, BASE + 0.0025], [INNER_R - 0.005, BASE], [0, BASE]);
  return p.map(([x, y]) => new THREE.Vector2(x, y));
}

/** The lid plate: a disc with a rounded slot cut through it, bevelled edges. Built along +z (rotated by the caller). */
function lidPlateGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, LID.r, 0, Math.PI * 2, false);
  const sw = LID.slotW / 2, sh = LID.slotH / 2;
  const hole = new THREE.Path();
  hole.moveTo(-sw + sh, -sh);
  hole.lineTo(sw - sh, -sh);
  hole.absarc(sw - sh, 0, sh, -Math.PI / 2, Math.PI / 2, false);
  hole.lineTo(-sw + sh, sh);
  hole.absarc(-sw + sh, 0, sh, Math.PI / 2, Math.PI * 1.5, false);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, {
    depth: LID.plate, bevelEnabled: true, bevelThickness: LID.bevel, bevelSize: LID.bevel, bevelSegments: 3, curveSegments: 48,
  });
}

/**
 * A slip folded once: each half hinged about the crease (along z by default,
 * or along x) and raised by `open` radians, with small wrinkles. Lies in the
 * x/z plane with the crease at y = 0.
 */
function foldedSlip(seed: number, open: number, w = 0.05, h = 0.034, crease: 'x' | 'z' = 'z'): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, 12, 6);
  g.rotateX(-Math.PI / 2);
  if (crease === 'x') g.rotateY(Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const half = w / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const a = crease === 'z' ? x : z;      // distance from the crease
    const s = Math.sign(a) || 1;
    const aa = Math.abs(a);
    const along = aa * Math.cos(open) * s;
    const up = aa * Math.sin(open);
    const n = (hash2(Math.round(x * 4000) + 97, Math.round(z * 4000) + 97, seed) - 0.5) * 0.0014 * (0.3 + aa / half);
    if (crease === 'z') pos.setXYZ(i, along, up + n, z);
    else pos.setXYZ(i, x, up + n, along);
  }
  g.computeVertexNormals();
  return g;
}

/** A crumpled ball: a low-poly sphere with faceted radial displacement. */
function crumpledSlip(seed: number, r: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 2).toNonIndexed();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const q = (a: number): number => Math.round(a * 1e4);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = hash2(q(v.x) * 7 + q(v.y), q(v.z), seed);
    const n2 = hash2(q(v.y) * 3 + q(v.z), q(v.x), seed + 1);
    v.multiplyScalar(0.76 + 0.34 * n + 0.14 * (n2 - 0.5));
    pos.setXYZ(i, v.x, v.y * 0.82, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A slip curling up at both ends. */
function curledSlip(seed: number, w = 0.046, h = 0.03): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, 12, 4);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const n = (hash2(Math.round(x * 4000) + 11, Math.round(z * 4000) + 11, seed) - 0.5) * 0.0008;
    pos.setY(i, (x * x) / (w / 2) * 0.55 + n);
  }
  g.computeVertexNormals();
  return g;
}
