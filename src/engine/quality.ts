import type { QualityTier } from '../state';

/**
 * Quality tier: starts high; drops to low (DPR 1, 1024 shadow map, 60 motes)
 * once, if the mean frame time over 60 consecutive frames exceeds 26 ms.
 * The first 90 frames after start or resume are ignored (shader warm-up).
 */
export class Quality {
  tier: QualityTier = 'high';
  private samples: number[] = [];
  private skip = 90;

  constructor(private readonly onDrop: () => void, private readonly locked = false) {}

  reset(): void {
    this.samples.length = 0;
    this.skip = 90;
  }

  sample(frameMs: number): void {
    if (this.tier === 'low' || this.locked) return;
    if (this.skip > 0) { this.skip--; return; }
    this.samples.push(Math.min(frameMs, 80));
    if (this.samples.length < 60) return;
    const mean = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples.length = 0;
    if (mean > 26) {
      this.tier = 'low';
      this.onDrop();
    }
  }
}
