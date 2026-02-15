/**
 * Backup production user/game data before deploying.
 *
 * Exports each table as a JSON file in backups/YYYY-MM-DDTHH-MM-SS/.
 * Does NOT back up booster data tables (re-loadable via load-booster-data.ts).
 *
 * Usage:
 *   npm run backup-prod
 *
 * Env vars required:
 *   SUPABASE_PROJECT_REF   (production project ref)
 *   SUPABASE_ACCESS_TOKEN  (personal access token)
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { executeSql, requireEnv, sleep, DATA_TABLES } from "./supabase-api.js";

async function main() {
  const projectRef = requireEnv("SUPABASE_PROJECT_REF");
  const accessToken = requireEnv("SUPABASE_ACCESS_TOKEN");

  // Create backup directory
  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d+Z$/, "");
  const backupDir = join(process.cwd(), "backups", timestamp);
  mkdirSync(backupDir, { recursive: true });

  console.log(`Backing up production data to ${backupDir}/\n`);

  // 1. Backup auth.users
  console.log("  auth.users...");
  const authUsers = await executeSql(
    projectRef,
    accessToken,
    `SELECT * FROM auth.users ORDER BY created_at`
  );
  const authUsersArr = authUsers as Record<string, unknown>[];
  writeFileSync(
    join(backupDir, "auth_users.json"),
    JSON.stringify(authUsersArr, null, 2)
  );
  console.log(`    ${authUsersArr.length} rows`);
  await sleep(250);

  // 2. Backup each public table
  for (const table of DATA_TABLES) {
    console.log(`  ${table}...`);
    const rows = await executeSql(
      projectRef,
      accessToken,
      `SELECT * FROM public.${table} ORDER BY 1`
    );
    const rowsArr = rows as Record<string, unknown>[];
    writeFileSync(
      join(backupDir, `${table}.json`),
      JSON.stringify(rowsArr, null, 2)
    );
    console.log(`    ${rowsArr.length} rows`);
    await sleep(250);
  }

  console.log(`\nBackup complete! ${DATA_TABLES.length + 1} tables saved.`);
  console.log(`Location: ${backupDir}/`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
