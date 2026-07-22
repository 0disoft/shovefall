import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:4175";

export default defineConfig({
  testDir: "./e2e",
  outputDir: ".cache/playwright-dist/test-results",
  fullyParallel: false,
  forbidOnly: true,
  grepInvert: /@profile|@dev-only/u,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run preview -- --host 127.0.0.1 --port 4175",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
