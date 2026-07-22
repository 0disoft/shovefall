import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:4174";

export default defineConfig({
  testDir: "./e2e",
  outputDir: ".cache/playwright-scale/test-results",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  reporter: [["list"]],
  use: {
    baseURL,
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: "bun run preview -- --host 127.0.0.1 --port 4174",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
