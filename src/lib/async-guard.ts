/**
 * Single-flight guard for user-triggered async actions.
 *
 * A second `run()` while the first task is still in flight is dropped rather
 * than queued — used by the pick flow, where a double tap would otherwise fire
 * two `makePickAction` calls and roll back to stale optimistic state.
 */
export interface InFlightGuard {
  /** True while a task is running. */
  isBusy: () => boolean;
  /** Runs `task` unless one is already in flight; returns `undefined` if dropped. */
  run: <T>(task: () => Promise<T>) => Promise<T | undefined>;
}

export function createInFlightGuard(
  onBusyChange?: (busy: boolean) => void
): InFlightGuard {
  let busy = false;

  const setBusy = (value: boolean) => {
    busy = value;
    onBusyChange?.(value);
  };

  return {
    isBusy: () => busy,
    async run<T>(task: () => Promise<T>): Promise<T | undefined> {
      if (busy) return undefined;
      setBusy(true);
      try {
        return await task();
      } finally {
        setBusy(false);
      }
    },
  };
}
