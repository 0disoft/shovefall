import { expect, test, type CDPSession, type Page } from "@playwright/test";

interface FrameProfile {
  readonly participantCount: number;
  readonly botDifficulty: "hard";
  readonly seed: string;
  readonly frameCount: number;
  readonly p95FrameMilliseconds: number;
  readonly maximumFrameMilliseconds: number;
  readonly framesOver100Milliseconds: number;
  readonly deliveredTicksPerRequestedSimulationSecond: number;
  readonly maximumBacklogTicks: number;
  readonly maximumSimulationRate: number;
  readonly effectiveDpr: number;
}

interface BrowserHeapUsage {
  readonly usedSize: number;
  readonly totalSize: number;
}

const PROFILE_CASES = Object.freeze([
  {
    participantCount: 16,
    preset: "default",
    seed: "0000001000000000",
    seedWords: [16, 0],
    p95Budget: 20,
    tickRateBudget: 55,
  },
  {
    participantCount: 24,
    preset: "crowded",
    seed: "0000001800000000",
    seedWords: [24, 0],
    p95Budget: 20,
    tickRateBudget: 55,
  },
  {
    participantCount: 32,
    preset: "chaos",
    seed: "0000002000000001",
    seedWords: [32, 1],
    p95Budget: 22,
    tickRateBudget: 42,
  },
] as const);

function percentile(values: readonly number[], fraction: number): number {
  const sorted = values.toSorted((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}

async function collectFrameProfile(
  page: Page,
  participantCount: number,
  seed: string,
): Promise<FrameProfile> {
  const startTick = Number(await page.locator("#game-telemetry").getAttribute("data-tick"));
  const result = await page.evaluate(
    (durationMilliseconds) =>
      new Promise<{
        intervals: number[];
        elapsedMilliseconds: number;
        maximumBacklogTicks: number;
        maximumSimulationRate: number;
        requestedSimulationMilliseconds: number;
      }>((resolve) => {
        const intervals: number[] = [];
        const started = performance.now();
        let previous = started;
        let maximumBacklogTicks = 0;
        let maximumSimulationRate = 1;
        let requestedSimulationMilliseconds = 0;

        const sample = (timestamp: number): void => {
          const interval = timestamp - previous;
          intervals.push(interval);
          previous = timestamp;
          const telemetry = document.querySelector<HTMLElement>("#game-telemetry");
          const simulationRate = Number(telemetry?.dataset.simulationRate ?? 1);
          maximumBacklogTicks = Math.max(
            maximumBacklogTicks,
            Number(telemetry?.dataset.backlogTicks ?? 0),
          );
          maximumSimulationRate = Math.max(maximumSimulationRate, simulationRate);
          requestedSimulationMilliseconds += interval * simulationRate;

          if (timestamp - started >= durationMilliseconds) {
            resolve({
              intervals,
              elapsedMilliseconds: timestamp - started,
              maximumBacklogTicks,
              maximumSimulationRate,
              requestedSimulationMilliseconds,
            });
            return;
          }

          requestAnimationFrame(sample);
        };

        requestAnimationFrame(sample);
      }),
    4_000,
  );
  const endTick = Number(await page.locator("#game-telemetry").getAttribute("data-tick"));
  const canvasMetrics = await page.locator("#arena-host canvas").evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Arena canvas is not an HTMLCanvasElement.");
    }

    return { width: canvas.width, clientWidth: canvas.clientWidth };
  });

  return Object.freeze({
    participantCount,
    botDifficulty: "hard",
    seed,
    frameCount: result.intervals.length,
    p95FrameMilliseconds: Math.round(percentile(result.intervals, 0.95) * 1_000) / 1_000,
    maximumFrameMilliseconds: Math.round(Math.max(...result.intervals) * 1_000) / 1_000,
    framesOver100Milliseconds: result.intervals.filter((duration) => duration > 100).length,
    deliveredTicksPerRequestedSimulationSecond:
      Math.round(((endTick - startTick) / (result.requestedSimulationMilliseconds / 1_000)) * 100) /
      100,
    maximumBacklogTicks: result.maximumBacklogTicks,
    maximumSimulationRate: result.maximumSimulationRate,
    effectiveDpr:
      canvasMetrics.clientWidth === 0
        ? 0
        : Math.round((canvasMetrics.width / canvasMetrics.clientWidth) * 100) / 100,
  });
}

