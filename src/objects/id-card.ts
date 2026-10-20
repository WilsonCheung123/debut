import * as THREE from 'three';
import gsap from 'gsap';
import type { ObjectCtx, TableObject } from './types';
import { hitProxy, solid, contactBlob } from './helpers';
import { makeCanvasTexture, grain, hash2 } from '../materials';
import { focus as focusFrames, rest as restPoses } from '../layout';
import { dirFrom } from '../engine/camera';
import { idCard as content } from '../content/id-card';

// The student ID (SPEC 4.3). A credit-card-sized card, 3 mm plan corners, a
// hair of edge bevel, satin clear-coat. Front: the drawn card inside
// public/id-card.webp (cropped to its outline, so the card's proportions are
// the drawing's). Back: a designed cream back on canvas. Focus lifts it and
// turns it to face the camera; a click inside flips it 180° about its long
// axis over 700 ms with a slight arc, and only then does the panel open
// (focus.deferPanel + ctx.openPanel).

const ID = 'id-card';
/** The drawn card's outline inside the 1024 × 683 image (measured; the rest is margin and a baked shadow). */
const CROP = { x: 31, y: 56, w: 962, h: 561 };
const W = 0.0856;
const H = W * CROP.h / CROP.w;        // 0.0499: the drawing's aspect
const T = 0.00078;                     // thickness
const R = 0.0028;                      // plan corner radius
const BEVEL = 0.00012;                 // edge bevel
/** How far the card's centre rises when focused (metres above its rest height). */
export const ID_FOCUS_LIFT = 0.055;
const TAU = Math.PI * 2;

export function createIdCard(ctx: ObjectCtx): TableObject {
  const group = new THREE.Group();
  group.name = ID;

  const frontTex = frontTexture();
  const backTex = backTexture();
  const front = new THREE.MeshPhysicalMaterial({ map: frontTex, roughness: 0.58, metalness: 0, clearcoat: 0.85, clearcoatRoughness: 0.34 });
  const back = new THREE.MeshPhysicalMaterial({ map: backTex, roughness: 0.6, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.38 });
  const edge = new THREE.MeshPhysicalMaterial({ color: 0xe6dcc6, roughness: 0.7, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.5 });

  // The card turns about `pivot`, which sits at the card's centre; the mesh hangs below it.
  const pivot = new THREE.Group();
  pivot.position.y = T / 2;
  const geo = cardGeometry();
  const card = solid(new THREE.Mesh(geo, [front, back, edge]), ID);
  card.position.y = -T / 2;
  pivot.add(card);
  const proxy = hitProxy(W + 0.024, 0.016, H + 0.024, `${ID}:proxy`);
  pivot.add(proxy);
  group.add(pivot);

  // Facing the focus camera: the pivot's YXZ angles that point the card's
  // normal along the focus direction (layout az/el), in the group's frame
  // (the rest yaw undone). alpha tips the top edge back, beta squares it up.
  const frame = focusFrames[ID] ?? { dist: 0.3, az: 2, el: 58 };
  const restYaw = THREE.MathUtils.degToRad(restPoses[ID]?.rotationY ?? 0);
  const dir = dirFrom(frame.az, frame.el).applyAxisAngle(new THREE.Vector3(0, 1, 0), -restYaw);
  const alpha = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1));
  const beta = Math.atan2(dir.x, dir.z);

  // a thin card casts nothing the shadow map can show near the table: a soft contact shadow stays on the table as it lifts
  const blob = contactBlob(W, H, restYaw, { strength: 0.42 });
  group.add(blob.mesh);

  const pose = { y: 0, rx: 0, ry: 0, rz: 0 };
  let flips = 0;
  let flipping = false;
  const apply = (): void => {
    pivot.position.y = T / 2 + pose.y;
    pivot.rotation.set(pose.rx, pose.ry, pose.rz, 'YXZ');
  };

  const land = (): void => {
    flipping = false;
    if (ctx.state.focused === ID) ctx.openPanel(ID);
  };

  const flip = (): void => {
    if (flipping || ctx.state.focused !== ID) return;
    flipping = true;
    flips += 1;
    const rx = alpha + Math.PI * flips;
    gsap.killTweensOf(pose);
    if (ctx.state.reducedMotion) {
      pose.rx = rx; pose.ry = beta; pose.y = ID_FOCUS_LIFT; pose.rz = 0;
      apply();
      land();
      return;
    }
    // 700 ms about the long axis; the arc is a rise of ~3 cm that settles as the turn lands, with a hint of yaw.
    const tl = gsap.timeline({ onComplete: land });
    tl.to(pose, { rx, duration: 0.7, ease: 'power2.inOut' }, 0);
    tl.to(pose, { y: ID_FOCUS_LIFT + 0.03, duration: 0.32, ease: 'sine.out' }, 0);
    tl.to(pose, { y: ID_FOCUS_LIFT, duration: 0.38, ease: 'sine.inOut' }, 0.32);
    tl.to(pose, { ry: beta + 0.07, rz: 0.03, duration: 0.34, ease: 'sine.out' }, 0);
    tl.to(pose, { ry: beta, rz: 0, duration: 0.36, ease: 'sine.inOut' }, 0.34);
  };

  return {
    id: ID,
    label: 'Student ID',
    group,
    hit: [card, proxy],
    anchor: new THREE.Vector3(0, T, 0),
    hover: { lift: 0.012, tilt: 3 },
    focus: {
      camera: ctx.focusPose(ID),
      panel: content,
      deferPanel: true,
      onEnter() {
        gsap.killTweensOf(pose);
        flipping = false;
        flips = 0;
        pose.rx = ((pose.rx % TAU) + TAU) % TAU; // a whole number of turns is a turn of zero
        if (pose.rx > Math.PI) pose.rx -= TAU;
        if (ctx.state.reducedMotion) { pose.y = ID_FOCUS_LIFT; pose.rx = alpha; pose.ry = beta; pose.rz = 0; apply(); return; }
        gsap.to(pose, { y: ID_FOCUS_LIFT, rx: alpha, ry: beta, rz: 0, duration: 0.9, ease: 'power3.inOut' });
      },
      onExit() {
        gsap.killTweensOf(pose);
        flipping = false;
        flips = 0;
        // settle face-up by the shorter way round (a flipped card tumbles on over its far edge)
        const rx = Math.round(pose.rx / TAU) * TAU;
        if (ctx.state.reducedMotion) { pose.y = 0; pose.rx = rx; pose.ry = 0; pose.rz = 0; apply(); return; }
        gsap.to(pose, { y: 0, rx, ry: 0, rz: 0, duration: 0.8, ease: 'power3.inOut' });
      },
      onClickInside() { flip(); },
    },
    update() { apply(); blob.update(group); },
    dispose() {
      blob.dispose();
      geo.dispose();
      frontTex.dispose();
      backTex.dispose();
      front.dispose(); back.dispose(); edge.dispose();
    },
  };
}

