/**
 * Sync production schema + data to staging.
 *
 * Steps:
 * 1. Apply any missing migrations to staging
 * 2. Export all user/game data from production
 * 3. Clear staging tables (children first)
 * 4. Insert production data into staging (parents first)
 *
 * The handle_new_user trigger auto-creates a profiles row when an auth.users
 * row is inserted. This script disables that trigger during sync, then
 * inserts the actual production profiles data directly.
 *
 * Usage:
 *   npm run sync-staging
 *
 * Env vars required:
 *   SUPABASE_PROJECT_REF      (production project ref)
 *   SUPABASE_STAGING_REF      (staging project ref)
 *   SUPABASE_ACCESS_TOKEN     (personal access token)
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  executeSql,
  requireEnv,
  esc,
  sleep,
  DATA_TABLES,
  DATA_TABLES_DELETE,
  AUTH_GENERATED_COLUMNS,
  AUTH_USERS_COALESCE_SQL,
} from "./supabase-api.js";

interface MigrationRow {
  version: string;
}

// --- Step 1: Apply missing migrations ---

async function applyMissingMigrations(
  stagingRef: string,
  accessToken: string
): Promise<number> {
  console.log("Step 1: Checking for missing migrations on staging...\n");

  // Get applied migrations from staging
  const stagingMigrations = (await executeSql(
    stagingRef,
    accessToken,
    `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`
  )) as MigrationRow[];
  const stagingVersions = new Set(stagingMigrations.map((r) => r.version));

  // Read local migration files
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const missingLocalFiles = files.filter((file) => {
    const version = file.replace(/\.sql$/, "");
    return !stagingVersions.has(version);
  });

  if (missingLocalFiles.length === 0) {
    console.log("  All migrations already applied.\n");
    return 0;
  }

  // Get the latest MCP-applied migration timestamp from staging to detect
  // local files whose schema was already applied under different version strings.
  const latestStaging = stagingMigrations
    .map((r) => r.version.replace(/\D/g, "")) // strip non-digits for comparison
    .sort()
    .pop() || "0";

  let applied = 0;
  let registered = 0;
  for (const file of missingLocalFiles) {
    const version = file.replace(/\.sql$/, "");
    // Extract date prefix (e.g. "20260214" from "20260214_008_group_invite_links")
    const datePrefix = version.replace(/\D/g, "");

    // If this file's date is at or before the latest staging migration,
    // the schema was already applied via MCP — just register the version.
    if (datePrefix <= latestStaging) {
      console.log(`  Registering (already applied): ${file}`);
      await executeSql(
        stagingRef,
        accessToken,
        `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${esc(version)}')`
      );
      registered++;
    } else {
      console.log(`  Applying: ${file}`);
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      try {
        await executeSql(stagingRef, accessToken, sql);
        await executeSql(
          stagingRef,
          accessToken,
          `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${esc(version)}')`
        );
        applied++;
      } catch (err) {
        console.error(
          `    Failed: ${(err as Error).message.slice(0, 200)}`
        );
        throw err;
      }
    }
    await sleep(500);
  }

  if (registered > 0) {
    console.log(`  Registered ${registered} previously-applied migration(s).`);
  }
  if (applied > 0) {
    console.log(`  Applied ${applied} new migration(s).`);
  }
  console.log();

  return applied;
}

// --- Step 2: Export production data ---

async function exportProdData(
  prodRef: string,
  accessToken: string
): Promise<Map<string, Record<string, unknown>[]>> {
  console.log("Step 2: Exporting production data...\n");

  const data = new Map<string, Record<string, unknown>[]>();

  // auth.users
  console.log("  auth.users...");
  const authUsers = (await executeSql(
    prodRef,
    accessToken,
    `SELECT * FROM auth.users ORDER BY created_at`
  )) as Record<string, unknown>[];
  data.set("auth_users", authUsers);
  console.log(`    ${authUsers.length} rows`);
  await sleep(250);

  // auth.identities
  console.log("  auth.identities...");
  const authIdentities = (await executeSql(
    prodRef,
    accessToken,
    `SELECT * FROM auth.identities ORDER BY created_at`
  )) as Record<string, unknown>[];
  data.set("auth_identities", authIdentities);
  console.log(`    ${authIdentities.length} rows`);
  await sleep(250);

  // Public tables
  for (const table of DATA_TABLES) {
    console.log(`  ${table}...`);
    const rows = (await executeSql(
      prodRef,
      accessToken,
      `SELECT * FROM public.${table} ORDER BY 1`
    )) as Record<string, unknown>[];
    data.set(table, rows);
    console.log(`    ${rows.length} rows`);
    await sleep(250);
  }

  console.log();
  return data;
}

// --- Step 3 & 4: Clear staging and insert prod data ---

function buildInsertSql(
  table: string,
  rows: Record<string, unknown>[]
): string {
  if (rows.length === 0) return "";

  const columns = Object.keys(rows[0]);
  const colList = columns.map((c) => `"${c}"`).join(", ");

  const valueSets = rows.map((row) => {
    const values = columns.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) return "NULL";
      if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
      if (typeof val === "number") return String(val);
      if (typeof val === "object")
        return `'${esc(JSON.stringify(val))}'::jsonb`;
      return `'${esc(String(val))}'`;
    });
    return `(${values.join(", ")})`;
  });

  return `INSERT INTO public."${table}" (${colList}) VALUES\n${valueSets.join(",\n")}`;
}

function sqlVal(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return String(val);
  if (typeof val === "object") return `'${esc(JSON.stringify(val))}'::jsonb`;
  return `'${esc(String(val))}'`;
}

function buildUpdateSql(
  table: string,
  rows: Record<string, unknown>[],
  pkColumn: string
): string {
  if (rows.length === 0) return "";

  const columns = Object.keys(rows[0]).filter((c) => c !== pkColumn);
  const allCols = [pkColumn, ...columns];
  const colDefs = allCols.map((c) => `"${c}"`).join(", ");
  const setClauses = columns.map((c) => `"${c}" = d."${c}"`).join(", ");

  // Build individual UPDATE statements to avoid VALUES type-casting issues
  const statements = rows.map((row) => {
    const setValues = columns
      .map((c) => `"${c}" = ${sqlVal(row[c])}`)
      .join(", ");
    return `UPDATE public."${table}" SET ${setValues} WHERE "${pkColumn}" = ${sqlVal(row[pkColumn])}`;
  });

  return statements.join(";\n");
}

async function syncDataToStaging(
  stagingRef: string,
  accessToken: string,
  data: Map<string, Record<string, unknown>[]>
) {
  console.log("Step 3: Clearing staging data...\n");

  // Delete in reverse FK order (skip profiles — will be updated after auth.users insert)
  for (const table of DATA_TABLES_DELETE) {
    if (table === "profiles") continue;
    console.log(`  Clearing ${table}...`);
    await executeSql(
      stagingRef,
      accessToken,
      `DELETE FROM public."${table}"`
    );
    await sleep(250);
  }

  // Clear auth.users (CASCADE deletes profiles too)
  console.log("  Clearing auth.users (cascades to profiles)...");
  await executeSql(
    stagingRef,
    accessToken,
    `DELETE FROM auth.users`
  );
  await sleep(250);

  console.log("\nStep 4: Inserting production data into staging...\n");

  // Insert auth.users — the handle_new_user trigger auto-creates profiles
  const authUsers = data.get("auth_users") || [];
  if (authUsers.length > 0) {
    console.log(`  auth.users (${authUsers.length} rows)...`);
    const skipUserCols = AUTH_GENERATED_COLUMNS["users"] || new Set();
    const columns = Object.keys(authUsers[0]).filter((c) => !skipUserCols.has(c));
    const colList = columns.map((c) => `"${c}"`).join(", ");
    const valueSets = authUsers.map((row) => {
      const values = columns.map((col) => sqlVal(row[col]));
      return `(${values.join(", ")})`;
    });
    await executeSql(
      stagingRef,
      accessToken,
      `INSERT INTO auth.users (${colList}) VALUES\n${valueSets.join(",\n")}`
    );
    // GoTrue expects empty strings, not NULLs, for certain varchar columns
    await executeSql(stagingRef, accessToken, AUTH_USERS_COALESCE_SQL);
    await sleep(250);
  }

  // Insert auth.identities (required for login — maps users to auth providers)
  const authIdentities = data.get("auth_identities") || [];
  if (authIdentities.length > 0) {
    console.log(`  auth.identities (${authIdentities.length} rows)...`);
    const skipCols = AUTH_GENERATED_COLUMNS["identities"] || new Set();
    const identityCols = Object.keys(authIdentities[0]).filter((c) => !skipCols.has(c));
    const identityColList = identityCols.map((c) => `"${c}"`).join(", ");
    const identityValueSets = authIdentities.map((row) => {
      const values = identityCols.map((col) => sqlVal(row[col]));
      return `(${values.join(", ")})`;
    });
    await executeSql(
      stagingRef,
      accessToken,
      `INSERT INTO auth.identities (${identityColList}) VALUES\n${identityValueSets.join(",\n")}`
    );
    await sleep(250);
  }

  // Update profiles with prod data (trigger already created default rows)
  const profiles = data.get("profiles") || [];
  if (profiles.length > 0) {
    console.log(`  profiles (${profiles.length} rows, updating)...`);
    const sql = buildUpdateSql("profiles", profiles, "id");
    await executeSql(stagingRef, accessToken, sql);
    await sleep(250);
  }

  // Insert remaining public tables in FK order (skip profiles, already handled)
  for (const table of DATA_TABLES) {
    if (table === "profiles") continue;
    const rows = data.get(table) || [];
    if (rows.length === 0) {
      console.log(`  ${table} (0 rows, skipped)`);
      continue;
    }

    console.log(`  ${table} (${rows.length} rows)...`);
    const sql = buildInsertSql(table, rows);
    await executeSql(stagingRef, accessToken, sql);
    await sleep(250);
  }

  console.log();
}

// --- Main ---

async function main() {
  const prodRef = requireEnv("SUPABASE_PROJECT_REF");
  const stagingRef = requireEnv("SUPABASE_STAGING_REF");
  const accessToken = requireEnv("SUPABASE_ACCESS_TOKEN");

  console.log(`Production:  ${prodRef}`);
  console.log(`Staging:     ${stagingRef}\n`);

  await applyMissingMigrations(stagingRef, accessToken);
  const data = await exportProdData(prodRef, accessToken);
  await syncDataToStaging(stagingRef, accessToken, data);

  console.log("Sync complete!");
  console.log(
    "\nNote: If staging needs booster data, run:\n" +
      "  SUPABASE_PROJECT_REF=<staging-ref> npm run load-booster-data"
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
