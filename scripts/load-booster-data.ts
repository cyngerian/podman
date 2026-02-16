/**
 * ETL script: loads booster distribution data from taw/magic-sealed-data
 * into Supabase booster_products, booster_configs, booster_config_slots,
 * booster_sheets, and sheet_cards tables.
 *
 * Uses the Supabase Management API to execute raw SQL in bulk,
 * making the load ~100x faster than individual REST API inserts.
 *
 * Usage:
 *   npx tsx scripts/load-booster-data.ts [--clear] [--set <code>] [--sync]
 *
 * Flags:
 *   --sync   Auto-detect and load only new products not yet in the DB
 *   --set    Filter to a single set code
 *   --clear  Wipe existing data before loading (full or per-set)
 *
 * Env vars required:
 *   SUPABASE_PROJECT_REF  (e.g. "mvqdejniqbaiishumezl")
 *   SUPABASE_ACCESS_TOKEN (personal access token from supabase.com/dashboard/account/tokens)
 *
 * Optional env vars (for KV cache invalidation):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */

import { Redis } from "@upstash/redis";
import { esc, executeSql, sleep } from "./supabase-api";

const DATA_URL =
  "https://raw.githubusercontent.com/taw/magic-sealed-data/master/sealed_basic_data.json";

// --- Types for taw JSON format ---

interface TawSheet {
  total_weight: number;
  cards: { [key: string]: number };
}

interface TawBooster {
  weight: number;
  sheets: { [sheetName: string]: number };
}

interface TawProduct {
  name: string;
  code: string;
  set_code: string;
  set_name: string;
  boosters: TawBooster[];
  sheets: { [sheetName: string]: TawSheet };
}

// --- Helpers ---

function parseCardKey(key: string) {
  const parts = key.split(":");
  return {
    set_code: parts[0],
    collector_number: parts[1],
    is_foil: parts.length > 2 && parts[2] === "foil",
  };
}

function parseArgs(): {
  clear: boolean;
  setFilter: string | null;
  sync: boolean;
} {
  const args = process.argv.slice(2);
  let clear = false;
  let setFilter: string | null = null;
  let sync = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--clear") {
      clear = true;
    } else if (args[i] === "--set" && args[i + 1]) {
      setFilter = args[i + 1].toLowerCase();
      i++;
    } else if (args[i] === "--sync") {
      sync = true;
    }
  }

  return { clear, setFilter, sync };
}

/**
 * Query the DB for all existing product codes.
 */
async function fetchExistingProductCodes(
  projectRef: string,
  accessToken: string
): Promise<Set<string>> {
  const result = (await executeSql(
    projectRef,
    accessToken,
    "SELECT code FROM booster_products"
  )) as Array<{ code: string }>;
  return new Set(result.map((row) => row.code));
}

/**
 * Invalidate Upstash Redis KV cache entries for loaded product codes.
 * Gracefully skips if Upstash env vars are not set.
 */
async function invalidateKVCache(productCodes: string[]): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.log(
      "Skipping KV invalidation (UPSTASH_REDIS_REST_URL/TOKEN not set)"
    );
    return;
  }

  const redis = new Redis({ url, token });
  const keys = productCodes.map((code) => `booster:${code}`);

  if (keys.length === 0) return;

  try {
    // DEL accepts multiple keys in one call
    const deleted = await redis.del(...keys);
    console.log(
      `Invalidated ${deleted} KV cache ${deleted === 1 ? "entry" : "entries"}`
    );
  } catch (err) {
    console.warn(
      `KV invalidation failed: ${(err as Error).message.slice(0, 200)}`
    );
  }
}

/**
 * Generate SQL for a single product and all its children.
 * Uses a DO block with variables so sheet IDs can be referenced by config slots.
 */
function generateProductSQL(product: TawProduct): string {
  const lines: string[] = [];
  const sheetNames = Object.keys(product.sheets);

  lines.push("DO $$");
  lines.push("DECLARE");
  lines.push("  v_pid integer;");
  sheetNames.forEach((_, i) => lines.push(`  v_s${i} integer;`));
  product.boosters.forEach((_, i) => lines.push(`  v_c${i} integer;`));
  lines.push("BEGIN");

  // Product
  lines.push(
    `  INSERT INTO booster_products (code, set_code, set_name, name) VALUES ('${esc(product.code)}', '${esc(product.set_code)}', '${esc(product.set_name)}', '${esc(product.name)}') RETURNING id INTO v_pid;`
  );

  // Sheets
  sheetNames.forEach((name, i) => {
    const sheet = product.sheets[name];
    lines.push(
      `  INSERT INTO booster_sheets (product_id, name, total_weight) VALUES (v_pid, '${esc(name)}', ${sheet.total_weight}) RETURNING id INTO v_s${i};`
    );
  });

  // Sheet cards — one bulk INSERT per sheet
  sheetNames.forEach((name, i) => {
    const sheet = product.sheets[name];
    const cards = Object.entries(sheet.cards);
    if (cards.length === 0) return;

    lines.push(
      `  INSERT INTO sheet_cards (sheet_id, set_code, collector_number, weight, is_foil) VALUES`
    );
    const values = cards.map(([key, weight]) => {
      const c = parseCardKey(key);
      return `    (v_s${i}, '${esc(c.set_code)}', '${esc(c.collector_number)}', ${weight}, ${c.is_foil})`;
    });
    lines.push(values.join(",\n") + ";");
  });

  // Configs
  product.boosters.forEach((booster, i) => {
    lines.push(
      `  INSERT INTO booster_configs (product_id, weight) VALUES (v_pid, ${booster.weight}) RETURNING id INTO v_c${i};`
    );

    // Config slots
    const slots = Object.entries(booster.sheets);
    if (slots.length > 0) {
      lines.push(
        `  INSERT INTO booster_config_slots (config_id, sheet_id, count) VALUES`
      );
      const slotValues = slots.map(([sheetName, count]) => {
        const sheetIdx = sheetNames.indexOf(sheetName);
        return `    (v_c${i}, v_s${sheetIdx}, ${count})`;
      });
      lines.push(slotValues.join(",\n") + ";");
    }
  });

  lines.push("END $$;");
  return lines.join("\n");
}

