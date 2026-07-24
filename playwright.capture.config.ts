import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "submission-capture.spec.ts",
  outputDir: ".cache/submission-captures/.playwright",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 90_000,
  use: {
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
});
