import type { ObjectCtx, TableObject } from './types';
import { placeholder } from './placeholder';

// PLACEHOLDER. The vinyl builder replaces this: plinth, platter, black record
// with a cream label, tonearm; spins while state.music.isPlaying.
export function createVinyl(ctx: ObjectCtx): TableObject {
  return placeholder(ctx, {
    id: 'vinyl',
    label: 'Turntable',
    size: [0.30, 0.05, 0.24],
    color: 0x3b3230,
    hover: { lift: 0.008, tilt: 1.5 },
  });
}
