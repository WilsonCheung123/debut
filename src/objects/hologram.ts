import type { ObjectCtx, TableObject } from './types';
import { placeholder } from './placeholder';

// PLACEHOLDER. The hologram builder replaces this: a black puck with a glass
// lens; a faint cone and a rotating ghost at rest; on focus a bowed 16:9
// plane plays the selected film via hls.js through the additive shader.
// The proxy reaches up so the air above the puck is clickable.
export function createHologram(ctx: ObjectCtx): TableObject {
  return placeholder(ctx, {
    id: 'hologram',
    label: 'Hologram projector',
    size: [0.10, 0.03, 0.10],
    color: 0x2b2b2e,
    proxy: [0.12, 0.26, 0.12],
  });
}
