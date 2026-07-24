import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { captureMedia, normalizeCandidateSha } from "../tools/capture-submission";

test("@submission-capture captures a deterministic exact-SHA submission bundle", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const candidateSha = normalizeCandidateSha(process.env.SHOVEFALL_CAPTURE_SHA ?? "");
  const captureDirectory = resolve(".cache", "submission-captures", candidateSha);
  await mkdir(captureDirectory, { recursive: true });

  const manifest = await captureMedia(browser, candidateSha, captureDirectory);
  await writeFile(
    join(captureDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  expect(manifest.candidate.commitSha).toBe(candidateSha);
  expect(manifest.capture.consoleErrors).toEqual([]);
  expect(manifest.capture.pageErrors).toEqual([]);
  expect(manifest.artifacts.menuScreenshot.bytes).toBeGreaterThan(1_000);
  expect(manifest.artifacts.gameplayScreenshot.bytes).toBeGreaterThan(1_000);
  expect(manifest.artifacts.gameplayVideo.bytes).toBeGreaterThan(1_000);
});