/**
 * The card: a rounded-rect extrusion with a hair of bevel, lying in the xz
 * plane with the printed side up. Groups: 0 front (top), 1 back (bottom),
 * 2 edge. Cap UVs span the card; the back is mirrored in v so it reads
 * upright after a half turn about the long (x) axis.
 */
function cardGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  roundedRect(shape, W - 2 * BEVEL, H - 2 * BEVEL, R - BEVEL);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: T - 2 * BEVEL, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 2, curveSegments: 12, steps: 1,
  });
  const lids = geo.groups[0];
  const sides = geo.groups[1];
  const half = lids.count / 2; // the lid group is [bottom cap][top cap], same triangulation
  geo.clearGroups();
  geo.addGroup(lids.start + half, half, 0);
  geo.addGroup(lids.start, half, 1);
  geo.addGroup(sides.start, sides.count, 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) + W / 2) / W;
    const v = (pos.getY(i) + H / 2) / H;
    if (i >= lids.start + half && i < lids.start + lids.count) uv.setXY(i, u, v);
    else if (i >= lids.start && i < lids.start + half) uv.setXY(i, u, 1 - v);
    else uv.setXY(i, u, 0.5);
  }
  uv.needsUpdate = true;
  geo.rotateX(-Math.PI / 2);   // extrude +z → +y; shape +y → world -z (the far edge is the top of the print)
  geo.translate(0, BEVEL, 0);  // bottom bevel on y = 0
  geo.computeBoundingBox();
  return geo;
}

function roundedRect(s: THREE.Shape, w: number, h: number, r: number): void {
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
}

/** The front: cream until the image arrives, then the drawn card cropped to its outline. */
function frontTexture(): THREE.CanvasTexture {
  const tex = makeCanvasTexture({
    width: 1024, height: Math.round(1024 * CROP.h / CROP.w), anisotropy: 16,
    draw(c, w, h) { c.fillStyle = '#f1e7d3'; c.fillRect(0, 0, w, h); },
  });
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    const canvas = tex.image as HTMLCanvasElement;
    const c = canvas.getContext('2d');
    if (!c) return;
    c.drawImage(img, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, canvas.width, canvas.height);
    tex.needsUpdate = true;
  };
  img.onerror = () => console.warn('id-card: front image failed to load; showing the blank card');
  img.src = '/id-card.webp';
  return tex;
}

