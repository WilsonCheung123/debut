import * as THREE from 'three';

let maxAnisotropy = 1;
/** Called once by the engine after the renderer exists. */
export function setMaxAnisotropy(n: number): void { maxAnisotropy = n; }

export interface CanvasTextureOptions {
  /** Width in px (power of two preferred). Covers: 512 x 768. Max 1024. */
  width: number;
  height: number;
  /** Draw the texture. The context is 2D, origin top-left, y down. */
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  /** Default sRGB (colour data). Use NoColorSpace for roughness/bump data. */
  colorSpace?: THREE.ColorSpace;
  /** Repeat wrap for tiling surfaces (wood, grain). */
  repeat?: [number, number];
  anisotropy?: number;
  /** Flip Y (three's default for canvas textures is true). */
  flipY?: boolean;
}

/**
 * Makes a CanvasTexture: sRGB by default, mipmapped, anisotropic, and sized to
 * the budget. Object builders draw covers, labels, PCB art and so on with this.
 */
export function makeCanvasTexture(opts: CanvasTextureOptions): THREE.CanvasTexture {
  const w = Math.min(1024, Math.max(2, Math.round(opts.width)));
  const h = Math.min(1024, Math.max(2, Math.round(opts.height)));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  opts.draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = opts.colorSpace ?? THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(maxAnisotropy, opts.anisotropy ?? 8);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  if (opts.flipY !== undefined) tex.flipY = opts.flipY;
  if (opts.repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  tex.needsUpdate = true;
  return tex;
}

/** Deterministic hash noise in [0,1). Use for grain so textures are stable. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Fills the canvas with fine monochrome grain (alpha controls strength). */
export function grain(ctx: CanvasRenderingContext2D, w: number, h: number, alpha = 0.06, seed = 1): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n = (hash2(x, y, seed) - 0.5) * 255 * alpha;
      d[i] = clamp255(d[i] + n);
      d[i + 1] = clamp255(d[i + 1] + n);
      d[i + 2] = clamp255(d[i + 2] + n);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function clamp255(v: number): number { return v < 0 ? 0 : v > 255 ? 255 : v; }

/** A small noise PNG as a data URL, for CSS paper grain on panels. */
export function noiseDataUrl(size = 128, alpha = 0.5, seed = 7): string {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(hash2(i % size, Math.floor(i / size), seed) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = Math.round(255 * alpha);
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}
