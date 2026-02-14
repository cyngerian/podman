"use server";

import { getUser } from "@/lib/supabase-server";
import { generatePacksForSet } from "@/lib/generate-packs";
import { hydrateCardTypeLines } from "@/lib/scryfall";
import type { CardReference } from "@/lib/types";

export async function crackAPackAction(
  setCode: string,
  productCode?: string
): Promise<{ cards: CardReference[] } | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  if (!setCode || typeof setCode !== "string") {
    return { error: "Invalid set code" };
  }

  try {
    const packs = await generatePacksForSet(setCode, 1, 1, {
      productCode,
      keepBasicLands: true,
    });
    if (!packs || packs.length === 0 || packs[0].length === 0) {
      return { error: "Could not generate a pack for this set" };
    }

    const cards = await hydrateCardTypeLines(packs[0]);
    return { cards };
  } catch (e) {
    console.error("crackAPackAction error:", e);
    return { error: "Failed to generate pack" };
  }
}
