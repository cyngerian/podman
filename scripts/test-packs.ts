#!/usr/bin/env tsx
/**
 * Pack Generation Validation Script
 *
 * Validates booster pack generation across all user-relevant products
 * (play, draft, set, collector boosters) for every set with booster data.
 * Phase 1: DB integrity checks (fast, no Scryfall)
 * Phase 2: Scryfall resolution + pack generation tests (slow)
 *
 * Usage:
 *   npm run test-packs                    # all products, both phases
 *   npm run test-packs -- --set fin       # all products for a set
 *   npm run test-packs -- --db-only       # skip Scryfall
 *   npm run test-packs -- --packs 6       # 6 packs instead of 24
 *   npm run test-packs -- --verbose       # show all products in summary
 */

import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import { createAdminClient } from "../src/lib/supabase-admin";
import {
  loadBoosterProductData,
  type BoosterProductData,
} from "../src/lib/booster-data";
import { fetchCardsByCollectorNumber, normalizeForScryfall } from "../src/lib/scryfall";
import { generateSheetPack } from "../src/lib/sheet-pack-generator";
import type { CardReference } from "../src/lib/types";

// --- Types ---

interface Phase1Result {
  setCode: string;
  productCode: string;
  issues: string[];
  configCount: number;
  sheetCount: number;
  cardCount: number;
}

interface Phase2Result {
  setCode: string;
  productCode: string;
  totalIdentifiers: number;
  resolvedCount: number;
  resolveRate: number;
  unresolvedKeys: string[];
  unresolvedPatterns: Map<string, string[]>;
  packsGenerated: number;
  packsExpected: number;
  packIssues: string[];
  elapsedMs: number;
}

type Severity = "pass" | "warn" | "fail";

interface SetResult {
  setCode: string;
  productCode: string;
  severity: Severity;
  phase1: Phase1Result | null;
  phase2: Phase2Result | null;
}

// --- Arg Parsing ---

interface Args {
  set: string | null;
  dbOnly: boolean;
  packs: number;
  verbose: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = {
    set: null,
    dbOnly: false,
    packs: 24,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--set":
        result.set = args[++i]?.toLowerCase() ?? null;
        break;
      case "--db-only":
        result.dbOnly = true;
        break;
      case "--packs":
        result.packs = parseInt(args[++i], 10) || 24;
        break;
      case "--verbose":
        result.verbose = true;
        break;
      default:
        console.error(chalk.red(`Unknown argument: ${args[i]}`));
        process.exit(1);
    }
  }

  return result;
}

// --- Phase 1: DB Integrity ---

function checkPhase1(data: BoosterProductData): Phase1Result {
  const issues: string[] = [];

  // Check configs
  if (data.configs.length === 0) {
    issues.push("No configs found");
  }

  for (const config of data.configs) {
    if (config.slots.length === 0) {
      issues.push(`Config ${config.id} has 0 slots`);
    }

    // Check slot references
    for (const slot of config.slots) {
      if (!data.sheets.has(slot.sheet_id)) {
        issues.push(
          `Config ${config.id} slot references missing sheet ${slot.sheet_id}`
        );
      }
    }
  }

  // Check weight consistency per sheet
  for (const [sheetId, sheet] of data.sheets) {
    const computedWeight = sheet.cards.reduce((sum, c) => sum + c.weight, 0);
    if (computedWeight !== sheet.total_weight) {
      issues.push(
        `Sheet "${sheet.name}" (${sheetId}): weight mismatch — stored: ${sheet.total_weight}, computed: ${computedWeight}`
      );
    }
  }

  // Check for orphan sheets (not referenced by any slot)
  const referencedSheets = new Set<number>();
  for (const config of data.configs) {
    for (const slot of config.slots) {
      referencedSheets.add(slot.sheet_id);
    }
  }
  for (const [sheetId, sheet] of data.sheets) {
    if (!referencedSheets.has(sheetId)) {
      issues.push(`Sheet "${sheet.name}" (${sheetId}) not referenced by any config slot`);
    }
  }

  return {
    setCode: data.setCode,
    productCode: data.code,
    issues,
    configCount: data.configs.length,
    sheetCount: data.sheets.size,
    cardCount: data.allCardIdentifiers.length,
  };
}

