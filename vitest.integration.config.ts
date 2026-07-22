import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Integration suite — talks to a real local Supabase (`npx supabase start`).
 * Kept out of `vitest.config.ts` so `npm test` stays offline and sub-second.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/globalSetup.ts"],
    // Fixtures share one database; parallel files would race on cleanup.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
