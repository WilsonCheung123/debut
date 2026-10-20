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
export function mergeParts(parts: THREE.BufferGeometry[], colors?: THREE.ColorRepresentation[]): THREE.BufferGeometry {
  const c = new THREE.Color();
  const flat = parts.map((g, i) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    for (const name of Object.keys(n.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') n.deleteAttribute(name);
    n.clearGroups();
    if (colors) {
      // one colour per part, as a vertex attribute (use a material with vertexColors: true): several tints, one draw call
      c.set(colors[i] ?? 0xffffff);
      const count = n.attributes.position.count;
      const arr = new Float32Array(count * 3);
      for (let k = 0; k < count; k++) { arr[k * 3] = c.r; arr[k * 3 + 1] = c.g; arr[k * 3 + 2] = c.b; }
      n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    return n;
  });
  const merged = mergeGeometries(flat, false);
  if (!merged) throw new Error('mergeParts: incompatible geometries');
  for (const g of parts) g.dispose();
  for (const g of flat) g.dispose();
  return merged;
}

/**
 * Bakes several meshes that share one material into one mesh in `parent`
 * space (their transforms relative to `parent` are applied to clones of their
 * geometries), removes the originals and adds the result to `parent`. For
 * static parts only. Shadow flags come from the first mesh.
 */
export function bakeMeshes(meshes: THREE.Mesh[], material: THREE.Material, parent: THREE.Object3D, name = 'baked'): THREE.Mesh | null {
  if (meshes.length === 0) return null;
  parent.updateWorldMatrix(true, true);
  const inv = parent.matrixWorld.clone().invert();
  const parts: THREE.BufferGeometry[] = [];
  for (const m of meshes) {
    const rel = inv.clone().multiply(m.matrixWorld);
    const g = m.geometry.clone().applyMatrix4(rel);
    parts.push(g);
  }
  const merged = new THREE.Mesh(mergeParts(parts), material);
  merged.name = name;
  merged.castShadow = meshes[0].castShadow;
  merged.receiveShadow = meshes[0].receiveShadow;
  for (const m of meshes) { m.removeFromParent(); m.geometry.dispose(); }
  parent.add(merged);
  return merged;
}

/** Direct or nested meshes under `root` wearing exactly `material` (and not instanced). */
export function meshesWith(root: THREE.Object3D, material: THREE.Material): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && m.material === material) out.push(m);
  });
  return out;
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

/**
 * Reorders a BoxGeometry's index so the top (+y) face comes first and leaves
 * two groups: 0 = top, 1 = the other five faces. A box with a printed top and
 * plain sides then costs two draw calls instead of three.
 */
export function topFirst(geo: THREE.BufferGeometry): void {
  const g = geo.groups.map((x) => ({ ...x }));
  if (g.length !== 6) return;
  const top = g[2];
  const index = geo.index;
  let total: number;
  if (index) {
    const a = Array.from(index.array as ArrayLike<number>);
    const rest = a.slice(0, top.start).concat(a.slice(top.start + top.count));
    geo.setIndex(a.slice(top.start, top.start + top.count).concat(rest));
    total = a.length;
  } else {
    // non-indexed (RoundedBoxGeometry): groups are vertex ranges; move the top's vertices to the front in every attribute
    total = geo.attributes.position.count;
    for (const name of Object.keys(geo.attributes)) {
      const attr = geo.attributes[name] as THREE.BufferAttribute;
      const n = attr.itemSize;
      const src = attr.array as Float32Array;
      const out = new Float32Array(src.length);
      const a0 = top.start * n, a1 = (top.start + top.count) * n;
      out.set(src.subarray(a0, a1), 0);
      out.set(src.subarray(0, a0), a1 - a0);
      out.set(src.subarray(a1), a1 - a0 + a0);
      geo.setAttribute(name, new THREE.BufferAttribute(out, n, attr.normalized));
    }
  }
  geo.clearGroups();
  geo.addGroup(0, top.count, 0);
  geo.addGroup(top.count, total - top.count, 1);
}
