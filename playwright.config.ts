import { defineConfig, devices } from "@playwright/test";
import { ensureSupabaseEnv } from "./tests/integration/helpers/env";

// Fails fast with a useful message if the local stack isn't running, and
// resolves the URL/keys the app under test needs.
ensureSupabaseEnv();

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // A full 3-pack draft is ~42 picks, each a server action round-trip.
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // Deliberately zero: this suite is the flake signal (see docs/testing.md).
  // A retry would hide exactly the intermittency it exists to detect.
  retries: 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production build, not `next dev`: the draft flow leans on Server Actions
    // and `router.refresh()`, and dev-mode recompiles turn every first hit on
    // a route into a multi-second stall that reads as flake.
    command: `npm run build && npx next start --port ${PORT}`,
    url: baseURL,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_TEST_URL!,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.SUPABASE_TEST_PUBLISHABLE_KEY!,
      SUPABASE_SECRET_KEY: process.env.SUPABASE_TEST_SECRET_KEY!,
      NEXT_PUBLIC_SENTRY_DSN: "",
    },
  },
});
