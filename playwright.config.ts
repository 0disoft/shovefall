import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./e2e",
  outputDir: ".cache/playwright/test-results",
  fullyParallel: false,
  forbidOnly: true,
  grepInvert: /@profile|@submission-capture/u,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: ".cache/playwright/report" }]],
  use: {
    baseURL,
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run dev -- --host 127.0.0.1 --port 4173",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
