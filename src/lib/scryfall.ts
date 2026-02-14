// ============================================================================
// Scryfall API Client for podman
// ============================================================================

import type {
  ScryfallCard,
  ScryfallSet,
  ScryfallSetsResponse,
  ScryfallSearchResponse,
  CardReference,
  Rarity,
  ManaColor,
} from "./types";

// --- Constants ---

const SCRYFALL_API_BASE = "https://api.scryfall.com";
const CUBECOBRA_API_BASE = "https://cubecobra.com/cube/api";
const USER_AGENT = "podman/1.0 (contact@podman.app)";
const MIN_REQUEST_INTERVAL_MS = 75;
const MAX_REQUESTS_PER_SECOND = 10;

// --- Rate Limiter ---

/**
 * Simple rate limiter that enforces:
 * - Minimum 75ms between consecutive requests
 * - Maximum 10 requests per second
 */
class RateLimiter {
  private lastRequestTime = 0;
  private requestTimestamps: number[] = [];
  private queue: Array<{
    resolve: (value: void) => void;
    reject: (reason: unknown) => void;
  }> = [];
  private processing = false;

  async acquire(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();

      // Enforce minimum interval between requests
      const timeSinceLast = now - this.lastRequestTime;
      if (timeSinceLast < MIN_REQUEST_INTERVAL_MS) {
        await sleep(MIN_REQUEST_INTERVAL_MS - timeSinceLast);
      }

      // Enforce max requests per second
      const oneSecondAgo = Date.now() - 1000;
      this.requestTimestamps = this.requestTimestamps.filter(
        (t) => t > oneSecondAgo
      );

      if (this.requestTimestamps.length >= MAX_REQUESTS_PER_SECOND) {
        const oldestInWindow = this.requestTimestamps[0];
        const waitTime = oldestInWindow + 1000 - Date.now();
        if (waitTime > 0) {
          await sleep(waitTime);
        }
        // Re-filter after waiting
        this.requestTimestamps = this.requestTimestamps.filter(
          (t) => t > Date.now() - 1000
        );
      }

      const entry = this.queue.shift();
      if (entry) {
        const currentTime = Date.now();
        this.lastRequestTime = currentTime;
        this.requestTimestamps.push(currentTime);
        entry.resolve();
      }
    }

    this.processing = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const rateLimiter = new RateLimiter();

// --- HTTP Helpers ---

/**
 * Make a rate-limited fetch request to Scryfall with the required User-Agent.
 */
async function scryfallFetch(url: string): Promise<Response> {
  await rateLimiter.acquire();

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (response.status === 429) {
    throw new ScryfallError(
      "Rate limit exceeded. Scryfall returned 429 Too Many Requests.",
      429
    );
  }

  if (response.status === 404) {
    throw new ScryfallError(
      `Resource not found: ${url}`,
      404
    );
  }

  if (!response.ok) {
    throw new ScryfallError(
      `Scryfall API error: ${response.status} ${response.statusText} for ${url}`,
      response.status
    );
  }

  return response;
}

// --- Error Class ---

export class ScryfallError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ScryfallError";
    this.statusCode = statusCode;
  }
}

// --- Rarity & Color Mapping ---

const VALID_RARITIES: Set<string> = new Set([
  "common",
  "uncommon",
  "rare",
  "mythic",
]);

function mapRarity(rarity: string): Rarity {
  const normalized = rarity.toLowerCase();
  if (VALID_RARITIES.has(normalized)) {
    return normalized as Rarity;
  }
  // Scryfall uses "special" for some cards; default to rare
  return "rare";
}

const VALID_COLORS: Set<string> = new Set(["W", "U", "B", "R", "G"]);

function mapColors(colors: string[] | undefined | null): ManaColor[] {
  if (!colors) return [];
  return colors.filter((c) => VALID_COLORS.has(c)) as ManaColor[];
}

// --- Image URL Helpers ---

/**
 * Get the appropriate image URL from a CardReference.
 *
 * Images are served from cards.scryfall.io CDN (no rate limit).
 * - Small: 146x204
 * - Normal: 488x680
 */
export function getCardImageUrl(
  card: CardReference,
  size: "small" | "normal"
): string {
  if (size === "small") {
    return card.smallImageUri;
  }
  return card.imageUri;
}

// --- Card Conversion ---

/**
 * Extract image URIs from a ScryfallCard, handling both single-faced
 * and double-faced cards (DFCs).
 */
