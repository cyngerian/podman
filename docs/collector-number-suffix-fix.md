# Collector Number Suffix Fix (DFC Cards in Sheet-Based Packs)

## The Problem

Simulated drafts of original Innistrad (ISD) produced zero double-faced cards (DFCs) despite the booster distribution data containing a dedicated `dfc` sheet with 20 cards and a guaranteed 1-per-pack slot.

## Root Cause

The booster distribution data (sourced from MTGJSON and stored in the `sheet_cards` table) uses **face-specific collector numbers** with an `a`/`b` suffix for DFCs:

| Card | `sheet_cards.collector_number` | Scryfall's actual collector_number |
|------|-------------------------------|-----------------------------------|
| Delver of Secrets (front) | `51a` | `51` |
| Insectile Aberration (back) | `51b` | `51` |
| Daybreak Ranger (front) | `176a` | `176` |

Scryfall's `/cards/collection` endpoint does **not** recognize the `a`/`b` suffixed numbers. When `fetchCardsByCollectorNumber` sent `{set: "isd", collector_number: "51a"}`, Scryfall returned it in the `not_found` array.

### The Silent Failure Chain

1. `loadBoosterProductData()` loads sheet data with `51a`-style collector numbers
2. `fetchCardsByCollectorNumber()` sends these to Scryfall -- DFCs come back as `not_found`
3. The returned `cardMap` has no entry for `isd:51a`
4. `generateSheetPack()` draws `{set_code: "isd", collector_number: "51a"}` from the DFC sheet
5. `cardMap.get("isd:51a")` returns `undefined`
6. The `if (!cardRef) continue;` on line 76 of `sheet-pack-generator.ts` silently skips it
7. The DFC slot produces 0 cards instead of 1

No errors, no warnings -- the pack just quietly has one fewer card than it should.

## The Fix

**File**: `src/lib/scryfall.ts` -- `fetchCardsByCollectorNumber()`

Before sending identifiers to Scryfall, strip trailing `a`/`b` suffixes:

```typescript
const stripped = id.collector_number.replace(/[ab]$/, "");
```

When storing results, map back to **both** the normalized key and all original keys:

```typescript
// Scryfall returns collector_number: "51"
// We store under both "isd:51" AND "isd:51a" so the sheet generator finds it
const normalizedKey = `${card.set}:${card.collector_number}`;
result.set(normalizedKey, cardRef);
const originals = normalizedToOriginal.get(normalizedKey) ?? [];
for (const origKey of originals) {
  result.set(origKey, cardRef);
}
```

## Affected Sets

Any set where the booster distribution data uses `a`/`b` suffixed collector numbers for DFCs. Known affected sets include transform-based Innistrad blocks:

- **ISD** (Innistrad) -- confirmed
- **DKA** (Dark Ascension) -- likely
- **SOI** (Shadows over Innistrad) -- likely
- **EMN** (Eldritch Moon) -- likely

Modern DFC sets (MID, VOW) may use different collector number conventions and should be verified.

## Related Fix: DFC Color Identity

A second issue was discovered alongside this: Scryfall's top-level `colors` field is **missing entirely** on older DFCs (ISD era). Colors are only available on each `card_faces[].colors` entry. The fix unions colors from all faces so that DFCs with different-colored faces (e.g., Brutal Cathar: white front / red back) correctly get a multicolor/gold border instead of appearing colorless.

**File**: `src/lib/scryfall.ts` -- `dfcUnionColors()` helper, called from `scryfallCardToReference()`

## Potential Edge Cases to Investigate

These are areas where similar silent failures could exist in the sheet-based pipeline:

1. **Other collector number formats**: Some sets use `/` separators (e.g., `1a/1b`), `*` prefixes (promo stars), or `s` suffixes. Does the booster data contain any of these?
2. **Split cards / Adventure cards**: Do these use suffixed collector numbers in the booster data?
3. **Cards from other sets in a booster**: Some boosters include cards from "The List" or bonus sheets with different set codes. Are those collector numbers formatted consistently?
4. **Back face (`b` suffix) in foil sheets**: The foil sheet might reference `51b` separately. After the fix, this resolves to the same card as `51a` -- is that correct behavior or should the back face be excluded?
5. **Empty packs / short packs**: If multiple cards in a pack fail to resolve, the pack could be significantly short. Consider adding a warning log when `cardMap.get(key)` returns undefined.
6. **`colors` field missing on other card layouts**: Adventure, split, flip, and meld cards may also have face-specific colors. Check if `dfcUnionColors()` handles all layouts correctly.
