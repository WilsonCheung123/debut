import * as THREE from 'three';
import type { ObjectCtx, TableObject } from './types';
import { roundedBox, hitProxy, solid, mergeParts, topFirst } from './helpers';
import { makeCanvasTexture, grain, hash2, matte } from '../materials';
import { dieCast as content } from '../content/die-cast';

// The die-cast part (SPEC 4.5): a small open aluminium housing. Filleted
// walls with cooling ribs outside, a floor, two mounting bosses with gussets
// inside, a pebbled as-cast finish (roughness + bump from one noise canvas),
// and one machined face: the flat top rim, brighter and smoother, with faint
// fly-cutter arcs. A manila tag on a string reads 样品 / SAMPLE with a
// handwritten lot number (Caveat, redrawn when the font arrives).

const ID = 'die-cast';
const OW = 0.088, OD = 0.064;         // outer footprint
const WALL = 0.0035;
const FLOOR = 0.003;
const HEIGHT = 0.030;                  // to the machined rim
const RIM_FILLET = 0.0014;
const OUTER_R = 0.009, INNER_R = 0.0045;
const BOSS_R = 0.0048, BOSS_HOLE = 0.0019;
const BOSSES: [number, number][] = [[-0.026, 0.0], [0.026, 0.0]];
const TAU = Math.PI * 2;
/** One tile of the cast noise per this many metres (shared by every cast surface). */
const NOISE_SCALE = 1 / 0.05;

export function createDieCast(ctx: ObjectCtx): TableObject {
  const group = new THREE.Group();
  group.name = ID;

  const noise = castNoise();
  // Cast aluminium: a warm mid grey, half metallic (the scene's room environment gives it something to
  // reflect; at metalness 0.2 under the cool window fill it read as bluish matte plastic), a pebbled bump.
  const cast = new THREE.MeshStandardMaterial({
    color: 0xaaa298, roughness: 0.66, metalness: 0.55,
    roughnessMap: noise, bumpMap: noise, bumpScale: 0.0007,
  });
  const toolMarks = machinedMarks();
  const machined = new THREE.MeshStandardMaterial({ color: 0xcfc9bf, roughness: 0.32, metalness: 0.8, roughnessMap: toolMarks });
  const hole = matte(0x1a1a19, 0.85);

  // walls: an extruded ring, filleted top and bottom; the top cap is the machined rim
  const wallGeo = wallGeometry();
  const walls = solid(new THREE.Mesh(wallGeo, [machined, cast]), ID);
  group.add(walls);

  // everything else as-cast: the floor, the bosses, their gussets, the outside ribs
  const parts: THREE.BufferGeometry[] = [];
  const floor = roundedBox(OW - 2 * WALL + 0.002, FLOOR, OD - 2 * WALL + 0.002, 0.0008, 1);
  floor.translate(0, FLOOR / 2, 0);
  parts.push(floor);
  const bossH = HEIGHT - 0.004;
  for (const [bx, bz] of BOSSES) {
    const boss = new THREE.CylinderGeometry(BOSS_R, BOSS_R + 0.0008, bossH, 28);
    boss.translate(bx, bossH / 2, bz);
    parts.push(boss);
    // gussets: two thin ribs from each boss to the long walls
    for (const s of [-1, 1]) {
      const len = OD / 2 - WALL - Math.abs(bz) - BOSS_R * 0.6;
      const g = roundedBox(0.0022, 0.013, len, 0.0006, 1);
      g.translate(bx, FLOOR + 0.0065, s * (BOSS_R * 0.6 + len / 2) + bz);
      parts.push(g);
    }
  }
  // cooling ribs on the two long outer walls
  for (let i = -3; i <= 3; i++) {
    for (const s of [-1, 1]) {
      const rib = roundedBox(0.0026, 0.021, 0.0045, 0.0009, 1);
      rib.translate(i * 0.0105, 0.0125, s * (OD / 2 + 0.0022 - 0.0004));
      parts.push(rib);
    }
  }
  const castGeo = mergeParts(parts);
  projectUv(castGeo);
  const castMesh = solid(new THREE.Mesh(castGeo, cast), 'die-cast-ribs');
  walls.add(castMesh);
  // the bosses' holes: dark discs sunk a hair below the boss tops
  const holes = BOSSES.map(([bx, bz]) => {
    const g = new THREE.CylinderGeometry(BOSS_HOLE, BOSS_HOLE, 0.004, 18);
    g.translate(bx, bossH - 0.0018, bz); // its top a hair above the boss top, so the dark disc reads as the hole
    return g;
  });
  const holeMesh = new THREE.Mesh(mergeParts(holes), hole);
  holeMesh.name = 'die-cast-holes';
  walls.add(holeMesh);

  // the tag and its string
  const tag = createTag();
  tag.mesh.position.set(-0.034, 0.0003, 0.052);
  tag.mesh.rotation.y = 0.42;
  walls.add(tag.mesh);
  const stringMat = matte(0xd6cbb2, 0.9);
  const hub = new THREE.Vector3(-0.034, 0.0006, 0.052).add(new THREE.Vector3(-0.0138, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.42)); // the tag's eyelet
  const curve = new THREE.CatmullRomCurve3([
    hub.clone(),
    new THREE.Vector3(hub.x + 0.004, 0.004, hub.z - 0.008),
    new THREE.Vector3(-0.030, 0.014, OD / 2 + 0.012),
    new THREE.Vector3(-0.026, HEIGHT + 0.0012, OD / 2 + 0.0015),
    new THREE.Vector3(-0.026, HEIGHT + 0.0008, OD / 2 - WALL - 0.002),
    new THREE.Vector3(-0.026, HEIGHT - 0.006, BOSS_R + 0.0025),
    new THREE.Vector3(-0.026 + BOSS_R + 0.001, HEIGHT - 0.007, 0.0),
  ], false, 'catmullrom', 0.6);
  const stringGeo = new THREE.TubeGeometry(curve, 36, 0.00045, 6);
  const knot = new THREE.SphereGeometry(0.0011, 10, 8);
  knot.translate(hub.x, hub.y + 0.0004, hub.z);
  const string = solid(new THREE.Mesh(mergeParts([stringGeo, knot]), stringMat), 'die-cast-string');
  walls.add(string);

  const proxy = hitProxy(OW + 0.03, HEIGHT + 0.01, OD + 0.05, `${ID}:proxy`);
  proxy.position.set(-0.006, HEIGHT / 2, 0.01);
  group.add(proxy);

  return {
    id: ID,
    label: 'Die-cast part',
    group,
    hit: [walls, proxy],
    anchor: new THREE.Vector3(0, HEIGHT + 0.004, 0),
    hover: { lift: 0.012, tilt: 2.5 },
    focus: { camera: ctx.focusPose(ID), panel: content },
    dispose() {
      for (const g of [wallGeo, castGeo, holeMesh.geometry, string.geometry, tag.mesh.geometry]) g.dispose();
      noise.dispose(); toolMarks.dispose(); tag.texture.dispose();
      cast.dispose(); machined.dispose(); tag.material.dispose();
    },
  };
}

