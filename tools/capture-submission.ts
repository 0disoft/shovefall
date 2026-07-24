import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type Browser, type BrowserContext, type Page } from "@playwright/test";
import { CONTENT_VERSION, PRODUCT_VERSION, SIMULATION_VERSION } from "../src/simulation/versions";

const CAPTURE_SCHEMA_VERSION = "shovefall.submission-capture/v1";
const CAPTURE_PORT = 4176;
const CAPTURE_ORIGIN = `http://127.0.0.1:${CAPTURE_PORT}`;
const CAPTURE_VIEWPORT = Object.freeze({ width: 1_920, height: 1_080 });
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SERVER_READY_TIMEOUT_MS = 30_000;
const BROWSER_STEP_TIMEOUT_MS = 15_000;

interface CommandResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

interface ArtifactMetadata {
  readonly bytes: number;
  readonly file: string;
  readonly sha256: string;
}

export interface CaptureManifest {
  readonly schemaVersion: typeof CAPTURE_SCHEMA_VERSION;
  readonly candidate: {
    readonly commitSha: string;
    readonly contentVersion: string;
    readonly productVersion: string;
    readonly simulationVersion: string;
    readonly trackedWorktreeClean: true;
  };
  readonly capture: {
    readonly browser: string;
    readonly capturedAt: string;
    readonly consoleErrors: readonly string[];
    readonly consoleWarnings: readonly string[];
    readonly origin: typeof CAPTURE_ORIGIN;
    readonly pageErrors: readonly string[];
    readonly seed: readonly [number, number];
    readonly settings: {
      readonly botDifficulty: "hard";
      readonly collapseSpeed: "normal";
      readonly participantCount: 50;
      readonly startingItems: readonly ["bomb", "grappling-hook"];
      readonly startingWeight: 75;
    };
    readonly viewport: typeof CAPTURE_VIEWPORT;
  };
  readonly artifacts: {
    readonly gameplayScreenshot: ArtifactMetadata;
    readonly gameplayVideo: ArtifactMetadata;
    readonly menuScreenshot: ArtifactMetadata;
  };
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function normalizeCandidateSha(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!SHA_PATTERN.test(normalized)) {
    throw new Error(
      `Candidate SHA must be a full lowercase hexadecimal commit SHA, received: ${value}`,
    );
  }
  return normalized;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

function reportPhase(phase: string): void {
  process.stdout.write(`${JSON.stringify({ phase, at: new Date().toISOString() })}\n`);
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMilliseconds: number,
  label: string,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`${label} exceeded ${timeoutMilliseconds} ms.`)),
      timeoutMilliseconds,
    );
  });
  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

async function runCommand(
  command: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): Promise<CommandResult> {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: environment,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
  const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code) => resolveExit(code ?? -1));
  });
  return {
    exitCode,
    stderr: Buffer.concat(stderrChunks).toString("utf8"),
    stdout: Buffer.concat(stdoutChunks).toString("utf8"),
  };
}

async function requireSuccessfulCommand(
  command: string,
  args: readonly string[],
  label: string,
  environment?: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  const result = await runCommand(command, args, environment);
  if (result.exitCode !== 0) {
    throw new Error(
      `${label} failed with exit code ${result.exitCode}.\n${result.stderr || result.stdout}`,
    );
  }
  return result;
}

async function resolveCandidateSha(): Promise<string> {
  const githubSha = process.env.GITHUB_SHA;
  if (githubSha !== undefined && githubSha.trim().length > 0) {
    return normalizeCandidateSha(githubSha);
  }
  const result = await requireSuccessfulCommand("git", ["rev-parse", "HEAD"], "git rev-parse");
  return normalizeCandidateSha(result.stdout);
}

async function requireCleanTrackedWorktree(): Promise<void> {
  const result = await requireSuccessfulCommand(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=no"],
    "git status",
  );
  if (result.stdout.trim().length > 0) {
    throw new Error(
      `Submission capture requires a clean tracked worktree so the media can be tied to one commit.\n${result.stdout}`,
    );
  }
}

