import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
const BROWSER_STEP_TIMEOUT_MS = 20_000;
const GAMEPLAY_SCENE_TIMEOUT_MS = 75_000;
const POST_ACTION_CAPTURE_TICKS = 45;
const GRAPPLING_CAPTURE_DIRECTIONS = Object.freeze([
  "ArrowRight",
  "ArrowDown",
  "ArrowLeft",
  "ArrowUp",
] as const);
const MISSING_RESOURCE_MESSAGE =
  "Failed to load resource: the server responded with a status of 404 (Not Found)";

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

interface IgnoredConsoleMessage {
  readonly text: string;
  readonly url: string;
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
    readonly ignoredConsoleMessages: readonly IgnoredConsoleMessage[];
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

export function isIgnorableFaviconProbe(text: string, url: string): boolean {
  if (text !== MISSING_RESOURCE_MESSAGE) {
    return false;
  }
  try {
    return new URL(url).pathname === "/favicon.ico";
  } catch {
    return false;
  }
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
  await page.locator("#starting-weight").fill("100");
  await page.locator('input[name="collapseSpeed"][value="normal"]').check();
  await page.getByRole("button", { name: "설정 저장" }).click();
  await waitForAttribute(page, "#app", "data-screen", "menu");
}

async function faceDirectionForCapture(page: Page, direction: string): Promise<void> {
  await page.locator("#arena-host").focus();
  const startingTick = await readSimulationTick(page);
  await page.keyboard.down(direction);
  try {
    await waitForTickDelta(page, startingTick, 2);
  } finally {
    await page.keyboard.up(direction);
  }
}

async function waitForInventorySlotReady(page: Page, selector: string): Promise<void> {
  await page.waitForFunction(
    ({ slotSelector }) => {
      const slot = document.querySelector(slotSelector);
      const telemetry = document.querySelector("#game-telemetry");
      return (
        slot instanceof HTMLButtonElement &&
        !slot.disabled &&
        telemetry?.getAttribute("data-action") === "Ready"
      );
    },
    { slotSelector: selector },
    { timeout: BROWSER_STEP_TIMEOUT_MS },
  );
}

async function clickInventorySlotWhenReady(page: Page, selector: string): Promise<void> {
  await page.waitForFunction(
    ({ slotSelector }) => {
      const slot = document.querySelector(slotSelector);
      const telemetry = document.querySelector("#game-telemetry");

      if (
        !(slot instanceof HTMLButtonElement) ||
        slot.disabled ||
        telemetry?.getAttribute("data-action") !== "Ready"
      ) {
        return false;
      }

      slot.click();
      return true;
    },
    { slotSelector: selector },
    { timeout: BROWSER_STEP_TIMEOUT_MS },
  );
}

async function useGrapplingHookForCapture(page: Page, directionIndex = 0): Promise<void> {
  const hookSlot = page.locator("#use-item-slot-1");
  const direction = GRAPPLING_CAPTURE_DIRECTIONS[directionIndex];

  if (direction === undefined) {
    throw new Error("The fixed capture seed exposed no cardinal Grappling Hook anchor.");
  }

  reportPhase(`gameplay-use-hook-${direction}`);
  await waitForInventorySlotReady(page, "#use-item-slot-1");
  await faceDirectionForCapture(page, direction);
  const attemptTick = await readSimulationTick(page);
  await clickInventorySlotWhenReady(page, "#use-item-slot-1");
  await waitForTickDelta(page, attemptTick, 2);

  if ((await hookSlot.textContent())?.includes("1회") === true) {
    await page.getByText("갈고리가 걸렸어.", { exact: true }).waitFor({ state: "visible" });
    return;
  }

  return useGrapplingHookForCapture(page, directionIndex + 1);
}

async function createGameplayScene(page: Page): Promise<void> {
  reportPhase("gameplay-start-round");
  await page.getByRole("button", { name: "게임 시작" }).click();
  await waitForAttribute(page, "#app", "data-screen", "arena");
  await waitForAttribute(page, "#app", "data-round", "active");
  const arena = page.locator("#arena-host");
  await arena.focus();
  reportPhase("gameplay-start-recording");
  await startCanvasRecording(page);

  reportPhase("gameplay-use-hook");
  await useGrapplingHookForCapture(page);

  reportPhase("gameplay-use-bomb");
  await clickInventorySlotWhenReady(page, "#use-item-slot-0");
  await page.getByText("폭탄을 놨어. 5초 뒤 터져.", { exact: true }).waitFor({ state: "visible" });
  reportPhase("gameplay-move-right");
  const movementStart = await readSimulationTick(page);
  await page.keyboard.down("ArrowRight");
  try {
    await waitForTickDelta(page, movementStart, 45);
  } finally {
    await page.keyboard.up("ArrowRight");
  }
  reportPhase("gameplay-dodge-and-shove");
  await page.keyboard.press("Shift");
  await page.keyboard.press("Space");
  const actionStart = await readSimulationTick(page);
  await waitForTickDelta(page, actionStart, POST_ACTION_CAPTURE_TICKS);
  reportPhase("gameplay-scene-ready");
}

async function startCanvasRecording(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#arena-host canvas");
    if (canvas === null) {
      throw new Error("Arena canvas is unavailable for gameplay recording.");
    }
    if (typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
      throw new Error("This Chrome build does not support canvas MediaRecorder capture.");
    }
    const mimeTypes = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mimeType = mimeTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (mimeType === undefined) {
      throw new Error("This Chrome build exposes no supported WebM recording codec.");
    }
    const stream = canvas.captureStream(30);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 3_000_000,
    });
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });
    (
      window as Window & {
        shovefallCaptureRecorder?: {
          readonly chunks: Blob[];
          readonly mimeType: string;
          readonly recorder: MediaRecorder;
          readonly stream: MediaStream;
        };
      }
    ).shovefallCaptureRecorder = { chunks, mimeType, recorder, stream };
    recorder.start(250);
  });
}

