/**
 * ETL script: loads booster distribution data from taw/magic-sealed-data
 * into Supabase booster_products, booster_configs, booster_config_slots,
 * booster_sheets, and sheet_cards tables.
 *
 * Uses the Supabase Management API to execute raw SQL in bulk,
 * making the load ~100x faster than individual REST API inserts.
 *
 * Usage:
 *   npx tsx scripts/load-booster-data.ts [--clear] [--set <code>]
 *
 * Env vars required:
 *   SUPABASE_PROJECT_REF  (e.g. "mvqdejniqbaiishumezl")
 *   SUPABASE_ACCESS_TOKEN (personal access token from supabase.com/dashboard/account/tokens)
 */

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

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

function parseCardKey(key: string) {
  const parts = key.split(":");
  return {
    set_code: parts[0],
    collector_number: parts[1],
    is_foil: parts.length > 2 && parts[2] === "foil",
  };
}

function parseArgs(): { clear: boolean; setFilter: string | null } {
  const args = process.argv.slice(2);
  let clear = false;
  let setFilter: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--clear") {
      clear = true;
    } else if (args[i] === "--set" && args[i + 1]) {
      setFilter = args[i + 1].toLowerCase();
      i++;
    }
  }

  return { clear, setFilter };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Execute raw SQL via Supabase Management API.
 * POST /v1/projects/{ref}/database/query
 * Retries on 429 (rate limit) with exponential backoff.
 */
async function executeSql(
  projectRef: string,
  accessToken: string,
  sql: string
): Promise<unknown> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const resp = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    if (resp.status === 429) {
      const wait = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s, 16s, 32s
      await sleep(wait);
      continue;
    }

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`SQL failed (${resp.status}): ${text.slice(0, 300)}`);
    }

    return resp.json();
  }

  throw new Error("Rate limited after 5 retries");
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

  const { clear, setFilter } = parseArgs();

  // Download data
  console.log("Downloading booster data...");
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    console.error(`Failed to download data: ${response.status}`);
    process.exit(1);
  }

  const allProducts: TawProduct[] = await response.json();
  console.log(`Downloaded ${allProducts.length} products`);

  // Filter if --set provided
  const products = setFilter
    ? allProducts.filter((p) => p.set_code.toLowerCase() === setFilter)
    : allProducts;

  if (setFilter) {
    console.log(
      `Filtered to ${products.length} products for set "${setFilter}"`
    );
    if (products.length === 0) {
      console.error(`No products found for set code "${setFilter}"`);
      process.exit(1);
    }
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
  const startTime = Date.now();

  for (const product of products) {
    const sql = generateProductSQL(product);

    try {
      await executeSql(projectRef, accessToken, sql);
      loaded++;
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
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
