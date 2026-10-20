import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ObjectCtx, TableObject } from './types';
import { roundedBox, solid } from './helpers';
import { metal, plastic, matte, makeCanvasTexture, hash2, PALETTE } from '../materials';
import { vinylPanel } from '../panels/vinyl';
import { music } from '../music';
import { state } from '../state';

// The turntable (SPEC 4.9): a compact deck, walnut plinth with a black top
// plate, aluminium platter under a felt mat, a black record with a cream
// label, and a straight tonearm on a gimbal with a counterweight. The record
// spins at 33⅓ and the arm swings onto the lead-in groove while
// state.music.isPlaying; on pause the arm lifts, the platter coasts down and
// the arm returns to its rest. Group origin: bottom centre, on y = 0.

const RPM = 100 / 3;
const OMEGA = (RPM * 2 * Math.PI) / 60; // 3.49 rad/s
/** Minutes of play for the arm to travel from the lead-in to the run-out groove. */
const SIDE_MINUTES = 20;

const PLINTH = { w: 0.30, d: 0.24, h: 0.034, r: 0.0045 };
const FOOT_H = 0.005;
const DECK_Y = FOOT_H + PLINTH.h;
const PLATE_H = 0.003;
const TOP_Y = DECK_Y + PLATE_H; // 0.042: the black top plate's surface
const PLATTER = { x: -0.035, z: 0.006, r: 0.100, h: 0.012 };
const MAT = { r: 0.097, h: 0.002 };
const RECORD = { r: 0.094, h: 0.0018, label: 0.033, hole: 0.0037, leadIn: 0.0895, runOut: 0.046 };
const PIVOT = new THREE.Vector3(0.102, 0, -0.072);
const ARM_Y = 0.066; // tube centre
const ARM_LEN = 0.168; // pivot to the headshell joint + headshell
const HEAD_OFFSET = THREE.MathUtils.degToRad(22);
const LIFT_ANGLE = 0.036; // rad: ~6 mm at the stylus
/** Radii (m) of the quiet bands between tracks. */
const TRACK_GAPS = [0.0825, 0.0745, 0.0665, 0.0585, 0.0515];

