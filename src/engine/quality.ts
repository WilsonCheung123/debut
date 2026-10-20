// Resolution and quality policy (SPEC 0.2, overriding SPEC 6).
//
// Desktop renders at the device pixel ratio up to 2. When frames are slow
// (mean over 60 frames above `SLOW_MS`, after a 90-frame settle), the ladder
// gives up quality in this order, one step at a time, re-measuring after each:
//   1. dust 200 → 60
//   2. the jar's transmission (state.quality becomes 'low', which the jar reads)
//   3. shadow map 4096 → 2048
//   4. DPR down to the floor: 1.5 on a capable GPU (never lower), 1 on software GL
//   5. shadow map → 1024 (last; only reached on software GL / phones)
// The owner's Intel iGPU at DPR 2 used to trip the single 26 ms check and go
// straight to DPR 1 (the "coarse paper"): resolution is now the last thing
// to go, and it stops at 1.5.

export interface GfxSettings {
  dpr: number;
  dust: number;
  transmission: boolean;
  shadowMap: number;
}

export interface QualityEnv {
  isPhone: boolean;
  /** The renderer is a software rasteriser (SwiftShader, llvmpipe): resolution may go to 1 and the ladder starts lower. */
  software: boolean;
  /** `?qa=1` / `?tier=high`: never step down (headless screenshots must be at full quality). */
  locked: boolean;
}

const SLOW_MS = 30;     // mean frame time that triggers the next step (33 ms = 30 fps; 26 was tripping on a healthy iGPU)
const WINDOW = 60;      // frames per measurement
const SETTLE = 90;      // frames ignored after start/resume/each step (shader warm-up, target reallocation)

export class Quality {
  /** 0 = everything on. Higher = further down the ladder. */
  level = 0;
  readonly maxLevel: number;
  private samples: number[] = [];
  private skip = SETTLE;

  constructor(private readonly env: QualityEnv, private readonly onChange: (s: GfxSettings, level: number) => void) {
    this.maxLevel = env.isPhone ? 3 : 5;
  }

  /** The settings for a level (the device pixel ratio is read live: a window dragged between screens changes it). */
  settings(level = this.level): GfxSettings {
    const { isPhone, software } = this.env;
    const device = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    if (isPhone) {
      // phones: 1.5, 60 motes, 1024 map from the start; then transmission, then DPR 1
      return { dpr: level >= 3 ? 1 : Math.min(device, 1.5), dust: 60, transmission: level < 2, shadowMap: 1024 };
    }
    const full = Math.min(device, 2);
    const floor = software ? 1 : Math.min(full, 1.5);
    return {
      dpr: level >= 4 ? floor : full,
      dust: level >= 1 ? 60 : 200,
      transmission: level < 2,
      // software GL (headless QA) starts at 2048: a 4096 pass there costs seconds, and it is for correctness only
      shadowMap: level >= 5 ? 1024 : level >= 3 || software ? 2048 : 4096,
    };
  }

  /** Forget the measurement window (after the tab was hidden, or a resize). */
  reset(): void {
    this.samples.length = 0;
    this.skip = SETTLE;
  }

  sample(frameMs: number): void {
    if (this.env.locked || this.level >= this.maxLevel) return;
    if (this.skip > 0) { this.skip--; return; }
    this.samples.push(Math.min(frameMs, 80)); // a hitch (texture upload, GC) is not a slow GPU
    if (this.samples.length < WINDOW) return;
    const mean = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples.length = 0;
    if (mean > SLOW_MS) this.step();
  }

  /** One step down the ladder (also the `__table.gfx.step()` test hook). */
  step(): void {
    if (this.level >= this.maxLevel) return;
    let next = this.level + 1;
    // a step that changes nothing (DPR already at the floor) is skipped
    while (next < this.maxLevel && sameSettings(this.settings(next), this.settings(this.level))) next++;
    this.level = next;
    this.reset();
    this.onChange(this.settings(), this.level);
  }
}

function sameSettings(a: GfxSettings, b: GfxSettings): boolean {
  return a.dpr === b.dpr && a.dust === b.dust && a.transmission === b.transmission && a.shadowMap === b.shadowMap;
}
