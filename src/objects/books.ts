import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import '@fontsource/newsreader/300.css';
import '@fontsource/newsreader/600.css';
import '@fontsource/newsreader/700.css';
import type { ObjectCtx, ObjectCluster, TableObject } from './types';
import { roundedBox, solid } from './helpers';
import { metal } from '../materials';
import { bookSlots } from '../layout';
import { bookById } from '../content/books';
import { bookPanel, type BookContent } from '../content/types';
import type { PanelSpec } from '../panels/types';
import { kahnemanPanel } from '../panels/kahneman';
import { austenPanel } from '../panels/austen';
import { Shelf, type ShelfBook, type ShelfPose } from '../panels/shelf';
import { flags, state } from '../state';
import { AW, AH, ATLAS, FONT_SPECS, designs, drawAtlas, frontHeightPx, sizeOf, spineWidthPx, type CoverDesign } from './book-covers';

// The books (SPEC 0.2): nine real covers, all standing between two bookends
// (spines toward +z, the camera), in the order of layout.bookSlots. Each book
// is one mesh (two boards, a spine and the page block merged) with one atlas
// texture (the cover image on the front, a procedural spine), so the cluster
// is eleven draw calls. The whole row is one hover target ("the books") that
// lifts together; clicking it opens the shelf (src/panels/shelf.ts), where
// the row spreads out, scrolls, leans under the pointer and opens one book's
// panel. A single book is still its own object for the keyboard list and deep
// links: focused that way it slides out of the row, lifts and turns to the
// camera.

