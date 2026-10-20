import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import '@fontsource/newsreader/300.css';
import '@fontsource/newsreader/600.css';
import '@fontsource/newsreader/700.css';
import type { ObjectCtx, ObjectCluster, TableObject } from './types';
import { roundedBox, solid } from './helpers';
import { metal, makeCanvasTexture } from '../materials';
import { bookSlots } from '../layout';
import { bookById } from '../content/books';
import { bookPanel, type BookContent } from '../content/types';
import type { PanelFactory, PanelSpec } from '../panels/types';
import { flags, state } from '../state';
import { ATLAS, FONT_SPECS, designs, drawAtlas, spineWidthPx, type CoverDesign } from './book-covers';

// The books (SPEC 4.1): nine procedurally covered books, five standing
// between two plain metal bookends (spines toward +z, the camera) and four
// lying in an offset stack to their right. Each book is one mesh (four
// rounded boxes merged: two boards, a spine, the page block) with one atlas
// texture, so the cluster is ten draw calls. Hover: standing books tilt out
// 8 degrees (Stripe Press), lying books lift toward the cursor. Focus: the
// book slides out of the shelf / stack, lifts ~8 cm and turns to face the
// camera (the layout's targetOffset for books matches this displacement).

/** Custom panel factories registered under these ids in src/panels (built by other agents). */
const customPanels = import.meta.glob('../panels/{kahneman,austen}.ts', { eager: true }) as Record<string, Record<string, unknown>>;
const customFor: Record<string, string> = { 'book.thinking-fast-slow': 'kahneman', 'book.pride-and-prejudice': 'austen' };

/** The panel for a book: the registered custom factory when one exists, else the plain blurb + quote. */
function panelFor(content: BookContent): PanelSpec {
  const plain = bookPanel(content);
  const key = customFor[content.id];
  const mod = key ? customPanels[`../panels/${key}.ts`] : undefined;
  if (!mod) return plain;
  const candidates = [mod[`${key}Panel`], mod.default, mod.panel];
  for (const cand of candidates) {
    try {
      const spec = typeof cand === 'function' ? (cand as (c: BookContent) => unknown)(content) : cand;
      if (spec && typeof (spec as PanelFactory).mount === 'function') return spec as PanelFactory;
      if (spec && typeof (spec as { html?: unknown }).html === 'string') return spec as PanelSpec;
    } catch (e) {
      console.error(`books: custom panel '${key}' failed, using the plain panel`, e);
    }
  }
  return plain;
}

// Sides of a BoxGeometry / RoundedBoxGeometry in group order.
const PX = 0, NX = 1, PY = 2, NY = 3, PZ = 4, NZ = 5;
type Uv = (u: number, v: number) => [number, number];

/**
 * Rewrites a rounded box's per-face UVs (each face spans 0..1, v = 1 at the
 * top) into atlas coordinates. `maps` returns atlas fractions (x right, y
 * down); the texture's flipY turns them into uv.
 */
function remapUv(geo: THREE.BufferGeometry, maps: Record<number, Uv>): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const perFace = uv.count / 6;
  for (let i = 0; i < uv.count; i++) {
    const side = Math.floor(i / perFace);
    const f = maps[side];
    if (!f) continue;
    const [x, y] = f(uv.getX(i), uv.getY(i));
    uv.setXY(i, x, 1 - y);
  }
  uv.needsUpdate = true;
}

const INSET = 3 / 1024;
function coverMap(r: { x: number; y: number; w: number; h: number }): Uv {
  return (u, v) => [r.x + INSET + u * (r.w - 2 * INSET), r.y + INSET + (1 - v) * (r.h - 2 * INSET)];
}
function pagesMap(): Uv {
  const r = ATLAS.pages, pad = 8 / 1024;
  return (u, v) => [r.x + pad + u * (r.w - 2 * pad), r.y + pad + v * (r.h - 2 * pad)];
}
function spineMap(sh: number): Uv {
  const r = ATLAS.spine;
  return (u, v) => [r.x + INSET + (1 - v) * (r.w - 2 * INSET), r.y + INSET + u * (sh - 2 * INSET)];
}
const solidMap = (p: { x: number; y: number }): Uv => () => [p.x, p.y];

