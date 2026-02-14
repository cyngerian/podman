# Booster Distribution Data

## Data Source

Pack generation uses distribution data from [taw/magic-sealed-data](https://github.com/taw/magic-sealed-data), a community project that reverse-engineers MTG booster pack collation from Wizards of the Coast's print sheet data.

The dataset covers **561 products** across most draftable sets, including Play Boosters, Draft Boosters, Collector Boosters, and other sealed products. Each product contains the exact per-card weights and pack configuration variants that determine what appears in a real booster pack.

The raw data is downloaded from:
```
https://raw.githubusercontent.com/taw/magic-sealed-data/master/sealed_basic_data.json
```

## Why This Matters

The previous pack generation system used hardcoded templates (`PLAY_BOOSTER_TEMPLATE`, `DRAFT_BOOSTER_TEMPLATE` in `src/lib/pack-generator.ts`) where every card of a given rarity had equal probability. This doesn't match how real MTG packs work:

- **Unequal card weights**: Some mythics appear less frequently than others on the print sheet.
- **Multiple pack configurations**: A single product can have several pack "configs" with different probabilities. For example, a Play Booster might have a 1-in-8 chance of replacing a common slot with a bonus rare.
- **Wildcard/foil slots**: These pull from multiple rarities with specific weight ratios, not simple "70% common / 20% uncommon / 8% rare / 2% mythic" approximations.
- **Special sheets**: "The List" cards, showcase frames, and extended art cards each have their own sheets with tiny weights relative to the main card pool.

## Data Model

Five tables in Supabase store the distribution data. All use serial integer primary keys (internal reference data, not user-facing).

```
booster_products
  ├── booster_configs (weighted pack variants)
  │     └── booster_config_slots (cards-per-sheet per config)
  └── booster_sheets (named card groups)
        └── sheet_cards (individual cards with weights)
```

### booster_products (~561 rows)

One row per booster product type. A set like Murders at Karlov Manor has separate products for its Play Booster (`mkm`), Collector Booster (`mkm-collector`), etc.

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | Internal ID |
| code | text UNIQUE | Product code, e.g. `mkm`, `mkm-collector` |
| set_code | text | MTG set code, e.g. `mkm` |
| set_name | text | Full set name |
| name | text | Full product name |

### booster_sheets (~3,254 rows)

Named groups of cards within a product. Each sheet has a `total_weight` (the sum of all its card weights) used for weighted random selection.

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | Internal ID |
| product_id | integer FK | References booster_products |
| name | text | Sheet name, e.g. `common`, `rare_mythic`, `foil_uncommon` |
| total_weight | bigint | Sum of all card weights in this sheet |

Common sheet names: `common`, `uncommon`, `rare`, `mythic`, `rare_mythic`, `foil_common`, `foil_rare_mythic`, `basic`, `dedicated_foil`, `the_list`.

### sheet_cards (~214,954 rows)

Individual cards on each sheet, identified by `set_code` + `collector_number` (bridged to Scryfall IDs at pack generation time).

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | Internal ID |
| sheet_id | integer FK | References booster_sheets |
| set_code | text | MTG set code |
| collector_number | text | Collector number, e.g. `42`, `42a` |
| weight | bigint | Relative weight within the sheet |
| is_foil | boolean | Whether this entry is foil |

**Why weights are bigint**: Some sheets combine cards from multiple rarities with very different frequencies. To represent exact probability ratios without floating point, weights use the least common multiple of the various denominators. This can produce values like `177,008,370,000,000` for a single card weight on complex sheets.

### booster_configs (~2,379 rows)

Weighted pack configurations. A product can have multiple configs — for example, a standard pack most of the time, but occasionally a variant with a bonus rare replacing a common.

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | Internal ID |
| product_id | integer FK | References booster_products |
| weight | integer | Relative probability of this config |

### booster_config_slots (~9,548 rows)

How many cards are drawn from each sheet for a given config.

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | Internal ID |
| config_id | integer FK | References booster_configs |
| sheet_id | integer FK | References booster_sheets |
| count | integer | Number of cards drawn from this sheet |

## Pack Generation Algorithm

When generating a pack from sheet data:

1. **Select a config**: Weighted random selection from the product's configs.
2. **For each slot in the config**: Draw `count` cards from the named sheet using weighted random selection (roll 0..total_weight, walk cards accumulating weight). No replacement within a single pack.
3. **Bridge to Scryfall**: Each card's `set_code:collector_number` is looked up via the Scryfall `/cards/collection` API to get the full `CardReference` (image URIs, name, rarity, colors, etc.).
4. **Foil handling**: If a sheet_card entry has `is_foil = true`, the resulting `CardReference` gets `isFoil: true`.

### Fallback

If a set isn't in the booster distribution database, pack generation falls back to the template-based system (`pack-generator.ts`) which fetches all booster-legal cards from Scryfall and distributes them by rarity using hardcoded templates.

Product code lookup order: `{set}-play` > `{set}-draft` > `{set}` (prefers Play Booster for modern sets, Draft Booster for legacy sets).

## ETL Process

The ETL script at `scripts/load-booster-data.ts` loads data from the taw repository into Supabase.

### Usage

```bash
# Set required env vars
export SUPABASE_PROJECT_REF="mvqdejniqbaiishumezl"  # or staging ref
export SUPABASE_ACCESS_TOKEN="sbp_..."               # from supabase.com/dashboard/account/tokens

# Full load (clear + reload all products)
npx tsx scripts/load-booster-data.ts --clear

# Load a single set
npx tsx scripts/load-booster-data.ts --clear --set mkm
```

### How It Works

1. Downloads `sealed_basic_data.json` (~30MB) from GitHub
2. For each product, generates a SQL `DO $$` block that inserts the product, its sheets, sheet cards, configs, and config slots in a single transaction
3. Sends each block via the Supabase Management API (`POST /v1/projects/{ref}/database/query`)
4. Throttles to ~4 requests/second with exponential backoff retry on rate limits (HTTP 429)

### Performance

- Full load: ~8.5 minutes for 561 products
- A few products may fail due to rate limiting; re-run with `--set <code>` to retry individual sets
- The `--clear` flag without `--set` truncates all 5 tables; with `--set`, it only deletes that set's product

### Migration

The table schema is defined in `supabase/migrations/20260214_009_booster_distribution_tables.sql`. RLS policies allow authenticated users read-only access; writes are done via the Management API (which bypasses RLS).

## Key Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260214_009_booster_distribution_tables.sql` | Table schema + RLS policies |
| `scripts/load-booster-data.ts` | ETL script |
| `src/lib/booster-data.ts` | Query booster tables from app code |
| `src/lib/sheet-pack-generator.ts` | Weighted random pack generation |
| `src/lib/generate-packs.ts` | Orchestration (sheet-based with fallback) |
| `src/lib/pack-generator.ts` | Template-based fallback system |
