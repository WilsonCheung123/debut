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
} as const;

const cache = new Map<string, THREE.Material>();
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) { m = make(); cache.set(key, m); }
  return m;
}

/** Procedural walnut grain, tiled. Dark, slightly worn. */
export function woodTexture(seed = 3, size = 1024): THREE.CanvasTexture {
  return makeCanvasTexture({
    width: size, height: size, repeat: [1, 1], anisotropy: 16,
    draw(ctx, w, h) {
      ctx.fillStyle = '#4a3424';
      ctx.fillRect(0, 0, w, h);
      // long grain lines: slow sine wander, varying darkness and width
      for (let i = 0; i < 260; i++) {
        const y0 = hash2(i, 1, seed) * h;
        const amp = 2 + hash2(i, 2, seed) * 14;
        const freq = 0.002 + hash2(i, 3, seed) * 0.006;
        const phase = hash2(i, 4, seed) * Math.PI * 2;
        const dark = hash2(i, 5, seed);
        const a = 0.08 + dark * 0.22;
        ctx.strokeStyle = dark > 0.5 ? `rgba(28,16,9,${a})` : `rgba(140,100,66,${a * 0.7})`;
        ctx.lineWidth = 0.6 + hash2(i, 6, seed) * 2.2;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.7 + phase) * amp * 0.25;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // broad tonal variation (boards)
      for (let i = 0; i < 6; i++) {
        const y = (i / 6) * h;
        const g = ctx.createLinearGradient(0, y, 0, y + h / 6);
        const t = hash2(i, 9, seed);
        g.addColorStop(0, `rgba(0,0,0,${0.05 + t * 0.1})`);
        g.addColorStop(0.5, 'rgba(0,0,0,0)');
        g.addColorStop(1, `rgba(255,220,180,${0.03 + t * 0.04})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, y, w, h / 6);
      }
      // a few worn, lighter patches
      for (let i = 0; i < 14; i++) {
        const x = hash2(i, 11, seed) * w, y = hash2(i, 12, seed) * h, r = 40 + hash2(i, 13, seed) * 160;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,230,200,0.05)');
        g.addColorStop(1, 'rgba(255,230,200,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // fine grain noise
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (hash2(i & 1023, i >> 10, seed + 5) - 0.5) * 14;
        d[i] += n; d[i + 1] += n * 0.9; d[i + 2] += n * 0.8;
      }
      ctx.putImageData(img, 0, 0);
    },
  });
}

export interface WoodOptions { tone?: THREE.ColorRepresentation; roughness?: number; seed?: number; bump?: number }

/** Dark walnut by default. Pass a lighter `tone` for pale woods (puppet, bookends). */
export function wood(opts: WoodOptions = {}): THREE.MeshStandardMaterial {
  const key = `wood:${String(opts.tone ?? '')}:${opts.roughness ?? ''}:${opts.seed ?? ''}:${opts.bump ?? ''}`;
  return cached(key, () => {
    const tex = woodTexture(opts.seed ?? 3);
    const m = new THREE.MeshStandardMaterial({
      map: tex,
      color: opts.tone ?? 0xffffff,
      roughness: opts.roughness ?? 0.72,
      metalness: 0,
      bumpMap: tex,
      bumpScale: opts.bump ?? 0.0025,
    });
    return m;
  });
}

export interface SimpleOptions { color?: THREE.ColorRepresentation; roughness?: number; metalness?: number; emissive?: THREE.ColorRepresentation; emissiveIntensity?: number }

/** Matte paper / card. */
export function paper(opts: SimpleOptions = {}): THREE.MeshStandardMaterial {
  return cached(`paper:${String(opts.color ?? '')}:${opts.roughness ?? ''}`, () =>
    new THREE.MeshStandardMaterial({ color: opts.color ?? PALETTE.paper, roughness: opts.roughness ?? 0.9, metalness: 0 }));
}

/** Brushed / cast metal. `roughness` 0.3 polished to 0.7 cast. */
export function metal(opts: SimpleOptions = {}): THREE.MeshStandardMaterial {
  return cached(`metal:${String(opts.color ?? '')}:${opts.roughness ?? ''}:${opts.metalness ?? ''}`, () =>
    new THREE.MeshStandardMaterial({ color: opts.color ?? PALETTE.steel, roughness: opts.roughness ?? 0.45, metalness: opts.metalness ?? 1 }));
}

/** Transparent glass base. Builders may add a fresnel rim or a Physical variant. */
export function glass(opts: SimpleOptions & { opacity?: number } = {}): THREE.MeshPhysicalMaterial {
  return cached(`glass:${String(opts.color ?? '')}:${opts.opacity ?? ''}`, () =>
    new THREE.MeshPhysicalMaterial({
      color: opts.color ?? PALETTE.glass, roughness: opts.roughness ?? 0.08, metalness: 0,
      transparent: true, opacity: opts.opacity ?? 0.28, clearcoat: 1, clearcoatRoughness: 0.1,
      side: THREE.DoubleSide, depthWrite: false,
    }));
}

/** Plastic / painted / rubber. */
export function plastic(opts: SimpleOptions = {}): THREE.MeshStandardMaterial {
  return cached(`plastic:${String(opts.color ?? '')}:${opts.roughness ?? ''}:${String(opts.emissive ?? '')}:${opts.emissiveIntensity ?? ''}`, () =>
    new THREE.MeshStandardMaterial({
      color: opts.color ?? PALETTE.rubber, roughness: opts.roughness ?? 0.6, metalness: 0,
      emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
    }));
}

/** Convenience: any flat matte colour (placeholders, small parts). */
export function matte(color: THREE.ColorRepresentation, roughness = 0.75): THREE.MeshStandardMaterial {
  return cached(`matte:${String(color)}:${roughness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }));
}

export const materials = { wood, paper, metal, glass, plastic, matte, makeCanvasTexture, woodTexture, PALETTE };
export type Materials = typeof materials;