function extractImageUris(card: ScryfallCard): {
  large: string;
  normal: string;
  small: string;
  backLarge?: string;
  backNormal?: string;
  backSmall?: string;
} {
  if (card.image_uris) {
    return {
      large: card.image_uris.large,
      normal: card.image_uris.normal,
      small: card.image_uris.small,
    };
  }

  // Double-faced cards store images on card_faces
  if (card.card_faces && card.card_faces.length > 0) {
    const frontFace = card.card_faces[0];
    const backFace = card.card_faces[1];
    const front = frontFace?.image_uris;
    const back = backFace?.image_uris;

    if (front) {
      return {
        large: front.large ?? front.normal,
        normal: front.normal,
        small: front.small,
        ...(back ? {
          backLarge: back.large ?? back.normal,
          backNormal: back.normal,
          backSmall: back.small,
        } : {}),
      };
    }
  }

  // Fallback — should not happen for booster cards
  return {
    large: "",
    normal: "",
    small: "",
  };
}

/**
 * Convert a ScryfallCard to a CardReference for use in the draft system.
 */
export function scryfallCardToReference(
  card: ScryfallCard,
  isFoil: boolean = false
): CardReference {
  const images = extractImageUris(card);

  return {
    scryfallId: card.id,
    name: card.name,
    imageUri: images.large,
    smallImageUri: images.normal,
    rarity: mapRarity(card.rarity),
    colors: mapColors(card.colors),
    cmc: card.cmc ?? 0,
    typeLine: card.type_line,
    isFoil,
    ...(images.backLarge ? { backImageUri: images.backLarge } : {}),
    ...(images.backNormal ? { backSmallImageUri: images.backNormal } : {}),
  };
}

// --- Core API Functions ---

/**
 * Fetch all booster-legal cards for a given set code.
 * Handles Scryfall pagination automatically.
 */
export async function fetchBoosterCards(
  setCode: string
): Promise<ScryfallCard[]> {
  const code = encodeURIComponent(setCode.toLowerCase());
  let url: string | null =
    `${SCRYFALL_API_BASE}/cards/search?q=set:${code}+is:booster`;

  const allCards: ScryfallCard[] = [];

  while (url) {
    let response: Response;
    try {
      response = await scryfallFetch(url);
    } catch (error) {
      if (error instanceof ScryfallError && error.statusCode === 404) {
        throw new ScryfallError(
          `No booster cards found for set "${setCode}". Verify the set code is correct.`,
          404
        );
      }
      throw error;
    }

    const data: ScryfallSearchResponse = await response.json();
    allCards.push(...data.data);

    url = data.has_more && data.next_page ? data.next_page : null;
  }

  return allCards;
}

/**
 * Search for a single card by exact name.
 * Returns null if no card is found (404).
 */
export async function searchCardByName(
  name: string
): Promise<ScryfallCard | null> {
  const encodedName = encodeURIComponent(name);
  const url = `${SCRYFALL_API_BASE}/cards/named?exact=${encodedName}`;

  try {
    const response = await scryfallFetch(url);
    const card: ScryfallCard = await response.json();
    return card;
  } catch (error) {
    if (error instanceof ScryfallError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Check if a card is a basic land (Plains, Island, Swamp, Mountain, Forest,
 * Wastes, or Snow-Covered variants).
 */
function isBasicLand(card: ScryfallCard): boolean {
  return card.type_line?.startsWith("Basic Land") ?? false;
}

/**
 * Group an array of ScryfallCards by their rarity.
 * Basic lands are separated into a dedicated "land" array so they
 * don't pollute the common pool and only appear in land slots.
 */
export function groupCardsByRarity(
  cards: ScryfallCard[]
): Record<Rarity, ScryfallCard[]> & { land: ScryfallCard[] } {
  const grouped: Record<Rarity, ScryfallCard[]> & { land: ScryfallCard[] } = {
    common: [],
    uncommon: [],
    rare: [],
    mythic: [],
    land: [],
  };

  for (const card of cards) {
    if (isBasicLand(card)) {
      grouped.land.push(card);
    } else {
      const rarity = mapRarity(card.rarity);
      grouped[rarity].push(card);
    }
  }

  return grouped;
}

// --- Set Info ---

/**
 * Fetch metadata for a single set by code.
 */
export async function fetchSetInfo(setCode: string): Promise<ScryfallSet> {
  const code = encodeURIComponent(setCode.toLowerCase());
  const response = await scryfallFetch(`${SCRYFALL_API_BASE}/sets/${code}`);
  return response.json();
}

/**
 * Determine pack era based on set release date.
 * Sets released on or after March of the Machine (2023-04-21) use play_booster.
 * Older sets use draft_booster.
 */
const PLAY_BOOSTER_CUTOFF = "2023-04-21";

export function getPackEra(releasedAt: string): "play_booster" | "draft_booster" {
  return releasedAt >= PLAY_BOOSTER_CUTOFF ? "play_booster" : "draft_booster";
}

// --- Set List ---

const DRAFTABLE_SET_TYPES = new Set([
  "core",
  "expansion",
  "draft_innovation",
  "masters",
]);

/**
 * Fetch all draftable sets from Scryfall.
 * Filters to sets that have physical boosters and are a draftable type.
 * Returns newest sets first.
 */
export async function fetchDraftableSets(): Promise<ScryfallSet[]> {
  const response = await scryfallFetch(`${SCRYFALL_API_BASE}/sets`);
  const data: ScryfallSetsResponse = await response.json();

  const today = new Date().toISOString().slice(0, 10);

  return data.data
    .filter(
      (s) =>
        DRAFTABLE_SET_TYPES.has(s.set_type) &&
        !s.digital &&
        s.released_at <= today
    )
    .sort((a, b) => b.released_at.localeCompare(a.released_at));
}

// --- Card Hydration ---

/**
 * Hydrate missing typeLine on CardReferences using Scryfall's collection endpoint.
 * Only calls Scryfall if any cards are missing typeLine. Handles up to 75 cards
 * per request (Scryfall limit). Returns cards with typeLine filled in.
 */
export async function hydrateCardTypeLines(
  cards: CardReference[]
): Promise<CardReference[]> {
  const missing = cards.filter((c) => !c.typeLine && !c.scryfallId.startsWith("cube-"));
  if (missing.length === 0) return cards;

  const identifiers = missing.map((c) => ({ id: c.scryfallId }));

  // Scryfall collection endpoint: POST, up to 75 identifiers per request
  await rateLimiter.acquire();
  let data: ScryfallCard[] = [];
  try {
    const response = await fetch(`${SCRYFALL_API_BASE}/cards/collection`, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ identifiers }),
    });

    if (response.ok) {
      const json = await response.json();
      data = json.data ?? [];
    }
  } catch {
    // Non-critical — just return cards without hydration
    return cards;
  }

  // Build lookup map: scryfallId → type_line
  const typeMap = new Map<string, string>();
  for (const card of data) {
    if (card.type_line) typeMap.set(card.id, card.type_line);
  }

  return cards.map((c) => {
    if (c.typeLine) return c;
    const tl = typeMap.get(c.scryfallId);
    return tl ? { ...c, typeLine: tl } : c;
  });
}

