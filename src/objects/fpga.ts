import type { ObjectCtx, TableObject } from './types';
import { placeholder } from './placeholder';

// PLACEHOLDER. The FPGA builder replaces this: green PCB, chip, headers,
// USB-C, passives, one LED breathing on a 4 s cycle (update()).
export function createFpga(ctx: ObjectCtx): TableObject {
  return placeholder(ctx, {
    id: 'fpga',
    label: 'FPGA board',
    size: [0.10, 0.014, 0.07],
    color: 0x2f5a44,
    proxy: [0.11, 0.03, 0.08],
  });
}
