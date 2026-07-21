import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    // `tests/` holds the integration + E2E suites, which need a live Supabase
    // and a running app. They have their own runners — see docs/testing.md.
    exclude: ["**/node_modules/**", "**/dist/**", "tests/**"],
  },
});
