import * as THREE from 'three';
import type { ObjectCtx, TableObject } from './types';
import { roundedBox, hitProxy, solid, mergeParts } from './helpers';
import { makeCanvasTexture, hash2, metal, plastic, matte } from '../materials';
import { fpga as content } from '../content/fpga';

// The FPGA dev board (SPEC 4.4): a green PCB on four rubber feet with a
// silkscreen drawn on canvas, one square chip with an etched label, two
// 2 × 8 pin headers, a USB-C port, a regulator, a crystal, a tactile button,
// a scatter of 0805 passives, and one LED that breathes on a 4 s cycle.

const ID = 'fpga';
const BW = 0.096, BD = 0.066, BT = 0.0016;   // board
const FOOT = 0.003;                            // rubber feet under the corners
const TOP = BT / 2;                            // the top surface, in board space
const CHIP = { x: -0.006, z: 0.0, s: 0.018, h: 0.0014 };
const LED = { x: 0.012, z: 0.024 };
const USB = { x: -0.03, z: 0.0306, w: 0.0089, h: 0.0032, d: 0.0074 };
const J1 = { x: -0.022, z: -0.027, rot: 0 };   // back edge, rows along x
const J2 = { x: 0.041, z: 0.006, rot: Math.PI / 2 };
const BUTTON = { x: 0.033, z: 0.023 };
const REG = { x: -0.037, z: 0.011 };
const XTAL = { x: 0.012, z: -0.011 };
/** 0805 passives: x, z, rotated (long side along z), tan ceramic (else black resistor). */
const PASSIVES: [number, number, boolean, boolean][] = [
  [-0.021, -0.013, false, true], [-0.0175, -0.013, false, false], [-0.021, 0.013, false, true], [-0.0175, 0.013, false, false],
  [0.008, -0.004, true, true], [0.008, 0.0, true, false], [0.008, 0.004, true, true],
  [-0.028, 0.002, true, false], [-0.028, -0.003, true, true], [0.0, 0.015, false, false], [0.004, 0.015, false, true],
  [0.024, -0.02, false, true], [0.028, -0.02, false, false], [0.02, 0.012, true, false], [0.02, 0.018, true, true],
  [-0.004, -0.015, false, true],
];
const FEET: [number, number][] = [[-0.043, -0.028], [0.043, -0.028], [-0.043, 0.028], [0.043, 0.028]];
const TAU = Math.PI * 2;

