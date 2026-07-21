/**
 * Narrow pick-screen read model.
 *
 * The pick page used to pull the whole `drafts.state` JSON (~125-180 KB) on
 * every refresh. `get_draft_pick_view` (see
 * `supabase/migrations/20260721000000_get_draft_pick_view.sql`) instead returns
 * only the viewer's slice, with deck/sideboard compacted to keys into the pool.
 * This module types that payload and expands it back into the props the client
 * components expect.
 */

import type {
  CardReference,
  PacingMode,
  PodMemberStatus,
  TimerPreset,
} from "./types";

/**
 * Fallback poll cadence for the waiting screen in `PickClient`.
 *
 * Realtime is the primary update signal; this poll only covers dropped
 * subscriptions. It used to be 2s, which produced ~5,400 full-state refetches
 * per 6-player draft — the largest single source of Supabase egress.
 */
export const WAITING_POLL_INTERVAL_MS = 8000;

/** One seat's summary — counts only, never another player's cards. */
export interface DraftPickViewMember {
  position: number;
  userId: string;
  displayName: string;
  pickCount: number;
  isCurrentlyPicking: boolean;
  queuedPacks: number;
}

export interface DraftPickViewSeat {
  position: number;
  currentPack: {
    round: number;
    pickNumber: number;
    cards: CardReference[];
  } | null;
  pool: CardReference[];
  /** Keys into `pool`; null when the deck has never been built. */
  deckKeys: string[] | null;
  sideboardKeys: string[] | null;
  packQueueLength: number;
  packReceivedAt: number | null;
}

export interface DraftPickView {
  status: string;
  setCode: string | null;
  setName: string | null;
  startedAt: number | null;
  currentPack: number;
  cardsPerPack: number;
  timerPreset: TimerPreset;
  pacingMode: PacingMode;
  /** Null when the caller has no seat in this draft. */
  seat: DraftPickViewSeat | null;
  podMembers: DraftPickViewMember[];
}

/**
 * Identity of a card *copy* within a pool. Must match the key built by
 * `public.draft_card_keys` in SQL — foil and non-foil copies of the same card
 * share a Scryfall id but are distinct copies.
 */
export function cardKey(card: CardReference): string {
  return `${card.scryfallId}:${card.isFoil ? "true" : "false"}`;
}

/**
 * Re-expand deck/sideboard keys against the pool.
 *
 * Consumes matches so repeated copies of the same card resolve to distinct pool
 * entries. Keys with no remaining match in the pool are dropped — the deck
 * builder already reconciles its saved deck against the pool on mount, so a
 * card that has left the pool would be discarded there anyway.
 */
export function expandCardKeys(
  pool: CardReference[],
  keys: string[] | null | undefined
): CardReference[] | null {
  if (keys == null) return null;

  const byKey = new Map<string, CardReference[]>();
  for (const card of pool) {
    const key = cardKey(card);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(card);
    else byKey.set(key, [card]);
  }

  const out: CardReference[] = [];
  for (const key of keys) {
    const bucket = byKey.get(key);
    const card = bucket?.shift();
    if (card) out.push(card);
  }
  return out;
}

export interface PodProfile {
  avatarUrl: string | null;
  favoriteColor: string | null;
}

/** Build the `PodMemberStatus[]` the pod list renders, joining in profiles. */
export function buildPodMembers(
  members: DraftPickViewMember[],
  profiles: Map<string, PodProfile>,
  currentUserId: string
): PodMemberStatus[] {
  return members.map((m) => {
    const profile = profiles.get(m.userId);
    return {
      position: m.position,
      displayName: m.displayName,
      pickCount: m.pickCount,
      isCurrentlyPicking: m.isCurrentlyPicking,
      queuedPacks: m.queuedPacks,
      avatarUrl: profile?.avatarUrl ?? null,
      favoriteColor: profile?.favoriteColor ?? null,
      isCurrentUser: m.userId === currentUserId,
    };
  });
}