// --- Main ---

async function main() {
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (!projectRef || !accessToken) {
    console.error(
      "Missing env vars. Required:\n" +
        "  SUPABASE_PROJECT_REF  (project reference ID)\n" +
        "  SUPABASE_ACCESS_TOKEN (from supabase.com/dashboard/account/tokens)"
    );
    process.exit(1);
  }

  const { clear, setFilter, sync } = parseArgs();

  if (sync && (clear || setFilter)) {
    console.error("--sync cannot be combined with --clear or --set");
    process.exit(1);
  }

  // Download data
  console.log("Downloading booster data...");
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    console.error(`Failed to download data: ${response.status}`);
    process.exit(1);
  }

  const allProducts: TawProduct[] = await response.json();
  console.log(`Downloaded ${allProducts.length} products`);

  // Determine which products to load
  let products: TawProduct[];

  if (sync) {
    // Auto-sync: only load products not already in the DB
    console.log("Checking existing products in DB...");
    const existingCodes = await fetchExistingProductCodes(
      projectRef,
      accessToken
    );
    console.log(`Found ${existingCodes.size} existing products in DB`);

    products = allProducts.filter((p) => !existingCodes.has(p.code));

    if (products.length === 0) {
      console.log(
        `\nAll ${allProducts.length} products up to date. Nothing to load.`
      );
      return;
    }

    const newSetCodes = [...new Set(products.map((p) => p.set_code))];
    console.log(
      `Found ${products.length} new products for ${newSetCodes.length} set(s): ${newSetCodes.join(", ")}`
    );
  } else if (setFilter) {
    products = allProducts.filter(
      (p) => p.set_code.toLowerCase() === setFilter
    );
    console.log(
      `Filtered to ${products.length} products for set "${setFilter}"`
    );
    if (products.length === 0) {
      console.error(`No products found for set code "${setFilter}"`);
      process.exit(1);
    }
  } else {
    products = allProducts;
  }

  // Clear existing data if requested
  if (clear) {
    console.log("Clearing existing booster data...");
    const clearSQL = setFilter
      ? `DELETE FROM booster_products WHERE set_code = '${esc(setFilter)}';`
      : `TRUNCATE booster_products, booster_configs, booster_config_slots, booster_sheets, sheet_cards RESTART IDENTITY CASCADE;`;
    await executeSql(projectRef, accessToken, clearSQL);
    console.log("Cleared.");
  }

  // Generate and execute SQL for each product
  console.log("Loading products...");
  let loaded = 0;
  let errors = 0;
  const loadedCodes: string[] = [];
  const startTime = Date.now();

  for (const product of products) {
    const sql = generateProductSQL(product);

    try {
      await executeSql(projectRef, accessToken, sql);
      loaded++;
      loadedCodes.push(product.code);
    } catch (err) {
      console.error(
        `  Error on ${product.code}: ${(err as Error).message.slice(0, 200)}`
      );
      errors++;
    }

    // Throttle to ~4 req/s to stay under Management API rate limits
    await sleep(250);

    const total = loaded + errors;
    if (total % 25 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ${total}/${products.length} products (${elapsed}s)`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${totalTime}s!`);
  console.log(`  Products loaded: ${loaded}`);
  if (errors > 0) console.log(`  Products failed: ${errors}`);

  // Invalidate KV cache for loaded products
  if (loadedCodes.length > 0) {
    await invalidateKVCache(loadedCodes);
  }

  // Print summary for --sync
  if (sync && loaded > 0) {
    const setCodes = [...new Set(loadedCodes.map((code) => {
      const product = products.find((p) => p.code === code);
      return product?.set_code ?? code;
    }))];
    console.log(
      `\nSynced ${loaded} new products for ${setCodes.length} set(s): ${setCodes.join(", ")}`
    );
  }

  // Exit with error code if any products failed to load
  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
