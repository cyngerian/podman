"use client";

import { useEffect, useRef } from "react";
import { SUCCESS_MESSAGE_DURATION_MS, scheduleDismiss } from "@/lib/auto-dismiss";

/**
 * Clears a transient message after `delayMs`.
 *
 * Pass the message state itself (a string, a boolean — anything falsy when
 * there's nothing to show) rather than a derived boolean: the timer restarts
 * whenever the value changes, so swapping one message for another gives the
 * new one a full duration instead of the old one's remaining time.
 *
 * The callback is held in a ref so an inline arrow (`() => setSuccess(false)`)
 * doesn't restart the timer on every render.
 */
export function useAutoDismiss(
  value: unknown,
  onDismiss: () => void,
  delayMs: number = SUCCESS_MESSAGE_DURATION_MS
) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!value) return;
    return scheduleDismiss(() => onDismissRef.current(), delayMs);
  }, [value, delayMs]);
}
