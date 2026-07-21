import { describe, it, expect } from "vitest";
import {
  WAITING_POLL_INTERVAL_MS,
  buildPodMembers,
  cardKey,
  expandCardKeys,
  type DraftPickViewMember,
  type PodProfile,
} from "../draft-view";
import type { CardReference } from "../types";

function card(
  scryfallId: string,
  overrides: Partial<CardReference> = {}
): CardReference {
  return {
    scryfallId,
    name: `Card ${scryfallId}`,
    imageUri: `https://cards.scryfall.io/normal/${scryfallId}.jpg`,
    smallImageUri: `https://cards.scryfall.io/small/${scryfallId}.jpg`,
    rarity: "common",
    colors: [],
    cmc: 1,
    isFoil: false,
    ...overrides,
  };
}

describe("cardKey", () => {
  it("keys on scryfall id + foil, matching public.draft_card_keys", () => {
    expect(cardKey(card("a"))).toBe("a:false");
    expect(cardKey(card("a", { isFoil: true }))).toBe("a:true");
  });

  it("distinguishes foil from non-foil copies of the same card", () => {
    expect(cardKey(card("a"))).not.toBe(cardKey(card("a", { isFoil: true })));
  });
});

describe("expandCardKeys", () => {
  const pool = [card("a"), card("b"), card("c")];

  it("returns null for a deck that has never been built", () => {
    expect(expandCardKeys(pool, null)).toBeNull();
    expect(expandCardKeys(pool, undefined)).toBeNull();
  });

  it("returns an empty array for an explicitly empty deck", () => {
    expect(expandCardKeys(pool, [])).toEqual([]);
  });

  it("expands keys back to the pool's card objects", () => {
    const deck = expandCardKeys(pool, ["c:false", "a:false"]);
    expect(deck).toEqual([pool[2], pool[0]]);
    // Same object identity — no re-serialized copies
    expect(deck![0]).toBe(pool[2]);
  });

  it("preserves key order rather than pool order", () => {
    const deck = expandCardKeys(pool, ["b:false", "a:false", "c:false"]);
    expect(deck!.map((c) => c.scryfallId)).toEqual(["b", "a", "c"]);
  });

  it("resolves duplicate copies to distinct pool entries", () => {
    const dupPool = [card("a"), card("a"), card("b")];
    const deck = expandCardKeys(dupPool, ["a:false", "a:false"]);
    expect(deck).toHaveLength(2);
    expect(deck![0]).toBe(dupPool[0]);
    expect(deck![1]).toBe(dupPool[1]);
  });

  it("does not hand out more copies than the pool holds", () => {
    const deck = expandCardKeys([card("a")], ["a:false", "a:false"]);
    expect(deck).toHaveLength(1);
  });

  it("keeps foil and non-foil copies distinct", () => {
    const foilPool = [card("a"), card("a", { isFoil: true })];
    const deck = expandCardKeys(foilPool, ["a:true"]);
    expect(deck).toEqual([foilPool[1]]);
    expect(deck![0].isFoil).toBe(true);
  });

  it("drops keys that no longer match a pool card", () => {
    // The deck builder reconciles against the pool on mount anyway
    expect(expandCardKeys(pool, ["gone:false", "a:false"])).toEqual([pool[0]]);
  });

  it("splits a pool into deck + sideboard without overlap", () => {
    const deck = expandCardKeys(pool, ["a:false", "b:false"])!;
    const sideboard = expandCardKeys(pool, ["c:false"])!;
    expect(deck.concat(sideboard)).toHaveLength(pool.length);
    expect(new Set(deck.concat(sideboard)).size).toBe(pool.length);
  });

  it("tolerates an empty pool", () => {
    expect(expandCardKeys([], ["a:false"])).toEqual([]);
  });
});

describe("buildPodMembers", () => {
  const members: DraftPickViewMember[] = [
    {
      position: 0,
      userId: "user-1",
      displayName: "Alice",
      pickCount: 3,
      isCurrentlyPicking: true,
      queuedPacks: 1,
    },
    {
      position: 1,
      userId: "bot-2",
      displayName: "Bot Bob",
      pickCount: 2,
      isCurrentlyPicking: false,
      queuedPacks: 0,
    },
  ];

  const profiles = new Map<string, PodProfile>([
    ["user-1", { avatarUrl: "https://blob/a.png", favoriteColor: "U" }],
  ]);

  it("joins profiles and flags the current user", () => {
    const pod = buildPodMembers(members, profiles, "user-1");
    expect(pod[0]).toEqual({
      position: 0,
      displayName: "Alice",
      pickCount: 3,
      isCurrentlyPicking: true,
      queuedPacks: 1,
      avatarUrl: "https://blob/a.png",
      favoriteColor: "U",
      isCurrentUser: true,
    });
  });

  it("nulls avatar fields for members without a profile (bots)", () => {
    const pod = buildPodMembers(members, profiles, "user-1");
    expect(pod[1].avatarUrl).toBeNull();
    expect(pod[1].favoriteColor).toBeNull();
    expect(pod[1].isCurrentUser).toBe(false);
  });

  it("marks nobody as the current user when the viewer has no seat", () => {
    const pod = buildPodMembers(members, profiles, "stranger");
    expect(pod.every((m) => !m.isCurrentUser)).toBe(true);
  });

  it("never leaks a userId into the rendered pod status", () => {
    const pod = buildPodMembers(members, profiles, "user-1");
    expect(pod[0]).not.toHaveProperty("userId");
  });
});

describe("WAITING_POLL_INTERVAL_MS", () => {
  it("stays in the 8-10s band the egress budget assumes", () => {
    expect(WAITING_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(8000);
    expect(WAITING_POLL_INTERVAL_MS).toBeLessThanOrEqual(10000);
  });
});
