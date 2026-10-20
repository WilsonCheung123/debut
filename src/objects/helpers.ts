import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HIT_LAYER } from '../engine/picking';

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