// --- Phase 2: Scryfall + Pack Gen ---

async function checkPhase2(
  data: BoosterProductData,
  packCount: number
): Promise<Phase2Result> {
  const start = Date.now();

  // Fetch cards from Scryfall
  const cardMap = await fetchCardsByCollectorNumber(data.allCardIdentifiers);

  // Check resolution rate
  const totalIdentifiers = data.allCardIdentifiers.length;
  const resolvedKeys = new Set<string>();
  const unresolvedKeys: string[] = [];

  for (const id of data.allCardIdentifiers) {
    const key = `${id.set}:${id.collector_number}`;
    if (cardMap.has(key)) {
      resolvedKeys.add(key);
    } else {
      unresolvedKeys.push(key);
    }
  }

  const resolvedCount = resolvedKeys.size;
  const resolveRate = totalIdentifiers > 0 ? resolvedCount / totalIdentifiers : 1;

  // Analyze unresolved patterns
  const unresolvedPatterns = analyzeUnresolved(unresolvedKeys, data);

  // Check sheet coverage — every non-empty sheet should have at least 1 resolved card
  const packIssues: string[] = [];
  for (const [, sheet] of data.sheets) {
    if (sheet.cards.length === 0) continue;
    const hasResolved = sheet.cards.some((c) => {
      const key = `${c.set_code}:${c.collector_number}`;
      return cardMap.has(key);
    });
    if (!hasResolved) {
      packIssues.push(`Sheet "${sheet.name}" has 0 resolved cards out of ${sheet.cards.length}`);
    }
  }

  // Generate packs and validate
  let packsGenerated = 0;
  for (let i = 0; i < packCount; i++) {
    const pack = generateSheetPack(data, cardMap);

    if (pack.length === 0) {
      packIssues.push(`Pack ${i + 1} is empty`);
    } else {
      // Check for intra-pack duplicates
      const ids = new Set<string>();
      for (const card of pack) {
        if (ids.has(card.scryfallId)) {
          packIssues.push(
            `Pack ${i + 1} has duplicate: ${card.name} (${card.scryfallId})`
          );
        }
        ids.add(card.scryfallId);
      }
      packsGenerated++;
    }
  }

  const elapsed = Date.now() - start;

  return {
    setCode: data.setCode,
    productCode: data.code,
    totalIdentifiers,
    resolvedCount,
    resolveRate,
    unresolvedKeys,
    unresolvedPatterns,
    packsGenerated,
    packsExpected: packCount,
    packIssues,
    elapsedMs: elapsed,
  };
}

// --- Pattern Analysis ---

function analyzeUnresolved(
  keys: string[],
  data: BoosterProductData
): Map<string, string[]> {
  const patterns = new Map<string, string[]>();

  for (const key of keys) {
    const [setCode, collNum] = key.split(":");
    const pattern = detectPattern(setCode, collNum, data);
    const existing = patterns.get(pattern) ?? [];
    existing.push(key);
    patterns.set(pattern, existing);
  }

  return patterns;
}

function detectPattern(
  setCode: string,
  collNum: string,
  _data: BoosterProductData
): string {
  // Check if it's a List-format card
  if (/^[A-Za-z0-9]+-\d+/.test(collNum)) {
    return "List SET-NUM";
  }
  // Check DFC a/b suffix
  if (/\d+[ab]$/.test(collNum)) {
    return "DFC a/b suffix";
  }
  // Check star suffix
  if (/★$/.test(collNum)) {
    return "Star ★ suffix";
  }
  // Check if normalization changes anything
  const norm = normalizeForScryfall({ set: setCode, collector_number: collNum });
  if (norm.set !== setCode || norm.collector_number !== collNum) {
    return "normalized differently";
  }
  return "unknown";
}