// --- Collection Fetch by Collector Number ---

/**
 * Fetch cards from Scryfall by set_code + collector_number pairs.
 * Returns a Map keyed by "set:collector_number" → CardReference.
 * Used to bridge booster distribution data (which uses collector numbers)
 * to the CardReference format used by the draft system.
 */
export async function fetchCardsByCollectorNumber(
  identifiers: Array<{ set: string; collector_number: string }>
): Promise<Map<string, CardReference>> {
  // Deduplicate
  const uniqueMap = new Map<string, { set: string; collector_number: string }>();
  for (const id of identifiers) {
    const key = `${id.set}:${id.collector_number}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, id);
    }
  }
  const unique = Array.from(uniqueMap.values());

  const result = new Map<string, CardReference>();
  if (unique.length === 0) return result;

  // Batch into groups of 75 (Scryfall collection limit)
  const BATCH_SIZE = 75;
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);

    await rateLimiter.acquire();
    try {
      const response = await fetch(`${SCRYFALL_API_BASE}/cards/collection`, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          identifiers: batch.map((id) => ({
            set: id.set,
            collector_number: id.collector_number,
          })),
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const cards: ScryfallCard[] = json.data ?? [];
        for (const card of cards) {
          if (card.collector_number) {
            const key = `${card.set}:${card.collector_number}`;
            result.set(key, scryfallCardToReference(card));
          }
        }
      }
    } catch {
      // Non-critical — cards not found will be skipped during pack generation
    }
  }

  return result;
}

// --- CubeCobra Integration ---

/**
 * Fetch a cube list from CubeCobra.
 * The API returns a plain text list of card names, one per line.
 */
export async function fetchCubeCobraList(
  cubeId: string
): Promise<string[]> {
  const encodedId = encodeURIComponent(cubeId);
  const url = `${CUBECOBRA_API_BASE}/cubelist/${encodedId}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
      },
    });
  } catch (error) {
    throw new ScryfallError(
      `Network error fetching CubeCobra list "${cubeId}": ${error instanceof Error ? error.message : String(error)}`,
      0
    );
  }

  if (response.status === 404) {
    throw new ScryfallError(
      `Cube not found on CubeCobra: "${cubeId}". Verify the cube ID is correct.`,
      404
    );
  }

  if (!response.ok) {
    throw new ScryfallError(
      `CubeCobra API error: ${response.status} ${response.statusText} for cube "${cubeId}"`,
      response.status
    );
  }

  const text = await response.text();
  const cardNames = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return cardNames;
}
