import type { ObjectCtx, TableObject } from './types';
import { placeholder } from './placeholder';

// PLACEHOLDER. The ID builder replaces this: a credit-card-sized card with
// public/id-card.webp on the front, a designed cream back, satin clear-coat;
// in-focus click flips it (onClickInside), then the bio panel.
export function createIdCard(ctx: ObjectCtx): TableObject {
  return placeholder(ctx, {
    id: 'id-card',
    label: 'Student ID',
    size: [0.0856, 0.0012, 0.054],
    color: 0x8f7a63,
    proxy: [0.11, 0.02, 0.08],
  });
}