/** The back: cream with a thin maroon rule, a small roundel, a line of fine print, a faint barcode. */
function backTexture(): THREE.CanvasTexture {
  return makeCanvasTexture({
    width: 1024, height: Math.round(1024 * CROP.h / CROP.w), anisotropy: 16,
    draw(c, w, h) {
      c.fillStyle = '#efe6d2';
      c.fillRect(0, 0, w, h);
      grain(c, w, h, 0.035, 3);
      // a faint warm vignette so the back is not a flat fill
      const g = c.createRadialGradient(w * 0.5, h * 0.5, h * 0.2, w * 0.5, h * 0.5, w * 0.75);
      g.addColorStop(0, 'rgba(255,250,240,0.0)');
      g.addColorStop(1, 'rgba(120,80,40,0.08)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);

      const maroon = '#6e2a2a';
      // thin maroon rule
      c.fillStyle = maroon;
      c.fillRect(w * 0.07, h * 0.235, w * 0.86, 3);

      // roundel: a ring, VERITAS on the upper arc, a lamp of learning in the centre (our own mark)
      const cx = w * 0.165, cy = h * 0.55, rr = h * 0.17;
      c.save();
      c.translate(cx, cy);
      c.strokeStyle = maroon;
      c.lineWidth = 4;
      c.beginPath(); c.arc(0, 0, rr, 0, TAU); c.stroke();
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(0, 0, rr * 0.86, 0, TAU); c.stroke();
      c.fillStyle = maroon;
      c.font = `500 ${Math.round(rr * 0.26)}px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const word = 'VERITAS';
      const arc = Math.PI * 0.78;
      for (let i = 0; i < word.length; i++) {
        const a = -Math.PI / 2 - arc / 2 + (arc * (i + 0.5)) / word.length;
        c.save();
        c.rotate(a + Math.PI / 2);
        c.fillText(word[i], 0, -rr * 0.93 + rr * 0.33);
        c.restore();
      }
      // three dots on the lower arc
      for (const k of [-1, 0, 1]) {
        const a = Math.PI / 2 + k * 0.32;
        c.beginPath(); c.arc(Math.cos(a) * rr * 0.72, Math.sin(a) * rr * 0.72, rr * 0.035, 0, TAU); c.fill();
      }
      // the lamp: a bowl, a flame, a foot
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(-rr * 0.3, -rr * 0.02);
      c.quadraticCurveTo(0, rr * 0.3, rr * 0.3, -rr * 0.02);
      c.lineTo(rr * 0.36, -rr * 0.06);
      c.lineTo(-rr * 0.36, -rr * 0.06);
      c.closePath();
      c.fill();
      c.beginPath(); c.moveTo(-rr * 0.16, rr * 0.3); c.lineTo(rr * 0.16, rr * 0.3); c.stroke();
      c.beginPath(); c.moveTo(0, rr * 0.3); c.lineTo(0, rr * 0.14); c.stroke();
      c.beginPath();
      c.moveTo(0, -rr * 0.42);
      c.quadraticCurveTo(rr * 0.16, -rr * 0.22, 0, -rr * 0.08);
      c.quadraticCurveTo(-rr * 0.16, -rr * 0.22, 0, -rr * 0.42);
      c.fill();
      c.restore();

      // fine print
      c.fillStyle = 'rgba(70,52,40,0.78)';
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.font = `400 ${Math.round(h * 0.036)}px Georgia, "Times New Roman", serif`;
      const x0 = w * 0.35;
      const lines = [
        'This card identifies a student and is not transferable.',
        'It remains the property of the issuing office.',
        'If found, please return it to its owner.',
      ];
      lines.forEach((t, i) => c.fillText(t, x0, h * 0.40 + i * h * 0.062));
      // signature line
      c.fillStyle = 'rgba(70,52,40,0.35)';
      c.fillRect(x0, h * 0.70, w * 0.40, 1.5);
      c.font = `500 ${Math.round(h * 0.026)}px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
      c.fillStyle = 'rgba(70,52,40,0.55)';
      c.fillText('SIGNATURE', x0, h * 0.745);

      // faint barcode strip, bottom left
      const bx = w * 0.07, by = h * 0.80, bw = w * 0.34, bh = h * 0.1;
      c.fillStyle = 'rgba(40,30,24,0.34)';
      let x = bx;
      let i = 0;
      while (x < bx + bw) {
        const bar = 2 + Math.floor(hash2(i, 1, 9) * 4) * 2;
        const gap = 2 + Math.floor(hash2(i, 2, 9) * 3) * 2;
        c.fillRect(x, by, bar, bh);
        x += bar + gap;
        i++;
      }
      // a quiet small-caps line under the rule, top right
      c.fillStyle = 'rgba(110,42,42,0.75)';
      c.font = `500 ${Math.round(h * 0.03)}px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
      c.textAlign = 'right';
      c.fillText('S T U D E N T   I D E N T I F I C A T I O N', w * 0.93, h * 0.20);
    },
  });
}
