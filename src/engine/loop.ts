// The render loop: continuous while visible, paused when hidden. dt is clamped
// so a hidden tab or a hitch never produces a jump in idle animations.

export interface Loop {
  start(): void;
  stop(): void;
  readonly running: boolean;
  /** Called when rendering resumes after the tab was hidden. */
  onResume(cb: () => void): void;
}

export function createLoop(tick: (dt: number, t: number, frameMs: number) => void): Loop {
  let raf = 0;
  let running = false;
  let wanted = false;
  let last = 0;
  let t = 0;
  const resumeCbs: (() => void)[] = [];

  const frame = (now: number): void => {
    if (!running) return;
    const rawMs = now - last;
    last = now;
    const dt = Math.min(rawMs / 1000, 0.05);
    t += dt;
    tick(dt, t, rawMs);
    raf = requestAnimationFrame(frame);
  };
  const begin = (): void => {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const halt = (): void => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) halt();
    else if (wanted) { begin(); for (const cb of resumeCbs) cb(); }
  });

  return {
    start() { wanted = true; if (!document.hidden) begin(); },
    stop() { wanted = false; halt(); },
    get running() { return running; },
    onResume(cb) { resumeCbs.push(cb); },
  };
}