async function profileCases(page: Page, index: number, profiles: FrameProfile[]): Promise<void> {
  const profileCase = PROFILE_CASES[index];

  if (profileCase === undefined) {
    return;
  }

  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.locator(`input[name="preset"][value="${profileCase.preset}"]`).check();
  await page.getByLabel("어려움").check();
  await page.locator("#player-count").fill(String(profileCase.participantCount));
  await page.evaluate((seedWords) => {
    (
      window as Window & { shovefallProfileSeedWords?: readonly number[] }
    ).shovefallProfileSeedWords = seedWords;
  }, profileCase.seedWords);
  await page.getByRole("button", { name: "설정 저장" }).click();
  await page.getByRole("button", { name: "게임 시작" }).click();
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active");
  await expect(page.locator("#app")).toHaveAttribute("data-bot-difficulty", "hard");
  const profile = await collectFrameProfile(page, profileCase.participantCount, profileCase.seed);
  profiles.push(profile);
  process.stdout.write(`${JSON.stringify({ kind: "browser-profile-case", profile })}\n`);
  expect(profile.p95FrameMilliseconds).toBeLessThanOrEqual(profileCase.p95Budget);
  expect(profile.deliveredTicksPerRequestedSimulationSecond).toBeGreaterThanOrEqual(
    profileCase.tickRateBudget,
  );
  expect(profile.framesOver100Milliseconds).toBeLessThanOrEqual(1);
  expect(profile.maximumBacklogTicks).toBeLessThanOrEqual(8);
  expect(profile.maximumSimulationRate).toBe(1);
  expect(profile.effectiveDpr).toBeLessThanOrEqual(profileCase.participantCount >= 25 ? 1 : 1.5);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active");
  await page.getByRole("button", { name: "메뉴로" }).click();
  return profileCases(page, index + 1, profiles);
}

async function restartRepeatedly(page: Page, remaining: number): Promise<void> {
  if (remaining === 0) {
    return;
  }

  await page.getByRole("button", { name: "다시 시작" }).click();
  return restartRepeatedly(page, remaining - 1);
}

async function collectHeapUsage(client: CDPSession): Promise<BrowserHeapUsage> {
  await client.send("HeapProfiler.collectGarbage");
  return client.send("Runtime.getHeapUsage");
}

test("@profile measures production 16, 24, and 32 participant browser budgets", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    const originalGetRandomValues = crypto.getRandomValues.bind(crypto);
    Object.defineProperty(crypto, "getRandomValues", {
      configurable: true,
      value: <T extends ArrayBufferView<ArrayBuffer>>(array: T): T => {
        const seedWords = (window as Window & { shovefallProfileSeedWords?: readonly number[] })
          .shovefallProfileSeedWords;

        if (array instanceof Uint32Array && seedWords !== undefined) {
          for (let index = 0; index < array.length; index += 1) {
            array[index] = seedWords[index % seedWords.length] ?? 0;
          }

          return array;
        }

        return originalGetRandomValues(array);
      },
    });
  });
  await page.goto("/");
  const profiles: FrameProfile[] = [];
  await profileCases(page, 0, profiles);

  const client = await context.newCDPSession(page);
  await client.send("HeapProfiler.enable");
  const heapBefore = await collectHeapUsage(client);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByLabel("난장판").check();
  await page.locator("#player-count").fill("32");
  await page.evaluate(() => {
    (
      window as Window & { shovefallProfileSeedWords?: readonly number[] }
    ).shovefallProfileSeedWords = [32, 0];
  });
  await page.getByRole("button", { name: "설정 저장" }).click();
  await page.getByRole("button", { name: "게임 시작" }).click();
  await restartRepeatedly(page, 20);
  const heapAfter = await collectHeapUsage(client);
  const restartHeapDeltaBytes = heapAfter.usedSize - heapBefore.usedSize;

  expect(await page.locator("#arena-host canvas").count()).toBe(1);
  expect(restartHeapDeltaBytes).toBeLessThanOrEqual(15 * 1024 * 1024);
  process.stdout.write(
    `${JSON.stringify(
      {
        kind: "local-production-chrome-profile",
        browser: "Chrome",
        viewport: "1280x720",
        sampleMillisecondsPerCase: 4_000,
        profiles,
        restartCount: 20,
        restartHeapDeltaBytes,
        limitations: [
          "This is one local headless Chrome run, not cross-browser or field evidence.",
          "CDP garbage collection and heap usage are Chromium-specific lab measurements.",
        ],
      },
      null,
      2,
    )}\n`,
  );
});
