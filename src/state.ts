// Global state. Small on purpose: everything here is read by more than one
// module. Objects and panels read it through ctx; the engine writes it.

export type QualityTier = 'high' | 'low';

export interface MusicState {
  /** True while the music plays (the YouTube player reports it; the visitor sets it when the player is unreachable). */
  isPlaying: boolean;
  /** Pauses the player. Registered by music.ts; the engine calls it for the Austen trick. */
  pause: (() => void) | null;
}

export interface State {
  /** Id of the focused object, or null at rest. */
  focused: string | null;
  /** Id of the hovered object (pointer or keyboard), or null. */
  hovered: string | null;
  music: MusicState;
  reducedMotion: boolean;
  /** Coarse pointer / no hover: taps only, no hover state, no parallax. */
  isTouch: boolean;
  /** Small screen: phone budgets (DPR 1.5, 1024 shadow map, 60 motes). */
  isPhone: boolean;
  portrait: boolean;
  /** 'low' once the quality ladder has switched the jar's transmission off (engine/quality.ts); objects read this. */
  quality: QualityTier;
  /** Where on the quality ladder the engine is (0 = everything on). */
  gfxLevel: number;
  /** True once the first lit frame has been rendered. */
  ready: boolean;
}

const mq = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q) : null);

function detectTouch(): boolean {
  const fine = mq('(pointer: fine)');
  const hover = mq('(hover: hover)');
  if (!fine || !hover) return 'ontouchstart' in window;
  return !(fine.matches && hover.matches);
}

function detectPhone(): boolean {
  const w = Math.min(innerWidth, innerHeight);
  return w <= 520 || (detectTouch() && Math.max(innerWidth, innerHeight) <= 960);
}

export const state: State = {
  focused: null,
  hovered: null,
  music: { isPlaying: false, pause: null },
  reducedMotion: mq('(prefers-reduced-motion: reduce)')?.matches ?? false,
  isTouch: detectTouch(),
  isPhone: detectPhone(),
  portrait: innerHeight > innerWidth,
  quality: 'high',
  gfxLevel: 0,
  ready: false,
};

/** Re-reads the media-dependent flags (called on resize). */
export function refreshMedia(): void {
  state.reducedMotion = mq('(prefers-reduced-motion: reduce)')?.matches ?? false;
  state.isTouch = detectTouch();
  state.portrait = innerHeight > innerWidth;
}

// Test hooks (tools/shot.mjs): ?qa=1 locks the quality tier (headless GPUs
// are slow and would otherwise drop to DPR 1 in every screenshot) and makes
// gsap follow wall-clock time so choreography timings can be asserted;
// ?motion=reduce forces reduced motion; ?touch=1 forces the touch path.
const params = new URLSearchParams(location.search);
export const flags = {
  qa: params.get('qa') === '1',
  lockTier: params.get('qa') === '1' || params.get('tier') === 'high',
  forceReducedMotion: params.get('motion') === 'reduce',
  forceTouch: params.get('touch') === '1',
};
if (flags.forceReducedMotion) state.reducedMotion = true;
if (flags.forceTouch) state.isTouch = true;
