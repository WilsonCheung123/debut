// Shared materials. Every object builder uses these (or derives from them) so
// the table reads as one lit room: same roughness range, same palette limits.
// Rules from SPEC 2: MeshStandardMaterial everywhere, roughness 0.55 to 0.9,
// metalness 0 except metal; no pure black (#141210 floor) or white (#f2ead8 ceiling).

import * as THREE from 'three';
import { makeCanvasTexture, hash2 } from './canvas';

export { makeCanvasTexture, grain, noiseDataUrl, hash2, setMaxAnisotropy } from './canvas';

export const PALETTE = {
  darkest: 0x141210,
  lightest: 0xf2ead8,
  paper: 0xf4efe6,
  cream: 0xe9e0cc,
  walnut: 0x3b2a1d,
  walnutLight: 0x5a4330,
  ink: 0x1d1a17,
  brass: 0xb08d57,
  steel: 0x9a9a98,
  gunmetal: 0x3a3b3d,
  rubber: 0x24221f,
  pcb: 0x1f5a3a,
  glass: 0xdfe8ec,
  leather: 0x2a221e,
} as const;

const cache = new Map<string, THREE.Material>();
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) { m = make(); cache.set(key, m); }
  return m;
}

/**
 * Every shared material dithers. The scene is mostly dark gradients (a lamp
 * pool falling off into black) and 8-bit output bands there; the shader
 * dither is the cheapest cure and costs nothing visible.
 */
export function standard(params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial(params);
  m.dithering = true;
  return m;
}

const TAU = Math.PI * 2;

/**
 * Walnut, drawn once per seed. Periodic in x (the grain direction), so a
 * repeat of 2 along the length is invisible: the streaks simply continue.
 * `mode` 'color' paints the figure; 'rough' paints the matching roughness
 * map (grey = roughness): grain and pores a little rougher, worn patches
 * duller, hand smudges smoother. Both modes place their features from the
 * same hashes so wear and roughness agree.
 */
