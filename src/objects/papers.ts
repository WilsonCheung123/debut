import * as THREE from 'three';
import gsap from 'gsap';
import type { ObjectCtx, TableObject } from './types';
import { hitProxy, solid, contactBlob, mergeParts, topFirst } from './helpers';
import { makeCanvasTexture, grain, hash2, closeUpSize, standard } from '../materials';
import { rest as restPoses } from '../layout';
import { papers as content } from '../content/papers';

// A stack of plain writing paper (the blog, "more to come"). Thirty-six
// letter-proportioned sheets, 8 mm in all, each one a real thin box set down
// a fraction of a millimetre and a few tenths of a degree off the one below
// (the top three more so), so the sides read as individual sheet edges and
// the lamp catches the slivers where one sheet overhangs the next. The sides
// wear a texture of faint sheet lines; the top sheet is cream paper with the
// site's grain and a few faint pencil lines near its head: "notes" in the
// site's handwriting, nothing legible beyond that. A contact blob keeps a
// shadow under it (the shadow map's bias hides anything this low). Focus
// lifts the whole stack 2 cm.

const ID = 'papers';
const W = 0.17, D = 0.22;              // US letter proportions (8.5 : 11), the footprint the corner allows
const N = 36;                           // sheets
const T = 0.00022;                      // one sheet
const H = N * T;                        // 7.9 mm
/** How far the stack rises when focused (metres). */
const FOCUS_LIFT = 0.02;

export function createPapers(ctx: ObjectCtx): TableObject {
  const group = new THREE.Group();
  group.name = ID;

  const R = (i: number, j: number): number => hash2(i, j, 41);
  // each sheet's offset from the stack's axis: a slow drift up the stack plus per-sheet jitter
  const place = (i: number): { x: number; z: number; yaw: number } => {
    const top = i >= N - 3;                                   // the last three were put down less carefully
    const jitter = top ? 0.0011 : 0.00045;
    const drift = (i / N) * 0.0012;
    return {
      x: drift * 0.6 + (R(i, 1) - 0.5) * 2 * jitter,
      z: -drift * 0.4 + (R(i, 2) - 0.5) * 2 * jitter,
      yaw: THREE.MathUtils.degToRad((R(i, 3) - 0.5) * 2 * (top ? 0.9 : 0.3)),
    };
  };

  // the body: sheets 0..N-2 merged into one geometry; UVs projected so the side texture's
  // lines run with the stack's height (v = y / H) and around its perimeter (u)
  const sideTex = sideTexture();
  const sideMat = standard({ map: sideTex, color: 0xffffff, roughness: 0.96, metalness: 0 });
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < N - 1; i++) {
    const g = new THREE.BoxGeometry(W, T, D);
    const p = place(i);
    g.rotateY(p.yaw);
    g.translate(p.x, i * T + T / 2, p.z);
    parts.push(g);
  }
  const bodyGeo = mergeParts(parts);
  projectUv(bodyGeo);
  const body = solid(new THREE.Mesh(bodyGeo, sideMat), `${ID}:body`);
  group.add(body);

  // the top sheet: its own mesh, the written face up
  const topTex = topTexture(ctx.isPhone);
  // roughness 1: a letter-sized plane facing the lamp throws a broad sheen at anything less, and paper has none
  const topMat = standard({ map: topTex.texture, roughness: 1.0, metalness: 0 });
  const topGeo = new THREE.BoxGeometry(W, T, D);
  topFirst(topGeo);
  const pt = place(N - 1);
  topGeo.rotateY(pt.yaw);
  topGeo.translate(pt.x, (N - 1) * T + T / 2, pt.z);
  const top = solid(new THREE.Mesh(topGeo, [topMat, sideMat]), `${ID}:top`);
  group.add(top);

  const proxy = hitProxy(W + 0.02, 0.03, D + 0.02, `${ID}:proxy`);
  proxy.position.y = 0.012;
  group.add(proxy);

  // 8 mm of paper is inside the shadow map's normal bias: a soft contact shadow stays under it as it lifts
  const restYaw = THREE.MathUtils.degToRad(restPoses[ID]?.rotationY ?? 0);
  const blob = contactBlob(W, D, restYaw, { strength: 0.4 });
  group.add(blob.mesh);

  return {
    id: ID,
    label: 'a stack of paper',
    group,
    hit: [top, body, proxy],
    anchor: new THREE.Vector3(0, H, 0),
    hover: { lift: 0.010, tilt: 2 },
    focus: {
      camera: ctx.focusPose(ID),
      panel: content,
      onEnter() {
        const m = ctx.motion(ID);
        gsap.killTweensOf(m);
        if (ctx.state.reducedMotion) { m.lift = FOCUS_LIFT; return; }
        gsap.to(m, { lift: FOCUS_LIFT, duration: 0.9, ease: 'power3.inOut' });
      },
      onExit() {
        const m = ctx.motion(ID);
        gsap.killTweensOf(m);
        if (ctx.state.reducedMotion) { m.lift = 0; return; }
        gsap.to(m, { lift: 0, duration: 0.8, ease: 'power3.inOut' });
      },
    },
    update() { blob.update(group); },
    dispose() {
      blob.dispose();
      bodyGeo.dispose(); topGeo.dispose();
      sideTex.dispose(); topTex.texture.dispose();
      sideMat.dispose(); topMat.dispose();
    },
  };
}