/**
 * One book's geometry in the canonical standing frame: x thickness (front
 * cover at +x), y height from 0, z depth (spine at +z). Boards overhang the
 * page block on hardcovers (the "squares"); paperbacks are flush.
 */
function bookGeometry(d: CoverDesign): THREE.BufferGeometry {
  const [T, H, D] = d.size;
  const hard = d.hardcover;
  const boardT = hard ? 0.0025 : 0.0012;
  const spineT = hard ? 0.004 : 0.0015;
  const sq = hard ? 0.003 : 0.0004;
  const sh = (spineWidthPx(d) / 1024);
  const cloth = solidMap(ATLAS.cloth);
  const end = solidMap(ATLAS.endpaper);
  const pages = pagesMap();

  const front = roundedBox(boardT, H, D - spineT, boardT * 0.48);
  front.translate(T / 2 - boardT / 2, H / 2, -spineT / 2);
  remapUv(front, { [PX]: coverMap(ATLAS.front), [NX]: end, [PY]: cloth, [NY]: cloth, [PZ]: cloth, [NZ]: cloth });

  const back = roundedBox(boardT, H, D - spineT, boardT * 0.48);
  back.translate(-T / 2 + boardT / 2, H / 2, -spineT / 2);
  remapUv(back, { [NX]: coverMap(ATLAS.back), [PX]: end, [PY]: cloth, [NY]: cloth, [PZ]: cloth, [NZ]: cloth });

  const spine = roundedBox(T, H, spineT, spineT * 0.49);
  spine.translate(0, H / 2, D / 2 - spineT / 2);
  remapUv(spine, { [PZ]: spineMap(sh), [NZ]: end, [PX]: cloth, [NX]: cloth, [PY]: cloth, [NY]: cloth });

  const pt = T - 2 * boardT, ph = H - 2 * sq, pd = D - spineT - sq;
  const block = roundedBox(pt, ph, pd, 0.0012);
  block.translate(0, H / 2, (sq - spineT) / 2);
  remapUv(block, { [PY]: pages, [NY]: pages, [NZ]: pages, [PX]: end, [NX]: end, [PZ]: end });

  const merged = mergeGeometries([front, back, spine, block], false);
  for (const g of [front, back, spine, block]) g.dispose();
  return merged;
}

/** Lying frame: cover up (+y), head away from the camera (-z), spine to the left (-x); origin at the bottom centre. */
const LYING = new THREE.Matrix4().set(
  0, 0, -1, 0,
  1, 0, 0, 0,
  0, -1, 0, 0,
  0, 0, 0, 1,
);

interface Book extends TableObject {
  redraw(): void;
}

function createBook(ctx: ObjectCtx, d: CoverDesign, standing: boolean, content: BookContent, label: string): Book {
  const atlasSize = ctx.isPhone ? 512 : 1024;
  const tex = makeCanvasTexture({ width: atlasSize, height: atlasSize, anisotropy: 16, draw: (c, w) => drawAtlas(c, w, d) });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: d.roughness, metalness: 0 });
  const geo = bookGeometry(d);
  const [T, H] = d.size;
  if (!standing) {
    geo.applyMatrix4(LYING);
    geo.translate(0, T / 2, H / 2);
    geo.computeBoundingBox();
  }
  const mesh = solid(new THREE.Mesh(geo, mat), d.id);
  const group = new THREE.Group();
  group.name = d.id;
  group.add(mesh);

  // focus motion: out of the shelf / stack, up ~8 cm, turned to the camera
  const m = () => ctx.motion(d.id);
  const target = standing
    ? { lift: 0.08, z: 0.13, yaw: -(Math.PI / 2 + THREE.MathUtils.degToRad(4)), roll: 0.26, pitch: -THREE.MathUtils.degToRad(8) }
    : { lift: 0.08, z: 0.14, pitch: 0.6 };
  const ease = 'power3.inOut';

  return {
    id: d.id,
    label,
    group,
    hit: [mesh],
    anchor: new THREE.Vector3(0, standing ? H : T, 0),
    hover: standing ? { lift: 0.012, tilt: 8, tiltMode: 'forward' } : { lift: 0.012, tilt: 3 },
    focus: {
      camera: ctx.focusPose(d.id),
      panel: panelFor(content),
      onEnter() {
        gsap.killTweensOf(m());
        if (state.reducedMotion) { gsap.set(m(), target); return; }
        gsap.to(m(), { ...target, duration: 0.9, ease, overwrite: true });
      },
      onExit() {
        gsap.killTweensOf(m());
        const rest = { lift: 0, z: 0, x: 0, yaw: 0, roll: 0 };
        if (state.reducedMotion) { gsap.set(m(), { ...rest, pitch: 0 }); return; }
        gsap.to(m(), { ...rest, duration: 0.8, ease, overwrite: 'auto' });
        // the hover tilt settles over 450 ms power2.out (engine); the pitch that cancelled it follows the same curve
        gsap.to(m(), { pitch: 0, duration: standing ? 0.45 : 0.8, ease: standing ? 'power2.out' : ease, overwrite: 'auto' });
      },
    },
    redraw() {
      const canvas = tex.image as HTMLCanvasElement;
      drawAtlas(canvas.getContext('2d')!, canvas.width, d);
      tex.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      tex.dispose();
      mat.dispose();
    },
  };
}

