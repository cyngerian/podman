"use client";

import { useEffect, useRef } from "react";
import { SUCCESS_MESSAGE_DURATION_MS, scheduleDismiss } from "@/lib/auto-dismiss";

/**
 * Clears a transient message after `delayMs` while `active` is true.
 *
 * The callback is held in a ref so an inline arrow (`() => setSuccess(false)`)
 * doesn't restart the timer on every render.
 */
export function useAutoDismiss(
  active: boolean,
  onDismiss: () => void,
  delayMs: number = SUCCESS_MESSAGE_DURATION_MS
) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!active) return;
    return scheduleDismiss(() => onDismissRef.current(), delayMs);
  }, [active, delayMs]);
}