/** Side-texture UVs for the merged sheets: v climbs the stack, u runs around it (the top slivers land on a line, which reads as the overhanging sheet's shadow). */
function projectUv(geo: THREE.BufferGeometry): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + pos.getZ(i) * 0.5) / (W + D * 0.5) + 0.5, pos.getY(i) / H);
  }
  uv.needsUpdate = true;
}

/** The edges of the stack: cream, a hairline where each sheet meets the next, some sheets a shade off. */
function sideTexture(): THREE.CanvasTexture {
  return makeCanvasTexture({
    width: 256, height: 512, anisotropy: 8, flipY: false,
    draw(c, w, h) {
      c.fillStyle = '#e2d8c2';
      c.fillRect(0, 0, w, h);
      const sheet = h / N;
      for (let i = 0; i < N; i++) {
        // the sheet's face: a few are a touch warmer or greyer (ream batches are not identical)
        const tone = hash2(i, 5, 41);
        c.fillStyle = tone < 0.3 ? 'rgba(255,248,232,0.22)' : tone > 0.8 ? 'rgba(90,80,70,0.08)' : 'rgba(0,0,0,0)';
        c.fillRect(0, i * sheet, w, sheet);
        // the seam at its top edge
        c.fillStyle = 'rgba(70,58,44,0.42)';
        c.fillRect(0, Math.round((i + 1) * sheet) - 1, w, 1.5);
      }
      grain(c, w, h, 0.05, 41);
    },
  });
}

interface TopTexture { texture: THREE.CanvasTexture }

/** The top sheet: cream paper, the site's grain, "notes" and three pencil lines up by its head. Redrawn once Caveat is in. */
function topTexture(isPhone: boolean): TopTexture {
  const w = isPhone ? 512 : closeUpSize() / 2;
  const h = Math.round(w * D / W);
  let paper: HTMLCanvasElement | null = null;
  const draw = (c: CanvasRenderingContext2D, W_: number, H_: number): void => {
    if (!paper) {
      // the grained paper once (grain reads pixels back; a redraw must not grain the writing)
      paper = document.createElement('canvas');
      paper.width = W_; paper.height = H_;
      const pc = paper.getContext('2d')!;
      pc.fillStyle = '#e9e0cb';
      pc.fillRect(0, 0, W_, H_);
      // the faintest warm fall-off toward the edges, so the sheet is not one flat value
      const g = pc.createRadialGradient(W_ * 0.5, H_ * 0.45, H_ * 0.2, W_ * 0.5, H_ * 0.5, H_ * 0.8);
      g.addColorStop(0, 'rgba(255,250,240,0)');
      g.addColorStop(1, 'rgba(120,90,50,0.04)');
      pc.fillStyle = g;
      pc.fillRect(0, 0, W_, H_);
      grain(pc, W_, H_, 0.04, 43);
    }
    c.drawImage(paper, 0, 0);
    // in pencil: a word up by the head, then three short lines that read as writing and nothing more
    const s = W_ / 1024;
    c.fillStyle = 'rgba(60,54,48,0.62)';
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.font = `500 ${Math.round(64 * s)}px Caveat, "Bradley Hand", cursive`;
    c.fillText('notes', W_ * 0.12, H_ * 0.105);
    c.strokeStyle = 'rgba(60,54,48,0.42)';
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = 2.2 * s;
    for (let line = 0; line < 3; line++) {
      const y0 = H_ * (0.15 + line * 0.034);
      let x = W_ * 0.12 + 18 * s * hash2(line, 2, 47);
      const end = W_ * (0.5 + 0.3 * hash2(line, 3, 47));
      c.beginPath(); c.moveTo(x, y0);
      let k = 0;
      while (x < end) {
        const dx = (7 + 9 * hash2(line, k, 51)) * s;
        const dy = (hash2(line, k, 53) - 0.5) * 22 * s;
        x += dx;
        c.quadraticCurveTo(x - dx / 2, y0 + dy * 1.3, x, y0 + dy * 0.35);
        k++;
        if (hash2(line, k, 57) < 0.18) { x += (10 + 12 * hash2(line, k, 59)) * s; c.moveTo(x, y0); }
      }
      c.stroke();
    }
  };
  const texture = makeCanvasTexture({ width: w, height: h, anisotropy: 16, draw });
  if (typeof document !== 'undefined' && document.fonts?.load) {
    document.fonts.load('500 64px Caveat').then(() => {
      const canvas = texture.image as HTMLCanvasElement;
      const c = canvas.getContext('2d');
      if (!c) return;
      draw(c, canvas.width, canvas.height);
      texture.needsUpdate = true;
    }).catch(() => { /* the fallback hand stays */ });
  }
  return { texture };
}