// --- Severity ---

function computeSeverity(p1: Phase1Result | null, p2: Phase2Result | null): Severity {
  // Phase 1 failures
  if (p1 && p1.issues.length > 0) {
    // Weight mismatches and dangling refs are fails
    const hasFail = p1.issues.some(
      (i) => i.includes("missing sheet") || i.includes("0 slots") || i.includes("No configs")
    );
    if (hasFail) return "fail";
  }

  // Phase 2
  if (p2) {
    if (p2.resolveRate < 0.95) return "fail";
    if (p2.packIssues.some((i) => i.includes("empty") || i.includes("0 resolved"))) return "fail";
    if (p2.resolveRate < 1 || p2.unresolvedKeys.length > 0) return "warn";
    if (p2.packIssues.length > 0) return "warn";
  }

  // Phase 1 warnings (weight mismatch, orphan sheets)
  if (p1 && p1.issues.length > 0) return "warn";

  return "pass";
}

// --- Summary ---

function printSummary(results: SetResult[], args: Args, totalElapsed: number) {
  console.log();
  console.log(chalk.bold("=== Summary ==="));
  console.log();

  const table = new Table({
    head: [
      chalk.white("Set"),
      chalk.white("Product"),
      chalk.white("Cards"),
      chalk.white("Resolve"),
      chalk.white("Packs"),
      chalk.white("Issues"),
    ],
    style: { head: [], border: [] },
    colWidths: [8, 18, 8, 10, 10, 30],
  });

  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const r of results) {
    if (r.severity === "pass") passCount++;
    else if (r.severity === "warn") warnCount++;
    else failCount++;

    // Skip passing products unless verbose
    if (r.severity === "pass" && !args.verbose) continue;

    const sevColor =
      r.severity === "fail" ? chalk.red : r.severity === "warn" ? chalk.yellow : chalk.green;
    const setLabel = sevColor(r.setCode);

    const cardCount = r.phase1?.cardCount ?? r.phase2?.totalIdentifiers ?? "-";
    const resolveStr = r.phase2
      ? `${(r.phase2.resolveRate * 100).toFixed(1)}%`
      : "-";
    const resolveColor =
      r.phase2 && r.phase2.resolveRate < 0.95
        ? chalk.red
        : r.phase2 && r.phase2.resolveRate < 1
          ? chalk.yellow
          : chalk.green;

    const packsStr = r.phase2
      ? `${r.phase2.packsGenerated}/${r.phase2.packsExpected}`
      : "-";
    const packsOk = r.phase2 && r.phase2.packsGenerated === r.phase2.packsExpected;
    const packsColor = packsOk ? chalk.green : r.phase2 ? chalk.red : chalk.white;

    // Summarize issues
    const issuesParts: string[] = [];
    if (r.phase1 && r.phase1.issues.length > 0) {
      issuesParts.push(`${r.phase1.issues.length} db`);
    }
    if (r.phase2 && r.phase2.unresolvedKeys.length > 0) {
      issuesParts.push(`${r.phase2.unresolvedKeys.length} unres.`);
    }
    if (r.phase2 && r.phase2.packIssues.length > 0) {
      issuesParts.push(`${r.phase2.packIssues.length} pack`);
    }
    const issuesStr = issuesParts.length > 0 ? issuesParts.join(", ") : chalk.green("OK");

    table.push([
      setLabel,
      r.productCode,
      String(cardCount),
      resolveColor(resolveStr),
      packsColor(packsStr),
      issuesStr,
    ]);
  }

  if (table.length > 0) {
    console.log(table.toString());
    console.log();
  }

  const resultLine = [
    chalk.green(`${passCount} PASS`),
    chalk.yellow(`${warnCount} WARN`),
    chalk.red(`${failCount} FAIL`),
  ].join("  |  ");

  console.log(`Results: ${resultLine}`);
  console.log(`Total time: ${formatDuration(totalElapsed)}`);
  console.log();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// --- Product Filtering ---