async function buildProductionArtifact(): Promise<void> {
  const viteEntrypoint = join(projectRoot, "node_modules", "vite", "bin", "vite.js");
  const result = await requireSuccessfulCommand(
    process.execPath,
    [viteEntrypoint, "build"],
    "production build",
  );
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

async function runPlaywrightCapture(candidateSha: string): Promise<void> {
  const playwrightCli = join(projectRoot, "node_modules", "@playwright", "test", "cli.js");
  const result = await requireSuccessfulCommand(
    "node",
    [playwrightCli, "test", "--config=playwright.capture.config.ts"],
    "Playwright submission capture",
    { ...process.env, SHOVEFALL_CAPTURE_SHA: candidateSha },
  );
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

function startPreviewServer(): ChildProcess {
  const viteEntrypoint = join(projectRoot, "node_modules", "vite", "bin", "vite.js");
  return spawn(
    process.execPath,
    [viteEntrypoint, "preview", "--host", "127.0.0.1", "--port", String(CAPTURE_PORT)],
    {
      cwd: projectRoot,
      shell: false,
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true,
    },
  );
}

async function attemptPreviewReadiness(server: ChildProcess, deadline: number): Promise<void> {
  if (server.exitCode !== null) {
    throw new Error(`Preview server exited before becoming ready with code ${server.exitCode}.`);
  }
  if (Date.now() >= deadline) {
    throw new Error(`Preview server did not become ready within ${SERVER_READY_TIMEOUT_MS} ms.`);
  }
  const ready = await fetch(CAPTURE_ORIGIN, { redirect: "manual" })
    .then((response) => response.ok)
    .catch(() => false);
  if (ready) {
    return;
  }
  await wait(100);
  return attemptPreviewReadiness(server, deadline);
}

async function waitForPreviewServer(server: ChildProcess): Promise<void> {
  return attemptPreviewReadiness(server, Date.now() + SERVER_READY_TIMEOUT_MS);
}

async function stopPreviewServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null) {
    return;
  }
  server.kill("SIGTERM");
  const stopped = await Promise.race([
    new Promise<boolean>((resolveExit) => server.once("exit", () => resolveExit(true))),
    wait(3_000).then(() => false),
  ]);
  if (!stopped && server.exitCode === null) {
    server.kill("SIGKILL");
  }
}

async function installFixedRoundSeed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = crypto.getRandomValues.bind(crypto);
    let supplied = false;
    Object.defineProperty(crypto, "getRandomValues", {
      configurable: true,
      value: <T extends ArrayBufferView<ArrayBuffer>>(array: T): T => {
        if (!supplied && array instanceof Uint32Array && array.length === 2) {
          array[0] = 1;
          array[1] = 0;
          supplied = true;
          return array;
        }
        original(array);
        return array;
      },
    });
  });
}

async function waitForAttribute(
  page: Page,
  selector: string,
  attribute: string,
  expected: string,
  timeout = 10_000,
): Promise<void> {
  await page.waitForFunction(
    ({ attributeName, expectedValue, targetSelector }) =>
      document.querySelector(targetSelector)?.getAttribute(attributeName) === expectedValue,
    { attributeName: attribute, expectedValue: expected, targetSelector: selector },
    { timeout },
  );
}

async function readSimulationTick(page: Page): Promise<number> {
  return Number(await page.locator("#game-telemetry").getAttribute("data-tick"));
}

async function waitForTickDelta(page: Page, startingTick: number, delta: number): Promise<void> {
  await page.waitForFunction(
    ({ expectedTick }) =>
      Number(document.querySelector("#game-telemetry")?.getAttribute("data-tick")) >= expectedTick,
    { expectedTick: startingTick + delta },
    { timeout: 10_000 },
  );
}

