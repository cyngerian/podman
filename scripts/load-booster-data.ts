/**
 * ETL script: loads booster distribution data from taw/magic-sealed-data
 * into Supabase booster_products, booster_configs, booster_config_slots,
 * booster_sheets, and sheet_cards tables.
 *
 * Usage:
 *   npx tsx scripts/load-booster-data.ts [--clear] [--set <code>]
 *
 * Env vars required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY
 */

import { createClient } from "@supabase/supabase-js";

const DATA_URL =
  "https://raw.githubusercontent.com/taw/magic-sealed-data/master/sealed_basic_data.json";

const BATCH_SIZE = 1000;

// --- Types for taw JSON format ---

interface TawCard {
  // basic format: key is "set:number" or "set:number:foil", value is weight
  [key: string]: number;
}

interface TawSheet {
  total_weight: number;
  cards: TawCard;
}

interface TawBooster {
  weight: number;
  sheets: { [sheetName: string]: number }; // sheetName → count
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

function parseCardKey(key: string): {
  set_code: string;
  collector_number: string;
  is_foil: boolean;
} {
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

// --- Main ---

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY env vars"
    );
    process.exit(1);
  }

  const supabase = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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
    if (setFilter) {
      // Delete only products for this set (cascades to children)
      const { error } = await supabase
        .from("booster_products")
        .delete()
        .eq("set_code", setFilter);
      if (error) {
        console.error("Failed to clear set data:", error.message);
        process.exit(1);
      }
    } else {
      // Truncate all tables (delete from parent cascades)
      const { error } = await supabase
        .from("booster_products")
        .delete()
        .neq("id", 0); // delete all rows
      if (error) {
        console.error("Failed to clear data:", error.message);
        process.exit(1);
      }
    }
    console.log("Cleared.");
  }

  // Process each product
  let totalSheetCards = 0;
  let productCount = 0;

  for (const product of products) {
    productCount++;
    if (productCount % 50 === 0 || productCount === products.length) {
      console.log(`Processing product ${productCount}/${products.length}: ${product.code}`);
    }

    // 1. Insert product
    const { data: productRow, error: productErr } = await supabase
      .from("booster_products")
      .insert({
        code: product.code,
        set_code: product.set_code,
        set_name: product.set_name,
        name: product.name,
      })
      .select("id")
      .single();

    if (productErr) {
      console.error(
        `Failed to insert product ${product.code}:`,
        productErr.message
      );
      continue;
    }

    const productId = productRow.id;

    // 2. Insert sheets (need IDs before configs)
    const sheetIdMap: Record<string, number> = {};

    for (const [sheetName, sheet] of Object.entries(product.sheets)) {
      const { data: sheetRow, error: sheetErr } = await supabase
        .from("booster_sheets")
        .insert({
          product_id: productId,
          name: sheetName,
          total_weight: sheet.total_weight,
        })
        .select("id")
        .single();

      if (sheetErr) {
        console.error(
          `Failed to insert sheet ${sheetName} for ${product.code}:`,
          sheetErr.message
        );
        continue;
      }

      sheetIdMap[sheetName] = sheetRow.id;

      // 3. Insert sheet_cards in batches
      const cardEntries = Object.entries(sheet.cards);
      for (let i = 0; i < cardEntries.length; i += BATCH_SIZE) {
        const batch = cardEntries.slice(i, i + BATCH_SIZE).map(([key, weight]) => {
          const parsed = parseCardKey(key);
          return {
            sheet_id: sheetRow.id,
            set_code: parsed.set_code,
            collector_number: parsed.collector_number,
            weight: weight as number,
            is_foil: parsed.is_foil,
          };
        });

        const { error: cardsErr } = await supabase
          .from("sheet_cards")
          .insert(batch);

        if (cardsErr) {
          console.error(
            `Failed to insert cards for sheet ${sheetName} of ${product.code}:`,
            cardsErr.message
          );
        }

        totalSheetCards += batch.length;
      }
    }

    // 4. Insert booster configs
    for (const booster of product.boosters) {
      const { data: configRow, error: configErr } = await supabase
        .from("booster_configs")
        .insert({
          product_id: productId,
          weight: booster.weight,
        })
        .select("id")
        .single();

      if (configErr) {
        console.error(
          `Failed to insert config for ${product.code}:`,
          configErr.message
        );
        continue;
      }

      // 5. Insert config slots
      const slots = Object.entries(booster.sheets).map(
        ([sheetName, count]) => ({
          config_id: configRow.id,
          sheet_id: sheetIdMap[sheetName],
          count: count as number,
        })
      );

      if (slots.some((s) => s.sheet_id === undefined)) {
        const missing = Object.keys(booster.sheets).filter(
          (name) => !sheetIdMap[name]
        );
        console.error(
          `Missing sheet IDs for ${product.code}: ${missing.join(", ")}`
        );
        continue;
      }

      const { error: slotsErr } = await supabase
        .from("booster_config_slots")
        .insert(slots);

      if (slotsErr) {
        console.error(
          `Failed to insert config slots for ${product.code}:`,
          slotsErr.message
        );
      }
    }
  }

  console.log("\nDone!");
  console.log(`  Products loaded: ${productCount}`);
  console.log(`  Sheet cards inserted: ${totalSheetCards}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
