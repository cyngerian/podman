/**
 * Restore production from a backup directory.
 *
 * Reads JSON files from a backup, clears tables in reverse FK order,
 * and inserts data in FK order.
 *
 * Usage:
 *   npm run restore-prod [backup-dir]
 *
 * If no backup-dir is provided, uses the most recent backup in backups/.
 *
 * Env vars required:
 *   SUPABASE_PROJECT_REF   (production project ref)
 *   SUPABASE_ACCESS_TOKEN  (personal access token)
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import {
  executeSql,
  requireEnv,
  esc,
  sleep,
  DATA_TABLES,
  DATA_TABLES_DELETE,
} from "./supabase-api.js";

function findBackupDir(): string {
  const arg = process.argv[2];
  if (arg) {
    if (!existsSync(arg)) {
      console.error(`Backup directory not found: ${arg}`);
      process.exit(1);
    }
    return arg;
  }

  // Find latest backup
  const backupsRoot = join(process.cwd(), "backups");
  if (!existsSync(backupsRoot)) {
    console.error("No backups/ directory found. Run backup-prod first.");
    process.exit(1);
  }

  const dirs = readdirSync(backupsRoot)
    .filter((d) => existsSync(join(backupsRoot, d, "auth_users.json")))
    .sort();

  if (dirs.length === 0) {
    console.error("No valid backups found in backups/");
    process.exit(1);
  }

  return join(backupsRoot, dirs[dirs.length - 1]);
}

function loadJsonFile(dir: string, filename: string): Record<string, unknown>[] {
  const filepath = join(dir, filename);
  if (!existsSync(filepath)) {
    console.log(`  ${filename} not found, skipping`);
    return [];
  }
  return JSON.parse(readFileSync(filepath, "utf8"));
}

function buildInsertSql(
  schema: string,
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

  return `INSERT INTO ${schema}."${table}" (${colList}) VALUES\n${valueSets.join(",\n")}`;
}

async function main() {
  const projectRef = requireEnv("SUPABASE_PROJECT_REF");
  const accessToken = requireEnv("SUPABASE_ACCESS_TOKEN");

  const backupDir = findBackupDir();
  console.log(`Restoring from: ${backupDir}`);
  console.log(`Target project: ${projectRef}\n`);

  // Confirm
  console.log(
    "WARNING: This will DELETE all existing data in the target project\n" +
      "and replace it with the backup. Press Ctrl+C to abort.\n" +
      "Continuing in 5 seconds...\n"
  );
  await sleep(5000);

  // Load backup data
  console.log("Loading backup files...\n");
  const authUsers = loadJsonFile(backupDir, "auth_users.json");
  const tableData = new Map<string, Record<string, unknown>[]>();
  for (const table of DATA_TABLES) {
    tableData.set(table, loadJsonFile(backupDir, `${table}.json`));
  }

  // Clear tables (children first, skip profiles — cascades from auth.users)
  console.log("Clearing tables...\n");
  for (const table of DATA_TABLES_DELETE) {
    if (table === "profiles") continue;
    console.log(`  Clearing ${table}...`);
    await executeSql(projectRef, accessToken, `DELETE FROM public."${table}"`);
    await sleep(250);
  }
  console.log("  Clearing auth.users (cascades to profiles)...");
  await executeSql(projectRef, accessToken, `DELETE FROM auth.users`);
  await sleep(250);

  // Insert data (parents first)
  // auth.users insert triggers handle_new_user which auto-creates profiles.
  // We then UPDATE profiles with the backup data.
  console.log("\nRestoring data...\n");

  if (authUsers.length > 0) {
    console.log(`  auth.users (${authUsers.length} rows)...`);
    const sql = buildInsertSql("auth", "users", authUsers);
    await executeSql(projectRef, accessToken, sql);
    await sleep(250);
  }

  // Update profiles with backup data (trigger already created default rows)
  const profiles = tableData.get("profiles") || [];
  if (profiles.length > 0) {
    console.log(`  profiles (${profiles.length} rows, updating)...`);
    const columns = Object.keys(profiles[0]).filter((c) => c !== "id");
    const setClauses = columns
      .map((c) => `"${c}" = d."${c}"`)
      .join(", ");
    const allCols = ["id", ...columns];
    const colList = allCols.map((c) => `"${c}"`).join(", ");
    const valueSets = profiles.map((row) => {
      const values = allCols.map((col) => {
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
    const typeCasts = allCols.map((col) => {
      const val = profiles[0][col];
      if (typeof val === "boolean") return "::boolean";
      if (typeof val === "number") return "::numeric";
      if (typeof val === "object" && val !== null) return "::jsonb";
      return "::text";
    });
    const castList = allCols.map((c, i) => `"${c}"${typeCasts[i]}`).join(", ");
    await executeSql(
      projectRef,
      accessToken,
      `UPDATE public."profiles" SET ${setClauses}
       FROM (VALUES ${valueSets.join(",\n")}) AS d(${castList})
       WHERE public."profiles"."id" = d."id"`
    );
    await sleep(250);
  }

  // Insert remaining tables (skip profiles, already handled)
  for (const table of DATA_TABLES) {
    if (table === "profiles") continue;
    const rows = tableData.get(table) || [];
    if (rows.length === 0) {
      console.log(`  ${table} (0 rows, skipped)`);
      continue;
    }
    console.log(`  ${table} (${rows.length} rows)...`);
    const sql = buildInsertSql("public", table, rows);
    await executeSql(projectRef, accessToken, sql);
    await sleep(250);
  }

  console.log("\nRestore complete!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