export function createVinyl(ctx: ObjectCtx): TableObject {
  const group = new THREE.Group();
  group.name = 'vinyl';
  const disposables: { dispose(): void }[] = [];

  // materials
  const veneerTex = veneerTexture();
  disposables.push(veneerTex);
  const veneer = new THREE.MeshStandardMaterial({ map: veneerTex, bumpMap: veneerTex, bumpScale: 0.0012, roughness: 0.58, metalness: 0 });
  disposables.push(veneer);
  const deck = matte(0x232120, 0.62);
  const alu = metal({ color: 0xb4b3af, roughness: 0.36 });
  const chrome = metal({ color: 0xd2d2cf, roughness: 0.24 });
  const gun = metal({ color: PALETTE.gunmetal, roughness: 0.5 });
  const brass = metal({ color: PALETTE.brass, roughness: 0.42 });
  const felt = matte(0x2b2a2d, 0.96);
  const black = plastic({ color: 0x1e1d1c, roughness: 0.55 });
  const rubber = plastic({ color: 0x1a1816, roughness: 0.92 });
  const maps = recordMaps(512);
  disposables.push(maps.map, maps.normalMap, maps.roughnessMap, maps.anisotropyMap);
  const vinyl = new THREE.MeshPhysicalMaterial({
    map: maps.map, normalMap: maps.normalMap, normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: maps.roughnessMap, roughness: 1, metalness: 0,
    anisotropy: 1, anisotropyMap: maps.anisotropyMap,
    color: 0xffffff,
  });
  disposables.push(vinyl);

  // feet, plinth, top plate
  const inset = 0.024;
  const feetGeo = mergeGeometries(
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => {
      const g = new THREE.CylinderGeometry(0.010, 0.0115, FOOT_H, 20);
      g.translate(sx * (PLINTH.w / 2 - inset), FOOT_H / 2, sz * (PLINTH.d / 2 - inset));
      return g;
    }),
  )!;
  const feet = solid(new THREE.Mesh(feetGeo, rubber), 'vinyl:feet');
  const plinth = solid(new THREE.Mesh(roundedBox(PLINTH.w, PLINTH.h, PLINTH.d, PLINTH.r), veneer), 'vinyl:plinth');
  plinth.position.y = FOOT_H + PLINTH.h / 2;
  const plate = solid(new THREE.Mesh(roundedBox(PLINTH.w - 0.007, PLATE_H, PLINTH.d - 0.007, 0.0014), deck), 'vinyl:deck');
  plate.position.y = DECK_Y + PLATE_H / 2;
  group.add(feet, plinth, plate);

  // spindle (fixed) and the spinning stack: platter, felt mat, record
  const spindle = solid(new THREE.Mesh(new THREE.CylinderGeometry(RECORD.hole - 0.0004, RECORD.hole - 0.0004, 0.027, 16), chrome), 'vinyl:spindle');
  spindle.position.set(PLATTER.x, TOP_Y + 0.0135, PLATTER.z);
  const spin = new THREE.Group();
  spin.position.set(PLATTER.x, TOP_Y, PLATTER.z);
  const platter = solid(new THREE.Mesh(platterGeometry(PLATTER.r, PLATTER.h, 0.0016), alu), 'vinyl:platter');
  const mat = solid(new THREE.Mesh(new THREE.CylinderGeometry(MAT.r, MAT.r, MAT.h, 72), felt), 'vinyl:mat');
  mat.position.y = PLATTER.h + MAT.h / 2;
  const record = solid(new THREE.Mesh(new THREE.CylinderGeometry(RECORD.r, RECORD.r, RECORD.h, 128), vinyl), 'vinyl:record');
  record.position.y = PLATTER.h + MAT.h + RECORD.h / 2;
  spin.add(platter, mat, record);
  group.add(spindle, spin);

  // tonearm: base + bearing on the deck; the arm yaws about y at PIVOT and the lifter pitches about its local z
  const armBase = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.018, 0.010, 32), black), 'vinyl:arm-base');
  armBase.position.set(PIVOT.x, TOP_Y + 0.005, PIVOT.z);
  const bearing = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.006, 24), brass), 'vinyl:bearing');
  bearing.position.set(PIVOT.x, TOP_Y + 0.013, PIVOT.z);
  group.add(armBase, bearing);

  const arm = new THREE.Group();
  arm.position.set(PIVOT.x, ARM_Y, PIVOT.z);
  const lifter = new THREE.Group();
  arm.add(lifter);
  const housing = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.016, 24), gun), 'vinyl:housing');
  housing.position.y = -0.001;
  const tubeStart = 0.010, tubeEnd = ARM_LEN - 0.024;
  const tube = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.0030, 0.0036, tubeEnd - tubeStart, 14), chrome), 'vinyl:tube');
  tube.rotation.z = -Math.PI / 2;
  tube.position.x = (tubeStart + tubeEnd) / 2;
  // the headshell is offset inward (toward the spindle) like a real one
  const head = new THREE.Group();
  head.position.x = tubeEnd;
  head.rotation.y = HEAD_OFFSET;
  const shell = solid(new THREE.Mesh(roundedBox(0.026, 0.0055, 0.012, 0.0012), black), 'vinyl:headshell');
  shell.position.set(0.012, -0.0025, 0);
  const cartridge = solid(new THREE.Mesh(roundedBox(0.011, 0.003, 0.008, 0.0008), gun), 'vinyl:cartridge');
  cartridge.position.set(0.016, -0.00675, 0);
  const fingerLift = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.0007, 0.010, 8), chrome));
  fingerLift.rotation.x = Math.PI / 2;
  fingerLift.position.set(0.004, -0.001, 0.009);
  head.add(shell, cartridge, fingerLift);
  const stub = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.0024, 0.0024, 0.036, 10), chrome), 'vinyl:stub');
  stub.rotation.z = -Math.PI / 2;
  stub.position.x = -0.022;
  const weight = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.018, 28), gun), 'vinyl:counterweight');
  weight.rotation.z = -Math.PI / 2;
  weight.position.x = -0.031;
  lifter.add(housing, tube, head, stub, weight);
  group.add(arm);

  // where the stylus is, in arm space (used to aim the arm at a groove radius)
  const stylusLocal = new THREE.Vector3(0.0215, -0.0083, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), HEAD_OFFSET).add(new THREE.Vector3(tubeEnd, 0, 0));
  const platterXZ = new THREE.Vector2(PLATTER.x, PLATTER.z);
  const stylusAt = (yaw: number, out = new THREE.Vector3()): THREE.Vector3 =>
    out.copy(stylusLocal).applyAxisAngle(UP, yaw).add(PIVOT);
  /** Yaw that puts the stylus on groove radius r, on the front side of the spindle (scan + bisection). */
  const yawForRadius = (r: number): number => {
    const p = new THREE.Vector3();
    const f = (yaw: number): number => { stylusAt(yaw, p); return Math.hypot(p.x - platterXZ.x, p.z - platterXZ.y) - r; };
    let best = REST_YAW;
    const N = 720;
    for (let i = 0; i < N; i++) {
      let a = -Math.PI + (i / N) * 2 * Math.PI, b = a + (2 * Math.PI) / N;
      const fa = f(a), fb = f(b);
      if (fa * fb > 0) continue;
      for (let k = 0; k < 24; k++) { const m = (a + b) / 2; if (f(a) * f(m) <= 0) b = m; else a = m; }
      stylusAt((a + b) / 2, p);
      if (p.z > platterXZ.y) { best = (a + b) / 2; break; }
    }
    return best;
  };
  // rest: the arm points to the front, a little outward, over the rest clip
  const REST_YAW = -Math.atan2(0.991, -0.132);
  const LEAD_IN = yawForRadius(RECORD.leadIn);
  const RUN_OUT = yawForRadius(RECORD.runOut);

  // the arm rest: a post with a clip, under the tube at rest
  const restDir = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, REST_YAW);
  const restPos = PIVOT.clone().addScaledVector(restDir, 0.118);
  const restPost = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0032, ARM_Y - TOP_Y - 0.006, 12), black), 'vinyl:rest-post');
  restPost.position.set(restPos.x, TOP_Y + (ARM_Y - TOP_Y - 0.006) / 2, restPos.z);
  const restClip = solid(new THREE.Mesh(roundedBox(0.0075, 0.0075, 0.009, 0.0012), black), 'vinyl:rest-clip');
  restClip.position.set(restPos.x, ARM_Y - 0.0045, restPos.z);
  restClip.rotation.y = REST_YAW;
  // cue lever beside the bearing
  const lever = solid(new THREE.Mesh(roundedBox(0.016, 0.0028, 0.0045, 0.001), black), 'vinyl:lever');
  lever.position.set(PIVOT.x + 0.022, TOP_Y + 0.0125, PIVOT.z + 0.012);
  lever.rotation.y = -0.5;
  // speed knob and start/stop button at the front-left
  const knob = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.0095, 0.007, 28), alu), 'vinyl:knob');
  knob.position.set(-0.100, TOP_Y + 0.0035, 0.100);
  const knobMark = new THREE.Mesh(roundedBox(0.0012, 0.0006, 0.006, 0.0002), black);
  knobMark.position.set(-0.100, TOP_Y + 0.0073, 0.1035);
  const button = solid(new THREE.Mesh(roundedBox(0.020, 0.004, 0.009, 0.0018), black), 'vinyl:button');
  button.position.set(-0.130, TOP_Y + 0.002, 0.100);
  group.add(restPost, restClip, lever, knob, knobMark, button);

  // the choreography (gsap on this object; update() applies it every frame)
  const anim = { yaw: REST_YAW, lift: 0, omega: 0, progress: 0 };
  let tracking = false;
  let tl: gsap.core.Timeline | null = null;
  const kill = (): void => { tl?.kill(); tl = null; tracking = false; };
  const startPlay = (): void => {
    kill();
    anim.progress = 0;
    if (state.reducedMotion) { anim.omega = 0; anim.yaw = LEAD_IN; anim.lift = 0; tracking = true; return; }
    tl = gsap.timeline({ onComplete: () => { tracking = true; tl = null; } });
    tl.to(anim, { omega: OMEGA, duration: 1.7, ease: 'power2.inOut' }, 0)
      .to(anim, { lift: 1, duration: 0.35, ease: 'power2.out' }, 0.05)
      .to(anim, { yaw: LEAD_IN, duration: 1.35, ease: 'power2.inOut' }, 0.3)
      .to(anim, { lift: 0, duration: 0.5, ease: 'power2.in' }, 1.6);
  };
  const stopPlay = (): void => {
    kill();
    if (state.reducedMotion) { anim.omega = 0; anim.yaw = REST_YAW; anim.lift = 0; return; }
    tl = gsap.timeline({ onComplete: () => { tl = null; } });
    tl.to(anim, { omega: 0, duration: 2.4, ease: 'power2.out' }, 0)
      .to(anim, { lift: 1, duration: 0.35, ease: 'power2.out' }, 0)
      .to(anim, { yaw: REST_YAW, duration: 1.25, ease: 'power2.inOut' }, 0.3)
      .to(anim, { lift: 0, duration: 0.4, ease: 'power2.in' }, 1.5);
  };
  let wasPlaying = false;

  return {
    id: 'vinyl',
    label: 'Turntable',
    group,
    hit: [plinth, plate, platter, mat, record],
    anchor: new THREE.Vector3(0, ARM_Y + 0.012, 0),
    hover: { lift: 0.008, tilt: 1.5 },
    focus: {
      camera: ctx.focusPose('vinyl'),
      panel: vinylPanel(),
      onClickInside(hitName) {
        // a click on the record while focused plays or pauses (the panel's toggle does the same)
        if (/record|platter|mat/.test(hitName)) music.toggle();
      },
    },
    update(dt) {
      const playing = state.music.isPlaying;
      if (playing !== wasPlaying) { wasPlaying = playing; if (playing) startPlay(); else stopPlay(); }
      if (anim.omega > 0) spin.rotation.y -= anim.omega * dt;
      if (tracking && playing) {
        anim.progress = Math.min(1, anim.progress + dt / (SIDE_MINUTES * 60));
        anim.yaw = LEAD_IN + (RUN_OUT - LEAD_IN) * anim.progress;
      }
      arm.rotation.y = anim.yaw;
      lifter.rotation.z = anim.lift * LIFT_ANGLE;
    },
    dispose() {
      kill();
      for (const d of disposables) d.dispose();
      feetGeo.dispose();
    },
  };
}

