import type { ObjectCtx, TableObject } from './types';
import { placeholder } from './placeholder';

// PLACEHOLDER. The puppet builder replaces this: our own wooden marionette on
// a round base, strings to a cross bar on the table, instant camera in the
// left hand, phone in the right; in-focus clicks on puppet / camera / phone.
export function createPuppet(ctx: ObjectCtx): TableObject {
  return placeholder(ctx, {
    id: 'puppet',
    label: 'Puppet',
    size: [0.10, 0.28, 0.10],
    color: 0x9a7a50,
    hover: { lift: 0.012, tilt: 2 },
  });
}