/** The walls: outer rounded rect minus inner, extruded to HEIGHT, filleted both ends. Groups: 0 lids (machined), 1 sides (cast). */
function wallGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  roundedRectPath(shape, OW - 2 * RIM_FILLET, OD - 2 * RIM_FILLET, OUTER_R - RIM_FILLET);
  const inner = new THREE.Path();
  roundedRectPath(inner, OW - 2 * WALL + 2 * RIM_FILLET, OD - 2 * WALL + 2 * RIM_FILLET, INNER_R + RIM_FILLET);
  shape.holes.push(inner);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: HEIGHT - 2 * RIM_FILLET, bevelEnabled: true, bevelThickness: RIM_FILLET, bevelSize: RIM_FILLET, bevelSegments: 3, curveSegments: 14, steps: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, RIM_FILLET, 0);
  // the lids: keep only the top as the machined face; the bottom sits on the table (group 0 covers both; harmless)
  // UVs: the lids in plan (for the fly-cut arcs), the sides projected (for the cast noise)
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const lids = geo.groups[0];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (i >= lids.start && i < lids.start + lids.count) uv.setXY(i, (x + OW / 2) / OW, (z + OD / 2) / OD);
    else uv.setXY(i, (x + z * 0.5) * NOISE_SCALE, (y + x * 0.37) * NOISE_SCALE);
  }
  uv.needsUpdate = true;
  geo.computeBoundingBox();
  return geo;
}

/** Projects a consistent-scale noise UV onto a merged cast geometry (positions are already in the group frame). */
function projectUv(geo: THREE.BufferGeometry): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    uv.setXY(i, (x + z * 0.5 + y * 0.21) * NOISE_SCALE, (y + x * 0.37 - z * 0.13) * NOISE_SCALE);
  }
  uv.needsUpdate = true;
}

function roundedRectPath(s: THREE.Path, w: number, h: number, r: number): void {
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
}