function drawWalnut(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, mode: 'color' | 'rough'): void {
  const R = (i: number, j: number): number => hash2(i, j, seed);
  const color = mode === 'color';
  ctx.fillStyle = color ? '#3a2a1d' : '#9c9c9c'; // roughness 0.61 base
  ctx.fillRect(0, 0, w, h);

  // boards glued along the length: each a slightly different tone, a slow
  // gradient across it, a hairline joint
  const boards: { y0: number; y1: number; i: number }[] = [];
  for (let y = 0, i = 0; y < h; i++) {
    const bh = Math.round(h * (0.13 + R(i, 1) * 0.11));
    boards.push({ y0: y, y1: Math.min(h, y + bh), i });
    y += bh;
  }
  for (const b of boards) {
    const bh = b.y1 - b.y0;
    if (color) {
      const t = R(b.i, 2);
      const g = ctx.createLinearGradient(0, b.y0, 0, b.y1);
      g.addColorStop(0, `rgba(0,0,0,${(0.10 + t * 0.12).toFixed(3)})`);
      g.addColorStop(0.5, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(214,170,130,${(0.03 + (1 - t) * 0.06).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, b.y0, w, bh);
      // a warmer or greyer cast per board (walnut varies from purple-brown to grey-brown)
      ctx.fillStyle = t > 0.5 ? `rgba(120,80,110,${(0.04 * (t - 0.5)).toFixed(3)})` : `rgba(90,110,120,${(0.05 * (0.5 - t)).toFixed(3)})`;
      ctx.fillRect(0, b.y0, w, bh);
      ctx.fillStyle = 'rgba(12,7,3,0.4)';
      ctx.fillRect(0, b.y1 - 1, w, 1);
    }
    // grain: long streaks that wander with integer-cycle sines (seamless in x)
    // and fade in and out along their length
    const n = Math.round(bh * 0.42);
    for (let i = 0; i < n; i++) {
      const s = i * 7 + b.i * 1000;
      const y0 = b.y0 + R(s, 10) * bh;
      const k1 = 1 + Math.floor(R(s, 11) * 3), k2 = 3 + Math.floor(R(s, 12) * 5);
      const a1 = (1 + R(s, 13) * 9) * (bh / 170), a2 = a1 * 0.35;
      const p1 = R(s, 14) * TAU, p2 = R(s, 15) * TAU;
      const dark = R(s, 16) > 0.4;
      const strength = R(s, 17);
      const alpha = color ? (dark ? 0.06 + strength * 0.26 : 0.03 + strength * 0.09) : 0.04 + strength * 0.10;
      const base = color ? (dark ? '18,10,5' : '132,96,66') : (dark ? '230,230,230' : '60,60,60');
      const gr = ctx.createLinearGradient(0, 0, w, 0);
      const ph = R(s, 18), cyc = 1 + Math.floor(R(s, 19) * 2);
      for (let q = 0; q <= 6; q++) {
        const u = q / 6;
        const m = 0.5 + 0.5 * Math.sin(TAU * (u + ph) * cyc);
        gr.addColorStop(u, `rgba(${base},${(alpha * (0.3 + 0.7 * m)).toFixed(3)})`);
      }
      ctx.strokeStyle = gr;
      ctx.lineWidth = 0.6 + R(s, 20) * (dark ? 2.0 : 1.3);
      ctx.beginPath();
      for (let x = 0; x <= w; x += 6) {
        const yy = y0 + a1 * Math.sin(TAU * k1 * x / w + p1) + a2 * Math.sin(TAU * k2 * x / w + p2);
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  // open pores: thousands of tiny dark dashes along the grain
  const pores = Math.round((w * h) / 110);
  for (let i = 0; i < pores; i++) {
    const x = R(i, 30) * w, y = Math.floor(R(i, 31) * h), len = 2 + R(i, 32) * 8;
    const a = 0.08 + R(i, 33) * 0.2;
    ctx.fillStyle = color ? `rgba(14,8,4,${a.toFixed(3)})` : `rgba(255,255,255,${(a * 0.5).toFixed(3)})`;
    ctx.fillRect(x, y, len, 1);
    if (x + len > w) ctx.fillRect(x - w, y, len, 1);
  }

  // wear: fine scratches, mostly along the grain (things slid across it)
  for (let i = 0; i < 16; i++) {
    const x = R(i, 40) * w, y = R(i, 41) * h, len = 60 + R(i, 42) * 260;
    const ang = (R(i, 43) < 0.75 ? (R(i, 44) - 0.5) * 0.5 : R(i, 44) * TAU);
    const a = color ? 0.04 + R(i, 45) * 0.07 : 0.2 + R(i, 45) * 0.2;
    ctx.strokeStyle = color ? `rgba(220,200,170,${a.toFixed(3)})` : `rgba(255,255,255,${a.toFixed(3)})`;
    ctx.lineWidth = 0.7 + R(i, 46) * 0.8;
    for (const dx of [0, -w, w]) {
      ctx.beginPath();
      ctx.moveTo(x + dx, y);
      ctx.lineTo(x + dx + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();
    }
  }
  // dull patches (finish worn through: lighter, rougher) and hand smudges (smoother only)
  const blob = (x: number, y: number, rx: number, ry: number, inner: string, outer: string): void => {
    for (const dx of [0, -w, w]) {
      const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, 1);
      g.addColorStop(0, inner); g.addColorStop(1, outer);
      ctx.save();
      ctx.translate(x + dx, y); ctx.scale(rx, ry); ctx.translate(-(x + dx), -y);
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - 1, y - 1, 2, 2);
      ctx.restore();
    }
  };
  for (let i = 0; i < 7; i++) {
    const x = R(i, 50) * w, y = R(i, 51) * h, rx = 50 + R(i, 52) * 150, ry = 25 + R(i, 53) * 60;
    if (color) blob(x, y, rx, ry, 'rgba(236,214,184,0.06)', 'rgba(236,214,184,0)');
    else blob(x, y, rx, ry, 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0)');
  }
  if (!color) {
    for (let i = 0; i < 6; i++) {
      const x = R(i, 60) * w, y = R(i, 61) * h, rx = 40 + R(i, 62) * 90, ry = 30 + R(i, 63) * 60;
      blob(x, y, rx, ry, 'rgba(0,0,0,0.26)', 'rgba(0,0,0,0)');
    }
  }

  // fine noise (per pixel, so it tiles)
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const amp = color ? 11 : 8;
  for (let i = 0; i < d.length; i += 4) {
    const n = (hash2(i & 1023, i >> 10, seed + 5) - 0.5) * amp;
    d[i] += n; d[i + 1] += n * 0.92; d[i + 2] += n * 0.82;
  }
  ctx.putImageData(img, 0, 0);
}

/** A fine tiling bump: pores and hairline grain, for close-ups where the 1024 figure goes soft. */
function drawWoodDetail(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  const R = (i: number, j: number): number => hash2(i, j, seed + 77);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const y0 = R(i, 1) * h, k = 1 + Math.floor(R(i, 2) * 2), a = 0.5 + R(i, 3) * 2.5, p = R(i, 4) * TAU;
    ctx.strokeStyle = `rgba(${R(i, 5) > 0.5 ? '40,40,40' : '200,200,200'},${(0.08 + R(i, 6) * 0.2).toFixed(3)})`;
    ctx.lineWidth = 0.6 + R(i, 7);
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const yy = y0 + a * Math.sin(TAU * k * x / w + p);
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 900; i++) {
    const x = R(i, 10) * w, y = Math.floor(R(i, 11) * h), len = 2 + R(i, 12) * 6;
    ctx.fillStyle = `rgba(30,30,30,${(0.15 + R(i, 13) * 0.35).toFixed(3)})`;
    ctx.fillRect(x, y, len, 1);
    if (x + len > w) ctx.fillRect(x - w, y, len, 1);
  }
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (hash2(i & 255, i >> 8, seed + 9) - 0.5) * 18;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

const texCache = new Map<string, THREE.CanvasTexture>();
function texOnce(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let t = texCache.get(key);
  if (!t) { t = make(); texCache.set(key, t); }
  return t;
}

/** Procedural walnut colour, tiled. Dark, slightly worn. */
export function woodTexture(seed = 3, size = 1024): THREE.CanvasTexture {
  return texOnce(`wood:${seed}:${size}`, () => makeCanvasTexture({
    width: size, height: size, repeat: [1, 1], anisotropy: 16,
    draw(ctx, w, h) { drawWalnut(ctx, w, h, seed, 'color'); },
  }));
}

/** The roughness map matching woodTexture(seed): same wear, same seed. */
export function woodRoughness(seed = 3, size = 512): THREE.CanvasTexture {
  return texOnce(`woodr:${seed}:${size}`, () => makeCanvasTexture({
    width: size, height: size, repeat: [1, 1], anisotropy: 8, colorSpace: THREE.NoColorSpace,
    draw(ctx, w, h) { drawWalnut(ctx, w, h, seed, 'rough'); },
  }));
}

/** Fine pore/grain bump, 256 px, meant to repeat many times. */
export function woodDetail(seed = 3): THREE.CanvasTexture {
  return texOnce(`woodd:${seed}`, () => makeCanvasTexture({
    width: 256, height: 256, repeat: [1, 1], anisotropy: 8, colorSpace: THREE.NoColorSpace,
    draw(ctx, w, h) { drawWoodDetail(ctx, w, h, seed); },
  }));
}

function repeated(tex: THREE.CanvasTexture, repeat: [number, number]): THREE.CanvasTexture {
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}

export interface WoodOptions {
  tone?: THREE.ColorRepresentation;
  roughness?: number;
  seed?: number;
  bump?: number;
  /** Texture repeat over the surface (default 1 x 1). The figure is seamless along x. */
  repeat?: [number, number];
  /**
   * Finished-surface look: a roughness map (worn patches, smudges, grain)
   * and a fine tiling pore bump for close-ups. The table top uses this.
   */
  finish?: boolean;
}

/** Dark walnut by default. Pass a lighter `tone` for pale woods (puppet, bookends). */
export function wood(opts: WoodOptions = {}): THREE.MeshStandardMaterial {
  const key = `wood:${String(opts.tone ?? '')}:${opts.roughness ?? ''}:${opts.seed ?? ''}:${opts.bump ?? ''}:${opts.repeat?.join('x') ?? ''}:${opts.finish ? 'f' : ''}`;
  return cached(key, () => {
    const seed = opts.seed ?? 3;
    const repeat = opts.repeat ?? [1, 1];
    const tex = opts.repeat ? repeated(woodTexture(seed), repeat) : woodTexture(seed);
    const m = standard({
      map: tex,
      color: opts.tone ?? 0xffffff,
      roughness: opts.roughness ?? 0.72,
      metalness: 0,
      bumpMap: tex,
      bumpScale: opts.bump ?? 0.0025,
    });
    if (opts.finish) {
      m.roughnessMap = repeated(woodRoughness(seed), repeat);
      m.roughness = opts.roughness ?? 1.0; // the map carries the value (~0.5 to 0.75)
      m.bumpMap = repeated(woodDetail(seed), [repeat[0] * 7, repeat[1] * 7]);
      m.bumpScale = opts.bump ?? 0.0012;
    }
    return m;
  });
}

/** Pebbled leather, tiling. Dark by default (a desk mat). */
export function leatherTexture(seed = 9, size = 512): THREE.CanvasTexture {
  return texOnce(`leather:${seed}:${size}`, () => makeCanvasTexture({
    width: size, height: size, repeat: [1, 1], anisotropy: 8,
    draw(ctx, w, h) {
      const R = (i: number, j: number): number => hash2(i, j, seed);
      ctx.fillStyle = '#2b221d';
      ctx.fillRect(0, 0, w, h);
      // pebbles: a lit rim toward the top-left, a shadowed pit toward the bottom-right
      const n = Math.round((w * h) / 150);
      for (let i = 0; i < n; i++) {
        const x = R(i, 1) * w, y = R(i, 2) * h, r = 2.6 + R(i, 3) * 5;
        const hi = (0.05 + R(i, 4) * 0.09).toFixed(3), lo = (0.08 + R(i, 5) * 0.14).toFixed(3);
        for (const [dx, dy] of [[0, 0], [-w, 0], [w, 0], [0, -h], [0, h]]) {
          const cx = x + dx, cy = y + dy;
          if (cx < -r || cx > w + r || cy < -r || cy > h + r) continue;
          const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, 0, cx, cy, r);
          g.addColorStop(0, `rgba(122,96,82,${hi})`);
          g.addColorStop(0.55, 'rgba(60,46,40,0)');
          g.addColorStop(1, `rgba(10,6,4,${lo})`);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
        }
      }
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const nz = (hash2(i & 511, i >> 9, seed + 3) - 0.5) * 10;
        d[i] += nz; d[i + 1] += nz * 0.9; d[i + 2] += nz * 0.85;
      }
      ctx.putImageData(img, 0, 0);
    },
  }));
}

export interface LeatherOptions { color?: THREE.ColorRepresentation; roughness?: number; repeat?: [number, number] }

/** Leather with a soft sheen: pebble grain as colour and bump. */
export function leather(opts: LeatherOptions = {}): THREE.MeshStandardMaterial {
  return cached(`leather:${String(opts.color ?? '')}:${opts.roughness ?? ''}:${opts.repeat?.join('x') ?? ''}`, () => {
    const tex = repeated(leatherTexture(), opts.repeat ?? [4, 4]);
    return standard({ map: tex, bumpMap: tex, bumpScale: 0.0006, color: opts.color ?? 0xffffff, roughness: opts.roughness ?? 0.64, metalness: 0 });
  });
}

export interface SimpleOptions { color?: THREE.ColorRepresentation; roughness?: number; metalness?: number; emissive?: THREE.ColorRepresentation; emissiveIntensity?: number }

/** Matte paper / card. */
export function paper(opts: SimpleOptions = {}): THREE.MeshStandardMaterial {
  return cached(`paper:${String(opts.color ?? '')}:${opts.roughness ?? ''}`, () =>
    standard({ color: opts.color ?? PALETTE.paper, roughness: opts.roughness ?? 0.9, metalness: 0 }));
}

/** Brushed / cast metal. `roughness` 0.3 polished to 0.7 cast. */
export function metal(opts: SimpleOptions = {}): THREE.MeshStandardMaterial {
  return cached(`metal:${String(opts.color ?? '')}:${opts.roughness ?? ''}:${opts.metalness ?? ''}`, () =>
    standard({ color: opts.color ?? PALETTE.steel, roughness: opts.roughness ?? 0.45, metalness: opts.metalness ?? 1 }));
}

/** Transparent glass base. Builders may add a fresnel rim or a Physical variant. */
export function glass(opts: SimpleOptions & { opacity?: number } = {}): THREE.MeshPhysicalMaterial {
  return cached(`glass:${String(opts.color ?? '')}:${opts.opacity ?? ''}`, () => {
    const m = new THREE.MeshPhysicalMaterial({
      color: opts.color ?? PALETTE.glass, roughness: opts.roughness ?? 0.08, metalness: 0,
      transparent: true, opacity: opts.opacity ?? 0.28, clearcoat: 1, clearcoatRoughness: 0.1,
      side: THREE.DoubleSide, depthWrite: false,
    });
    m.dithering = true;
    return m;
  });
}

/** Plastic / painted / rubber. */
export function plastic(opts: SimpleOptions = {}): THREE.MeshStandardMaterial {
  return cached(`plastic:${String(opts.color ?? '')}:${opts.roughness ?? ''}:${String(opts.emissive ?? '')}:${opts.emissiveIntensity ?? ''}`, () =>
    standard({
      color: opts.color ?? PALETTE.rubber, roughness: opts.roughness ?? 0.6, metalness: 0,
      emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
    }));
}

/** Convenience: any flat matte colour (placeholders, small parts). */
export function matte(color: THREE.ColorRepresentation, roughness = 0.75): THREE.MeshStandardMaterial {
  return cached(`matte:${String(color)}:${roughness}`, () => standard({ color, roughness, metalness: 0 }));
}

export const materials = { wood, paper, metal, glass, plastic, matte, leather, standard, makeCanvasTexture, woodTexture, PALETTE };
export type Materials = typeof materials;
