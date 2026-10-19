import type { ObjectCtx, TableObject } from './types';
import { placeholder } from './placeholder';

// PLACEHOLDER. The die-cast builder replaces this: a small aluminium housing
// (ribs, fillets, bosses, cast finish, one machined face) with a 样品 / SAMPLE tag.
export function createDieCast(ctx: ObjectCtx): TableObject {
  return placeholder(ctx, {
    id: 'die-cast',
    label: 'Die-cast part',
    size: [0.09, 0.04, 0.07],
    color: 0x6f7275,
  });
}
