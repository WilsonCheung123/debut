import * as THREE from 'three';
import type { ObjectCtx, TableObject } from './types';
import { placeholder } from './placeholder';
import { roundedBox, solid } from './helpers';
import { matte } from '../materials';

// PLACEHOLDER. The guitar builder replaces this: a spring capo (black, rubber
// pad) and a tortoiseshell celluloid pick. One object, one hit set.
export function createGuitar(ctx: ObjectCtx): TableObject {
  const pick = solid(new THREE.Mesh(roundedBox(0.03, 0.0012, 0.026, 0.0005), matte(0x7a4a2a, 0.5)), 'pick');
  pick.position.set(0.07, 0.0006, 0.018);
  pick.rotation.y = 0.5;
  const obj = placeholder(ctx, {
    id: 'guitar',
    label: 'Capo and pick',
    size: [0.085, 0.03, 0.045],
    color: 0x2a2826,
    proxy: [0.16, 0.035, 0.09],
    extras: [pick],
  });
  obj.hit.push(pick);
  return obj;
}