export function createFpga(ctx: ObjectCtx): TableObject {
  const group = new THREE.Group();
  group.name = ID;

  // the board: rounded, green on top (silkscreen map), fibreglass edge
  const boardGeo = roundedBox(BW, BT, BD, 0.0006, 2);
  const pcbTex = pcbTexture();
  const pcbTop = new THREE.MeshStandardMaterial({ map: pcbTex, roughness: 0.52, metalness: 0 });
  const pcbEdge = matte(0x8f8c62, 0.8);
  regroupBox(boardGeo, 0, 1); // 0 = top (py), 1 = everything else
  const board = solid(new THREE.Mesh(boardGeo, [pcbTop, pcbEdge]), ID);
  board.position.y = FOOT + BT / 2;
  group.add(board);

  const black = plastic({ color: 0x1f1f21, roughness: 0.55 });
  const gold = metal({ color: 0xd4b464, roughness: 0.32 });
  const steel = metal({ color: 0xa4a4a0, roughness: 0.36 });
  const tan = matte(0xb59a6c, 0.62);
  const dark = matte(0x2c2c2e, 0.5);

  // the chip and its etched label
  const chipGeo = roundedBox(CHIP.s, CHIP.h, CHIP.s, 0.0004, 2);
  chipGeo.translate(CHIP.x, TOP + CHIP.h / 2, CHIP.z);
  const chip = solid(new THREE.Mesh(chipGeo, black), 'fpga-chip');
  board.add(chip);
  const labelTex = chipLabelTexture();
  const labelMat = new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.6, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(CHIP.s * 0.92, CHIP.s * 0.92), labelMat);
  label.rotation.x = -Math.PI / 2;
  label.position.set(CHIP.x, TOP + CHIP.h + 0.00004, CHIP.z);
  board.add(label);

  // black plastic: header bases, button base + plunger, regulator, feet, the USB's dark mouth
  const blacks: THREE.BufferGeometry[] = [];
  const pins: THREE.BufferGeometry[] = [];
  for (const j of [J1, J2]) {
    const base = roundedBox(0.0203, 0.0025, 0.0051, 0.0003, 1);
    base.translate(0, TOP + 0.00125, 0);
    base.rotateY(j.rot);
    base.translate(j.x, 0, j.z);
    blacks.push(base);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 8; i++) {
      const pin = new THREE.BoxGeometry(0.00064, 0.0105, 0.00064);
      pin.translate(-0.0203 / 2 + 0.00127 + i * 0.00254, TOP + 0.0105 / 2 - 0.0015, (r - 0.5) * 0.00254);
      pin.rotateY(j.rot);
      pin.translate(j.x, 0, j.z);
      pins.push(pin);
    }
  }
  const btn = roundedBox(0.006, 0.0025, 0.006, 0.0004, 1);
  btn.translate(BUTTON.x, TOP + 0.00125, BUTTON.z);
  blacks.push(btn);
  const plunger = new THREE.CylinderGeometry(0.0017, 0.0017, 0.0014, 16);
  plunger.translate(BUTTON.x, TOP + 0.0025 + 0.0007, BUTTON.z);
  blacks.push(plunger);
  const reg = roundedBox(0.0065, 0.0016, 0.0035, 0.0002, 1);
  reg.translate(REG.x, TOP + 0.0008, REG.z);
  blacks.push(reg);
  for (const [fx, fz] of FEET) {
    const foot = new THREE.CylinderGeometry(0.0026, 0.0028, FOOT, 14);
    foot.translate(fx, -BT / 2 - FOOT / 2, fz);
    blacks.push(foot);
  }
  const mouth = new THREE.BoxGeometry(USB.w - 0.0012, USB.h - 0.0012, 0.001);
  mouth.translate(USB.x, TOP + USB.h / 2, USB.z + USB.d / 2 - 0.0003);
  blacks.push(mouth);
  const blackMesh = solid(new THREE.Mesh(mergeParts(blacks), black), 'fpga-plastic');
  board.add(blackMesh);
  const pinMesh = solid(new THREE.Mesh(mergeParts(pins), gold), 'fpga-pins');
  board.add(pinMesh);

  // metal: the USB-C shell, the crystal can, the regulator tab
  const metals: THREE.BufferGeometry[] = [];
  const shell = roundedBox(USB.w, USB.h, USB.d, 0.0012, 2);
  shell.translate(USB.x, TOP + USB.h / 2, USB.z);
  metals.push(shell);
  const xtal = roundedBox(0.0032, 0.0009, 0.0025, 0.0003, 1);
  xtal.translate(XTAL.x, TOP + 0.00045, XTAL.z);
  metals.push(xtal);
  const tab = new THREE.BoxGeometry(0.003, 0.0003, 0.0018);
  tab.translate(REG.x, TOP + 0.00015, REG.z - 0.0026);
  metals.push(tab);
  const metalMesh = solid(new THREE.Mesh(mergeParts(metals), steel), 'fpga-metal');
  board.add(metalMesh);

  // passives: 0805, two kinds
  const tans: THREE.BufferGeometry[] = [];
  const darks: THREE.BufferGeometry[] = [];
  for (const [px, pz, rot, isTan] of PASSIVES) {
    const g = new THREE.BoxGeometry(0.002, 0.0007, 0.00125);
    if (rot) g.rotateY(Math.PI / 2);
    g.translate(px, TOP + 0.00035, pz);
    (isTan ? tans : darks).push(g);
  }
  board.add(solid(new THREE.Mesh(mergeParts(tans), tan), 'fpga-caps'));
  board.add(solid(new THREE.Mesh(mergeParts(darks), dark), 'fpga-res'));

  // the LED: a tiny 0805 lens that breathes, plus an additive glow above it
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xe9e6cf, emissive: 0x7cff66, emissiveIntensity: 0.2, roughness: 0.3, metalness: 0 });
  const ledGeo = roundedBox(0.002, 0.0011, 0.00125, 0.0003, 1);
  ledGeo.translate(LED.x, TOP + 0.00055, LED.z);
  const led = new THREE.Mesh(ledGeo, ledMat);
  led.name = 'fpga-led';
  board.add(led);
  const glowTex = makeCanvasTexture({
    width: 64, height: 64,
    draw(c, w, h) {
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(190,255,170,1)');
      g.addColorStop(0.25, 'rgba(150,255,130,0.5)');
      g.addColorStop(1, 'rgba(120,255,110,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    },
  });
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0x9dff86, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(0.016);
  glow.position.set(LED.x, TOP + 0.003, LED.z);
  board.add(glow);

  const proxy = hitProxy(BW + 0.016, 0.03, BD + 0.016, `${ID}:proxy`);
  proxy.position.y = 0.015;
  group.add(proxy);

  return {
    id: ID,
    label: 'FPGA board',
    group,
    hit: [board, proxy],
    anchor: new THREE.Vector3(0, FOOT + BT + 0.012, 0),
    hover: { lift: 0.012, tilt: 2.5 },
    focus: {
      camera: ctx.focusPose(ID),
      panel: content,
    },
    update(_dt, t) {
      // one breath every 4 s: a slow rise, a slightly quicker fall
      const k = 0.5 - 0.5 * Math.cos((t / 4) * TAU);
      const e = Math.pow(k, 1.4);
      ledMat.emissiveIntensity = 0.1 + 1.6 * e;
      glowMat.opacity = 0.62 * e;
    },
    dispose() {
      for (const g of [boardGeo, chipGeo, ledGeo, blackMesh.geometry, pinMesh.geometry, metalMesh.geometry]) g.dispose();
      pcbTex.dispose(); labelTex.dispose(); glowTex.dispose();
      pcbTop.dispose(); labelMat.dispose(); ledMat.dispose(); glowMat.dispose();
    },
  };
}

/** Collapses a BoxGeometry's six face groups into two materials: the top (+y) and the rest. */
function regroupBox(geo: THREE.BufferGeometry, topIndex: number, restIndex: number): void {
  const g = geo.groups.map((x) => ({ ...x }));
  if (g.length !== 6) return;
  geo.clearGroups();
  geo.addGroup(g[0].start, g[0].count + g[1].count, restIndex); // +x, -x
  geo.addGroup(g[2].start, g[2].count, topIndex);               // +y
  geo.addGroup(g[3].start, g[3].count + g[4].count + g[5].count, restIndex); // -y, +z, -z
}

/** Silkscreen + traces for the top of the board. 1024 × 704 maps the 96 × 66 mm board; v up = the far edge. */
function pcbTexture(): THREE.CanvasTexture {
  const W = 1024, H = 704;
  const S = W / BW; // px per metre
  const P = (x: number, z: number): [number, number] => [(x + BW / 2) * S, (z + BD / 2) * S];
  return makeCanvasTexture({
    width: W, height: H, anisotropy: 16,
    draw(c, w, h) {
      c.fillStyle = '#1b4b33';
      c.fillRect(0, 0, w, h);
      // copper pours under the mask: a touch lighter, with a faint hatch
      c.fillStyle = 'rgba(70,130,90,0.22)';
      c.fillRect(P(-0.046, -0.031)[0], P(0, -0.031)[1], 0.03 * S, 0.062 * S);
      c.fillRect(P(0.018, -0.031)[0], P(0, -0.031)[1], 0.028 * S, 0.062 * S);
      c.strokeStyle = 'rgba(40,90,60,0.35)';
      c.lineWidth = 1;
      for (let i = -40; i < 80; i++) { c.beginPath(); c.moveTo(i * 24, 0); c.lineTo(i * 24 + h, h); c.stroke(); }

      // traces: from the chip's pads out to the headers, the USB, the LED; 45° bends
      c.strokeStyle = 'rgba(96,160,118,0.85)';
      c.lineWidth = 2.6;
      c.lineCap = 'round';
      const trace = (pts: [number, number][]): void => {
        c.beginPath();
        pts.forEach(([x, z], i) => { const [px, pz] = P(x, z); if (i === 0) c.moveTo(px, pz); else c.lineTo(px, pz); });
        c.stroke();
      };
      const half = CHIP.s / 2 + 0.0012;
      for (let i = 0; i < 10; i++) {
        const t = (i - 4.5) * 0.0015;
        // top side pads → J1
        trace([[CHIP.x + t, CHIP.z - half], [CHIP.x + t, CHIP.z - half - 0.004 - i * 0.0006], [CHIP.x + t - 0.006 - i * 0.0012, CHIP.z - half - 0.010 - i * 0.0018], [J1.x - 0.009 + i * 0.002, J1.z + 0.004]]);
        // right side pads → J2
        trace([[CHIP.x + half, CHIP.z + t], [CHIP.x + half + 0.004 + i * 0.0007, CHIP.z + t], [CHIP.x + half + 0.012 + i * 0.0009, CHIP.z + t * 1.6], [J2.x - 0.004, J2.z - 0.009 + i * 0.002]]);
      }
      for (let i = 0; i < 6; i++) {
        const t = (i - 2.5) * 0.0022;
        // left side pads → USB / regulator
        trace([[CHIP.x - half, CHIP.z + t], [CHIP.x - half - 0.005 - i * 0.0008, CHIP.z + t], [CHIP.x - half - 0.012, CHIP.z + t + 0.006 + i * 0.001], [USB.x + 0.003 - i * 0.0012, USB.z - 0.006]]);
        // bottom side pads → LED / button
        trace([[CHIP.x + t, CHIP.z + half], [CHIP.x + t, CHIP.z + half + 0.004 + i * 0.0007], [CHIP.x + t + 0.008 + i * 0.002, CHIP.z + half + 0.011 + i * 0.001], [i < 3 ? LED.x - 0.002 : BUTTON.x - 0.004, i < 3 ? LED.z : BUTTON.z + (i - 4) * 0.0015]]);
      }
      // vias
      for (let i = 0; i < 70; i++) {
        const x = (hash2(i, 1, 4) - 0.5) * (BW - 0.012);
        const z = (hash2(i, 2, 4) - 0.5) * (BD - 0.012);
        if (Math.abs(x - CHIP.x) < CHIP.s / 2 + 0.003 && Math.abs(z - CHIP.z) < CHIP.s / 2 + 0.003) continue;
        const [px, pz] = P(x, z);
        c.beginPath(); c.arc(px, pz, 3.6, 0, TAU);
        c.fillStyle = 'rgba(190,180,120,0.75)'; c.fill();
        c.beginPath(); c.arc(px, pz, 1.6, 0, TAU);
        c.fillStyle = '#17241c'; c.fill();
      }
      // chip pads: a ring of tinned pads just outside the body
      c.fillStyle = 'rgba(205,205,190,0.85)';
      for (let i = 0; i < 20; i++) {
        const t = (i - 9.5) * 0.00085;
        const [ax, az] = P(CHIP.x + t, CHIP.z - CHIP.s / 2 - 0.0008);
        c.fillRect(ax - 2.5, az - 7, 5, 14);
        const [bx, bz] = P(CHIP.x + t, CHIP.z + CHIP.s / 2 + 0.0008);
        c.fillRect(bx - 2.5, bz - 7, 5, 14);
        const [cx, cz] = P(CHIP.x - CHIP.s / 2 - 0.0008, CHIP.z + t);
        c.fillRect(cx - 7, cz - 2.5, 14, 5);
        const [dx, dz] = P(CHIP.x + CHIP.s / 2 + 0.0008, CHIP.z + t);
        c.fillRect(dx - 7, dz - 2.5, 14, 5);
      }
      // mounting holes: plated rings at the corners
      for (const [fx, fz] of FEET) {
        const [px, pz] = P(fx, fz);
        c.beginPath(); c.arc(px, pz, 15, 0, TAU); c.fillStyle = 'rgba(205,185,120,0.9)'; c.fill();
        c.beginPath(); c.arc(px, pz, 9, 0, TAU); c.fillStyle = '#161a16'; c.fill();
      }

      // silkscreen
      const ink = 'rgba(236,234,222,0.92)';
      c.strokeStyle = ink;
      c.fillStyle = ink;
      c.lineWidth = 1.8;
      const rect = (x: number, z: number, w2: number, d2: number): void => { const [px, pz] = P(x, z); c.strokeRect(px - w2 * S / 2, pz - d2 * S / 2, w2 * S, d2 * S); };
      const text = (s: string, x: number, z: number, size = 15, align: CanvasTextAlign = 'left', rot = 0): void => {
        const [px, pz] = P(x, z);
        c.save(); c.translate(px, pz); c.rotate(rot);
        c.font = `600 ${size}px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
        c.textAlign = align; c.textBaseline = 'middle';
        c.fillText(s, 0, 0);
        c.restore();
      };
      rect(CHIP.x, CHIP.z, CHIP.s + 0.0036, CHIP.s + 0.0036);
      text('U1', CHIP.x - CHIP.s / 2 - 0.0015, CHIP.z - CHIP.s / 2 - 0.0032, 14);
      for (const [j, name] of [[J1, 'J1'], [J2, 'J2']] as const) {
        c.save();
        const [px, pz] = P(j.x, j.z);
        c.translate(px, pz); c.rotate(j.rot);
        c.strokeRect(-0.0203 * S / 2 - 3, -0.0051 * S / 2 - 3, 0.0203 * S + 6, 0.0051 * S + 6);
        c.fillRect(-0.0203 * S / 2 - 3, 0.0051 * S / 2 - 6, 9, 9); // pin 1
        c.restore();
        text(name, j.x + (j.rot ? -0.0045 : -0.0125), j.z + (j.rot ? -0.013 : 0.0045), 14, 'center');
      }
      rect(USB.x, USB.z - 0.0015, USB.w + 0.002, USB.d - 0.0005);
      text('USB', USB.x + 0.0075, USB.z - 0.002, 13);
      rect(LED.x, LED.z, 0.0032, 0.0022);
      text('LD0', LED.x, LED.z + 0.0028, 12, 'center');
      rect(BUTTON.x, BUTTON.z, 0.0075, 0.0075);
      text('SW0', BUTTON.x, BUTTON.z + 0.0058, 12, 'center');
      rect(REG.x, REG.z, 0.008, 0.0075);
      text('U2', REG.x, REG.z + 0.0058, 12, 'center');
      rect(XTAL.x, XTAL.z, 0.0044, 0.0036);
      text('Y1', XTAL.x + 0.0042, XTAL.z, 12);
      PASSIVES.forEach(([px, pz, rot, isTan], i) => {
        c.save();
        const [qx, qz] = P(px, pz);
        c.translate(qx, qz); if (rot) c.rotate(Math.PI / 2);
        c.strokeRect(-0.0014 * S, -0.0009 * S, 0.0028 * S, 0.0018 * S);
        c.restore();
        text(`${isTan ? 'C' : 'R'}${i + 1}`, px + (rot ? 0.0016 : 0), pz + (rot ? 0 : 0.0019), 10, rot ? 'left' : 'center');
      });
      // the board's name, a revision, and the small marks boards carry
      text('FPGA EVAL', -0.044, 0.0255, 20);
      text('REV B', -0.044, 0.0295, 13);
      text('RoHS', 0.0305, -0.028, 12, 'center');
      rect(0.0305, -0.028, 0.007, 0.0035);
      text('3V3', 0.035, -0.0235, 10, 'center');
      text('GND', 0.041, -0.0235, 10, 'center');
      // a few test points
      for (const [tx, tz] of [[0.03, -0.012], [0.03, -0.008], [0.03, -0.004]] as [number, number][]) {
        const [px, pz] = P(tx, tz);
        c.beginPath(); c.arc(px, pz, 4, 0, TAU); c.stroke();
      }
    },
  });
}

/** The chip's etched label: a small mark, a part code, a date code, the pin-1 dot. Transparent outside the text. */
function chipLabelTexture(): THREE.CanvasTexture {
  return makeCanvasTexture({
    width: 256, height: 256, anisotropy: 8,
    draw(c, w, h) {
      c.clearRect(0, 0, w, h);
      const ink = 'rgba(196,198,190,0.9)';
      c.fillStyle = ink;
      c.strokeStyle = ink;
      c.lineWidth = 3;
      c.strokeRect(w * 0.12, h * 0.14, w * 0.14, w * 0.14);
      c.beginPath(); c.moveTo(w * 0.12, h * 0.14 + w * 0.14); c.lineTo(w * 0.26, h * 0.14); c.stroke();
      c.font = `600 ${Math.round(h * 0.13)}px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      c.fillText('WT-7A35', w * 0.12, h * 0.46);
      c.font = `500 ${Math.round(h * 0.085)}px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
      c.fillText('FPGA  ·  C1', w * 0.12, h * 0.62);
      c.fillText('2425  TW', w * 0.12, h * 0.75);
      c.beginPath(); c.arc(w * 0.17, h * 0.88, w * 0.035, 0, TAU); c.fill();
    },
  });
}
