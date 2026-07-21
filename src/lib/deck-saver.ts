import type { BasicLandCounts, CardReference } from "@/lib/types";

export interface DeckSavePayload {
  deck: CardReference[];
  sideboard: CardReference[];
  lands: BasicLandCounts;
}

export interface DeckSaverOptions {
  /** Performs the actual save; rejects on failure. */
  save: (payload: DeckSavePayload) => Promise<void>;
  /** Called with `true` when a save ultimately fails, `false` when one succeeds. */
  onFailedChange: (failed: boolean) => void;
  /** Delay before the single retry attempt. */
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface DeckSaver {
  /** Saves the payload, retrying once before reporting failure. */
  save: (payload: DeckSavePayload) => Promise<void>;
  /** Re-runs the most recent payload (used by the "Retry" control in the notice). */
  retryLast: () => Promise<void>;
  hasPending: () => boolean;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Mid-draft deck auto-save with retry-once semantics.
 *
 * Failures used to be swallowed, so deck edits made while waiting for a pack
 * could silently disappear. Each save gets one retry; if that also fails the
 * caller is told so it can surface a visible notice.
 *
 * Saves are sequenced: a newer save supersedes an older one, so a stale
 * in-flight attempt never clears (or raises) the notice for the current deck.
 */
export function createDeckSaver({
  save,
  onFailedChange,
  retryDelayMs = 1000,
  sleep = defaultSleep,
}: DeckSaverOptions): DeckSaver {
  let seq = 0;
  let lastPayload: DeckSavePayload | null = null;

  async function attempt(payload: DeckSavePayload, mySeq: number) {
    try {
      await save(payload);
    } catch {
      await sleep(retryDelayMs);
      // A newer save has taken over — abandon this retry silently.
      if (mySeq !== seq) return;
      await save(payload);
    }
  }

  async function runSave(payload: DeckSavePayload) {
    lastPayload = payload;
    const mySeq = ++seq;
    try {
      await attempt(payload, mySeq);
      if (mySeq === seq) onFailedChange(false);
    } catch {
      if (mySeq === seq) onFailedChange(true);
    }
  }

  return {
    save: runSave,
    retryLast: async () => {
      if (lastPayload) await runSave(lastPayload);
    },
    hasPending: () => lastPayload !== null,
  };
}
