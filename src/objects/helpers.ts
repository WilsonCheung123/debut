import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HIT_LAYER } from '../engine/picking';
import { makeCanvasTexture } from '../materials';

/** A box with rounded edges (every box on the table uses one). */
export function roundedBox(w: number, h: number, d: number, radius = 0.003, segments = 2): RoundedBoxGeometry {
  return new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, Math.min(w, h, d) / 2));
}

const proxyMat = new THREE.MeshBasicMaterial({ visible: false });

/**
 * An invisible raycast proxy: lives on the hit layer (never rendered), sized
 * to make thin or tiny things easy to hover and tap. Position it in the
 * object's group space; add it to `group` and to `hit`.
 */
export function hitProxy(w: number, h: number, d: number, name = 'proxy'): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), proxyMat);
  m.name = name;
  m.layers.set(HIT_LAYER);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

/** Marks a mesh as a shadow caster/receiver (default for solid things). */
export function solid<T extends THREE.Mesh>(mesh: T, name?: string): T {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  return mesh;
}

/**
 * Merges same-material parts into one geometry (one draw call). Parts may mix
 * indexed (box, cylinder) and non-indexed (extrude) geometries: everything is
 * made non-indexed and reduced to position/normal/uv first. The parts are disposed.
 */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    for (const name of Object.keys(n.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') n.deleteAttribute(name);
    n.clearGroups();
    return n;
  });
  const merged = mergeGeometries(flat, false);
  if (!merged) throw new Error('mergeParts: incompatible geometries');
  for (const g of parts) g.dispose();
  for (const g of flat) g.dispose();
  return merged;
}

export interface ContactBlob { mesh: THREE.Mesh; update(group: THREE.Object3D): void; dispose(): void }

/**
 * A soft contact shadow for thin things lying on the table (the ID, the pick).
 * The shadow map's normal bias (12 mm) hides a caster within ~12 mm of the
 * table, so a lifted card would float with nothing under it. The blob sits on
 * the table under the object at local offset (x, z) with local yaw `yaw`; it
 * is counter-transformed every frame so it stays put while the group lifts and
 * tilts, slides away from the lamp with height, and fades as the real shadow
 * takes over. `baseYaw` is the group's layout rotation (radians): the only
 * part of the group transform it keeps.
 */
export function contactBlob(w: number, d: number, baseYaw: number, opts: { x?: number; z?: number; yaw?: number; strength?: number } = {}): ContactBlob {
  const strength = opts.strength ?? 0.4;
  const tex = makeCanvasTexture({
    width: 128, height: 128,
    draw(c, W, H) {
      c.clearRect(0, 0, W, H);
      // a rounded rect drawn off-canvas; only its blurred shadow lands on the texture
      const inset = 0.17;
      c.save();
      c.translate(0, H * 2);
      c.shadowColor = 'rgba(0,0,0,1)';
      c.shadowBlur = 11;
      c.shadowOffsetY = -H * 2;
      c.fillStyle = 'rgba(0,0,0,1)';
      const x = W * inset, y = H * inset, rw = W * (1 - 2 * inset), rh = H * (1 - 2 * inset), r = Math.min(rw, rh) * 0.16;
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + rw, y, x + rw, y + rh, r);
      c.arcTo(x + rw, y + rh, x, y + rh, r);
      c.arcTo(x, y + rh, x, y, r);
      c.arcTo(x, y, x + rw, y, r);
      c.closePath();
      c.fill();
      c.restore();
    },
  });
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: strength, color: 0x000000 });
  const geo = new THREE.PlaneGeometry(w * 1.36, d * 1.36);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'contact-blob';
  mesh.renderOrder = -1;
  const UP = new THREE.Vector3(0, 1, 0);
  const base = new THREE.Quaternion().setFromAxisAngle(UP, baseYaw);
  const local = new THREE.Quaternion().setFromAxisAngle(UP, opts.yaw ?? 0);
  const off = new THREE.Vector3(opts.x ?? 0, 0, opts.z ?? 0).applyQuaternion(base);
  const inv = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const drift = new THREE.Vector3();
  return {
    mesh,
    update(group) {
      const lift = Math.max(0, group.position.y);
      inv.copy(group.quaternion).invert();
      mesh.quaternion.copy(inv).multiply(base).multiply(local);
      // the lamp is back-right: a lifted thing's shadow slides toward the front-left
      drift.set(-0.45, 0, 0.55).multiplyScalar(lift * 0.9);
      v.copy(off).add(drift).setY(0.0004 - lift).applyQuaternion(inv);
      mesh.position.copy(v);
      const k = THREE.MathUtils.clamp(1 - lift / 0.05, 0, 1);
      mat.opacity = strength * k * k;
      const sc = 1 + lift * 5;
      mesh.scale.set(sc, 1, sc);
    },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); },
  };
}