async function chooseCaptureLoadout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await waitForAttribute(page, "#app", "data-screen", "settings");
  await page.locator('input[name="startingItem"][value="iron-boots"]').uncheck();
  await page.locator('input[name="startingItem"][value="spring-glove"]').uncheck();
  await page.locator('input[name="startingItem"][value="bomb"]').check();
  await page.locator('input[name="startingItem"][value="grappling-hook"]').check();
  await page.locator("#starting-weight").fill("75");
  await page.locator('input[name="collapseSpeed"][value="normal"]').check();
  await page.getByRole("button", { name: "설정 저장" }).click();
  await waitForAttribute(page, "#app", "data-screen", "menu");
}

async function createGameplayScene(page: Page): Promise<void> {
  await page.getByRole("button", { name: "게임 시작" }).click();
  await waitForAttribute(page, "#app", "data-screen", "arena");
  await waitForAttribute(page, "#app", "data-round", "active");
  const arena = page.locator("#arena-host");
  await arena.focus();

  const facingStart = await readSimulationTick(page);
  await page.keyboard.down("ArrowRight");
  try {
    await waitForTickDelta(page, facingStart, 2);
  } finally {
    await page.keyboard.up("ArrowRight");
  }

  const hookSlot = page.locator("#use-item-slot-1");
  await hookSlot.click();
  await page.getByText("갈고리가 걸렸어.", { exact: true }).waitFor({ state: "visible" });

  const bombSlot = page.locator("#use-item-slot-0");
  await bombSlot.click();
  await page.getByText("폭탄을 놨어. 5초 뒤 터져.", { exact: true }).waitFor({ state: "visible" });
  const movementStart = await readSimulationTick(page);
  await page.keyboard.down("ArrowRight");
  try {
    await waitForTickDelta(page, movementStart, 45);
  } finally {
    await page.keyboard.up("ArrowRight");
  }
  await page.keyboard.press("Shift");
  await page.keyboard.press("Space");
  const actionStart = await readSimulationTick(page);
  await waitForTickDelta(page, actionStart, 45);
}