async function stopCanvasRecording(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(async () => {
    const captureWindow = window as Window & {
      shovefallCaptureRecorder?: {
        readonly chunks: Blob[];
        readonly mimeType: string;
        readonly recorder: MediaRecorder;
        readonly stream: MediaStream;
      };
    };
    const state = captureWindow.shovefallCaptureRecorder;
    if (state === undefined) {
      throw new Error("Gameplay recording state is missing.");
    }
    if (state.recorder.state !== "inactive") {
      await new Promise<void>((resolveStop) => {
        state.recorder.addEventListener("stop", () => resolveStop(), { once: true });
        state.recorder.stop();
      });
    }
    for (const track of state.stream.getTracks()) {
      track.stop();
    }
    delete captureWindow.shovefallCaptureRecorder;
    const blob = new Blob(state.chunks, { type: state.mimeType });
    if (blob.size === 0) {
      throw new Error("Chrome produced an empty gameplay recording.");
    }
    return new Promise<string>((resolveRead, rejectRead) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        if (typeof reader.result !== "string") {
          rejectRead(new Error("Gameplay recording did not produce a data URL."));
          return;
        }
        resolveRead(reader.result);
      });
      reader.addEventListener("error", () => rejectRead(reader.error ?? new Error("Read failed.")));
      reader.readAsDataURL(blob);
    });
  });
  const separator = dataUrl.indexOf(",");
  if (separator < 0) {
    throw new Error("Gameplay recording data URL is malformed.");
  }
  return Buffer.from(dataUrl.slice(separator + 1), "base64");
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
  const ignoredConsoleMessages: IgnoredConsoleMessage[] = [];
  const pageErrors: string[] = [];
  const menuScreenshotPath = join(captureDirectory, "menu.png");
  const gameplayScreenshotPath = join(captureDirectory, "gameplay.png");
  const gameplayVideoPath = join(captureDirectory, "gameplay.webm");

  try {
    reportPhase("create-browser-context");
    context = await browser.newContext({
      colorScheme: "dark",
      locale: "ko-KR",
      reducedMotion: "no-preference",
      timezoneId: "Asia/Seoul",
      viewport: CAPTURE_VIEWPORT,
    });
    page = await context.newPage();
    page.setDefaultNavigationTimeout(BROWSER_STEP_TIMEOUT_MS);
    page.setDefaultTimeout(BROWSER_STEP_TIMEOUT_MS);
    page.on("console", (message) => {
      if (message.type() === "error") {
        const text = message.text();
        const url = message.location().url;
        if (isIgnorableFaviconProbe(text, url)) {
          ignoredConsoleMessages.push({ text, url });
        } else {
          consoleErrors.push(url.length > 0 ? `${url}: ${text}` : text);
        }
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
      GAMEPLAY_SCENE_TIMEOUT_MS,
      "Gameplay capture scene",
    );
    reportPhase("capture-gameplay");
    await page.screenshot({
      animations: "disabled",
      path: gameplayScreenshotPath,
      timeout: BROWSER_STEP_TIMEOUT_MS,
    });
    reportPhase("finalize-video");
    const gameplayVideoBytes = await withTimeout(
      stopCanvasRecording(page),
      BROWSER_STEP_TIMEOUT_MS,
      "Canvas gameplay recording",
    );
    await writeFile(gameplayVideoPath, gameplayVideoBytes);
    await withTimeout(context.close(), BROWSER_STEP_TIMEOUT_MS, "Browser context close");
    context = undefined;

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
        ignoredConsoleMessages,
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