/** The panel for a book: the two custom panels (Kahneman's flow, the Austen letter) by id, else the plain blurb + quote. */
function panelFor(content: BookContent): PanelSpec {
  const plain = bookPanel(content);
  switch (content.id) {
    case 'book.thinking-fast-slow':
      return kahnemanPanel({ kicker: plain.kicker, title: content.title, author: content.author, blurb: content.blurb });
    case 'book.pride-and-prejudice':
      return austenPanel(plain);
    default:
      return plain;
  }
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

const IX = 3 / AW, IY = 3 / AH;
function rectMap(r: { x: number; y: number; w: number; h: number }): Uv {
  return (u, v) => [r.x + IX + u * (r.w - 2 * IX), r.y + IY + (1 - v) * (r.h - 2 * IY)];
}
function pagesMap(): Uv {
  const r = ATLAS.pages, px = 8 / AW, py = 8 / AH;
  return (u, v) => [r.x + px + u * (r.w - 2 * px), r.y + py + v * (r.h - 2 * py)];
}
function spineMap(sh: number): Uv {
  const r = ATLAS.spine;
  return (u, v) => [r.x + IX + (1 - v) * (r.w - 2 * IX), r.y + IY + u * (sh - 2 * IY)];
}
const solidMap = (p: { x: number; y: number }): Uv => () => [p.x, p.y];

/**
 * One book's geometry in the standing frame: x thickness (front cover at +x),
 * y height from 0, z depth (spine at +z). Boards overhang the page block on
 * hardcovers (the "squares"); paperbacks are flush.
 */
function bookGeometry(d: CoverDesign): THREE.BufferGeometry {
  const [T, H, D] = sizeOf(d);
  const hard = d.hardcover;
  const boardT = hard ? 0.0025 : 0.0012;
  const spineT = hard ? 0.004 : 0.0015;
  const sq = hard ? 0.003 : 0.0004;
  const sh = spineWidthPx(d) / AH;
  const cloth = solidMap(ATLAS.cloth);
  const end = solidMap(ATLAS.endpaper);
  const pages = pagesMap();
  const front = { x: 0, y: 0, w: 1, h: frontHeightPx(d) / AH };

  const fr = roundedBox(boardT, H, D - spineT, boardT * 0.48);
  fr.translate(T / 2 - boardT / 2, H / 2, -spineT / 2);
  remapUv(fr, { [PX]: rectMap(front), [NX]: end, [PY]: cloth, [NY]: cloth, [PZ]: cloth, [NZ]: cloth });

  const bk = roundedBox(boardT, H, D - spineT, boardT * 0.48);
  bk.translate(-T / 2 + boardT / 2, H / 2, -spineT / 2);
  remapUv(bk, { [NX]: rectMap(ATLAS.back), [PX]: end, [PY]: cloth, [NY]: cloth, [PZ]: cloth, [NZ]: cloth });

  const sp = roundedBox(T, H, spineT, spineT * 0.49);
  sp.translate(0, H / 2, D / 2 - spineT / 2);
  remapUv(sp, { [PZ]: spineMap(sh), [NZ]: end, [PX]: cloth, [NX]: cloth, [PY]: cloth, [NY]: cloth });

  const pt = T - 2 * boardT, ph = H - 2 * sq, pd = D - spineT - sq;
  const block = roundedBox(pt, ph, pd, 0.0012);
  block.translate(0, H / 2, (sq - spineT) / 2);
  remapUv(block, { [PY]: pages, [NY]: pages, [NZ]: pages, [PX]: end, [NX]: end, [PZ]: end });

  const merged = mergeGeometries([fr, bk, sp, block], false);
  for (const g of [fr, bk, sp, block]) g.dispose();
  return merged;
}

interface Book extends TableObject {
  design: CoverDesign;
  mesh: THREE.Mesh;
  redraw(): void;
  /** The single-book focus pose (tweened; read-only for QA). */
  readonly pose: ShelfPose;
  /** The shelf's offset for this book (written by the Shelf). */
  readonly shelf: ShelfPose;
  /** Writes pose + shelf into the engine's motion layer (gsap's tick, before the engine composes transforms). */
  sync(): void;
}

function createBook(ctx: ObjectCtx, d: CoverDesign, content: BookContent, label: string, x: number, y: number, z: number): Book {
  const A = ctx.isPhone ? 512 : 1024;
  const canvas = document.createElement('canvas');
  canvas.width = A;
  canvas.height = A * 2;
  const c2d = canvas.getContext('2d', { willReadFrequently: true })!;
  let image: HTMLImageElement | null = null;
  drawAtlas(c2d, A, d, image);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(ctx.maxAnisotropy, 16);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: d.roughness, metalness: 0 });
  const geo = bookGeometry(d);
  const [, H, D] = sizeOf(d);
  const mesh = solid(new THREE.Mesh(geo, mat), d.id);
  const group = new THREE.Group();
  group.name = d.id;
  group.add(mesh);
  group.position.set(x, y, z);

  // the real cover, once it has landed (the front wears the cover colour until then)
  const img = new Image();
  img.decoding = 'async';
  img.src = d.image.src;
  img.decode().then(() => { image = img; self.redraw(); }).catch((e: unknown) => console.warn(`books: cover ${d.image.src} did not load`, e));

  // Single-book focus (keyboard / deep link), in two phases so nothing passes
  // through a neighbour: slide clear of the row, then rise ~8 cm and turn to the
  // camera. `pose` is tweened and copied into the motion layer in sync().
  const pose: ShelfPose = { x: 0, z: 0, lift: 0, yaw: 0, pitch: 0, roll: 0 };
  const shelf: ShelfPose = { x: 0, z: 0, lift: 0, yaw: 0, pitch: 0, roll: 0 };
  const slide = D + 0.01;
  const turned = { lift: 0.08, yaw: -(Math.PI / 2 + THREE.MathUtils.degToRad(4)), roll: 0.26, pitch: -THREE.MathUtils.degToRad(8) };
  const home = { lift: 0, z: 0, yaw: 0, roll: 0, pitch: 0 };
  let tl: gsap.core.Timeline | null = null;
  let pending: gsap.core.Tween | null = null;
  const stop = (): void => { tl?.kill(); tl = null; pending?.kill(); pending = null; };
  // reduced motion: the engine cuts to black (100 ms in); the pose changes under the black
  const setUnderCut = (delay: number, values: Partial<ShelfPose>): void => {
    pending = gsap.delayedCall(delay, () => { pending = null; Object.assign(pose, values); });
  };

  const self: Book = {
    id: d.id,
    label,
    group,
    hit: [mesh],
    anchor: new THREE.Vector3(0, H, 0),
    hover: { lift: 0.012, tilt: 8, tiltMode: 'forward' },
    contactShadow: false,
    design: d,
    mesh,
    pose,
    shelf,
    focus: {
      camera: ctx.focusPose(d.id),
      panel: panelFor(content),
      onEnter() {
        stop();
        if (state.reducedMotion) { setUnderCut(0.1, { z: slide, ...turned }); return; }
        tl = gsap.timeline();
        tl.to(pose, { z: slide, duration: 0.45, ease: 'power2.inOut' }, 0);
        tl.to(pose, { ...turned, duration: 0.48, ease: 'power3.inOut' }, 0.42);
      },
      onExit() {
        stop();
        if (state.reducedMotion) { setUnderCut(0.34, home); return; } // after the panel's 240 ms fade, under the cut
        tl = gsap.timeline();
        // the engine settles the 8° hover tilt over 450 ms power2.out; the pitch that cancelled it follows the same curve
        tl.to(pose, { pitch: 0, duration: 0.45, ease: 'power2.out' }, 0);
        tl.to(pose, { lift: 0, yaw: 0, roll: 0, duration: 0.4, ease: 'power2.inOut' }, 0);
        tl.to(pose, { z: 0, duration: 0.45, ease: 'power2.inOut' }, 0.35);
      },
    },
    sync() {
      const mo = ctx.motion(d.id);
      mo.lift = pose.lift + shelf.lift;
      mo.x = pose.x + shelf.x;
      mo.z = pose.z + shelf.z;
      mo.yaw = pose.yaw + shelf.yaw;
      mo.pitch = pose.pitch + shelf.pitch;
      mo.roll = pose.roll + shelf.roll;
    },
    redraw() {
      drawAtlas(c2d, A, d, image);
      tex.needsUpdate = true;
    },
    dispose() {
      stop();
      geo.dispose();
      tex.dispose();
      mat.dispose();
    },
  };
  return self;
}

