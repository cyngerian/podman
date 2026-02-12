import type { BasicLandCounts, CardReference } from "./types";

const LAND_NAMES: Record<string, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};

/** Aggregate an array of cards into a map of name -> count */
function aggregateCards(cards: CardReference[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) {
    counts.set(card.name, (counts.get(card.name) ?? 0) + 1);
  }
  return counts;
}

/** Format aggregated card counts as lines of "N CardName" */
function formatCardLines(counts: Map<string, number>): string[] {
  return Array.from(counts.entries()).map(([name, count]) => `${count} ${name}`);
}

/** Add basic land entries to an aggregated counts map */
function addLands(counts: Map<string, number>, lands: BasicLandCounts): void {
  for (const [color, landName] of Object.entries(LAND_NAMES)) {
    const count = lands[color as keyof BasicLandCounts];
    if (count > 0) {
      counts.set(landName, (counts.get(landName) ?? 0) + count);
    }
  }
}

/**
 * Format a standard decklist with main deck (including basic lands) and sideboard.
 */
export function formatDeckListText(
  deck: CardReference[],
  sideboard: CardReference[],
  lands: BasicLandCounts
): string {
  const mainCounts = aggregateCards(deck);
  addLands(mainCounts, lands);

  const lines: string[] = [];
  lines.push("// Main Deck");
  lines.push(...formatCardLines(mainCounts));

  if (sideboard.length > 0) {
    lines.push("");
    lines.push("// Sideboard");
    lines.push(...formatCardLines(aggregateCards(sideboard)));
  }

  return lines.join("\n");
}

/**
 * Format a flat pool list (no deck/sideboard separation).
 */
export function formatPoolText(pool: CardReference[]): string {
  return formatCardLines(aggregateCards(pool)).join("\n");
}

/**
 * Escape special XML characters in a string.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate a Cockatrice .cod XML deck file.
 */
export function formatCockatriceXml(
  deck: CardReference[],
  sideboard: CardReference[],
  lands: BasicLandCounts
): string {
  const mainCounts = aggregateCards(deck);
  addLands(mainCounts, lands);
  const sideCounts = aggregateCards(sideboard);

  const mainCards = Array.from(mainCounts.entries())
    .map(([name, count]) => `      <card number="${count}" name="${escapeXml(name)}"/>`)
    .join("\n");

  const sideCards = Array.from(sideCounts.entries())
    .map(([name, count]) => `      <card number="${count}" name="${escapeXml(name)}"/>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<cockatrice_deck version="1">
  <deckname>podman Draft</deckname>
  <zone name="main">
${mainCards}
  </zone>
  <zone name="side">
${sideCards}
  </zone>
</cockatrice_deck>`;
}

/**
 * Create a blob URL and trigger a file download in the browser.
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Copy text to the clipboard. Returns true on success, false on failure.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
