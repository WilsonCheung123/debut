import * as THREE from 'three';
import type { ObjectCtx, TableObject } from './types';
import { roundedBox, hitProxy, solid } from './helpers';
import { matte } from '../materials';
import { placeholderPanel } from '../panels/placeholder';

export interface PlaceholderSpec {
  id: string;
  label: string;
  /** Footprint w (x), h (y), d (z) in metres. The box sits on the table. */
  size: [number, number, number];
  color: number;
  /** Optional enlarged invisible proxy [w, h, d] (centred on the box). */
  proxy?: [number, number, number];
  hover?: TableObject['hover'];
  /** Extra meshes to add to the group (not hit targets). */
  extras?: THREE.Object3D[];
}

/**
 * A rounded box of the real footprint in a muted colour, with the hover label
 * and a plain panel saying it is being built. Group origin: bottom centre.
 */
export function placeholder(ctx: ObjectCtx, spec: PlaceholderSpec): TableObject {
  const [w, h, d] = spec.size;
  const group = new THREE.Group();
  group.name = spec.id;
  const mesh = solid(new THREE.Mesh(roundedBox(w, h, d, Math.min(0.004, h / 3)), matte(spec.color, 0.78)), spec.id);
  mesh.position.y = h / 2;
  group.add(mesh);
  const hit: THREE.Object3D[] = [mesh];
  if (spec.proxy) {
    const [pw, ph, pd] = spec.proxy;
    const p = hitProxy(pw, ph, pd, `${spec.id}:proxy`);
    p.position.y = ph / 2;
    group.add(p);
    hit.push(p);
  }
  for (const e of spec.extras ?? []) group.add(e);
  return {
    id: spec.id,
    label: spec.label,
    group,
    hit,
    anchor: new THREE.Vector3(0, h, 0),
    hover: spec.hover,
    focus: {
      camera: ctx.focusPose(spec.id),
      panel: placeholderPanel(spec.label),
    },
  };
}