export function createBooks(ctx: ObjectCtx): ObjectCluster {
  const root = new THREE.Group();
  root.name = 'books';
  const books: Book[] = [];

  // the row: spines flush at local z = FRONT, books shoulder to shoulder from x = X0 with a 3 mm gap;
  // the two end books sit on the bookends' base plates (1.5 mm)
  const X0 = -0.19, GAP = 0.003, FRONT = 0.075, BASE_T = 0.0015;
  let cursor = X0;
  let maxH = 0;
  bookSlots.forEach((slot, i) => {
    const d = designs[slot.id];
    const content = bookById[slot.id];
    if (!d || !content) throw new Error(`books: no design/content for ${slot.id}`);
    const [T, H, D] = sizeOf(d);
    const end = i === 0 || i === bookSlots.length - 1;
    const book = createBook(ctx, d, content, slot.title, cursor + T / 2, end ? BASE_T : 0, FRONT - D / 2);
    cursor += T + GAP;
    maxH = Math.max(maxH, H);
    root.add(book.group);
    books.push(book);
  });
  const xEnd = cursor - GAP;

  // bookends: plain dark steel, an L of two plates each; two meshes so the shelf can carry them with the row's ends
  const plateT = 0.0025, plateH = 0.15, plateD = 0.11, baseW = 0.05;
  const endMat = metal({ color: 0x3b3a3c, roughness: 0.5 });
  const makeEnd = (dir: 1 | -1): THREE.Mesh => {
    const plate = roundedBox(plateT, plateH, plateD, 0.0008);
    plate.translate(-dir * plateT / 2, plateH / 2, FRONT - plateD / 2);
    const base = roundedBox(baseW, BASE_T, plateD, 0.0006);
    base.translate(dir * (baseW / 2 - plateT / 2), BASE_T / 2, FRONT - plateD / 2);
    const m = solid(new THREE.Mesh(mergeGeometries([plate, base], false), endMat), dir === 1 ? 'bookend-left' : 'bookend-right');
    plate.dispose(); base.dispose();
    return m;
  };
  const endL = makeEnd(1), endR = makeEnd(-1);
  endL.position.x = X0;
  endR.position.x = xEnd;
  root.add(endL, endR);

  // The cluster: one hover target for the row (lifts together), the shelf when clicked.
  const shelfBooks: ShelfBook[] = books.map((b) => ({ id: b.id, title: b.label, author: bookById[b.id].author, size: sizeOf(b.design), mesh: b.mesh, group: b.group, restX: b.group.position.x, pose: b.shelf, panel: () => panelFor(bookById[b.id]) }));
  const shelf = new Shelf(ctx, shelfBooks, {
    rowCentreX: (X0 + xEnd) / 2,
    bookends: { left: endL, right: endR, restLeft: X0, restRight: xEnd },
  });
  const cluster: TableObject = {
    id: 'books',
    label: 'the books',
    group: root,
    hit: books.map((b) => b.mesh),
    anchor: new THREE.Vector3((X0 + xEnd) / 2, maxH, FRONT),
    hover: { lift: 0.008, tilt: 0, spring: { duration: 0.42, overshoot: 1.2 } },
    focus: {
      camera: ctx.focusPose('books'),
      panel: null,
      onEnter() { shelf.enter(); },
      onExit() { shelf.exit(); },
      onClickInside(hitName) { shelf.clickBook(hitName); },
      onDismiss() { return shelf.dismiss(); },
    },
  };

  // motion into the engine: the shelf first (it writes the books' shelf poses and the root), then every book
  let registered = false;
  const tick = (_t: number, dtMs: number): void => {
    if (!registered) { // the engine registers motion rigs right after creation; never tick before that
      try { ctx.motion(books[0].id); ctx.motion('books'); registered = true; } catch { return; }
    }
    shelf.tick(Math.min(0.05, dtMs / 1000));
    for (const b of books) b.sync();
  };
  gsap.ticker.add(tick);
  const own = books[0].dispose!;
  books[0].dispose = () => { gsap.ticker.remove(tick); shelf.dispose(); own(); };

  // spines again once the web fonts are in (the first draw may have used the fallback serif)
  if (typeof document !== 'undefined' && document.fonts?.load) {
    Promise.all(FONT_SPECS.map((f) => document.fonts.load(f, 'Anna Karenina').catch(() => [])))
      .then(() => document.fonts.ready)
      .then(() => { for (const b of books) b.redraw(); })
      .catch(() => { /* fallback fonts stay */ });
  }
  if (flags.qa) {
    (window as unknown as { __books: unknown }).__books = {
      covers: () => books.map((b) => ({ id: b.id, canvas: (b.mesh.material as THREE.MeshStandardMaterial).map!.image as HTMLCanvasElement })),
      atlas: { w: AW, h: AH },
      state: (id: string) => {
        const b = books.find((x) => x.id === id);
        if (!b) return null;
        const mo = ctx.motion(id);
        // explicit fields: gsap attaches a circular `_gsap` cache to tweened objects
        return {
          pose: { ...b.pose }, shelf: { ...b.shelf },
          motion: { lift: mo.lift, z: mo.z, x: mo.x, yaw: mo.yaw, roll: mo.roll, pitch: mo.pitch },
          position: b.group.position.toArray(), tweens: gsap.getTweensOf(b.pose).length,
        };
      },
      shelf: () => shelf.snapshot(),
      /** Drives the shelf without a pointer: hover(id | null), select(id), scroll(metres). */
      drive: { hover: (id: string | null) => shelf.hoverById(id), scrollBy: (m: number) => shelf.scrollBy(m) },
    };
  }

  return { root, objects: [...books, cluster] };
}