const ALLOWED_SUFFIXES = new Set(["", "-play", "-draft", "-set", "-collector"]);

function isUserRelevantProduct(code: string, setCode: string): boolean {
  const suffix = code.startsWith(setCode) ? code.slice(setCode.length) : null;
  return suffix !== null && ALLOWED_SUFFIXES.has(suffix);
}

// --- Main ---

async function main() {
  const args = parseArgs();
  const totalStart = Date.now();

  console.log();
  console.log(chalk.bold("=== Phase 1: Database Integrity ==="));
  console.log();

  // Fetch all products with code + set_code
  const supabase = createAdminClient();
  const spinner = ora("Fetching product data...").start();

  const { data: rawProducts, error: productsError } = await supabase
    .from("booster_products")
    .select("code, set_code")
    .order("set_code")
    .order("code");

  if (productsError || !rawProducts) {
    spinner.fail(`Failed to fetch products: ${productsError?.message}`);
    process.exit(1);
  }

  // Filter to user-relevant product types
  const allProducts = rawProducts.filter((p) => isUserRelevantProduct(p.code, p.set_code));
  const productList = args.set
    ? allProducts.filter((p) => p.set_code === args.set)
    : allProducts;

  if (productList.length === 0) {
    spinner.fail(
      args.set
        ? `No user-relevant products found for set "${args.set}"`
        : "No user-relevant products found in booster_products"
    );
    process.exit(1);
  }

  const uniqueSetCount = new Set(allProducts.map((p) => p.set_code)).size;
  spinner.succeed(`${allProducts.length} products across ${uniqueSetCount} sets${args.set ? `, filtering to: ${args.set}` : ""}`);
  console.log();

  // Load all product data and run Phase 1 checks
  const productDataMap = new Map<string, BoosterProductData>();
  const phase1Results: Phase1Result[] = [];
  let phase1Issues = 0;
  let loadFailures = 0;

  for (let i = 0; i < productList.length; i++) {
    const { code: productCode, set_code: setCode } = productList[i];
    process.stdout.write(
      `\r  [${String(i + 1).padStart(String(productList.length).length)}/${productList.length}] Checking structural integrity...`
    );

    const data = await loadBoosterProductData(setCode, productCode);
    if (!data) {
      loadFailures++;
      continue;
    }

    productDataMap.set(productCode, data);
    const result = checkPhase1(data);
    phase1Results.push(result);
    if (result.issues.length > 0) phase1Issues++;
  }

  // Clear progress line
  process.stdout.write("\r" + " ".repeat(80) + "\r");

  if (loadFailures > 0) {
    console.log(chalk.dim(`  ${loadFailures} products skipped (failed to load)`));
  }

  if (phase1Issues > 0) {
    console.log();
    console.log(`  ${chalk.yellow(`${phase1Issues} products with issues:`)}`);
    for (const r of phase1Results) {
      if (r.issues.length === 0) continue;
      for (const issue of r.issues) {
        console.log(chalk.yellow(`  ! ${r.setCode}`) + chalk.dim(`  ${r.productCode}  — ${issue}`));
      }
    }
  } else {
    console.log(chalk.green(`  All ${phase1Results.length} products passed structural checks`));
  }

  // Build results array (Phase 1 only so far)
  const results: SetResult[] = phase1Results.map((p1) => ({
    setCode: p1.setCode,
    productCode: p1.productCode,
    severity: computeSeverity(p1, null),
    phase1: p1,
    phase2: null,
  }));

  // Phase 2
  if (!args.dbOnly) {
    console.log();
    console.log(chalk.bold("=== Phase 2: Pack Generation ==="));
    console.log();

    const productsToTest = Array.from(productDataMap.entries());
    const estimatedMinutes = Math.ceil(productsToTest.length * 0.5 / 60);
    console.log(
      `  Testing ${productsToTest.length} products (${args.packs} packs each${productsToTest.length > 10 ? `, ~${estimatedMinutes} min estimated` : ""})`
    );
    console.log();

    for (let i = 0; i < productsToTest.length; i++) {
      const [productCode, data] = productsToTest[i];
      const label = productCode.padEnd(16);
      const prefix = `  [${String(i + 1).padStart(String(productsToTest.length).length)}/${productsToTest.length}] ${label}`;
      const productSpinner = ora({
        text: `${prefix} Fetching cards...`,
        prefixText: "",
      }).start();

      let phase2: Phase2Result;
      try {
        // Suppress console.warn from sheet-pack-generator during testing
        const origWarn = console.warn;
        const suppressedWarnings: string[] = [];
        console.warn = (...warnArgs: unknown[]) => {
          const msg = warnArgs.map(String).join(" ");
          if (msg.includes("[sheet-pack-gen]")) {
            suppressedWarnings.push(msg);
          } else {
            origWarn(...warnArgs);
          }
        };

        phase2 = await checkPhase2(data, args.packs);

        console.warn = origWarn;
      } catch (err) {
        productSpinner.fail(
          `${prefix} ${chalk.red("ERROR")}: ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }

      // Format output line
      const resolvePercent = (phase2.resolveRate * 100).toFixed(0);
      const resolveColor =
        phase2.resolveRate < 0.95
          ? chalk.red
          : phase2.resolveRate < 1
            ? chalk.yellow
            : chalk.green;
      const packsOk = phase2.packsGenerated === phase2.packsExpected;
      const packsStr = packsOk
        ? chalk.green(`${phase2.packsGenerated}/${phase2.packsExpected} packs OK`)
        : chalk.red(`${phase2.packsGenerated}/${phase2.packsExpected} packs`);

      const statusIcon = phase2.resolveRate >= 1 && packsOk ? "✓" : "⚠";
      const statusColor = phase2.resolveRate >= 1 && packsOk ? chalk.green : chalk.yellow;

      const elapsed = `(${(phase2.elapsedMs / 1000).toFixed(1)}s)`;

      const line = `${prefix} ${String(phase2.totalIdentifiers).padStart(5)} cards  ${statusColor(statusIcon)} ${resolveColor(`${resolvePercent}%`)}  ${packsStr}  ${chalk.dim(elapsed)}`;

      if (statusIcon === "✓") {
        productSpinner.succeed(line);
      } else {
        productSpinner.warn(line);
      }

      // Show unresolved details
      if (phase2.unresolvedKeys.length > 0) {
        for (const [pattern, keys] of phase2.unresolvedPatterns) {
          const sample = keys.slice(0, 5).join(", ");
          const moreText = keys.length > 5 ? ` ... +${keys.length - 5} more` : "";
          console.log(
            chalk.dim(`            └ ${keys.length} unresolved (${pattern}): ${sample}${moreText}`)
          );
        }
      }

      // Show pack issues
      for (const issue of phase2.packIssues.slice(0, 3)) {
        console.log(chalk.red(`            └ ${issue}`));
      }
      if (phase2.packIssues.length > 3) {
        console.log(chalk.red(`            └ ... +${phase2.packIssues.length - 3} more pack issues`));
      }

      // Update results
      const existingResult = results.find((r) => r.productCode === productCode);
      if (existingResult) {
        existingResult.phase2 = phase2;
        existingResult.severity = computeSeverity(existingResult.phase1, phase2);
      } else {
        results.push({
          setCode: data.setCode,
          productCode,
          severity: computeSeverity(null, phase2),
          phase1: null,
          phase2,
        });
      }
    }
  }

  // Print summary
  const totalElapsed = Date.now() - totalStart;
  printSummary(results, args, totalElapsed);

  // Exit with non-zero if any failures
  const hasFailures = results.some((r) => r.severity === "fail");
  process.exit(hasFailures ? 1 : 0);
}

main().catch((err) => {
  console.error(chalk.red(`Fatal error: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
