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
} from "./supabase-api.js";

interface MigrationRow {
  version: string;
}

// --- Step 1: Apply missing migrations ---

async function applyMissingMigrations(
  prodRef: string,
  stagingRef: string,
  accessToken: string
): Promise<number> {
  console.log("Step 1: Checking for missing migrations on staging...\n");

  // Get applied migrations from both environments
  const [prodMigrations, stagingMigrations] = await Promise.all([
    executeSql(
      prodRef,
      accessToken,
      `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`
    ) as Promise<MigrationRow[]>,
    executeSql(
      stagingRef,
      accessToken,
      `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`
    ) as Promise<MigrationRow[]>,
  ]);

  const stagingVersions = new Set(stagingMigrations.map((r) => r.version));

  // Find migrations in prod but not staging (applied via MCP/dashboard)
  const missingFromMcp = prodMigrations.filter(
    (r) => !stagingVersions.has(r.version)
  );

  // Also check local migration files not in staging
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const missingLocalFiles = files.filter((file) => {
    const version = file.replace(/\.sql$/, "");
    return !stagingVersions.has(version);
  });

  if (missingFromMcp.length > 0) {
    console.log(
      `  ${missingFromMcp.length} migration(s) in prod but not staging:\n` +
        missingFromMcp.map((r) => `    - ${r.version}`).join("\n") +
        "\n  These were likely applied via dashboard/MCP. Apply them to staging manually.\n"
    );
  }

  let count = 0;
  for (const file of missingLocalFiles) {
    const version = file.replace(/\.sql$/, "");
    console.log(`  Applying: ${file}`);
    const sql = readFileSync(join(migrationsDir, file), "utf8");

    try {
      await executeSql(stagingRef, accessToken, sql);

      // Record in migration history
      await executeSql(
        stagingRef,
        accessToken,
        `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${esc(version)}')`
      );
      count++;
    } catch (err) {
      console.error(
        `    Failed: ${(err as Error).message.slice(0, 200)}`
      );
      throw err;
    }
    await sleep(500);
  }

  if (count === 0 && missingFromMcp.length === 0) {
    console.log("  All migrations already applied.\n");
  } else if (count > 0) {
    console.log(`  Applied ${count} local migration(s).\n`);
  }

  return count;
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
    `SELECT id, email, encrypted_password, email_confirmed_at,
            raw_user_meta_data, created_at, updated_at, last_sign_in_at,
            role, aud, confirmation_token, recovery_token
     FROM auth.users ORDER BY created_at`
  )) as Record<string, unknown>[];
  data.set("auth_users", authUsers);
  console.log(`    ${authUsers.length} rows`);
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

async function syncDataToStaging(
  stagingRef: string,
  accessToken: string,
  data: Map<string, Record<string, unknown>[]>
) {
  console.log("Step 3: Clearing staging data...\n");

  // Disable the profile auto-create trigger so we can insert auth.users
  // without the trigger creating default profiles
  await executeSql(
    stagingRef,
    accessToken,
    `ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created`
  );

  // Delete in reverse FK order
  for (const table of DATA_TABLES_DELETE) {
    console.log(`  Clearing ${table}...`);
    await executeSql(
      stagingRef,
      accessToken,
      `DELETE FROM public."${table}"`
    );
    await sleep(250);
  }

  // Clear auth.users
  console.log("  Clearing auth.users...");
  await executeSql(
    stagingRef,
    accessToken,
    `DELETE FROM auth.users`
  );
  await sleep(250);

  console.log("\nStep 4: Inserting production data into staging...\n");

  // Insert auth.users first
  const authUsers = data.get("auth_users") || [];
  if (authUsers.length > 0) {
    console.log(`  auth.users (${authUsers.length} rows)...`);
    const columns = Object.keys(authUsers[0]);
    const colList = columns.map((c) => `"${c}"`).join(", ");
    const valueSets = authUsers.map((row) => {
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
    await executeSql(
      stagingRef,
      accessToken,
      `INSERT INTO auth.users (${colList}) VALUES\n${valueSets.join(",\n")}`
    );
    await sleep(250);
  }

  // Insert public tables in FK order
  for (const table of DATA_TABLES) {
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

  // Re-enable the trigger
  await executeSql(
    stagingRef,
    accessToken,
    `ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created`
  );

  console.log();
}

// --- Main ---

async function main() {
  const prodRef = requireEnv("SUPABASE_PROJECT_REF");
  const stagingRef = requireEnv("SUPABASE_STAGING_REF");
  const accessToken = requireEnv("SUPABASE_ACCESS_TOKEN");

  console.log(`Production:  ${prodRef}`);
  console.log(`Staging:     ${stagingRef}\n`);

  await applyMissingMigrations(prodRef, stagingRef, accessToken);
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
