import type { ObjectCtx, TableObject } from './types';
import { placeholder } from './placeholder';

// PLACEHOLDER. The jar builder replaces this: a glass jar with folded paper
// slips and a slotted lid; the panel is a crumpled slip that unfolds.
export function createJar(ctx: ObjectCtx): TableObject {
  return placeholder(ctx, {
    id: 'jar',
    label: 'The jar',
    size: [0.09, 0.14, 0.09],
    color: 0x9fb0b4,
  });
}
