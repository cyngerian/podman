/**
 * Timing helper for transient success messages.
 *
 * Success banners that never clear read as stale state — the user can't tell
 * whether "Profile updated!" refers to the save they just made or one from
 * five minutes ago. Anything that reports "this worked" should clear itself.
 */

/** How long a success message stays on screen before dismissing itself. */
export const SUCCESS_MESSAGE_DURATION_MS = 2500;

/**
 * Schedules `onExpire` to run after `delayMs`. Returns a cancel function that
 * is safe to call more than once (e.g. from a React effect cleanup that also
 * ran after the timer already fired).
 */
export function scheduleDismiss(
  onExpire: () => void,
  delayMs: number = SUCCESS_MESSAGE_DURATION_MS
): () => void {
  const timer = setTimeout(onExpire, Math.max(0, delayMs));
  let cancelled = false;
  return () => {
    if (cancelled) return;
    cancelled = true;
    clearTimeout(timer);
  };
}