async function readArtifactMetadata(file: string): Promise<ArtifactMetadata> {
  const bytes = await readFile(file);
  return {
    bytes: bytes.byteLength,
    file: basename(file),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function captureMedia(
  browser: Browser,
  candidateSha: string,
  captureDirectory: string,
): Promise<CaptureManifest> {
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const pageErrors: string[] = [];
  const menuScreenshotPath = join(captureDirectory, "menu.png");
  const gameplayScreenshotPath = join(captureDirectory, "gameplay.png");
  const gameplayVideoPath = join(captureDirectory, "gameplay.webm");

  try {
    reportPhase("create-browser-context");
    context = await browser.newContext({
      colorScheme: "dark",
      locale: "ko-KR",
      recordVideo: { dir: captureDirectory, size: CAPTURE_VIEWPORT },
      reducedMotion: "no-preference",
      timezoneId: "Asia/Seoul",
      viewport: CAPTURE_VIEWPORT,
    });
    page = await context.newPage();
    page.setDefaultNavigationTimeout(BROWSER_STEP_TIMEOUT_MS);
    page.setDefaultTimeout(BROWSER_STEP_TIMEOUT_MS);
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      } else if (message.type() === "warning") {
        consoleWarnings.push(message.text());
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await installFixedRoundSeed(page);
    reportPhase("load-menu");
    const response = await page.goto(CAPTURE_ORIGIN, { waitUntil: "domcontentloaded" });
    if (response === null || !response.ok()) {
      throw new Error(`Capture page failed to load: ${response?.status() ?? "no response"}.`);
    }
    if ((await page.title()) !== "바닥이 사라지는 술래잡기") {
      throw new Error(`Unexpected capture page title: ${await page.title()}`);
    }

    reportPhase("save-loadout");
    await withTimeout(chooseCaptureLoadout(page), BROWSER_STEP_TIMEOUT_MS, "Capture loadout setup");
    reportPhase("capture-menu");
    await page.screenshot({
      animations: "disabled",
      path: menuScreenshotPath,
      timeout: BROWSER_STEP_TIMEOUT_MS,
    });
    reportPhase("play-gameplay-scene");
    await withTimeout(
      createGameplayScene(page),
      BROWSER_STEP_TIMEOUT_MS * 2,
      "Gameplay capture scene",
    );
    reportPhase("capture-gameplay");
    await page.screenshot({
      animations: "disabled",
      path: gameplayScreenshotPath,
      timeout: BROWSER_STEP_TIMEOUT_MS,
    });
    const video = page.video();
    if (video === null) {
      throw new Error("Playwright did not create the requested gameplay video.");
    }
    reportPhase("finalize-video");
    await withTimeout(context.close(), BROWSER_STEP_TIMEOUT_MS, "Browser context close");
    context = undefined;
    const recordedVideoPath = await withTimeout(
      video.path(),
      BROWSER_STEP_TIMEOUT_MS,
      "Recorded video path",
    );
    await rm(gameplayVideoPath, { force: true });
    await rename(recordedVideoPath, gameplayVideoPath);

    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(
        `Capture produced browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`,
      );
    }
    const [menuScreenshot, gameplayScreenshot, gameplayVideo] = await Promise.all([
      readArtifactMetadata(menuScreenshotPath),
      readArtifactMetadata(gameplayScreenshotPath),
      readArtifactMetadata(gameplayVideoPath),
    ]);
    return {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      candidate: {
        commitSha: candidateSha,
        contentVersion: CONTENT_VERSION,
        productVersion: PRODUCT_VERSION,
        simulationVersion: SIMULATION_VERSION,
        trackedWorktreeClean: true,
      },
      capture: {
        browser: browser.version(),
        capturedAt: new Date().toISOString(),
        consoleErrors,
        consoleWarnings,
        origin: CAPTURE_ORIGIN,
        pageErrors,
        seed: [1, 0],
        settings: {
          botDifficulty: "hard",
          collapseSpeed: "normal",
          participantCount: 50,
          startingItems: ["bomb", "grappling-hook"],
          startingWeight: 75,
        },
        viewport: CAPTURE_VIEWPORT,
      },
      artifacts: { gameplayScreenshot, gameplayVideo, menuScreenshot },
    };
  } catch (error) {
    if (page !== undefined && !page.isClosed()) {
      await page
        .screenshot({
          path: join(captureDirectory, "capture-failure.png"),
          timeout: 5_000,
        })
        .catch(() => undefined);
    }
    throw error;
  } finally {
    if (context !== undefined) {
      await withTimeout(context.close(), 5_000, "Failure context close").catch(() => undefined);
    }
  }
}

async function main(): Promise<void> {
  await requireCleanTrackedWorktree();
  const candidateSha = await resolveCandidateSha();
  const captureDirectory = join(projectRoot, ".cache", "submission-captures", candidateSha);
  await rm(captureDirectory, { force: true, recursive: true });
  await mkdir(captureDirectory, { recursive: true });
  reportPhase("build-production-artifact");
  await buildProductionArtifact();
  reportPhase("start-preview-server");
  const server = startPreviewServer();
  try {
    await waitForPreviewServer(server);
    reportPhase("run-playwright-capture");
    await runPlaywrightCapture(candidateSha);
    const manifestPath = join(captureDirectory, "manifest.json");
    const manifestBytes = await readFile(manifestPath);
    const manifest: CaptureManifest = JSON.parse(manifestBytes.toString("utf8"));
    if (manifest.candidate.commitSha !== candidateSha) {
      throw new Error(
        `Capture manifest SHA ${manifest.candidate.commitSha} does not match ${candidateSha}.`,
      );
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          candidateSha,
          captureDirectory,
          manifestBytes: manifestBytes.byteLength,
          artifacts: manifest.artifacts,
          browserWarnings: manifest.capture.consoleWarnings,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await stopPreviewServer(server);
  }
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  await main();
}
