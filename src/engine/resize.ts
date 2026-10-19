/** Debounced resize: applies immediately once, then at most every `ms` while resizing. */
export function watchResize(apply: () => void, ms = 120): () => void {
  let timer = 0;
  const schedule = (): void => {
    clearTimeout(timer);
    timer = window.setTimeout(apply, ms);
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  visualViewport?.addEventListener('resize', schedule);
  apply();
  return () => {
    clearTimeout(timer);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    visualViewport?.removeEventListener('resize', schedule);
  };
}