export function createBooks(ctx: ObjectCtx): ObjectCluster {
  const root = new THREE.Group();
  root.name = 'books';
  const books: Book[] = [];

  // shelf: spines flush at local z = FRONT, books shoulder to shoulder from x = X0 with a 3 mm gap;
  // the two end books sit on the bookends' base plates (1.5 mm)
  const X0 = -0.19, GAP = 0.003, FRONT = 0.075, BASE_T = 0.0015;
  const standingIds = bookSlots.filter((s) => s.standing).map((s) => s.id);
  let cursor = X0;
  // stack: bottom to top, each a little offset and turned
  const stackPose: Record<number, [number, number, number]> = { 0: [0.168, 0.0, 0.03], 1: [0.176, -0.008, -0.05], 2: [0.158, 0.014, 0.085], 3: [0.174, -0.004, -0.03] };
  let stackY = 0;

  for (const slot of bookSlots) {
    const d = designs[slot.id];
    const content = bookById[slot.id];
    if (!d || !content) throw new Error(`books: no design/content for ${slot.id}`);
    const book = createBook(ctx, d, slot.standing, content, slot.title);
    const [T, , D] = d.size;
    if (slot.standing) {
      const end = slot.id === standingIds[0] || slot.id === standingIds[standingIds.length - 1];
      book.group.position.set(cursor + T / 2, end ? BASE_T : 0, FRONT - D / 2);
      cursor += T + GAP;
    } else {
      const [sx, sz, ry] = stackPose[slot.stackIndex ?? 0];
      book.group.position.set(sx, stackY, sz);
      book.group.rotation.y = ry;
      stackY += T + 0.0003;
    }
    root.add(book.group);
    books.push(book);
  }

  // bookends: plain dark steel, an L of two plates each, merged into one mesh
  const xEnd = cursor - GAP;
  const plateT = 0.0025, plateH = 0.15, plateD = 0.11, baseW = 0.05;
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, dir] of [[X0, 1], [xEnd, -1]] as [number, number][]) {
    const plate = roundedBox(plateT, plateH, plateD, 0.0008);
    plate.translate(x - dir * plateT / 2, plateH / 2, FRONT - plateD / 2);
    const base = roundedBox(baseW, BASE_T, plateD, 0.0006);
    base.translate(x + dir * (baseW / 2 - plateT / 2) , BASE_T / 2, FRONT - plateD / 2);
    parts.push(plate, base);
  }
  const bookends = solid(new THREE.Mesh(mergeGeometries(parts, false), metal({ color: 0x3b3a3c, roughness: 0.5 })), 'bookends');
  for (const g of parts) g.dispose();
  root.add(bookends);

  // covers again once the web fonts are in (the first draw may have used the fallback serif)
  if (typeof document !== 'undefined' && document.fonts?.load) {
    Promise.all(FONT_SPECS.map((f) => document.fonts.load(f, 'Anna Karenina').catch(() => [])))
      .then(() => document.fonts.ready)
      .then(() => { for (const b of books) b.redraw(); })
      .catch(() => { /* fallback fonts stay */ });
  }
  if (flags.qa) {
    (window as unknown as { __books: unknown }).__books = {
      covers: () => books.map((b) => ({ id: b.id, canvas: ((b.hit[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).map!.image as HTMLCanvasElement })),
    };
  }

  return { root, objects: books };
}