const UP = new THREE.Vector3(0, 1, 0);

/** A platter with a small chamfer on its top edge (lathe). */
function platterGeometry(r: number, h: number, c: number): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(0, 0), new THREE.Vector2(r - 0.002, 0), new THREE.Vector2(r, 0.002),
    new THREE.Vector2(r, h - c), new THREE.Vector2(r - c, h), new THREE.Vector2(0, h),
  ];
  return new THREE.LatheGeometry(pts, 96);
}

/** Mid walnut veneer, straight grain, lighter than the table so the deck reads on it. */
function veneerTexture(size = 512): THREE.CanvasTexture {
  return makeCanvasTexture({
    width: size, height: size, anisotropy: 8,
    draw(ctx, w, h) {
      ctx.fillStyle = '#6a4629';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 220; i++) {
        const y0 = hash2(i, 1, 21) * h;
        const amp = 0.5 + hash2(i, 2, 21) * 3;
        const freq = 0.004 + hash2(i, 3, 21) * 0.01;
        const phase = hash2(i, 4, 21) * 6.28;
        const dark = hash2(i, 5, 21);
        const a = 0.06 + dark * 0.2;
        ctx.strokeStyle = dark > 0.45 ? `rgba(40,22,10,${a})` : `rgba(170,120,80,${a * 0.6})`;
        ctx.lineWidth = 0.5 + hash2(i, 6, 21) * 1.6;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 6) {
          const y = y0 + Math.sin(x * freq + phase) * amp;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // broad figure: a few soft bands
      for (let i = 0; i < 5; i++) {
        const y = hash2(i, 9, 21) * h, r = 60 + hash2(i, 10, 21) * 120;
        const g = ctx.createLinearGradient(0, y - r, 0, y + r);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.5, `rgba(0,0,0,${0.06 + hash2(i, 11, 21) * 0.08})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, y - r, w, r * 2);
      }
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (hash2(i & 511, i >> 9, 23) - 0.5) * 10;
        d[i] += n; d[i + 1] += n * 0.9; d[i + 2] += n * 0.8;
      }
      ctx.putImageData(img, 0, 0);
    },
  });
}

interface RecordMaps { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture; anisotropyMap: THREE.CanvasTexture }

/**
 * The record's maps, drawn once: colour (black vinyl, fine grooves, quiet
 * bands between tracks, a cream printed label), a groove normal map, a
 * roughness map (grooves duller, bands and run-out glossier, label matte) and
 * an anisotropy map whose direction runs along the grooves, so the lamp
 * draws the radial sheen a real record shows.
 */
function recordMaps(size: number): RecordMaps {
  const c = size / 2;
  const R = c - 2;
  const px = R / RECORD.r;
  const labelPx = RECORD.label * px, holePx = RECORD.hole * px;
  const leadPx = RECORD.leadIn * px, runPx = RECORD.runOut * px;
  const gapsPx = TRACK_GAPS.map((g) => g * px);

  const map = makeCanvasTexture({
    width: size, height: size, anisotropy: 16,
    draw(ctx, w, h) {
      ctx.fillStyle = '#151314';
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(c, c, 0, c, c, R);
      g.addColorStop(0, '#1d1c1e');
      g.addColorStop(1, '#17161a');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
      // fine grooves
      for (let r = runPx; r < leadPx; r += 1.7) {
        ctx.strokeStyle = `rgba(255,255,255,${0.012 + hash2(Math.round(r * 10), 1, 5) * 0.045})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.stroke();
      }
      // the quiet bands between tracks read a touch lighter
      for (const r of gapsPx) {
        ctx.strokeStyle = 'rgba(255,255,255,0.085)';
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.stroke();
      }
      // the outer edge: a thin bevel highlight
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(c, c, R - 1, 0, Math.PI * 2); ctx.stroke();
      // the label
      ctx.fillStyle = '#e7ddc6';
      ctx.beginPath(); ctx.arc(c, c, labelPx, 0, Math.PI * 2); ctx.fill();
      const lg = ctx.createRadialGradient(c, c, labelPx * 0.2, c, c, labelPx);
      lg.addColorStop(0, 'rgba(255,250,236,0.35)');
      lg.addColorStop(1, 'rgba(120,90,50,0.12)');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(c, c, labelPx, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(70,45,25,0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(c, c, labelPx - 5, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(c, c, holePx + 7, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#3a2a1c';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `italic 400 ${Math.round(labelPx * 0.42)}px Georgia, "Times New Roman", serif`;
      ctx.fillText('lol', c, c - labelPx * 0.42);
      ctx.font = `500 ${Math.round(labelPx * 0.13)}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
      ctx.fillText('33⅓ RPM', c, c + labelPx * 0.44);
      ctx.fillText('SIDE A', c, c + labelPx * 0.62);
      // a ring of small type around the rim of the label
      ctx.save();
      ctx.translate(c, c);
      const ring = 'A PLAYLIST · LONG PLAYING · STEREO · ';
      ctx.font = `500 ${Math.round(labelPx * 0.09)}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
      const step = (Math.PI * 2) / (ring.length * 2);
      for (let k = 0; k < ring.length * 2; k++) {
        const ch = ring[k % ring.length];
        ctx.save();
        ctx.rotate(k * step - Math.PI / 2);
        ctx.fillStyle = 'rgba(58,42,28,0.8)';
        ctx.fillText(ch, 0, -(labelPx - 12));
        ctx.restore();
      }
      ctx.restore();
      ctx.fillStyle = '#141210';
      ctx.beginPath(); ctx.arc(c, c, holePx, 0, Math.PI * 2); ctx.fill();
    },
  });

  // data maps in one pass
  const mk = (): [HTMLCanvasElement, ImageData] => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const cx = cv.getContext('2d')!;
    return [cv, cx.createImageData(size, size)];
  };
  const [nCv, nImg] = mk();
  const [rCv, rImg] = mk();
  const [aCv, aImg] = mk();
  const period = 3.1, amp = 0.42;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const r = Math.hypot(dx, dy);
      const inDisc = r <= R;
      const inLabel = r <= labelPx;
      const nearGap = gapsPx.some((g) => Math.abs(r - g) < 1.6);
      const grooved = inDisc && !inLabel && r >= runPx && r <= leadPx && !nearGap;
      // normal: grooves tilt the normal radially in and out
      let nx = 0, ny = 0;
      if (grooved) {
        const s = Math.sin((r / period) * Math.PI * 2) * amp * (0.7 + hash2(Math.round(r * 7), 2, 9) * 0.5);
        nx = (dx / r) * s; ny = (dy / r) * s;
      }
      const len = Math.hypot(nx, ny, 1);
      nImg.data[i] = Math.round((nx / len * 0.5 + 0.5) * 255);
      nImg.data[i + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      nImg.data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      nImg.data[i + 3] = 255;
      // roughness (three reads the green channel; write all three)
      let rough = 0.5;
      if (inLabel) rough = 0.86;
      else if (grooved) rough = 0.46 + (hash2(x, y, 4) - 0.5) * 0.08;
      else if (inDisc) rough = 0.30;
      const rv = Math.round(rough * 255);
      rImg.data[i] = rv; rImg.data[i + 1] = rv; rImg.data[i + 2] = rv; rImg.data[i + 3] = 255;
      // anisotropy: direction along the groove (tangential), strength off the label
      const t = r > 0 ? Math.atan2(dy, dx) : 0;
      const ax = -Math.sin(t), ay = Math.cos(t);
      aImg.data[i] = Math.round((ax * 0.5 + 0.5) * 255);
      aImg.data[i + 1] = Math.round((ay * 0.5 + 0.5) * 255);
      aImg.data[i + 2] = inLabel || !inDisc ? 0 : grooved ? 255 : 170;
      aImg.data[i + 3] = 255;
    }
  }
  const finish = (cv: HTMLCanvasElement, img: ImageData): THREE.CanvasTexture => {
    cv.getContext('2d')!.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = 8;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  };
  return { map, normalMap: finish(nCv, nImg), roughnessMap: finish(rCv, rImg), anisotropyMap: finish(aCv, aImg) };
}