/** Pebbled cast noise, tiling, linear data (roughness and bump share it). */
function castNoise(): THREE.CanvasTexture {
  return makeCanvasTexture({
    width: 256, height: 256, colorSpace: THREE.NoColorSpace, repeat: [1, 1], anisotropy: 4,
    draw(c, w, h) {
      const img = c.createImageData(w, h);
      const d = img.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        // three octaves of value noise, wrapped so the tile repeats cleanly
        let v = 0, amp = 0.5, f = 8;
        for (let o = 0; o < 3; o++) {
          const gx = (x / w) * f, gy = (y / h) * f;
          const x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
          const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
          const n = (i: number, j: number): number => hash2(((i % f) + f) % f, ((j % f) + f) % f, 11 + o);
          const a = n(x0, y0) + (n(x0 + 1, y0) - n(x0, y0)) * sx;
          const b = n(x0, y0 + 1) + (n(x0 + 1, y0 + 1) - n(x0, y0 + 1)) * sx;
          v += (a + (b - a) * sy) * amp;
          amp *= 0.5; f *= 2;
        }
        // 0.62..0.98 roughness; the same value is the bump height
        const g = Math.round((0.62 + v * 0.36) * 255);
        const i = (y * w + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    },
  });
}

/** Faint fly-cutter arcs for the machined rim (roughness map, linear). */
function machinedMarks(): THREE.CanvasTexture {
  return makeCanvasTexture({
    width: 512, height: 384, colorSpace: THREE.NoColorSpace, anisotropy: 8,
    draw(c, w, h) {
      c.fillStyle = 'rgb(84,84,84)';
      c.fillRect(0, 0, w, h);
      // arcs about a centre off the part (the cutter's path), two passes
      for (const [cx, cy, seed] of [[w * 1.6, h * 0.5, 1], [w * -0.55, h * 0.45, 2]] as const) {
        for (let r = 0; r < 2.4 * w; r += 3 + hash2(r, seed, 5) * 2) {
          c.strokeStyle = `rgba(${hash2(r, 1, seed) > 0.5 ? 120 : 60},${hash2(r, 1, seed) > 0.5 ? 120 : 60},${hash2(r, 1, seed) > 0.5 ? 120 : 60},0.35)`;
          c.lineWidth = 1;
          c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke();
        }
      }
      grain(c, w, h, 0.05, 7);
    },
  });
}

/** A manila tag: 样品 / SAMPLE, a handwritten lot number and date, an eyelet at the left end. */
function createTag(): { mesh: THREE.Mesh; texture: THREE.CanvasTexture; material: THREE.MeshStandardMaterial } {
  const TW = 0.034, TD = 0.018, TT = 0.0004;
  // the grained paper is drawn once (grain reads pixels back; a redraw must not read the same canvas again)
  let paper: HTMLCanvasElement | null = null;
  const draw = (c: CanvasRenderingContext2D, w: number, h: number): void => {
    if (!paper) {
      paper = document.createElement('canvas');
      paper.width = w; paper.height = h;
      const pc = paper.getContext('2d')!;
      pc.fillStyle = '#d8c48f';
      pc.fillRect(0, 0, w, h);
      grain(pc, w, h, 0.05, 2);
    }
    c.drawImage(paper, 0, 0);
    c.strokeStyle = 'rgba(80,60,30,0.35)';
    c.lineWidth = 2;
    c.strokeRect(10, 10, w - 20, h - 20);
    // the eyelet at the left end (the string's end), a ring on a cut corner
    c.fillStyle = '#6a6762';
    c.beginPath(); c.arc(w * 0.095, h * 0.5, h * 0.13, 0, TAU); c.fill();
    c.fillStyle = '#efe6d2';
    c.beginPath(); c.arc(w * 0.095, h * 0.5, h * 0.07, 0, TAU); c.fill();
    // 样品 / SAMPLE
    c.fillStyle = 'rgba(56,40,24,0.92)';
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.font = '600 92px "PingFang SC", "Songti SC", "Noto Serif CJK SC", "Hiragino Sans GB", serif';
    c.fillText('样品', w * 0.2, h * 0.36);
    c.font = '600 28px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
    c.fillText('S A M P L E', w * 0.205, h * 0.68);
    // printed field labels
    c.font = '500 20px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
    c.fillStyle = 'rgba(56,40,24,0.7)';
    c.fillText('LOT', w * 0.6, h * 0.27);
    c.fillText('日期', w * 0.6, h * 0.62);
    c.fillStyle = 'rgba(56,40,24,0.35)';
    c.fillRect(w * 0.6, h * 0.42, w * 0.34, 1.5);
    c.fillRect(w * 0.6, h * 0.78, w * 0.34, 1.5);
    // handwritten, in pen
    c.fillStyle = 'rgba(28,38,78,0.9)';
    c.font = '500 46px Caveat, "Bradley Hand", cursive';
    c.fillText('A3-0917', w * 0.66, h * 0.31);
    c.font = '500 40px Caveat, "Bradley Hand", cursive';
    c.fillText('9/17  #2', w * 0.68, h * 0.66);
  };
  const texture = makeCanvasTexture({ width: 512, height: 272, anisotropy: 8, draw });
  const redraw = (): void => {
    const canvas = texture.image as HTMLCanvasElement;
    const c = canvas.getContext('2d');
    if (!c) return;
    draw(c, canvas.width, canvas.height);
    texture.needsUpdate = true;
  };
  if (typeof document !== 'undefined' && document.fonts?.load) {
    document.fonts.load('500 46px Caveat').then(() => redraw()).catch(() => { /* fallback hand stays */ });
  }
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92, metalness: 0 });
  const plain = matte(0xd3bf8c, 0.92);
  const geo = roundedBox(TW, TT, TD, 0.0002, 1);
  topFirst(geo); // printed top, plain sides: two draw calls
  const mesh = solid(new THREE.Mesh(geo, [material, plain]), 'die-cast-tag');
  mesh.position.y = TT / 2;
  return { mesh, texture, material };
}
