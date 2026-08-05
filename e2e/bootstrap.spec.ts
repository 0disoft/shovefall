import { expect, test, type Locator, type Page } from "@playwright/test";
import { VERSION_HISTORY } from "../src/app/version-history";
import { PRODUCT_VERSION } from "../src/simulation/versions";
import {
  CAPTURE_STARTING_ATTRIBUTES,
  CAPTURE_STARTING_ITEMS,
  CAPTURE_STARTING_SKILLS,
  chooseCaptureLoadout,
  startCaptureRound,
} from "../tools/capture-submission";

interface CanvasPixelSummary {
  readonly luminanceRange: number;
  readonly sampledPixels: number;
  readonly uniqueColorBuckets: number;
}

interface LoadoutCardOffsets {
  readonly art: number;
  readonly effect: number;
  readonly height: number;
  readonly meta: number;
  readonly top: number;
  readonly title: number;
}

interface DomBox {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

const INITIAL_VERSION_HISTORY_COUNT = 30;

function boxesOverlap(a: DomBox | null, b: DomBox | null): boolean {
  return (
    a !== null &&
    b !== null &&
    a.left < b.right &&
    b.left < a.right &&
    a.top < b.bottom &&
    b.top < a.bottom
  );
}

async function expectAlignedLoadoutCards(cards: Locator): Promise<void> {
  const offsets = await cards.evaluateAll((elements): readonly LoadoutCardOffsets[] =>
    elements.map((element) => {
      const card = element.getBoundingClientRect();
      const art = element.querySelector<HTMLElement>(".skill-art, .item-art");
      const effect = element.querySelector<HTMLElement>(".skill-card__effect, .item-card__effect");
      const meta = element.querySelector<HTMLElement>(".skill-card__meta, .item-card__meta");
      const title = element.querySelector<HTMLElement>("strong");

      if (art === null || effect === null || meta === null || title === null) {
        throw new Error("Loadout card is missing a required layout region.");
      }

      return {
        art: art.getBoundingClientRect().top - card.top,
        effect: effect.getBoundingClientRect().top - card.top,
        height: card.height,
        meta: meta.getBoundingClientRect().top - card.top,
        top: card.top,
        title: title.getBoundingClientRect().top - card.top,
      };
    }),
  );

  expect(offsets.length).toBeGreaterThan(1);
  const first = offsets[0];
  expect(first).toBeDefined();

  for (const current of offsets.slice(1)) {
    expect(Math.abs(current.title - first!.title)).toBeLessThanOrEqual(1);
    expect(Math.abs(current.meta - first!.meta)).toBeLessThanOrEqual(1);
    expect(Math.abs(current.art - first!.art)).toBeLessThanOrEqual(1);
    expect(Math.abs(current.effect - first!.effect)).toBeLessThanOrEqual(1);
  }

  for (const [index, current] of offsets.entries()) {
    for (const sibling of offsets.slice(index + 1)) {
      if (Math.abs(current.top - sibling.top) <= 1) {
        expect(Math.abs(current.height - sibling.height)).toBeLessThanOrEqual(1);
      }
    }
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function getCompletedTick(report: unknown): number {
  if (!isRecord(report) || !isRecord(report.result)) {
    throw new Error("Copied round report is missing its result object.");
  }

  const completedTick = report.result.completedTick;
  if (typeof completedTick !== "number" || !Number.isSafeInteger(completedTick)) {
    throw new Error("Copied round report has an invalid completed tick.");
  }

  return completedTick;
}

async function captureArenaCanvas(page: Page): Promise<{
  readonly png: Buffer;
  readonly summary: CanvasPixelSummary;
}> {
  const png = await page.locator("#arena-host canvas").screenshot();
  const summary = await page.evaluate(
    async (dataUrl): Promise<CanvasPixelSummary> => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();

      const probe = document.createElement("canvas");
      probe.width = image.naturalWidth;
      probe.height = image.naturalHeight;
      const context = probe.getContext("2d", { willReadFrequently: true });

      if (context === null) {
        throw new Error("Unable to inspect the arena canvas screenshot.");
      }

      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
      const stride = Math.max(1, Math.floor(Math.min(probe.width, probe.height) / 96));
      const colorBuckets = new Set<string>();
      let minimumLuminance = 255;
      let maximumLuminance = 0;
      let sampledPixels = 0;

      for (let y = 0; y < probe.height; y += stride) {
        for (let x = 0; x < probe.width; x += stride) {
          const offset = (y * probe.width + x) * 4;
          const red = pixels[offset] ?? 0;
          const green = pixels[offset + 1] ?? 0;
          const blue = pixels[offset + 2] ?? 0;
          const luminance = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
          minimumLuminance = Math.min(minimumLuminance, luminance);
          maximumLuminance = Math.max(maximumLuminance, luminance);
          colorBuckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
          sampledPixels += 1;
        }
      }

      return {
        luminanceRange: maximumLuminance - minimumLuminance,
        sampledPixels,
        uniqueColorBuckets: colorBuckets.size,
      };
    },
    `data:image/png;base64,${png.toString("base64")}`,
  );

  return { png, summary };
}

async function fastForwardUntilRoundCompleted(page: Page, remainingSteps = 54): Promise<void> {
  if (
    remainingSteps === 0 ||
    (await page.locator("#app").getAttribute("data-round")) === "completed"
  ) {
    return;
  }

  await page.clock.runFor(5_000);
  return fastForwardUntilRoundCompleted(page, remainingSteps - 1);
}

async function installFixedRoundSeed(page: Page, firstWord: number, secondWord: number) {
  await page.addInitScript(
    ({ first, second }) => {
      const original = crypto.getRandomValues.bind(crypto);
      let supplied = false;
      Object.defineProperty(crypto, "getRandomValues", {
        configurable: true,
        value: <T extends ArrayBufferView<ArrayBuffer>>(array: T): T => {
          if (!supplied && array instanceof Uint32Array && array.length === 2) {
            array[0] = first;
            array[1] = second;
            supplied = true;
            return array;
          }

          original(array);
          return array;
        },
      });
    },
    { first: firstWord, second: secondWord },
  );
}

async function installClipboardCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async writeText(value: string): Promise<void> {
          (window as Window & { shovefallClipboardCapture?: string }).shovefallClipboardCapture =
            value;
        },
      },
    });
  });
}

async function pauseInstalledClock(page: Page): Promise<void> {
  const currentBrowserTime = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(currentBrowserTime + 60_000);
}

async function installDeterministicClock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  });
  await page.clock.install();
}

async function driveHumanUntilEliminated(
  page: Page,
  directions: readonly string[] = ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"],
): Promise<void> {
  const [direction, ...remainingDirections] = directions;
  if (direction === undefined) {
    throw new Error("human actor did not reach water during the bounded movement path");
  }

  await page.locator("#arena-host").focus();
  await page.keyboard.down(direction);
  let eliminated = false;
  try {
    eliminated = await driveHumanInDirection(page, 16);
  } finally {
    await page.keyboard.up(direction);
  }

  if (eliminated) {
    return;
  }
  return driveHumanUntilEliminated(page, remainingDirections);
}

async function driveHumanInDirection(page: Page, remainingSeconds: number): Promise<boolean> {
  if (remainingSeconds === 0) {
    return false;
  }

  await page.clock.runFor(1_000);
  if ((await page.locator("#app").getAttribute("data-human-eliminated")) === "true") {
    return true;
  }
  return driveHumanInDirection(page, remainingSeconds - 1);
}

async function finishInstalledClockCountdown(page: Page, remainingSteps = 5): Promise<void> {
  const round = await page.locator("#app").getAttribute("data-round");

  if (round === "active") {
    return;
  }

  if (remainingSteps === 0) {
    throw new Error(
      `Countdown did not become active; current round state is ${round ?? "missing"}.`,
    );
  }

  if (remainingSteps === 5) {
    await page.clock.fastForward(1);
  } else {
    await page.clock.fastForward(510);
  }

  return finishInstalledClockCountdown(page, remainingSteps - 1);
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "settings");
}

async function openSettingsTab(
  page: Page,
  name: "특성" | "스킬" | "아이템" | "설정",
): Promise<void> {
  await page.getByRole("tab", { name, exact: true }).click();
}

async function assertLastSettingsCardReachable(page: Page, tab: "스킬" | "아이템"): Promise<void> {
  await openSettingsTab(page, tab);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(100);

  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>(".preset-card")];
    const visible = cards.filter((card) => {
      const rect = card.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });
    const last = visible.at(-1)?.getBoundingClientRect();
    const save = document.querySelector<HTMLElement>(".settings-actions")?.getBoundingClientRect();
    const overlaps =
      last !== undefined && save !== undefined && last.top < save.bottom && save.top < last.bottom;
    return {
      lastTop: last === undefined ? null : Math.round(last.top * 10) / 10,
      lastBottom: last === undefined ? null : Math.round(last.bottom * 10) / 10,
      saveTop: save === undefined ? null : Math.round(save.top * 10) / 10,
      saveBottom: save === undefined ? null : Math.round(save.bottom * 10) / 10,
      overlaps,
      saveVisible: save !== undefined && save.top >= 0 && save.bottom <= window.innerHeight,
    };
  });

  expect(layout.lastTop).not.toBeNull();
  expect(layout.lastTop).toBeGreaterThanOrEqual(0);
  expect(layout.lastBottom).toBeLessThanOrEqual(390);
  expect(layout.overlaps).toBe(false);
  expect(layout.saveVisible).toBe(true);
}

async function assertCoverSettingsTab(
  page: Page,
  tab: "특성" | "스킬" | "아이템" | "설정",
): Promise<void> {
  await openSettingsTab(page, tab);
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
}

async function selectStartingItem(page: Page, value: string): Promise<void> {
  await openSettingsTab(page, "아이템");
  await page.locator(`input[name="startingItem"][value="${value}"]`).check();
}

async function clickRepeatedly(control: Locator, remainingClicks: number): Promise<void> {
  if (remainingClicks <= 0) {
    return;
  }
  await control.click();
  return clickRepeatedly(control, remainingClicks - 1);
}

async function allocateBalancedAttributes(
  page: Page,
  names: readonly string[] = ["완력", "민첩", "체질", "정신", "균형"],
): Promise<void> {
  const [name, ...remainingNames] = names;
  if (name === undefined) {
    return;
  }
  await clickRepeatedly(page.getByRole("button", { name: `${name} 1 올리기` }), 4);
  return allocateBalancedAttributes(page, remainingNames);
}

async function selectStartingSkills(page: Page): Promise<void> {
  const arcBolt = page.locator('input[name="startingSkill"][value="arc-bolt"]');
  if (!(await arcBolt.isChecked())) {
    await arcBolt.check();
  }
  const blinkStep = page.locator('input[name="startingSkill"][value="blink-step"]');
  if (!(await blinkStep.isChecked())) {
    await blinkStep.check();
  }
}

async function saveSettings(page: Page): Promise<void> {
  const remaining = Number(await page.locator("#starting-attribute-remaining").textContent());
  if (remaining === 20) {
    await openSettingsTab(page, "특성");
    await allocateBalancedAttributes(page);
  }
  await openSettingsTab(page, "스킬");
  await selectStartingSkills(page);
  await openSettingsTab(page, "아이템");
  if ((await page.locator('input[name="startingItem"]:checked').count()) === 0) {
    await page.locator('input[name="startingItem"][value="bomb"]').check();
  }
  await page.getByRole("button", { name: "설정 저장" }).click();
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "menu");
}

async function allocateStrengthBuild(page: Page): Promise<void> {
  await openSettingsTab(page, "특성");
  await clickRepeatedly(page.getByRole("button", { name: "완력 1 올리기" }), 8);
  await allocateBalancedAttributes(page, ["체질", "정신", "균형"]);
}

async function startGame(page: Page): Promise<void> {
  await page.getByRole("button", { name: "게임 시작" }).click();
  const briefing = page.getByRole("dialog", {
    name: "포격으로 무너지는 섬에서 끝까지 살아남아.",
  });
  await expect(briefing).toBeVisible();
  const confirm = page.getByRole("button", { name: "알겠다요 ㅇㅅㅇ" });
  await expect(confirm).toBeEnabled();
  await confirm.click();
}

async function saveBalancedDefaults(page: Page): Promise<void> {
  await openSettings(page);
  await saveSettings(page);
}

async function readSimulationTick(page: Page): Promise<number> {
  return Number(await page.locator("#game-telemetry").getAttribute("data-tick"));
}

async function waitForSimulationTickAdvance(
  page: Page,
  tickBefore: number,
  remainingFrames = 20,
): Promise<void> {
  if ((await readSimulationTick(page)) > tickBefore) {
    return;
  }

  if (remainingFrames === 0) {
    throw new Error("inventory input was not consumed during the bounded fixed-clock window");
  }

  await page.clock.fastForward(20);
  return waitForSimulationTickAdvance(page, tickBefore, remainingFrames - 1);
}

async function waitForReadyActionState(page: Page, remainingFrames = 120): Promise<void> {
  const action = await page.locator("#game-telemetry").getAttribute("data-action");
  if (action === "Ready") {
    return;
  }

  if (remainingFrames === 0) {
    throw new Error(`player never returned to Ready; current action is ${action ?? "missing"}`);
  }

  await page.clock.fastForward(34);
  return waitForReadyActionState(page, remainingFrames - 1);
}

async function setArenaFacingDirection(page: Page, direction: string): Promise<void> {
  await page.locator("#arena-host").focus();
  const tickBeforeFacing = await readSimulationTick(page);
  await page.keyboard.down(direction);

  try {
    await waitForSimulationTickAdvance(page, tickBeforeFacing);
  } finally {
    await page.keyboard.up(direction);
  }
}

async function waitForActionButtonEnabled(
  page: Page,
  selector: string,
  remainingFrames = 45,
): Promise<void> {
  const button = page.locator(selector);
  if (await button.isEnabled()) {
    return;
  }

  if (remainingFrames === 0) {
    throw new Error(`action never became ready: ${selector}`);
  }

  await page.clock.fastForward(34);
  return waitForActionButtonEnabled(page, selector, remainingFrames - 1);
}

async function placeGroundItemAtPlayer(page: Page, expectedText: string): Promise<void> {
  await waitForReadyActionState(page);
  const tickBeforeUse = await readSimulationTick(page);
  await page.keyboard.press("KeyD");
  await expect(page.locator("#targeting-help")).toBeVisible();
  const arenaBounds = await page.locator("#arena-host").boundingBox();
  expect(arenaBounds).not.toBeNull();
  if (arenaBounds === null) {
    return;
  }

  await page.mouse.click(
    arenaBounds.x + arenaBounds.width / 2,
    arenaBounds.y + arenaBounds.height / 2,
  );
  await waitForSimulationTickAdvance(page, tickBeforeUse);
  await expect(page.locator("#use-item-slot-0")).toContainText(expectedText);
}

async function placeDirectionalBrickAnchor(page: Page, direction: string): Promise<void> {
  await setArenaFacingDirection(page, direction);
  await waitForReadyActionState(page);
  const tickBeforeUse = await readSimulationTick(page);
  await page.keyboard.press("KeyD");
  await expect(page.locator("#targeting-help")).toBeVisible();
  await page.keyboard.press("KeyD");
  await waitForSimulationTickAdvance(page, tickBeforeUse);
  await expect(page.locator("#round-message")).toHaveText("벽돌을 세웠어.");
}

async function useDirectionalGrapple(
  page: Page,
  directions: readonly string[] = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"],
): Promise<void> {
  const [direction, ...remainingDirections] = directions;

  if (direction === undefined) {
    throw new Error("built-in grapple did not find an anchor in any cardinal direction");
  }

  await setArenaFacingDirection(page, direction);
  await waitForActionButtonEnabled(page, "#use-grapple");
  const tickBeforeGrapple = await readSimulationTick(page);
  await page.keyboard.press("KeyE");
  await expect(page.locator("#targeting-help")).toBeVisible();
  await page.keyboard.press("KeyE");
  await waitForSimulationTickAdvance(page, tickBeforeGrapple);

  if (!(await page.locator("#use-grapple").isEnabled())) {
    return;
  }

  return useDirectionalGrapple(page, remainingDirections);
}

async function readCameraPosition(page: Page): Promise<string> {
  const arena = page.locator("#arena-host");
  const [x, y] = await Promise.all([
    arena.getAttribute("data-camera-x"),
    arena.getAttribute("data-camera-y"),
  ]);
  return `${x ?? "missing"},${y ?? "missing"}`;
}

async function restartIfEliminated(page: Page): Promise<void> {
  if ((await page.locator("#app").getAttribute("data-human-eliminated")) !== "true") {
    return;
  }
  await page.keyboard.press("p");
  await expect(page.locator("#pause-menu")).toBeVisible();
  await page.getByRole("button", { name: "다시 시작" }).click();
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active", {
    timeout: 15_000,
  });
  await expect(page.locator("#app")).not.toHaveAttribute("data-human-eliminated", "true");
}

async function dragJoystickToMoveCamera(page: Page, joystick: Locator): Promise<void> {
  if (await dragJoystickOnce(page, joystick)) {
    return;
  }
  if (await dragJoystickOnce(page, joystick)) {
    return;
  }
  throw new Error("touch joystick did not move the camera after restarting the round");
}

async function dragJoystickOnce(page: Page, joystick: Locator): Promise<boolean> {
  await restartIfEliminated(page);
  const joystickBounds = await joystick.boundingBox();
  if (joystickBounds === null) {
    throw new Error("touch joystick is missing a bounding box");
  }

  const centerX = joystickBounds.x + joystickBounds.width / 2;
  const centerY = joystickBounds.y + joystickBounds.height / 2;
  const positionBefore = await readCameraPosition(page);
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + joystickBounds.width / 2, centerY, { steps: 4 });
  await page.waitForTimeout(120);
  await expect(joystick).toHaveAttribute("data-active", "true");
  await page.mouse.up();
  await expect(joystick).not.toHaveAttribute("data-active", "true");
  try {
    await expect.poll(() => readCameraPosition(page), { timeout: 5_000 }).not.toBe(positionBefore);
    return true;
  } catch (error) {
    const eliminated =
      (await page.locator("#app").getAttribute("data-human-eliminated")) === "true";
    if (!eliminated) {
      throw error;
    }
    return false;
  }
}

async function panSpectatorCameraWithArrows(
  page: Page,
  directions: readonly string[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"],
): Promise<void> {
  const initialPosition = await readCameraPosition(page);
  return panSpectatorCameraFromPosition(page, initialPosition, directions);
}

async function panSpectatorCameraFromPosition(
  page: Page,
  initialPosition: string,
  directions: readonly string[],
): Promise<void> {
  const [direction, ...remainingDirections] = directions;
  if (direction === undefined) {
    throw new Error("spectator camera did not move with any arrow direction");
  }

  await page.keyboard.down(direction);
  try {
    await page.clock.fastForward(100);
  } finally {
    await page.keyboard.up(direction);
  }
  if ((await readCameraPosition(page)) !== initialPosition) {
    return;
  }
  return panSpectatorCameraFromPosition(page, initialPosition, remainingDirections);
}

async function fastForwardUntilCameraMoved(
  page: Page,
  positionBefore: string,
  remainingFrames = 12,
): Promise<void> {
  if ((await readCameraPosition(page)) !== positionBefore) {
    return;
  }

  if (remainingFrames <= 0) {
    throw new Error("camera did not follow held movement during the bounded fixed-clock window");
  }

  await page.clock.fastForward(20);
  return fastForwardUntilCameraMoved(page, positionBefore, remainingFrames - 1);
}

async function faceArenaDirection(page: Page, direction: string): Promise<void> {
  await page.locator("#arena-host").focus();
  const positionBeforeFacing = await readCameraPosition(page);
  const tickBeforeFacing = await readSimulationTick(page);
  await page.keyboard.down(direction);

  try {
    await fastForwardUntilCameraMoved(page, positionBeforeFacing);
    await waitForSimulationTickAdvance(page, tickBeforeFacing);
  } finally {
    await page.keyboard.up(direction);
  }
}

test("@ci-smoke boots the production artifact into a live arena", async ({ page }) => {
  test.setTimeout(45_000);
  await installDeterministicClock(page);
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await pauseInstalledClock(page);

  await expect(page).toHaveTitle("바닥이 사라지는 술래잡기");
  await expect(page.locator("#arena-host canvas")).toBeHidden();
  await saveBalancedDefaults(page);
  await startGame(page);
  await finishInstalledClockCountdown(page);

  await expect(page.locator("#app")).toHaveAttribute("data-screen", "arena");
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active");
  await expect(page.locator("#arena-host")).toHaveAttribute("data-visual-assets", "generated");
  await expect(page.locator("#arena-host")).toHaveAttribute("data-skill-effect-assets", "6");
  await expect
    .poll(async () =>
      Number(await page.locator("#arena-host").getAttribute("data-terrain-sprites")),
    )
    .toBeGreaterThan(0);
  const developerTelemetry = page.locator("#developer-telemetry");
  const productionArtifact = new URL(page.url()).port === "4175";
  await expect(developerTelemetry).toHaveCount(productionArtifact ? 0 : 1);
  if (!productionArtifact) {
    await expect(developerTelemetry).toBeHidden();
  }
  await expect(page.locator("#debug-tuning")).toHaveCount(0);
  await expect(page.locator("#game-telemetry")).toHaveAttribute("data-action", "Ready");
  await expect(page.locator("#skill-actions")).toBeVisible();
  await expect(page.locator("#inventory-actions")).toBeVisible();
});

test("centers the fullscreen menu actions on the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");

  const geometry = await page.locator(".main-menu__actions").evaluate((actions) => {
    const bounds = actions.getBoundingClientRect();
    return {
      actionCenter: bounds.top + bounds.height / 2,
      viewportCenter: window.innerHeight / 2,
    };
  });

  expect(Math.abs(geometry.actionCenter - geometry.viewportCenter)).toBeLessThanOrEqual(1);
  await expect(page.locator(".masthead h1")).toBeVisible();
  await expect(page.locator(".fullscreen-guide")).toBeVisible();
  const menuContextMenuPrevented = await page.locator("#app").evaluate((app) => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    return !app.dispatchEvent(event);
  });

  expect(menuContextMenuPrevented).toBe(true);
});

test("saves the complete submission-capture loadout from fresh settings", async ({ page }) => {
  await page.goto("/");
  await chooseCaptureLoadout(page);

  await expect(page.locator("#app")).toHaveAttribute("data-screen", "menu");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.locator("#starting-attribute-strength")).toHaveText(
    String(CAPTURE_STARTING_ATTRIBUTES.strength),
  );
  await expect(page.locator("#starting-attribute-agility")).toHaveText(
    String(CAPTURE_STARTING_ATTRIBUTES.agility),
  );
  await expect(page.locator("#starting-attribute-constitution")).toHaveText(
    String(CAPTURE_STARTING_ATTRIBUTES.constitution),
  );
  await expect(page.locator("#starting-attribute-spirit")).toHaveText(
    String(CAPTURE_STARTING_ATTRIBUTES.spirit),
  );
  await expect(page.locator("#starting-attribute-balance")).toHaveText(
    String(CAPTURE_STARTING_ATTRIBUTES.balance),
  );
  await expect(page.locator("#starting-attribute-willpower")).toHaveText(
    String(CAPTURE_STARTING_ATTRIBUTES.willpower),
  );
  await expect(page.locator('input[name="startingSkill"]:checked')).toHaveCount(
    CAPTURE_STARTING_SKILLS.length,
  );
  await expect(
    page.locator(`input[name="startingItem"][value="${CAPTURE_STARTING_ITEMS[0]}"]`),
  ).toBeChecked();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await startCaptureRound(page);
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "arena");
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active");
});

test("uses right-click ground destinations instead of desktop mouse-drag movement", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await installDeterministicClock(page);
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await pauseInstalledClock(page);
  await saveBalancedDefaults(page);
  await startGame(page);
  await finishInstalledClockCountdown(page);

  const arenaBounds = await page.locator("#arena-host").boundingBox();
  expect(arenaBounds).not.toBeNull();
  if (arenaBounds === null) {
    return;
  }

  const originX = arenaBounds.x + arenaBounds.width / 2;
  const originY = arenaBounds.y + arenaBounds.height / 2;
  await page.mouse.move(originX, originY);
  await page.mouse.down();
  await page.mouse.move(originX + 80, originY, { steps: 4 });
  await expect(page.locator("#arena-host")).not.toHaveAttribute("data-pointer-moving", "true");
  await page.mouse.up();

  const cameraBeforeRightClick = await readCameraPosition(page);
  await page.mouse.click(originX + 80, originY, { button: "right" });
  await fastForwardUntilCameraMoved(page, cameraBeforeRightClick);
});

test("boots WebGL and drives the fixed-tick gray-box round", async ({ page }) => {
  test.slow();
  await installDeterministicClock(page);
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  const productionArtifact = new URL(page.url()).port === "4175";
  await pauseInstalledClock(page);

  await expect(page).toHaveTitle("바닥이 사라지는 술래잡기");
  await expect(
    page.getByRole("heading", { level: 1, name: "바닥이 사라지는 술래잡기" }),
  ).toBeVisible();
  await expect(page.getByText("SHOVE · DODGE · SURVIVE")).toHaveCount(0);
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "menu");
  await expect(page.getByRole("button", { name: "게임 시작" })).toBeVisible();
  await expect(page.getByRole("button", { name: "설정", exact: true })).toBeVisible();
  const scoreboardButton = page.getByRole("button", { name: "점수표", exact: true });
  await expect(scoreboardButton).toBeVisible();
  await scoreboardButton.click();
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "scoreboard");
  await expect(page.getByRole("heading", { level: 2, name: "점수표" })).toBeFocused();
  await expect(page.locator("#scoreboard-summary")).toHaveText("아직 기록 없음");
  await expect(page.getByText("아직 끝낸 판이 없어. 한 판 끝내면 여기에 남아.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "menu");
  await expect(scoreboardButton).toBeFocused();
  const versionHistoryButton = page.getByRole("button", { name: "버전 기록", exact: true });
  await expect(versionHistoryButton).toBeVisible();
  const sourceCodeLink = page.getByRole("link", { name: "소스 코드", exact: true });
  await expect(sourceCodeLink).toBeVisible();
  await expect(sourceCodeLink).toHaveAttribute("href", "https://github.com/0disoft/shovefall");
  await expect(sourceCodeLink).toHaveAttribute("target", "_blank");
  await expect(sourceCodeLink).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.getByText("F11 키로 전체화면을 켠 뒤 시작해.")).toBeVisible();
  await expect(page.locator("#arena-host canvas")).toBeHidden();
  await versionHistoryButton.click();
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "history");
  await expect(page.getByRole("heading", { level: 2, name: "버전 기록" })).toBeFocused();
  await expect(page.locator("#current-version")).toHaveText(`v${PRODUCT_VERSION}`);
  await expect(page.locator("#version-history-list > li")).toHaveCount(
    Math.min(VERSION_HISTORY.length, INITIAL_VERSION_HISTORY_COUNT),
  );
  await expect(page.locator("#version-history-list details")).toHaveCount(
    Math.min(VERSION_HISTORY.length, INITIAL_VERSION_HISTORY_COUNT),
  );
  await expect(page.locator("#version-history-list details[open]")).toHaveCount(1);
  const openEntry = page.locator("#version-history-list details[open]");
  await expect(openEntry.getByText("왜 바꿨냐면요")).toHaveCount(1);
  await page.getByRole("button", { name: "이전 버전 더 보기" }).click();
  await expect(page.locator("#version-history-list details")).toHaveCount(VERSION_HISTORY.length);
  await page.locator("#version-history-list details").nth(1).locator("summary").click();
  await expect(
    page.locator("#version-history-list details[open]").getByText("왜 바꿨냐면요"),
  ).toHaveCount(2);
  await expect(page.locator("#arena-host canvas")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "menu");
  await expect(versionHistoryButton).toBeFocused();
  await page.getByRole("button", { name: "게임 시작" }).click();
  await expect(page.getByRole("dialog", { name: "먼저 설정을 골라줘" })).toBeVisible();
  await expect(
    page.getByText("기초 특성 20포인트, 스킬 2개, 아이템 1개를 골라야 시작할 수 있어."),
  ).toBeVisible();
  await page.getByRole("button", { name: "설정하러 가기" }).click();
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "settings");
  await expect(page.locator('input[name="preset"]')).toHaveCount(0);
  await expect(page.locator('input[name="botDifficulty"]')).toHaveCount(0);
  await expect(page.locator("#player-count")).toHaveCount(0);
  await expect(page.locator("#stat-upgrade-form [data-trait-choice]")).toHaveCount(6);
  await expect(
    page.locator("#stat-upgrade-form [data-trait-choice] > .trait-upgrade__copy > strong"),
  ).toHaveText(["완력", "균형", "민첩", "의지", "체질", "정신"]);
  await expect(page.locator("#stat-upgrade-form svg")).toHaveCount(0);
  await expect(page.getByText("50명 · AI 어려움", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(4);
  await expect(page.getByRole("tab", { name: "특성" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#settings-panel-attributes")).toBeVisible();
  await expect(page.locator("#starting-skills")).toBeHidden();
  await expect(page.locator("#starting-items")).toBeHidden();
  expect(
    await page.locator("#app").evaluate((element) => getComputedStyle(element).userSelect),
  ).toBe("none");
  await page.getByRole("tab", { name: "특성" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "스킬" })).toBeFocused();
  await expect(page.locator("#starting-skills")).toBeVisible();
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "특성" })).toBeFocused();
  await expect(page.locator("#starting-attribute-remaining")).toHaveText("20");
  await expect(page.locator("[data-starting-attribute]")).toHaveCount(6);
  await expect(page.locator("#starting-attribute-strength")).toHaveText("0");
  await expect(page.locator("#starting-attribute-willpower")).toHaveText("0");
  await expect(page.locator("#starting-total-health")).toHaveText("100");
  await expect(page.locator("#starting-total-mana")).toHaveText("100");
  await expect(page.locator("#starting-total-mass")).toHaveText("기본");
  await expect(page.locator("#starting-total-damage-taken")).toHaveText("0%");
  await expect(page.locator("#starting-total-shield")).toHaveText("0%");
  await expect(page.locator("#starting-total-health-regen")).toHaveText("0%");
  await expect(page.locator("#starting-total-mana-regen")).toHaveText("0%");
  await expect(page.locator(".starting-build-summary > div")).toHaveCount(12);
  await expect(page.locator("#starting-total-cooldown")).toHaveText("대기 0% · 마나 0%");
  await expect(page.locator("#starting-total-cooldown")).toHaveAttribute(
    "title",
    "대기: 스킬을 다시 쓸 때까지 기다리는 시간. 마나: 스킬을 사용할 때 소비하는 양.",
  );
  await expect(page.locator(".starting-attributes__grid")).toHaveCSS(
    "grid-template-columns",
    /^\d+(?:\.\d+)?px \d+(?:\.\d+)?px$/u,
  );
  await expect(page.locator(".starting-build-summary")).toHaveCSS(
    "grid-template-columns",
    /^\d+(?:\.\d+)?px \d+(?:\.\d+)?px \d+(?:\.\d+)?px$/u,
  );
  await openSettingsTab(page, "스킬");
  await expect(page.locator('#starting-skills input[name="startingSkill"]')).toHaveCount(6);
  await expect(page.locator("#starting-skills .skill-art")).toHaveCount(6);
  await expectAlignedLoadoutCards(page.locator("#starting-skills .preset-card"));
  const blinkStepRows = page.locator(
    '[data-skill-definition="blink-step"] .loadout-card__effect-row',
  );
  await expect(blinkStepRows).toHaveCount(2);
  await expect(blinkStepRows.nth(0)).toHaveText("지정 방향으로 최대 5칸 이동");
  await expect(blinkStepRows.nth(1)).toHaveText("2.5초 동안 공격 회피");
  await expect(page.getByText("바위 감옥", { exact: true })).toHaveCount(0);
  await expect(page.locator(".skill-art--arc-bolt")).toHaveCSS(
    "background-image",
    /skill-icon-arc-bolt[^)]*\.png/u,
  );
  await Promise.all(
    ["blink-step", "arc-bolt", "chain-bind", "meteor-mark", "frost-field", "aegis"].map((skillId) =>
      expect(page.locator(`.skill-art--${skillId}`)).toHaveCSS(
        "background-image",
        new RegExp(`skill-icon-${skillId}[^)]*\\.png`, "u"),
      ),
    ),
  );
  await expect(page.locator('#starting-skills input[name="startingSkill"]:checked')).toHaveCount(0);
  await expect(page.locator('input[name="startingItem"]:checked')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "설정 저장" })).toBeDisabled();
  await expect(page.locator("#starting-skills")).toBeVisible();
  await expect(page.locator("#settings-panel-attributes")).toBeHidden();
  await openSettingsTab(page, "아이템");
  await expect(page.locator('[data-item-definition="bomb"] .item-card__meta')).toContainText("2회");
  await expect(page.locator('[data-item-definition="bomb"] .item-card__meta')).toContainText(
    "설치 위치 선택",
  );
  const bombEffect = page.locator('[data-item-definition="bomb"] .item-card__effect');
  await expect(bombEffect).toContainText("내 위치에서 최대 0.75칸 떨어진 곳에 폭탄 설치");
  await expect(bombEffect).toContainText("3.25초 뒤 폭발");
  await expect(bombEffect).toContainText("폭발 반경 3칸");
  await expect(bombEffect).toContainText("피해 60");
  await expect(bombEffect).toContainText("설치자는 피해의 25%를 받음");
  await expect(page.locator("#starting-items .item-art")).toHaveCount(4);
  await expectAlignedLoadoutCards(page.locator("#starting-items .preset-card"));
  await expect(page.locator(".item-art--soap")).toHaveCSS("background-image", /item-icons/u);
  await expect(page.locator("#setup-summary")).toHaveCount(0);
  await expect(page.locator("#starting-skill-count")).toHaveText("0");
  await expect(page.locator("#starting-item-count")).toHaveText("0");
  await openSettingsTab(page, "특성");
  await page.getByRole("button", { name: "완력 1 올리기" }).click();
  await expect(page.locator("#starting-total-mass")).toHaveText("+2.5%");
  await expect(page.getByRole("button", { name: "설정 저장" })).toBeDisabled();
  await page.getByRole("button", { name: "취소" }).click();
  await openSettings(page);
  await expect(page.locator("#starting-attribute-strength")).toHaveText("0");
  await expect(page.locator("#setup-summary")).toHaveCount(0);
  await allocateStrengthBuild(page);
  await selectStartingItem(page, "soap");
  await expect(page.locator("#starting-attribute-strength")).toHaveText("8");
  await expect(page.locator('input[name="startingItem"][value="soap"]')).toBeChecked();
  await expect(page.locator("#starting-item-count")).toHaveText("1");

  await saveSettings(page);
  await page.getByRole("button", { name: "게임 시작" }).click();
  const roundBriefing = page.getByRole("dialog", {
    name: "포격으로 무너지는 섬에서 끝까지 살아남아.",
  });
  await expect(roundBriefing).toBeVisible();
  await expect(
    roundBriefing.getByText("해적선의 대포에 맞은 해안 타일은 바다로 변해."),
  ).toBeVisible();
  await expect(roundBriefing.getByText("포격이 이어질수록 육지는 점점 좁아져.")).toBeVisible();
  await expect(roundBriefing.getByText("마지막 한 명이 될 때까지 섬에서 살아남아.")).toBeVisible();
  await expect(page.getByText("방향키 · 땅 우클릭", { exact: true })).toBeVisible();
  await expect(page.getByText("Q · W", { exact: true })).toBeVisible();
  await expect(page.getByText("E · D", { exact: true })).toBeVisible();
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "menu");
  const confirmRoundBriefing = page.getByRole("button", { name: "알겠다요 ㅇㅅㅇ" });
  const confirmRoundBriefingControl = page.locator("#confirm-round-briefing");
  await expect(confirmRoundBriefing).toBeEnabled();
  await expect(page.locator("#game-telemetry")).toHaveAttribute("data-tick", "0");
  await page.clock.fastForward(2_000);
  await expect(page.locator("#game-telemetry")).toHaveAttribute("data-tick", "0");
  await page.locator("#arena-host canvas").dispatchEvent("webglcontextlost");
  await expect(confirmRoundBriefingControl).toBeDisabled();
  await expect(confirmRoundBriefingControl).toHaveText("게임 불러오는 중…");
  await expect(page.getByText("그래픽 연결을 다시 기다리는 중…", { exact: true })).toBeVisible();
  await expect(page.locator("#game-telemetry")).toHaveAttribute("data-tick", "0");
  await page.locator("#arena-host canvas").dispatchEvent("webglcontextrestored");
  await expect(confirmRoundBriefingControl).toHaveText("알겠다요 ㅇㅅㅇ");
  await expect(confirmRoundBriefing).toBeEnabled();
  await expect(confirmRoundBriefing).toBeFocused();

  const countdownPauseSnapshot = await confirmRoundBriefing.evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Round briefing confirmation is not a button.");
    }

    button.click();
    const telemetry = document.querySelector("#game-telemetry");
    const arena = document.querySelector("#arena-host");
    const rendererStatus = document.querySelector("#renderer-status");
    const snapshot = {
      countdown: telemetry?.getAttribute("data-countdown") ?? null,
      arenaFocused: document.activeElement === arena,
      rendererStatus: rendererStatus?.textContent ?? "",
    };
    window.dispatchEvent(new Event("blur"));
    return snapshot;
  });

  expect(countdownPauseSnapshot.countdown).toMatch(/^[123]$/u);
  expect(countdownPauseSnapshot.arenaFocused).toBe(true);
  expect(countdownPauseSnapshot.rendererStatus).toMatch(/^시작까지 [123]$/u);
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "arena");
  await expect(page.locator("#app")).toHaveAttribute("data-round", "countdown");
  await expect(page.locator("#arena-host")).toHaveAttribute("data-visual-assets", "generated");
  await expect(page.locator("#arena-host")).toHaveAttribute("data-skill-effect-assets", "6");
  await expect
    .poll(async () =>
      Number(await page.locator("#arena-host").getAttribute("data-terrain-sprites")),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(async () =>
      Number(await page.locator("#arena-host").getAttribute("data-terrain-sprites")),
    )
    .toBeLessThan(500);
  await expect(page.locator("#game-telemetry")).toHaveAttribute("data-tick", "0");
  await expect(page.locator("#game-telemetry")).toBeVisible();
  const developerTelemetry = page.locator("#developer-telemetry");
  await expect(developerTelemetry).toHaveCount(productionArtifact ? 0 : 1);
  if (!productionArtifact) {
    await expect(developerTelemetry).toBeVisible();
    await expect(developerTelemetry).not.toHaveAttribute("open", "");
  }
  await expect(page.locator("#app")).toHaveAttribute("data-initial-items", "8");
  await expect(page.locator("#app")).toHaveAttribute("data-bot-difficulty", "hard");
  await expect(page.locator("#app")).toHaveAttribute("data-collapse-speed", "slow");
  await expect(page.locator("#renderer-status")).toHaveText("일시 정지");
  await page.clock.fastForward(600);
  await expect(page.locator("#game-telemetry")).toHaveAttribute("data-tick", "0");
  await expect(page.locator("#game-telemetry")).toHaveAttribute(
    "data-countdown",
    countdownPauseSnapshot.countdown ?? "",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const heldMovementStart = await readCameraPosition(page);
  await page.keyboard.down("ArrowUp");
  try {
    await finishInstalledClockCountdown(page);
    await fastForwardUntilCameraMoved(page, heldMovementStart);
  } finally {
    await page.keyboard.up("ArrowUp");
  }
  await expect(page.locator("#round-message")).toHaveText("시작!");
  await expect(page.locator("#game-telemetry")).toHaveAttribute("data-action", "Ready");
  await expect(page.locator("#inventory-actions")).toBeVisible();
  await expect(page.locator("#skill-actions")).toBeVisible();
  await expect(page.locator("#use-skill-slot-0")).toContainText("Q · 잔상 회피");
  await expect(page.locator("#use-skill-slot-1")).toContainText("W · 파동탄");
  await expect(page.locator("#use-grapple")).toContainText("E · 구조 갈고리");
  await expect(page.locator("#use-item-slot-0")).toContainText("D · 비누 · 4회");
  const actionHudButtons = page.locator(".action-hud button");
  await expect(actionHudButtons).toHaveCount(4);
  const actionHudPositions = await actionHudButtons.evaluateAll((buttons) =>
    buttons.map((button) => {
      const bounds = button.getBoundingClientRect();
      return { left: Math.round(bounds.left), top: Math.round(bounds.top) };
    }),
  );
  expect(actionHudPositions.map(({ left }) => left)).toEqual([
    actionHudPositions[0]?.left,
    actionHudPositions[0]?.left,
    actionHudPositions[0]?.left,
    actionHudPositions[0]?.left,
  ]);
  expect(
    actionHudPositions.every(
      ({ top }, index) => index === 0 || top > (actionHudPositions[index - 1]?.top ?? top),
    ),
  ).toBe(true);
  const viewport = page.viewportSize();
  const arenaPanelBounds = await page.locator(".arena-panel").boundingBox();
  expect(viewport).not.toBeNull();
  expect(arenaPanelBounds).not.toBeNull();
  if (viewport !== null && arenaPanelBounds !== null) {
    expect(Math.round(arenaPanelBounds.x)).toBe(0);
    expect(Math.round(arenaPanelBounds.y)).toBe(0);
    expect(Math.round(arenaPanelBounds.width)).toBe(viewport.width);
    expect(Math.round(arenaPanelBounds.height)).toBe(viewport.height);
  }
  await expect(page.locator("body")).toHaveClass(/game-screen-active/u);
  await expect(page.locator("#pause-menu")).toBeHidden();
  await expect(page.locator("#game-telemetry")).toBeHidden();
  expect(
    await page.locator("#app").evaluate((element) => getComputedStyle(element).userSelect),
  ).toBe("none");
  const activeCanvas = await captureArenaCanvas(page);
  expect(activeCanvas.summary.uniqueColorBuckets).toBeGreaterThan(4);
  expect(activeCanvas.summary.luminanceRange).toBeGreaterThan(20);
  if (!productionArtifact) {
    const positionBefore = await readCameraPosition(page);
    await page.keyboard.press("KeyD");
    await expect(page.locator("#targeting-help")).toBeVisible();
    await expect(page.locator("#arena-host")).toHaveAttribute("data-targeting", "valid");
    expect(await readCameraPosition(page)).toBe(positionBefore);

    await page.keyboard.press("ArrowRight");
    expect(await readCameraPosition(page)).toBe(positionBefore);
    await page.keyboard.press("KeyD");
    await expect(page.locator("#targeting-help")).toBeHidden();
    await expect(page.locator("#arena-host")).toHaveAttribute("data-targeting", "valid");
    expect(await readCameraPosition(page)).toBe(positionBefore);

    await faceArenaDirection(page, "ArrowRight");
    expect(await readCameraPosition(page)).not.toBe(positionBefore);
    const movedCanvas = await captureArenaCanvas(page);
    expect(movedCanvas.png.equals(activeCanvas.png)).toBe(false);

    const arrowPositionBefore = await readCameraPosition(page);
    await faceArenaDirection(page, "ArrowUp");
    expect(await readCameraPosition(page)).not.toBe(arrowPositionBefore);
  }

  const tickBeforeProgressCheck = await readSimulationTick(page);
  if (tickBeforeProgressCheck === 0) {
    await waitForSimulationTickAdvance(page, tickBeforeProgressCheck);
  }
  await expect(readSimulationTick(page)).resolves.toBeGreaterThan(0);
  await expect
    .poll(async () =>
      Number(await page.locator("#game-telemetry").getAttribute("data-backlog-ticks")),
    )
    .toBeLessThanOrEqual(8);

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("heading", { name: "일시정지" })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("#renderer-status")).toHaveAttribute(
    "data-state",
    /playing|spectating/u,
  );
  await expect(page.locator("#pause-menu")).toBeHidden();

  const arenaBounds = await page.locator("#arena-host").boundingBox();
  expect(arenaBounds).not.toBeNull();
  if (arenaBounds !== null) {
    const originX = arenaBounds.x + arenaBounds.width / 2;
    const originY = arenaBounds.y + arenaBounds.height / 2;
    const cameraBeforeRightClick = await readCameraPosition(page);
    await page.mouse.move(originX, originY);
    await page.mouse.down();
    await page.mouse.move(originX + 80, originY, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator("#arena-host")).not.toHaveAttribute("data-pointer-moving", "true");
    await page.mouse.click(originX + 80, originY, { button: "right" });
    await fastForwardUntilCameraMoved(page, cameraBeforeRightClick);
  }
  await expect(page.locator("#arena-host")).not.toHaveAttribute("data-pointer-moving", "true");

  await page.keyboard.press("Shift");
  await expect(page.locator("#pause-menu")).toBeHidden();
  await page.keyboard.press("p");
  await expect(page.locator("#pause-menu")).toBeVisible();
  await expect(page.getByRole("heading", { name: "일시정지" })).toBeVisible();
  await expect(page.locator("#game-telemetry")).toBeVisible();
  await expect(page.getByRole("heading", { name: "이번 라운드" })).toBeVisible();
  await expect(page.locator("#round-distance-moved")).toHaveText(/칸$/u);
  await expect(page.locator("#round-damage-dealt")).not.toBeEmpty();
  await expect(page.locator("#round-damage-taken")).not.toBeEmpty();
  await expect(page.locator("#round-damage-blocked")).toHaveText(/%$/u);
  await expect(page.locator("#round-slowed-time")).toHaveText(/초$/u);
  await expect(page.locator("#round-skill-uses li")).toHaveCount(2);
  const manuallyPausedTick = await readSimulationTick(page);
  await page.clock.fastForward(600);
  expect(await readSimulationTick(page)).toBe(manuallyPausedTick);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  await expect(page.locator("#pause-menu")).toBeVisible();
  await page.getByRole("button", { name: "계속", exact: true }).click();
  await expect(page.locator("#pause-menu")).toBeHidden();

  await page.keyboard.press("p");
  const soundButton = page.getByRole("button", { name: "소리 끄기" });
  await soundButton.click();
  await expect(page.getByRole("button", { name: "소리 켜기" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "소리 켜기" }).click();
  await expect(page.getByRole("button", { name: "소리 끄기" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await page.getByRole("button", { name: "메뉴로" }).click();

  await expect(page.locator("#app")).toHaveAttribute("data-screen", "menu");
  await expect(page.getByRole("button", { name: "게임 시작" })).toBeFocused();
  await expect(page.locator("#game-telemetry")).toBeHidden();
  await expect(page.locator("#inventory-actions")).toBeHidden();
  await expect(page.locator("#skill-actions")).toBeHidden();
});

test("offers six direct kill-reward traits without a progression tree", async ({ page }) => {
  await page.goto("/");
  await page.locator("#stat-upgrade-overlay").evaluate((overlay) => {
    const app = document.querySelector<HTMLElement>("#app");
    if (app === null) {
      throw new Error("Missing app shell for trait-choice layout test");
    }
    app.dataset.screen = "arena";
    document.body.classList.add("game-screen-active");
    overlay.removeAttribute("hidden");
  });
  await expect(page.locator("#stat-upgrade-overlay")).toBeVisible();
  await expect(page.getByRole("heading", { name: "전투 특성 선택" })).toBeVisible();
  await expect(page.locator("#stat-upgrade-form [data-trait-choice]")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "저장하고 계속" })).toBeDisabled();
  await page.locator('input[name="upgradeChoice"][value="mobility"]').check();
  await expect(page.locator('input[name="upgradeChoice"][value="mobility"]')).toBeChecked();
  await expect(page.getByRole("button", { name: "저장하고 계속" })).toBeEnabled();
  await page.locator('input[name="upgradeChoice"][value="power"]').focus();
  await expect(page.locator('input[name="upgradeChoice"][value="power"]')).toBeFocused();

  await page.setViewportSize({ width: 420, height: 740 });
  const pageWidth = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(pageWidth.bodyWidth).toBeLessThanOrEqual(pageWidth.viewportWidth);
  const pageScrollBefore = await page.evaluate(() => window.scrollY);
  await page.locator(".trait-upgrade__choices").hover();
  await page.mouse.wheel(0, 600);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore);
  await expect(page.getByRole("button", { name: "저장하고 계속" })).toBeVisible();
});

test("equips Brick Bag in a live production round", async ({ page }) => {
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await openSettings(page);
  await selectStartingItem(page, "brick-bag");
  await allocateStrengthBuild(page);
  await expect(page.locator('input[name="startingItem"][value="brick-bag"]')).toBeChecked();
  await saveSettings(page);
  await startGame(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active", { timeout: 5_000 });
  await expect(page.locator("#stat-status")).toBeVisible();
  await expect(page.locator("#power-bonus")).toHaveText("무게 +0% · 위력 +0%");
  await expect(page.locator("#stability-bonus")).toHaveText("밀침 +0% · 제어 -0%");
  await expect(page.locator("#mobility-bonus")).toHaveText(
    "이동 +0% · 재사용 -0% · 마나 -0% · 휘청 -0%",
  );
  await expect(page.locator("#reflex-bonus")).toHaveText("피해 -0% · 보호막 +0%");
  await expect(page.locator("#use-skill-slot-0")).toContainText("Q · 잔상 회피");
  await expect(page.locator("#use-skill-slot-0")).toHaveAttribute("data-state", "ready");
  await expect(page.locator("#use-skill-slot-1")).toContainText("W · 파동탄");
  await expect(page.locator("#use-item-slot-0")).toContainText("D · 벽돌 가방 · 3회");
});

test("equips and preserves a Boat while standing on land", async ({ page }) => {
  await installDeterministicClock(page);
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await pauseInstalledClock(page);
  await openSettings(page);
  await selectStartingItem(page, "boat");
  await expect(page.locator('input[name="startingItem"][value="boat"]')).toBeChecked();
  await saveSettings(page);
  await startGame(page);
  await finishInstalledClockCountdown(page);
  await expect(page.locator("#use-item-slot-0")).toContainText("D · 배 · 1회");
  await page.keyboard.press("KeyD");
  await expect(page.locator("#use-item-slot-0")).toContainText("D · 배 · 1회");
});

test("equips and places a timed bomb in a fresh round", async ({ page }) => {
  test.setTimeout(60_000);
  await installDeterministicClock(page);
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await pauseInstalledClock(page);
  await openSettings(page);
  await selectStartingItem(page, "bomb");
  await expect(page.locator('input[name="startingItem"][value="bomb"]')).toBeChecked();
  await saveSettings(page);
  await startGame(page);
  await finishInstalledClockCountdown(page);
  await expect(page.locator("#use-item-slot-0")).toContainText("D · 시한폭탄 · 2회");
  await expect(page.locator("#use-item-slot-0")).toBeEnabled();
  await placeGroundItemAtPlayer(page, "시한폭탄 · 1회");
  await expect(page.locator("#use-item-slot-0")).toContainText("시한폭탄 · 1회");
  await expect(page.locator("#round-message")).toHaveText("폭탄을 놨어. 3.25초 뒤 터져.");
});

test("@extended fires the built-in grapple in a fresh round", async ({ page }) => {
  test.setTimeout(60_000);
  await installDeterministicClock(page);
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await pauseInstalledClock(page);
  await openSettings(page);
  await selectStartingItem(page, "brick-bag");
  await expect(page.locator('input[name="startingItem"][value="brick-bag"]')).toBeChecked();
  await saveSettings(page);
  await startGame(page);
  await finishInstalledClockCountdown(page);
  await placeDirectionalBrickAnchor(page, "ArrowUp");
  await page.keyboard.down("ArrowDown");
  await page.clock.fastForward(600);
  await page.keyboard.up("ArrowDown");
  await expect(page.locator("#use-grapple")).toContainText("E · 구조 갈고리 · 준비");
  await useDirectionalGrapple(page, ["ArrowUp"]);
  await expect(page.locator("#use-grapple")).toBeDisabled();
});

test("offers a working touch joystick and action buttons on a narrow viewport", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  const versionHistoryButton = page.getByRole("button", { name: "버전 기록", exact: true });
  await versionHistoryButton.click();
  const mobileHistoryLayout = await page.locator("#version-history").evaluate((panel) => {
    const firstCard = panel.querySelector("#version-history-list > li");
    const currentEntry = panel.querySelector("#version-history-list details[data-current='true']");
    return {
      cardWidth: firstCard?.getBoundingClientRect().width ?? 0,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      currentEntryOpen: currentEntry?.hasAttribute("open") ?? false,
      collapsedEntries: panel.querySelectorAll("#version-history-list details:not([open])").length,
    };
  });
  expect(mobileHistoryLayout.documentWidth).toBeLessThanOrEqual(mobileHistoryLayout.viewportWidth);
  expect(mobileHistoryLayout.cardWidth).toBeLessThanOrEqual(mobileHistoryLayout.viewportWidth);
  expect(mobileHistoryLayout.currentEntryOpen).toBe(true);
  expect(mobileHistoryLayout.collapsedEntries).toBe(
    Math.min(VERSION_HISTORY.length, INITIAL_VERSION_HISTORY_COUNT) - 1,
  );
  await page.getByRole("button", { name: "메뉴로", exact: true }).click();
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "menu");
  await expect(versionHistoryButton).toBeFocused();
  await openSettings(page);
  await allocateStrengthBuild(page);
  await saveSettings(page);
  await startGame(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active");

  await page.locator("#touch-skill-0").dispatchEvent("pointerdown", {
    button: 0,
    isPrimary: true,
    pointerId: 99,
    pointerType: "touch",
  });
  await page.locator("#touch-skill-0").dispatchEvent("pointerup", {
    button: 0,
    isPrimary: true,
    pointerId: 99,
    pointerType: "touch",
  });
  await expect(page.locator("#targeting-help")).toBeVisible();
  await page.locator("#touch-skill-0").dispatchEvent("pointerdown", {
    button: 0,
    isPrimary: true,
    pointerId: 100,
    pointerType: "touch",
  });
  await page.locator("#touch-skill-0").dispatchEvent("pointerup", {
    button: 0,
    isPrimary: true,
    pointerId: 100,
    pointerType: "touch",
  });
  await expect(page.locator("#targeting-help")).toBeHidden();
  await expect(page.locator("#mana-value")).not.toHaveText("100 / 100");

  const joystick = page.locator("#pointer-joystick");
  await expect(joystick).toBeVisible();
  await restartIfEliminated(page);
  await dragJoystickToMoveCamera(page, joystick);
});

test("keeps filled scoreboard rows compact on a narrow phone", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const entries = Array.from({ length: 12 }, (_, index) => ({
      id: `2026-08-05T00:00:0${index}.000Z:${index + 1}`,
      playedAt: `2026-08-05T00:00:0${index}.000Z`,
      rank: 1 + ((index * 7) % 50),
      participantCount: 70,
      score: 1000 + index * 137,
      eliminations: (index * 3) % 12,
      survivalSeconds: 180 + index * 42,
      outcome: index % 4 === 0 ? ("victory" as const) : ("defeat" as const),
    }));
    localStorage.setItem("shovefall.scoreboard.v1", JSON.stringify(entries));
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.getByRole("button", { name: "점수표", exact: true }).click();
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "scoreboard");
  await expect(page.locator("#scoreboard-list > li")).toHaveCount(10);

  const layout = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#scoreboard-list > li")];
    const heights = rows.map((row) => Math.round(row.getBoundingClientRect().height));
    return {
      heights,
      tallest: Math.max(...heights),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      cellColumns: getComputedStyle(
        document.querySelector(".scoreboard__stats") ?? document.body,
      ).gridTemplateColumns.split(" ").length,
    };
  });
  expect(layout.tallest).toBeLessThanOrEqual(170);
  expect(layout.cellColumns).toBe(2);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
});

test("repeats attribute allocation while an increment is held", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  const increment = page.getByRole("button", { name: "완력 1 올리기" });
  await increment.dispatchEvent("pointerdown", {
    button: 0,
    isPrimary: true,
    pointerId: 11,
    pointerType: "touch",
  });
  await page.waitForTimeout(800);
  await increment.dispatchEvent("pointerup", {
    button: 0,
    isPrimary: true,
    pointerId: 11,
    pointerType: "touch",
  });
  const strength = Number(await page.locator("#starting-attribute-strength").textContent());
  expect(strength).toBeGreaterThanOrEqual(4);
  expect(Number(await page.locator("#starting-attribute-remaining").textContent())).toBe(
    20 - strength,
  );
  await page.getByRole("button", { name: "취소" }).click();
});

test("offers five-point attribute steps on desktop without clipping the cards", async ({
  page,
}) => {
  await page.goto("/");
  await openSettings(page);
  await expect(page.getByRole("button", { name: "완력 5 올리기" })).toBeVisible();
  await page.getByRole("button", { name: "완력 5 올리기" }).click();
  await expect(page.locator("#starting-attribute-strength")).toHaveText("5");
  await expect(page.locator("#starting-attribute-remaining")).toHaveText("15");

  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>(".starting-attribute")];
    const steppers = cards.map((card) => {
      const cardRect = card.getBoundingClientRect();
      const stepper = card.querySelector<HTMLElement>(".starting-attribute__stepper");
      const stepperRect = stepper?.getBoundingClientRect();
      return {
        cardLeft: cardRect.left,
        cardRight: cardRect.right,
        stepperLeft: stepperRect?.left ?? 0,
        stepperRight: stepperRect?.right ?? 0,
      };
    });
    return {
      steppers,
      columns: getComputedStyle(
        document.querySelector(".starting-attributes__grid") ?? document.body,
      ).gridTemplateColumns.split(" ").length,
      docOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  expect(layout.columns).toBe(2);
  for (const stepper of layout.steppers) {
    expect(stepper.stepperLeft).toBeGreaterThanOrEqual(stepper.cardLeft - 1);
    expect(stepper.stepperRight).toBeLessThanOrEqual(stepper.cardRight + 1);
  }
  expect(layout.docOverflowX).toBe(false);
});

test("fills every remaining attribute point with one tap and re-enables after a change", async ({
  page,
}) => {
  await page.goto("/");
  await openSettings(page);
  const strengthMax = page.getByRole("button", { name: "완력 모두 올리기" });
  await expect(strengthMax).toBeEnabled();
  await strengthMax.click();
  await expect(page.locator("#starting-attribute-strength")).toHaveText("20");
  await expect(page.locator("#starting-attribute-remaining")).toHaveText("0");
  await expect(strengthMax).toBeDisabled();

  await page.getByRole("button", { name: "완력 5 내리기" }).click();
  await expect(page.locator("#starting-attribute-strength")).toHaveText("15");
  await expect(page.locator("#starting-attribute-remaining")).toHaveText("5");
  await expect(strengthMax).toBeEnabled();
  await strengthMax.click();
  await expect(page.locator("#starting-attribute-strength")).toHaveText("20");
  await expect(page.locator("#starting-attribute-remaining")).toHaveText("0");

  await page.getByRole("button", { name: "완력 5 내리기" }).click();
  await expect(page.locator("#starting-attribute-strength")).toHaveText("15");
  await expect(page.locator("#starting-attribute-remaining")).toHaveText("5");
  await expect(strengthMax).toBeEnabled();
  await page.getByRole("button", { name: "의지 5 올리기" }).click();
  await expect(page.locator("#starting-attribute-willpower")).toHaveText("5");
  await expect(page.locator("#starting-attribute-remaining")).toHaveText("0");
  await expect(strengthMax).toBeDisabled();
  await page.getByRole("button", { name: "의지 5 내리기" }).click();
  await expect(strengthMax).toBeEnabled();
});

test("keeps every attribute stepper button inside its card without overlap", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>(".starting-attribute")];
    return cards.map((card) => {
      const cardRect = card.getBoundingClientRect();
      const buttons = [
        ...card.querySelectorAll<HTMLElement>(".starting-attribute__stepper button"),
      ].map((button) => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      });
      const overlaps = buttons.some((button, index) => {
        const previous = buttons[index - 1];
        return previous !== undefined && index > 0 && button.left < previous.right - 1;
      });
      const last = buttons.at(-1);
      return {
        cardLeft: cardRect.left,
        cardRight: cardRect.right,
        buttonCount: buttons.length,
        overlaps,
        maxRight: last?.right ?? 0,
      };
    });
  });
  for (const card of layout) {
    expect(card.buttonCount).toBe(5);
    expect(card.overlaps).toBe(false);
    expect(card.maxRight).toBeLessThanOrEqual(card.cardRight + 1);
  }
});

test("keeps the version-history document short and reveals older entries on demand", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "버전 기록", exact: true }).click();
  await expect(page.locator("#version-history")).toBeVisible();

  const initial = await page.locator("#version-history").evaluate((panel) => {
    const showMore = panel.querySelector<HTMLButtonElement>("#show-older-versions");
    return {
      count: panel.querySelectorAll("#version-history-list details").length,
      openCount: panel.querySelectorAll("#version-history-list details[open]").length,
      docHeight: document.documentElement.scrollHeight,
      showMoreVisible: showMore !== null && !showMore.hidden,
    };
  });
  expect(initial.count).toBe(Math.min(VERSION_HISTORY.length, INITIAL_VERSION_HISTORY_COUNT));
  expect(initial.openCount).toBe(1);
  expect(initial.showMoreVisible).toBe(VERSION_HISTORY.length > INITIAL_VERSION_HISTORY_COUNT);

  await page.getByRole("button", { name: "이전 버전 더 보기" }).click();
  const after = await page.locator("#version-history").evaluate((panel) => {
    const showMore = panel.querySelector<HTMLButtonElement>("#show-older-versions");
    return {
      count: panel.querySelectorAll("#version-history-list details").length,
      openCount: panel.querySelectorAll("#version-history-list details[open]").length,
      docHeight: document.documentElement.scrollHeight,
      showMoreHidden: showMore === null || showMore.hidden,
    };
  });
  expect(after.count).toBe(VERSION_HISTORY.length);
  expect(after.openCount).toBe(1);
  expect(after.showMoreHidden).toBe(true);
});

test.describe("coarse-pointer surfaces", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("collapses the build summary and keeps the arena readout clear of touch controls", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await installFixedRoundSeed(page, 1, 0);
    await page.goto("/");
    await page.getByRole("button", { name: "게임 시작" }).click();
    await page.getByRole("button", { name: "설정하러 가기" }).click();
    await expect(page.locator("#app")).toHaveAttribute("data-screen", "settings");
    await expect(page.locator("#starting-build-summary")).not.toHaveAttribute("open", "");
    await expect(page.getByText("길게 누르면 계속 · 5씩 버튼 · MAX는 남은 전부")).toBeVisible();
    await expect(page.getByText("Ctrl+클릭은 5씩 · MAX는 남은 전부")).toBeHidden();
    const stepperBox = await page.getByRole("button", { name: "완력 1 올리기" }).boundingBox();
    expect(stepperBox).not.toBeNull();
    if (stepperBox !== null) {
      expect(stepperBox.y).toBeGreaterThan(0);
      expect(stepperBox.y).toBeLessThan(844);
    }

    const increment = page.getByRole("button", { name: "완력 1 올리기" });
    await increment.dispatchEvent("pointerdown", {
      button: 0,
      isPrimary: true,
      pointerId: 21,
      pointerType: "touch",
    });
    await page.waitForTimeout(800);
    await increment.dispatchEvent("pointerup", {
      button: 0,
      isPrimary: true,
      pointerId: 21,
      pointerType: "touch",
    });
    const strength = Number(await page.locator("#starting-attribute-strength").textContent());
    expect(strength).toBeGreaterThanOrEqual(4);
    await clickRepeatedly(page.getByRole("button", { name: "완력 1 올리기" }), 20 - strength);
    await expect(page.locator("#starting-attribute-remaining")).toHaveText("0");
    await saveSettings(page);
    await startGame(page);
    await expect(page.locator("#app")).toHaveAttribute("data-round", "active");

    await expect(page.locator(".action-hud")).toBeHidden();
    await expect(page.locator("#pointer-joystick")).toBeVisible();
    await expect(page.locator("#touch-skill-0")).toHaveText("Q");
    await expect(page.locator("#toggle-stat-status")).toBeVisible();
    await expect(page.locator("#stat-status")).toBeHidden();
    await expect(page.locator("#stat-status-summary")).toHaveText(/^\d+ \/ \d+ · \d+ \/ \d+$/u);
    await page.locator("#touch-skill-0").dispatchEvent("pointerdown", {
      button: 0,
      isPrimary: true,
      pointerId: 41,
      pointerType: "touch",
    });
    await page.locator("#touch-skill-0").dispatchEvent("pointerup", {
      button: 0,
      isPrimary: true,
      pointerId: 41,
      pointerType: "touch",
    });
    await expect(page.locator("#targeting-help")).toBeVisible();
    const helpBox = await page.locator("#targeting-help").boundingBox();
    const actionsBox = await page.locator(".touch-actions").boundingBox();
    expect(helpBox).not.toBeNull();
    expect(actionsBox).not.toBeNull();
    if (helpBox !== null && actionsBox !== null) {
      expect(helpBox.y + helpBox.height).toBeLessThanOrEqual(actionsBox.y + 4);
    }
    await page.locator("#toggle-stat-status").click();
    await expect(page.locator("#stat-status")).toBeVisible();
    const readoutBox = await page.locator("#stat-status").boundingBox();
    const joystickBox = await page.locator("#pointer-joystick").boundingBox();
    expect(readoutBox).not.toBeNull();
    expect(joystickBox).not.toBeNull();
    if (readoutBox !== null && joystickBox !== null) {
      expect(readoutBox.y + readoutBox.height).toBeLessThanOrEqual(joystickBox.y + 4);
    }
    await expect(page.locator("#stat-status")).toHaveCSS(
      "grid-template-columns",
      /^\d+(?:\.\d+)?px(?: \d+(?:\.\d+)?px){3}$/u,
    );

    await page.keyboard.press("p");
    await expect(page.locator("#pause-menu")).toBeVisible();
    await expect(page.locator("#pause-control-guide")).not.toHaveAttribute("open", "");
    await expect(page.locator("#pause-control-guide .control-guide")).toBeHidden();
    await expect(page.locator(".round-statistics .round-statistics__grid")).toHaveCSS(
      "grid-template-columns",
      /^\d+(?:\.\d+)?px \d+(?:\.\d+)?px$/u,
    );
    await expect(page.locator("#game-telemetry")).toHaveCSS(
      "grid-template-columns",
      /^\d+(?:\.\d+)?px \d+(?:\.\d+)?px$/u,
    );
    const pausePanelBox = await page.locator(".pause-menu__panel").boundingBox();
    const resumeBox = await page.getByRole("button", { name: "계속", exact: true }).boundingBox();
    expect(pausePanelBox).not.toBeNull();
    expect(resumeBox).not.toBeNull();
    if (pausePanelBox !== null && resumeBox !== null) {
      expect(resumeBox.y).toBeGreaterThanOrEqual(pausePanelBox.y - 4);
      expect(resumeBox.y + resumeBox.height).toBeLessThanOrEqual(844);
    }
  });

  test("keeps the stat toggle clear of the pause trigger on a common phone", async ({ page }) => {
    test.setTimeout(60_000);
    await installFixedRoundSeed(page, 1, 0);
    await page.goto("/");
    await openSettings(page);
    await saveSettings(page);
    await startGame(page);
    await expect(page.locator("#app")).toHaveAttribute("data-round", "active");

    await expect(page.locator("#toggle-stat-status")).toBeVisible();
    await expect(page.locator("#pause-round")).toBeVisible();
    const toggleBox = await page.locator("#toggle-stat-status").boundingBox();
    const pauseBox = await page.locator("#pause-round").boundingBox();
    expect(toggleBox).not.toBeNull();
    expect(pauseBox).not.toBeNull();
    if (toggleBox !== null && pauseBox !== null) {
      expect(pauseBox.x).toBeGreaterThanOrEqual(toggleBox.x + toggleBox.width + 4);
    }
  });

  test("keeps narrow-phone combat controls clear of each other", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 320, height: 568 });
    await installFixedRoundSeed(page, 1, 0);
    await page.goto("/");
    await openSettings(page);
    await saveSettings(page);
    await startGame(page);
    await expect(page.locator("#app")).toHaveAttribute("data-round", "active");

    await expect(page.locator("#pointer-joystick")).toBeVisible();
    await expect(page.locator(".touch-actions")).toBeVisible();
    await expect(page.locator("#toggle-stat-status")).toBeVisible();
    await expect(page.locator("#pause-round")).toBeVisible();

    const joystickBox = await page.locator("#pointer-joystick").boundingBox();
    const actionsBox = await page.locator(".touch-actions").boundingBox();
    const pauseBox = await page.locator("#pause-round").boundingBox();
    const toggleBox = await page.locator("#toggle-stat-status").boundingBox();
    expect(joystickBox).not.toBeNull();
    expect(actionsBox).not.toBeNull();
    expect(pauseBox).not.toBeNull();
    expect(toggleBox).not.toBeNull();
    if (joystickBox !== null && actionsBox !== null) {
      expect(joystickBox.x + joystickBox.width).toBeLessThanOrEqual(actionsBox.x + 4);
    }
    if (pauseBox !== null && toggleBox !== null) {
      expect(pauseBox.x).toBeGreaterThanOrEqual(toggleBox.x + toggleBox.width + 4);
      expect(pauseBox.y).toBeLessThanOrEqual(toggleBox.y + 4);
    }

    await page.locator("#toggle-stat-status").click();
    await expect(page.locator("#stat-status")).toBeVisible();
    const readoutBox = await page.locator("#stat-status").boundingBox();
    expect(readoutBox).not.toBeNull();
    if (readoutBox !== null && joystickBox !== null) {
      expect(readoutBox.y + readoutBox.height).toBeLessThanOrEqual(joystickBox.y + 4);
    }
    await expect(page.locator("#stat-status")).toHaveCSS(
      "grid-template-columns",
      /^\d+(?:\.\d+)?px(?: \d+(?:\.\d+)?px){3}$/u,
    );
  });

  test("keeps the expanded stat readout clear of touch controls in landscape", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 568, height: 320 });
    await installFixedRoundSeed(page, 1, 0);
    await page.goto("/");
    await openSettings(page);
    await saveSettings(page);
    await startGame(page);
    await expect(page.locator("#app")).toHaveAttribute("data-round", "active");

    const toggleBox = await page.locator("#toggle-stat-status").boundingBox();
    await page.locator("#toggle-stat-status").click();
    await expect(page.locator("#stat-status")).toBeVisible();
    const readoutBox = await page.locator("#stat-status").boundingBox();
    const joystickBox = await page.locator("#pointer-joystick").boundingBox();
    expect(toggleBox).not.toBeNull();
    expect(readoutBox).not.toBeNull();
    expect(joystickBox).not.toBeNull();
    if (toggleBox !== null && readoutBox !== null && joystickBox !== null) {
      expect(readoutBox.y + readoutBox.height).toBeLessThanOrEqual(joystickBox.y + 4);
      expect(toggleBox.y + toggleBox.height).toBeLessThanOrEqual(joystickBox.y + 4);
      expect(readoutBox.y).toBeGreaterThanOrEqual(0);
      expect(readoutBox.y + readoutBox.height).toBeLessThanOrEqual(toggleBox.y + 4);
      expect(readoutBox.width).toBeGreaterThanOrEqual(500);
    }
    await expect(page.locator("#stat-status")).toHaveCSS(
      "grid-template-columns",
      /^\d+(?:\.\d+)?px \d+(?:\.\d+)?px$/u,
    );
    await expect(page.locator("#stat-status > div").first()).toHaveCSS(
      "grid-template-columns",
      /^\d+(?:\.\d+)?px \d+(?:\.\d+)?px$/u,
    );
    const panelOverflow = await page.locator("#stat-status").evaluate((panel) => ({
      scrollHeight: panel.scrollHeight,
      clientHeight: panel.clientHeight,
    }));
    expect(panelOverflow.scrollHeight).toBeLessThanOrEqual(panelOverflow.clientHeight + 1);
  });

  test("keeps completed-round actions and statistics reachable on a narrow phone", async ({
    page,
  }) => {
    await page.goto("/");
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => {
      const app = document.querySelector("#app");
      const pause = document.querySelector("#pause-menu");
      for (const candidate of [
        pause?.closest("section"),
        pause?.closest("main"),
        document.querySelector("#arena-host"),
      ]) {
        if (candidate) candidate.removeAttribute("hidden");
      }
      pause?.removeAttribute("hidden");
      pause?.setAttribute("data-mode", "completed");
      app?.setAttribute("data-screen", "arena");
      app?.setAttribute("data-pause-menu", "open");
      app?.setAttribute("data-round", "completed");
      document.querySelector("#arena-actions")?.removeAttribute("hidden");
      document.querySelector("#copy-round-report")?.removeAttribute("hidden");
      document.querySelector("#view-finished-map")?.removeAttribute("hidden");
      document.querySelector("#resume-round")?.setAttribute("hidden", "");
      const message = document.querySelector("#round-message");
      if (message) message.textContent = "라운드 종료 · 7위";
      const rankOutput = document.querySelector("#round-current-rank");
      if (rankOutput instanceof HTMLOutputElement) rankOutput.value = "7위";
      const elapsedOutput = document.querySelector("#round-elapsed-time");
      if (elapsedOutput instanceof HTMLOutputElement) elapsedOutput.value = "3:24";
      const skillList = document.querySelector("#round-skill-uses");
      if (skillList) {
        skillList.replaceChildren(
          ...["빙결 지대", "수호 방패"].map((label) => {
            const item = document.createElement("li");
            const span = document.createElement("span");
            const output = document.createElement("output");
            span.textContent = label;
            output.value = "6회";
            item.append(span, output);
            return item;
          }),
        );
      }
      document.body.classList.add("game-screen-active");
    });
    await expect(page.locator("#pause-menu")).toHaveAttribute("data-mode", "completed");
    await expect(page.locator("#resume-round")).toBeHidden();
    await expect(page.locator("#game-telemetry")).toBeHidden();
    await expect(page.locator("#round-skill-uses li")).toHaveCount(2);

    const layout = await page.evaluate(() => {
      const panel = document.querySelector(".pause-menu__panel");
      const actions = document.querySelector("#arena-actions");
      const statistics = document.querySelector(".round-statistics");
      const buttons = [...document.querySelectorAll("#arena-actions button:not([hidden])")];
      return {
        panelScrollHeight: panel?.scrollHeight ?? 0,
        panelClientHeight: panel?.clientHeight ?? 0,
        actionsAboveStatistics:
          actions !== null &&
          statistics !== null &&
          (actions.compareDocumentPosition(statistics) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        buttonHeights: buttons.map((button) => Math.round(button.getBoundingClientRect().height)),
        bodyOverflow: document.body.scrollWidth > document.documentElement.clientWidth,
      };
    });
    expect(layout.actionsAboveStatistics).toBe(true);
    expect(layout.panelScrollHeight).toBeLessThanOrEqual(layout.panelClientHeight + 2);
    expect(layout.buttonHeights.every((height) => height >= 44)).toBe(true);
    expect(layout.bodyOverflow).toBe(false);
  });

  test("keeps the paused panel on one screen with the resume action visible on a narrow phone", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await installFixedRoundSeed(page, 1, 0);
    await page.goto("/");
    await page.setViewportSize({ width: 320, height: 568 });
    await openSettings(page);
    await saveSettings(page);
    await startGame(page);
    await expect(page.locator("#app")).toHaveAttribute("data-round", "active");
    await page.keyboard.press("p");
    await expect(page.locator("#pause-menu")).toBeVisible();
    await expect(page.getByRole("button", { name: "계속", exact: true })).toBeVisible();

    // The dev-only telemetry block is absent from production builds; hide it so the
    // measurement matches the artifact a real player sees.
    await page.locator("#developer-telemetry").evaluate((details: HTMLElement) => {
      details.hidden = true;
    });

    const layout = await page.evaluate(() => {
      const panel = document.querySelector(".pause-menu__panel");
      const telemetry = document.querySelector("#game-telemetry");
      const statistics = document.querySelector(".round-statistics");
      const resume = document.querySelector("#resume-round");
      const guide = document.querySelector("#pause-control-guide");
      const resumeVisible =
        resume instanceof HTMLElement &&
        !resume.hidden &&
        getComputedStyle(resume).display !== "none";
      const resumeRect = resume?.getBoundingClientRect();
      return {
        panelScrollHeight: panel?.scrollHeight ?? 0,
        panelClientHeight: panel?.clientHeight ?? 0,
        telemetryHeight: Math.round(telemetry?.getBoundingClientRect().height ?? 0),
        statisticsTop: Math.round(statistics?.getBoundingClientRect().top ?? 0),
        resumeBottom: resumeRect === undefined ? null : Math.round(resumeRect.bottom),
        guideHidden: guide === null || getComputedStyle(guide).display === "none",
        bodyOverflow: document.body.scrollWidth > document.documentElement.clientWidth,
        resumeVisible,
      };
    });
    expect(layout.panelScrollHeight).toBeLessThanOrEqual(layout.panelClientHeight + 2);
    expect(layout.telemetryHeight).toBeLessThan(110);
    expect(layout.statisticsTop).toBeGreaterThan(0);
    expect(layout.statisticsTop).toBeLessThan(400);
    expect(layout.resumeVisible).toBe(true);
    expect(layout.resumeBottom).not.toBeNull();
    if (layout.resumeBottom !== null) {
      expect(layout.resumeBottom).toBeLessThanOrEqual(568);
    }
    expect(layout.guideHidden).toBe(true);
    expect(layout.bodyOverflow).toBe(false);
  });

  test("fits the round briefing into the portrait viewport", async ({ page }) => {
    await installFixedRoundSeed(page, 1, 0);
    await page.goto("/");
    await openSettings(page);
    await saveSettings(page);
    await page.getByRole("button", { name: "게임 시작" }).click();
    const briefing = page.getByRole("dialog", {
      name: "포격으로 무너지는 섬에서 끝까지 살아남아.",
    });
    await expect(briefing).toBeVisible();
    await expect(page.getByRole("button", { name: "알겠다요 ㅇㅅㅇ" })).toBeEnabled();

    const layout = await page.evaluate(() => {
      const dialog = document.querySelector("#round-briefing-dialog");
      const rect = dialog?.getBoundingClientRect();
      return {
        scrollHeight: dialog?.scrollHeight ?? 0,
        clientHeight: dialog?.clientHeight ?? 0,
        top: rect?.top ?? 0,
        bottom: rect?.bottom ?? 0,
        innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });
    expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight);
    expect(layout.top).toBeGreaterThanOrEqual(0);
    expect(layout.bottom).toBeLessThanOrEqual(layout.innerHeight);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    await page.getByRole("button", { name: "알겠다요 ㅇㅅㅇ" }).click();
  });

  test("shows the selected loadout in the round briefing", async ({ page }) => {
    await installFixedRoundSeed(page, 1, 0);
    await page.goto("/");
    await openSettings(page);
    await saveSettings(page);
    await page.getByRole("button", { name: "게임 시작" }).click();
    const briefing = page.getByRole("dialog", {
      name: "포격으로 무너지는 섬에서 끝까지 살아남아.",
    });
    await expect(briefing).toBeVisible();
    await expect(page.locator("#briefing-starting-attributes")).toHaveText(
      "완력 4 · 민첩 4 · 체질 4 · 정신 4 · 균형 4 · 의지 0",
    );
    await expect(page.locator("#briefing-starting-skills")).toHaveText("잔상 회피 · 파동탄");
    await expect(page.locator("#briefing-starting-item")).toHaveText("시한폭탄");
    await page.getByRole("button", { name: "알겠다요 ㅇㅅㅇ" }).click();
  });

  test("keeps the settings save action on screen while the form scrolls", async ({ page }) => {
    await installFixedRoundSeed(page, 1, 0);
    await page.goto("/");
    await openSettings(page);
    const save = page.getByRole("button", { name: "설정 저장" });
    await expect(page.locator(".settings-actions")).toHaveCSS("position", "sticky");

    const initial = await page.evaluate(() => {
      const rect = document.querySelector(".settings-actions")?.getBoundingClientRect();
      return {
        top: rect?.top ?? 0,
        bottom: rect?.bottom ?? 0,
        innerHeight,
      };
    });
    expect(initial.top).toBeGreaterThanOrEqual(0);
    expect(initial.bottom).toBeLessThanOrEqual(initial.innerHeight);

    await page.evaluate(() => {
      document.querySelector(".starting-attributes__grid")?.scrollIntoView({
        block: "start",
      });
    });
    const midForm = await page.evaluate(() => {
      const rect = document.querySelector(".settings-actions")?.getBoundingClientRect();
      return {
        top: rect?.top ?? 0,
        bottom: rect?.bottom ?? 0,
        innerHeight,
      };
    });
    expect(midForm.top).toBeGreaterThanOrEqual(0);
    expect(midForm.bottom).toBeLessThanOrEqual(midForm.innerHeight);

    await page.getByRole("tab", { name: "스킬", exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(save).toBeInViewport();
    await page.getByRole("button", { name: "취소" }).click();
  });

  test.describe("landscape menu", () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test("fits every menu action without vertical scrolling", async ({ page }) => {
      await installFixedRoundSeed(page, 1, 0);
      await page.goto("/");
      await expect(page.locator("#app")).toHaveAttribute("data-screen", "menu");
      const layout = await page.evaluate(() => {
        const masthead = document.querySelector(".masthead")?.getBoundingClientRect();
        const actions = document.querySelector(".main-menu__actions")?.getBoundingClientRect();
        return {
          docScrollHeight: document.documentElement.scrollHeight,
          docClientHeight: document.documentElement.clientHeight,
          actionsTop: actions?.top ?? 0,
          actionsBottom: actions?.bottom ?? 0,
          mastheadBottom: masthead?.bottom ?? 0,
          innerHeight,
        };
      });
      expect(layout.docScrollHeight).toBeLessThanOrEqual(layout.docClientHeight);
      expect(layout.actionsBottom).toBeLessThanOrEqual(layout.innerHeight);
      expect(layout.mastheadBottom).toBeLessThanOrEqual(layout.actionsTop);
      await expect(page.getByRole("button", { name: "버전 기록" })).toBeInViewport();
      await expect(page.getByRole("link", { name: "소스 코드" })).toBeInViewport();
    });
  });

  test("keeps preference sliders touch-sized on coarse-pointer surfaces", async ({ page }) => {
    await installFixedRoundSeed(page, 1, 0);
    await page.goto("/");
    await openSettings(page);
    await openSettingsTab(page, "설정");
    const sliders = page.locator('.player-control input[type="range"]');
    await expect(sliders).toHaveCount(2);
    const heights = await sliders.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(28);
    await expect(page.locator(".font-scale-options")).toHaveCSS(
      "grid-template-columns",
      /^\d+(?:\.\d+)?px(?: \d+(?:\.\d+)?px){3}$/u,
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await page.getByRole("button", { name: "취소" }).click();
  });

  test.describe("tablet settings cards", () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test("lays loadout cards in two columns without clipping", async ({ page }) => {
      await installFixedRoundSeed(page, 1, 0);
      await page.goto("/");
      await openSettings(page);
      await openSettingsTab(page, "스킬");
      await expect(page.locator(".skill-loadout-fieldset")).toHaveCSS(
        "grid-template-columns",
        /repeat\(2,\s*minmax\(0px,\s*1fr\)\)|^\d+(?:\.\d+)?px(?: \d+(?:\.\d+)?px)+$/u,
      );
      const clipping = await page.evaluate(() => {
        const cards = [...document.querySelectorAll(".skill-loadout-fieldset .preset-card")];
        return cards.filter((card) => {
          const cardRect = card.getBoundingClientRect();
          return [...card.querySelectorAll("p, dd, strong")].some((text) => {
            const textRect = text.getBoundingClientRect();
            return textRect.bottom > cardRect.bottom + 1 || textRect.right > cardRect.right + 1;
          });
        }).length;
      });
      expect(clipping).toBe(0);
      await openSettingsTab(page, "아이템");
      await expect(page.locator(".loadout-fieldset")).toHaveCSS(
        "grid-template-columns",
        /repeat\(2,\s*minmax\(0px,\s*1fr\)\)|^\d+(?:\.\d+)?px(?: \d+(?:\.\d+)?px)+$/u,
      );
    });
  });

  test.describe("tablet touch controls", () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test("keeps tablet touch buttons inside their grid without horizontal overflow", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await installFixedRoundSeed(page, 1, 0);
      await page.goto("/");
      await openSettings(page);
      await saveSettings(page);
      await startGame(page);
      await expect(page.locator("#app")).toHaveAttribute("data-round", "active");
      await expect(page.locator(".touch-actions")).toBeVisible();

      const layout = await page.evaluate(() => {
        const actions = document.querySelector<HTMLElement>(".touch-actions");
        const root = document.querySelector<HTMLElement>(".touch-controls");
        const buttons = [...document.querySelectorAll(".touch-actions button")].map((button) => {
          const rect = button.getBoundingClientRect();
          return {
            left: Math.round(rect.left * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
          };
        });
        return {
          actionsScrollWidth: actions?.scrollWidth ?? 0,
          actionsClientWidth: actions?.clientWidth ?? 0,
          rootScrollWidth: root?.scrollWidth ?? 0,
          rootClientWidth: root?.clientWidth ?? 0,
          buttons,
          viewportWidth: document.documentElement.clientWidth,
        };
      });
      expect(layout.actionsScrollWidth).toBeLessThanOrEqual(layout.actionsClientWidth);
      expect(layout.rootScrollWidth).toBeLessThanOrEqual(layout.rootClientWidth);
      expect(layout.buttons.length).toBeGreaterThanOrEqual(3);
      for (const button of layout.buttons) {
        expect(button.left).toBeGreaterThanOrEqual(0);
        expect(button.right).toBeLessThanOrEqual(layout.viewportWidth);
        expect(button.width).toBeGreaterThanOrEqual(60);
        expect(button.height).toBeGreaterThanOrEqual(60);
      }
    });
  });

  test.describe("extra-large font", () => {
    test.use({ viewport: { width: 320, height: 568 } });

    test("keeps the longest loadout card under half the screen at extra-large text", async ({
      page,
    }) => {
      await page.goto("/");
      await openSettings(page);
      await saveSettings(page);
      await openSettings(page);
      await openSettingsTab(page, "설정");
      await page.locator('input[name="fontScale"][value="extra-large"]').check();
      await page.getByRole("button", { name: "설정 저장" }).click();
      await openSettings(page);
      await openSettingsTab(page, "아이템");
      const itemLayout = await page.evaluate(() => {
        const cards = [...document.querySelectorAll("#starting-items .preset-card")];
        return {
          maxHeight: Math.max(...cards.map((card) => card.getBoundingClientRect().height)),
          halfViewport: innerHeight / 2,
          rootFont: getComputedStyle(document.documentElement).fontSize,
        };
      });
      expect(itemLayout.rootFont).toBe("22px");
      expect(itemLayout.maxHeight).toBeLessThanOrEqual(itemLayout.halfViewport);
      await openSettingsTab(page, "스킬");
      const skillLayout = await page.evaluate(() => {
        const cards = [...document.querySelectorAll("#starting-skills .preset-card")];
        return {
          maxHeight: Math.max(...cards.map((card) => card.getBoundingClientRect().height)),
          halfViewport: innerHeight / 2,
        };
      });
      expect(skillLayout.maxHeight).toBeLessThanOrEqual(skillLayout.halfViewport);
      await page.getByRole("button", { name: "취소" }).click();
    });

    test("keeps the briefing on one screen at extra-large text", async ({ page }) => {
      await installFixedRoundSeed(page, 1, 0);
      await page.goto("/");
      await openSettings(page);
      await saveSettings(page);
      await openSettings(page);
      await openSettingsTab(page, "설정");
      await page.locator('input[name="fontScale"][value="extra-large"]').check();
      await page.getByRole("button", { name: "설정 저장" }).click();
      await expect(page.locator("#app")).toHaveAttribute("data-screen", "menu");
      await page.getByRole("button", { name: "게임 시작" }).click();
      const briefing = page.getByRole("dialog", {
        name: "포격으로 무너지는 섬에서 끝까지 살아남아.",
      });
      await expect(briefing).toBeVisible();
      await expect(page.getByRole("button", { name: "알겠다요 ㅇㅅㅇ" })).toBeEnabled();
      const layout = await page.evaluate(() => {
        const dialog = document.querySelector("#round-briefing-dialog");
        const rect = dialog?.getBoundingClientRect();
        const confirm = document.querySelector("#confirm-round-briefing")?.getBoundingClientRect();
        return {
          scrollHeight: dialog?.scrollHeight ?? 0,
          clientHeight: dialog?.clientHeight ?? 0,
          top: rect?.top ?? 0,
          bottom: rect?.bottom ?? 0,
          confirmTop: confirm?.top ?? 0,
          confirmBottom: confirm?.bottom ?? 0,
          innerHeight,
          rootFont: getComputedStyle(document.documentElement).fontSize,
        };
      });
      expect(layout.rootFont).toBe("22px");
      expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight);
      expect(layout.top).toBeGreaterThanOrEqual(0);
      expect(layout.bottom).toBeLessThanOrEqual(layout.innerHeight);
      expect(layout.confirmTop).toBeGreaterThanOrEqual(0);
      expect(layout.confirmBottom).toBeLessThanOrEqual(layout.innerHeight);
      await page.getByRole("button", { name: "알겠다요 ㅇㅅㅇ" }).click();
    });
  });

  test.describe("landscape play HUD", () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test("keeps the combat readout clear of the touch controls", async ({ page }) => {
      await installFixedRoundSeed(page, 1, 0);
      await page.goto("/");
      await openSettings(page);
      await saveSettings(page);
      await startGame(page);
      await expect(page.locator("#app")).toHaveAttribute("data-round", "active");
      await expect(page.locator("#pointer-joystick")).toBeVisible();
      await expect(page.locator("#toggle-stat-status")).toBeVisible();
      await page.locator("#toggle-stat-status").click();
      await expect(page.locator("#stat-status")).toBeVisible();

      const boxes = await page.evaluate(() => {
        const found: Record<string, DomBox | null> = {};
        for (const selector of ["#stat-status", "#pointer-joystick", ".touch-actions"]) {
          const r = document.querySelector(selector)?.getBoundingClientRect();
          found[selector] =
            r === undefined
              ? null
              : {
                  top: r.top,
                  bottom: r.bottom,
                  left: r.left,
                  right: r.right,
                };
        }
        return {
          status: found["#stat-status"] ?? null,
          joystick: found["#pointer-joystick"] ?? null,
          touch: found[".touch-actions"] ?? null,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });
      expect(boxesOverlap(boxes.status, boxes.joystick)).toBe(false);
      expect(boxesOverlap(boxes.status, boxes.touch)).toBe(false);
      expect(boxesOverlap(boxes.touch, boxes.joystick)).toBe(false);
      expect(boxes.scrollWidth).toBeLessThanOrEqual(boxes.clientWidth);
    });
  });

  test.describe("landscape pause", () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test("fits the pause actions and core statistics without horizontal overflow", async ({
      page,
    }) => {
      await installFixedRoundSeed(page, 1, 0);
      await page.goto("/");
      await openSettings(page);
      await saveSettings(page);
      await startGame(page);
      await expect(page.locator("#app")).toHaveAttribute("data-round", "active");
      await page.keyboard.press("p");
      await expect(page.locator("#pause-menu")).toBeVisible();

      await expect(page.locator(".round-statistics .round-statistics__grid")).toHaveCSS(
        "grid-template-columns",
        /^\d+(?:\.\d+)?px \d+(?:\.\d+)?px \d+(?:\.\d+)?px \d+(?:\.\d+)?px$/u,
      );
      await expect(page.locator(".arena-actions__buttons")).toHaveCSS(
        "grid-template-columns",
        /^\d+(?:\.\d+)?px \d+(?:\.\d+)?px \d+(?:\.\d+)?px \d+(?:\.\d+)?px$/u,
      );
      await expect(page.locator("#pause-control-guide")).not.toHaveAttribute("open", "");
      const layout = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        panelScrollHeight: document.querySelector(".pause-menu__panel")?.scrollHeight ?? 0,
        panelClientHeight: document.querySelector(".pause-menu__panel")?.clientHeight ?? 0,
      }));
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
      expect(layout.panelScrollHeight).toBeLessThan(560);
    });

    test("keeps the pause panel compact and the resume action visible at extra-large text", async ({
      page,
    }) => {
      await installFixedRoundSeed(page, 1, 0);
      await page.goto("/");
      await openSettings(page);
      await openSettingsTab(page, "설정");
      await page.locator('input[name="fontScale"][value="extra-large"]').check();
      await saveSettings(page);
      await startGame(page);
      await page.keyboard.press("p");
      await expect(page.locator("#pause-menu")).toBeVisible();

      await expect(page.locator(".round-statistics__grid")).toHaveCSS(
        "grid-template-columns",
        /^\d+(?:\.\d+)?px \d+(?:\.\d+)?px \d+(?:\.\d+)?px \d+(?:\.\d+)?px$/u,
      );
      const layout = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>(".pause-menu__panel");
        const resume = document.querySelector<HTMLElement>("#resume-round");
        const resumeRect = resume?.getBoundingClientRect();
        return {
          panelScrollHeight: panel?.scrollHeight ?? 0,
          panelClientHeight: panel?.clientHeight ?? 0,
          resumeTop: resumeRect === undefined ? null : Math.round(resumeRect.top * 10) / 10,
          resumeBottom: resumeRect === undefined ? null : Math.round(resumeRect.bottom * 10) / 10,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });
      expect(layout.panelScrollHeight).toBeLessThanOrEqual(560);
      expect(layout.resumeTop).not.toBeNull();
      expect(layout.resumeTop).toBeGreaterThanOrEqual(0);
      expect(layout.resumeBottom).toBeLessThanOrEqual(390);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    });

    test("keeps the standard-text pause panel compact on short landscape screens", async ({
      page,
    }) => {
      await installFixedRoundSeed(page, 1, 0);
      await page.goto("/");
      await openSettings(page);
      await saveSettings(page);
      await startGame(page);
      await page.keyboard.press("p");
      await expect(page.locator("#pause-menu")).toBeVisible();

      await expect(page.locator(".round-statistics__grid")).toHaveCSS(
        "grid-template-columns",
        /^\d+(?:\.\d+)?px \d+(?:\.\d+)?px \d+(?:\.\d+)?px \d+(?:\.\d+)?px$/u,
      );
      const layout = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>(".pause-menu__panel");
        const resume = document.querySelector<HTMLElement>("#resume-round");
        const firstStat = document.querySelector<HTMLElement>(".round-statistics__grid div");
        const resumeRect = resume?.getBoundingClientRect();
        const firstStatRect = firstStat?.getBoundingClientRect();
        return {
          panelScrollHeight: panel?.scrollHeight ?? 0,
          panelClientHeight: panel?.clientHeight ?? 0,
          resumeTop: resumeRect === undefined ? null : Math.round(resumeRect.top * 10) / 10,
          resumeBottom: resumeRect === undefined ? null : Math.round(resumeRect.bottom * 10) / 10,
          firstStatTop:
            firstStatRect === undefined ? null : Math.round(firstStatRect.top * 10) / 10,
          firstStatBottom:
            firstStatRect === undefined ? null : Math.round(firstStatRect.bottom * 10) / 10,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });
      expect(layout.panelScrollHeight).toBeLessThanOrEqual(560);
      expect(layout.resumeTop).not.toBeNull();
      expect(layout.resumeTop).toBeGreaterThanOrEqual(0);
      expect(layout.resumeBottom).toBeLessThanOrEqual(390);
      expect(layout.firstStatTop).not.toBeNull();
      expect(layout.firstStatTop).toBeGreaterThanOrEqual(0);
      expect(layout.firstStatBottom).toBeLessThanOrEqual(390);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    });
  });

  test.describe("landscape briefing", () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test("fits the round briefing into the landscape viewport", async ({ page }) => {
      await installFixedRoundSeed(page, 1, 0);
      await page.goto("/");
      await openSettings(page);
      await saveSettings(page);
      await page.getByRole("button", { name: "게임 시작" }).click();
      const briefing = page.getByRole("dialog", {
        name: "포격으로 무너지는 섬에서 끝까지 살아남아.",
      });
      await expect(briefing).toBeVisible();
      await expect(page.getByRole("button", { name: "알겠다요 ㅇㅅㅇ" })).toBeEnabled();

      const layout = await page.evaluate(() => {
        const dialog = document.querySelector("#round-briefing-dialog");
        const rect = dialog?.getBoundingClientRect();
        const controls = document.querySelector(".round-briefing-dialog__controls");
        return {
          scrollHeight: dialog?.scrollHeight ?? 0,
          clientHeight: dialog?.clientHeight ?? 0,
          top: rect?.top ?? 0,
          bottom: rect?.bottom ?? 0,
          innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          columns: getComputedStyle(controls ?? document.body).gridTemplateColumns.split(" ")
            .length,
        };
      });
      expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight);
      expect(layout.top).toBeGreaterThanOrEqual(0);
      expect(layout.bottom).toBeLessThanOrEqual(layout.innerHeight);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
      expect(layout.columns).toBe(4);
      await page.getByRole("button", { name: "알겠다요 ㅇㅅㅇ" }).click();
    });
  });

  test.describe("landscape settings", () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test("keeps the last settings cards fully reachable at the bottom of the form", async ({
      page,
    }) => {
      await page.goto("/");
      await openSettings(page);
      await assertLastSettingsCardReachable(page, "스킬");
      await assertLastSettingsCardReachable(page, "아이템");
    });
  });

  test.describe("foldable cover width", () => {
    test.use({ viewport: { width: 260, height: 653 } });

    test("keeps the cover-width filled scoreboard readable without clipped cells", async ({
      page,
    }) => {
      await page.addInitScript(() => {
        const entries = Array.from({ length: 12 }, (_, index) => ({
          id: `2026-08-05T00:00:0${index}.000Z:${index + 1}`,
          playedAt: `2026-08-05T00:00:0${index}.000Z`,
          rank: 1 + ((index * 7) % 50),
          participantCount: 70,
          score: 1000 + index * 137,
          eliminations: (index * 3) % 12,
          survivalSeconds: 180 + index * 42,
          outcome: index % 4 === 0 ? ("victory" as const) : ("defeat" as const),
        }));
        localStorage.setItem("shovefall.scoreboard.v1", JSON.stringify(entries));
      });
      await page.goto("/");
      await page.getByRole("button", { name: "점수표", exact: true }).click();
      await expect(page.locator("#app")).toHaveAttribute("data-screen", "scoreboard");
      await expect(page.locator("#scoreboard-list > li").first()).toBeVisible();

      const layout = await page.evaluate(() => {
        const cells = [...document.querySelectorAll(".scoreboard__stats div")];
        return {
          rowCount: document.querySelectorAll("#scoreboard-list > li").length,
          clippedCells: cells.filter(
            (cell) =>
              cell.scrollWidth > cell.clientWidth + 2 || cell.scrollHeight > cell.clientHeight + 2,
          ).length,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });
      expect(layout.rowCount).toBeGreaterThanOrEqual(10);
      expect(layout.clippedCells).toBe(0);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    });

    test("keeps the cover-width menu, settings tabs, and attribute steppers free of horizontal overflow", async ({
      page,
    }) => {
      await page.goto("/");
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
        )
        .toBe(true);
      await openSettings(page);
      await assertCoverSettingsTab(page, "특성");
      await assertCoverSettingsTab(page, "스킬");
      await assertCoverSettingsTab(page, "아이템");
      await assertCoverSettingsTab(page, "설정");

      await openSettingsTab(page, "특성");
      const stepper = await page.evaluate(() => {
        const card = document.querySelector<HTMLElement>(".starting-attribute");
        const cardRect = card?.getBoundingClientRect();
        const button = card?.querySelector<HTMLButtonElement>(
          '.starting-attribute__stepper button[data-attribute-step="1"]',
        );
        const buttonRect = button?.getBoundingClientRect();
        const maxButton = card?.querySelector<HTMLButtonElement>(
          '.starting-attribute__stepper button[data-attribute-step="max"]',
        );
        const maxRect = maxButton?.getBoundingClientRect();
        return {
          cardLeft: cardRect === undefined ? null : Math.round(cardRect.left),
          cardRight: cardRect === undefined ? null : Math.round(cardRect.right),
          buttonWidth: buttonRect === undefined ? null : Math.round(buttonRect.width),
          buttonHeight: buttonRect === undefined ? null : Math.round(buttonRect.height),
          maxRight: maxRect === undefined ? null : Math.round(maxRect.right),
        };
      });
      expect(stepper.cardLeft).not.toBeNull();
      expect(stepper.cardLeft).toBeGreaterThanOrEqual(0);
      expect(stepper.cardRight).toBeLessThanOrEqual(260);
      expect(stepper.buttonWidth).not.toBeNull();
      expect(stepper.buttonWidth).toBeGreaterThanOrEqual(36);
      expect(stepper.buttonHeight).toBeGreaterThanOrEqual(36);
      expect(stepper.maxRight).not.toBeNull();
      expect(stepper.maxRight).toBeLessThanOrEqual(260);
    });

    test("explains each cover-width attribute card's per-point effect without clipping", async ({
      page,
    }) => {
      await page.goto("/");
      await openSettings(page);
      await openSettingsTab(page, "특성");

      const cards = await page.evaluate(() => {
        const attributeCards = [...document.querySelectorAll(".starting-attribute")];
        return attributeCards.map((card) => {
          const cardRect = card.getBoundingClientRect();
          const chips = [
            ...card.querySelectorAll<HTMLElement>(".starting-attribute__effects span"),
          ];
          const chipCounts: Record<string, number> = {};
          for (const chip of chips) {
            const text = chip.textContent ?? "";
            chipCounts[text] = (chipCounts[text] ?? 0) + 1;
          }
          return {
            id: card.getAttribute("data-starting-attribute") ?? "",
            chipCount: chips.length,
            chipLabels: Object.keys(chipCounts),
            cardLeft: Math.round(cardRect.left),
            cardRight: Math.round(cardRect.right),
            clippedChips: chips.filter((chip) => {
              const rect = chip.getBoundingClientRect();
              return (
                rect.left < cardRect.left - 1 ||
                rect.right > cardRect.right + 1 ||
                rect.bottom > cardRect.bottom + 1
              );
            }).length,
          };
        });
      });

      expect(cards).toHaveLength(6);
      for (const card of cards) {
        expect(card.chipCount).toBeGreaterThanOrEqual(2);
        expect(card.cardLeft).toBeGreaterThanOrEqual(0);
        expect(card.cardRight).toBeLessThanOrEqual(260);
        expect(card.clippedChips).toBe(0);
        expect(card.chipLabels.length).toBe(card.chipCount);
      }
      const labelSet = new Set(cards.flatMap((card) => card.chipLabels));
      expect(labelSet.size).toBeGreaterThanOrEqual(12);
    });

    test("keeps the cover-width arena controls inside the viewport without overflow", async ({
      page,
    }) => {
      await page.goto("/");
      await page.locator("#app").evaluate((app) => {
        app.setAttribute("data-screen", "arena");
        app.setAttribute("data-round", "active");
        document.body.classList.add("game-screen-active");
        document.querySelector("#arena-host")?.removeAttribute("hidden");
        document.querySelector("#pause-round")?.removeAttribute("hidden");
        document.querySelector(".touch-controls")?.removeAttribute("hidden");
        document.querySelector("#pointer-joystick")?.removeAttribute("hidden");
      });
      const layout = await page.evaluate(() => {
        const selectors = [
          "#pointer-joystick",
          ".touch-actions",
          "#pause-round",
          "#toggle-stat-status",
        ];
        const boxes: Record<string, { left: number; right: number; top: number; bottom: number }> =
          {};
        for (const selector of selectors) {
          const r = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
          if (r !== undefined) {
            boxes[selector] = {
              left: Math.round(r.left * 10) / 10,
              right: Math.round(r.right * 10) / 10,
              top: Math.round(r.top * 10) / 10,
              bottom: Math.round(r.bottom * 10) / 10,
            };
          }
        }
        return {
          boxes,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
      for (const box of Object.values(layout.boxes)) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(260);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.bottom).toBeLessThanOrEqual(653);
      }
    });

    test("keeps the cover-width expanded stat panel readable in two columns", async ({ page }) => {
      test.setTimeout(60_000);
      await installFixedRoundSeed(page, 1, 0);
      await page.goto("/");
      await openSettings(page);
      await saveSettings(page);
      await startGame(page);
      await expect(page.locator("#app")).toHaveAttribute("data-round", "active");

      await page.locator("#toggle-stat-status").click();
      await expect(page.locator("#stat-status")).toBeVisible();
      const layout = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>("#stat-status");
        const joystick = document.querySelector<HTMLElement>("#pointer-joystick");
        const panelRect = panel?.getBoundingClientRect();
        const joystickRect = joystick?.getBoundingClientRect();
        const cells = [...document.querySelectorAll("#stat-status > div")];
        return {
          columns:
            panel === null ? 0 : getComputedStyle(panel).gridTemplateColumns.split(" ").length,
          tallestCell: Math.round(
            Math.max(...cells.map((cell) => cell.getBoundingClientRect().height)),
          ),
          panelBottom: panelRect === undefined ? null : Math.round(panelRect.bottom),
          joystickTop: joystickRect === undefined ? null : Math.round(joystickRect.top),
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });
      expect(layout.columns).toBe(2);
      expect(layout.tallestCell).toBeLessThanOrEqual(80);
      expect(layout.panelBottom).not.toBeNull();
      expect(layout.joystickTop).not.toBeNull();
      if (layout.panelBottom !== null && layout.joystickTop !== null) {
        expect(layout.panelBottom).toBeLessThanOrEqual(layout.joystickTop + 4);
      }
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    });

    test("keeps the cover-width stat toggle label fully readable during a live round", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await installFixedRoundSeed(page, 1, 0);
      await page.goto("/");
      await openSettings(page);
      await saveSettings(page);
      await startGame(page);
      await expect(page.locator("#app")).toHaveAttribute("data-round", "active");
      await expect(page.locator("#toggle-stat-status")).toBeVisible();

      const layout = await page.locator("#toggle-stat-status").evaluate((toggle) => ({
        scrollWidth: toggle.scrollWidth,
        clientWidth: toggle.clientWidth,
      }));
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    });

    test("keeps the cover-width stat toggle readable at extra-large text during a live round", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await installFixedRoundSeed(page, 1, 0);
      await page.goto("/");
      await openSettings(page);
      await saveSettings(page);
      await openSettings(page);
      await openSettingsTab(page, "설정");
      await page.locator('input[name="fontScale"][value="extra-large"]').check();
      await page.getByRole("button", { name: "설정 저장" }).click();
      await expect(page.locator("#app")).toHaveAttribute("data-screen", "menu");
      await startGame(page);
      await expect(page.locator("#app")).toHaveAttribute("data-round", "active");
      await expect(page.locator("#toggle-stat-status")).toBeVisible();

      const layout = await page.locator("#toggle-stat-status").evaluate((toggle) => {
        const output = toggle.querySelector("output");
        return {
          scrollWidth: toggle.scrollWidth,
          clientWidth: toggle.clientWidth,
          outputVisible: output !== null && output.getBoundingClientRect().width > 0,
        };
      });
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
      expect(layout.outputVisible).toBe(true);
    });

    test("keeps the cover-width completed panel readable without clipped values", async ({
      page,
    }) => {
      await page.goto("/");
      await page.locator("#app").evaluate((app) => {
        const pause = document.querySelector("#pause-menu");
        for (const candidate of [
          pause?.closest("section"),
          pause?.closest("main"),
          document.querySelector("#arena-host"),
        ]) {
          if (candidate) candidate.removeAttribute("hidden");
        }
        pause?.removeAttribute("hidden");
        pause?.setAttribute("data-mode", "completed");
        app?.setAttribute("data-screen", "arena");
        app?.setAttribute("data-pause-menu", "open");
        app?.setAttribute("data-round", "completed");
        document.querySelector("#arena-actions")?.removeAttribute("hidden");
        document.querySelector("#copy-round-report")?.removeAttribute("hidden");
        document.querySelector("#view-finished-map")?.removeAttribute("hidden");
        document.querySelector("#resume-round")?.setAttribute("hidden", "");
        const skillList = document.querySelector("#round-skill-uses");
        if (skillList) {
          skillList.replaceChildren(
            ...["빙결 지대", "수호 방패"].map((label) => {
              const item = document.createElement("li");
              const span = document.createElement("span");
              const output = document.createElement("output");
              span.textContent = label;
              output.value = "6회";
              item.append(span, output);
              return item;
            }),
          );
        }
        document.body.classList.add("game-screen-active");
      });
      await expect(page.locator("#pause-menu")).toHaveAttribute("data-mode", "completed");
      await expect(page.locator("#round-skill-uses li")).toHaveCount(2);

      const layout = await page.evaluate(() => {
        const panel = document.querySelector(".pause-menu__panel");
        const cells = [...document.querySelectorAll(".round-statistics__grid > div")].map(
          (cell) => {
            const dd = cell.querySelector("dd");
            return {
              height: Math.round(cell.getBoundingClientRect().height),
              overflow: dd !== null && dd.scrollWidth > dd.clientWidth + 1,
            };
          },
        );
        return {
          panelScrollHeight: panel?.scrollHeight ?? 0,
          panelClientHeight: panel?.clientHeight ?? 0,
          cells,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });
      expect(layout.panelScrollHeight).toBeLessThanOrEqual(layout.panelClientHeight + 2);
      expect(layout.cells.every((cell) => !cell.overflow)).toBe(true);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    });
  });
});

test("fits the completed-round panel on a desktop viewport without scrolling", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const app = document.querySelector("#app");
    const pause = document.querySelector("#pause-menu");
    for (const candidate of [
      pause?.closest("section"),
      pause?.closest("main"),
      document.querySelector("#arena-host"),
    ]) {
      if (candidate) candidate.removeAttribute("hidden");
    }
    pause?.removeAttribute("hidden");
    pause?.setAttribute("data-mode", "completed");
    app?.setAttribute("data-screen", "arena");
    app?.setAttribute("data-pause-menu", "open");
    app?.setAttribute("data-round", "completed");
    document.querySelector("#arena-actions")?.removeAttribute("hidden");
    document.querySelector("#copy-round-report")?.removeAttribute("hidden");
    document.querySelector("#view-finished-map")?.removeAttribute("hidden");
    document.querySelector("#resume-round")?.setAttribute("hidden", "");
    const message = document.querySelector("#round-message");
    if (message) message.textContent = "라운드 종료 · 7위";
    document.body.classList.add("game-screen-active");
  });
  await expect(page.locator("#pause-menu")).toHaveAttribute("data-mode", "completed");
  const layout = await page.evaluate(() => {
    const panel = document.querySelector(".pause-menu__panel");
    const buttons = [...document.querySelectorAll("#arena-actions button:not([hidden])")];
    const firstRowTop = buttons[0]?.getBoundingClientRect().top ?? 0;
    const secondRowTop = buttons[3]?.getBoundingClientRect().top ?? 0;
    return {
      scrollHeight: panel?.scrollHeight ?? 0,
      clientHeight: panel?.clientHeight ?? 0,
      buttonColumns: getComputedStyle(
        document.querySelector(".arena-actions__buttons") ?? document.body,
      ).gridTemplateColumns.split(" ").length,
      buttonRows: secondRowTop > firstRowTop ? 2 : 1,
      bodyOverflow: document.body.scrollWidth > document.documentElement.clientWidth,
    };
  });
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight);
  expect(layout.buttonColumns).toBe(3);
  expect(layout.buttonRows).toBe(2);
  expect(layout.bodyOverflow).toBe(false);
});

test("fits the paused panel on a desktop viewport without scrolling", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const app = document.querySelector("#app");
    const pause = document.querySelector("#pause-menu");
    for (const candidate of [
      pause?.closest("section"),
      pause?.closest("main"),
      document.querySelector("#arena-host"),
    ]) {
      if (candidate) candidate.removeAttribute("hidden");
    }
    pause?.removeAttribute("hidden");
    pause?.setAttribute("data-mode", "paused");
    app?.setAttribute("data-screen", "arena");
    app?.setAttribute("data-pause-menu", "open");
    app?.setAttribute("data-round", "active");
    document.querySelector("#arena-actions")?.removeAttribute("hidden");
    document.querySelector("#game-telemetry")?.removeAttribute("hidden");
    const message = document.querySelector("#round-message");
    if (message) message.textContent = "잠시 멈췄어.";
    document.body.classList.add("game-screen-active");
  });
  await expect(page.locator("#pause-menu")).toHaveAttribute("data-mode", "paused");
  await expect(page.locator("#pause-control-guide")).not.toHaveAttribute("open", "");
  const layout = await page.evaluate(() => {
    const panel = document.querySelector(".pause-menu__panel");
    return {
      scrollHeight: panel?.scrollHeight ?? 0,
      clientHeight: panel?.clientHeight ?? 0,
      buttonColumns: getComputedStyle(
        document.querySelector(".arena-actions__buttons") ?? document.body,
      ).gridTemplateColumns.split(" ").length,
      statsColumns: getComputedStyle(
        document.querySelector(".round-statistics__grid") ?? document.body,
      ).gridTemplateColumns.split(" ").length,
      bodyOverflow: document.body.scrollWidth > document.documentElement.clientWidth,
    };
  });
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight);
  expect(layout.buttonColumns).toBe(3);
  expect(layout.statsColumns).toBe(4);
  expect(layout.bodyOverflow).toBe(false);
});

test("keeps narrow fine-pointer arena controls clear of the pause trigger", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 320, height: 568 });
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await openSettings(page);
  await saveSettings(page);
  await startGame(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active");

  await expect(page.locator("#pointer-joystick")).toBeVisible();
  await expect(page.locator(".touch-actions")).toBeVisible();
  await expect(page.locator("#toggle-stat-status")).toBeVisible();
  await expect(page.locator("#pause-round")).toBeVisible();

  const joystickBox = await page.locator("#pointer-joystick").boundingBox();
  const actionsBox = await page.locator(".touch-actions").boundingBox();
  const pauseBox = await page.locator("#pause-round").boundingBox();
  expect(joystickBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(pauseBox).not.toBeNull();

  if (pauseBox !== null) {
    expect(pauseBox.y).toBeLessThanOrEqual(120);
    expect(pauseBox.x).toBeGreaterThanOrEqual(320 - pauseBox.width - 120);
  }
  if (joystickBox !== null && pauseBox !== null) {
    expect(pauseBox.y + pauseBox.height).toBeLessThanOrEqual(joystickBox.y);
  }
  if (actionsBox !== null && pauseBox !== null) {
    expect(pauseBox.y + pauseBox.height).toBeLessThanOrEqual(actionsBox.y);
  }

  await expect(page.locator("#stat-status-wrap")).toHaveAttribute("data-expanded", "false");
  await expect(page.locator("#stat-status")).toBeHidden();
  await page.locator("#toggle-stat-status").click();
  await expect(page.locator("#stat-status")).toBeVisible();
  const readoutBox = await page.locator("#stat-status").boundingBox();
  expect(readoutBox).not.toBeNull();
  if (readoutBox !== null && joystickBox !== null) {
    expect(readoutBox.y + readoutBox.height).toBeLessThanOrEqual(joystickBox.y + 4);
  }
});

test("keeps the desktop stat readout clear of the renderer status and action HUD", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await openSettings(page);
  await saveSettings(page);
  await startGame(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active");

  await expect(page.locator("#toggle-stat-status")).toBeHidden();
  await expect(page.locator("#stat-status")).toBeVisible();
  await expect(page.locator("#renderer-status")).toBeVisible();
  await expect(page.locator(".action-hud")).toBeVisible();

  const boxes = await page.evaluate(() => {
    const found: Record<string, DomBox | null> = {};
    for (const selector of ["#stat-status", "#renderer-status", ".action-hud", "#skill-actions"]) {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      found[selector] =
        r === undefined ? null : { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    }
    return {
      status: found["#stat-status"] ?? null,
      renderer: found["#renderer-status"] ?? null,
      hud: found[".action-hud"] ?? null,
      skill: found["#skill-actions"] ?? null,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  expect(boxesOverlap(boxes.status, boxes.renderer)).toBe(false);
  expect(boxesOverlap(boxes.status, boxes.hud)).toBe(false);
  expect(boxesOverlap(boxes.status, boxes.skill)).toBe(false);
  expect(boxes.scrollWidth).toBeLessThanOrEqual(boxes.clientWidth);
  await expect(page.locator("#stat-status")).toHaveCSS(
    "grid-template-columns",
    /^\d+(?:\.\d+)?px \d+(?:\.\d+)?px$/u,
  );
});

test("persists four-step text size and sound-effect volume settings", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  await expect(page.locator("#app")).toHaveAttribute("data-background-music", "playing");
  await openSettingsTab(page, "설정");
  const volume = page.getByLabel("효과음");
  const musicVolume = page.getByLabel("배경음악");
  await expect(volume).toHaveValue("50");
  await expect(musicVolume).toHaveValue("50");
  await expect(page.getByRole("link", { name: "HYP - Catch Me If You Can" })).toHaveAttribute(
    "href",
    "https://youtu.be/LrTkfYqNJFU",
  );
  await page.getByLabel("아주 크게").check();
  await volume.fill("35");
  await musicVolume.fill("24");
  await expect(page.locator("#sound-effects-volume-value")).toHaveText("35");
  await expect(page.locator("#background-music-volume-value")).toHaveText("24");
  await expect(page.locator("html")).toHaveAttribute("data-font-scale", "extra-large");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-font-scale", "extra-large");
  await openSettings(page);
  await openSettingsTab(page, "설정");
  await expect(page.getByLabel("효과음")).toHaveValue("35");
  await expect(page.getByLabel("배경음악")).toHaveValue("24");
  await expect(page.getByLabel("아주 크게")).toBeChecked();
  await expect(page.locator("#debug-tuning")).toHaveCount(0);
});

test("@extended completes a collapsing round and starts a fresh world", async ({ page }) => {
  test.setTimeout(120_000);
  await installDeterministicClock(page);
  await installClipboardCapture(page);
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await pauseInstalledClock(page);
  await openSettings(page);

  await expect(page.locator("#setup-summary")).toHaveCount(0);
  await saveSettings(page);
  await startGame(page);

  await finishInstalledClockCountdown(page);
  await driveHumanUntilEliminated(page);
  await fastForwardUntilRoundCompleted(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "completed");
  await expect(page.locator("#pause-menu")).toHaveAttribute("data-mode", "completed");
  await expect(page.getByRole("button", { name: "계속", exact: true })).toBeHidden();
  await expect(page.locator("#resume-round")).toBeDisabled();
  await expect(page.locator("#game-telemetry")).toBeHidden();
  await expect(page.locator(".control-guide")).toBeHidden();
  await expect(page.locator("#developer-telemetry")).toBeHidden();
  const resultActionsAboveStatistics = await page.evaluate(() => {
    const actions = document.querySelector("#arena-actions");
    const statistics = document.querySelector(".round-statistics");
    return (
      actions !== null &&
      statistics !== null &&
      (actions.compareDocumentPosition(statistics) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    );
  });
  expect(resultActionsAboveStatistics).toBe(true);
  await expect(page.getByRole("button", { name: "다시 시작" })).toBeFocused();
  await expect(page.locator("#renderer-status")).toHaveText(/승리|라운드 종료/u);
  await expect(page.locator("#arena-host")).toHaveAttribute("data-camera-mode", "spectator");
  await page.getByRole("button", { name: "맵 보기" }).click();
  await expect(page.locator("#pause-menu")).toBeHidden();
  await expect(page.locator("#arena-host")).toBeFocused();
  await panSpectatorCameraWithArrows(page);
  await page.keyboard.press("p");
  await expect(page.locator("#pause-menu")).toBeVisible();
  await expect(page.getByRole("button", { name: "맵 보기" })).toBeVisible();

  const copyButton = page.getByRole("button", { name: "기록 복사" });
  await expect(copyButton).toBeVisible();
  await copyButton.click();
  await expect(page.getByRole("button", { name: "복사됨" })).toBeVisible();
  const copiedReport = await page.evaluate(
    () => (window as Window & { shovefallClipboardCapture?: string }).shovefallClipboardCapture,
  );
  const parsedReport: unknown = JSON.parse(copiedReport ?? "null");
  expect(parsedReport).toMatchObject({
    schemaVersion: "shovefall-playtest-round/v11",
    seed: expect.any(String),
    stateHash: expect.stringMatching(/^fnv1a32:[0-9a-f]{8}$/u),
    settings: {
      participantCount: 70,
      startingAttributes: {
        strength: 4,
        agility: 4,
        constitution: 4,
        spirit: 4,
        balance: 4,
        willpower: 0,
      },
      roundLimitSeconds: null,
    },
    result: {
      completedTick: expect.any(Number),
      humanUpgradeSelections: expect.any(Array),
    },
  });

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async writeText(): Promise<void> {
          throw new DOMException("Clipboard denied", "NotAllowedError");
        },
      },
    });
  });
  await page.getByRole("button", { name: "복사됨" }).click();
  await expect(page.getByRole("button", { name: "복사 실패" })).toBeVisible();
  await expect(page.getByText("기록을 복사하지 못했어. 다시 시도해 줘.")).toBeVisible();

  const completedTick = getCompletedTick(parsedReport);
  const completedRoundId = Number(
    await page.locator("#game-telemetry").getAttribute("data-round-id"),
  );
  await page.getByRole("button", { name: "다시 시작" }).click();

  await expect(page.locator("#app")).toHaveAttribute("data-round", "countdown");
  await expect(copyButton).toBeHidden();
  await expect(page.locator("#game-telemetry")).toHaveAttribute("data-tick", "0");
  await expect
    .poll(async () => Number(await page.locator("#game-telemetry").getAttribute("data-round-id")))
    .toBeGreaterThan(completedRoundId);
  await finishInstalledClockCountdown(page);
  await expect(page.locator("#arena-host")).toBeFocused();
  const restartedTick = await readSimulationTick(page);
  expect(restartedTick).toBeLessThan(completedTick);
});

test("allows an immediate fresh restart after a deterministic human defeat", async ({ page }) => {
  test.setTimeout(240_000);
  await installDeterministicClock(page);
  await installFixedRoundSeed(page, 8, 1);
  await page.goto("/");
  await pauseInstalledClock(page);
  await openSettings(page);
  await saveSettings(page);
  await startGame(page);

  await finishInstalledClockCountdown(page);

  await driveHumanUntilEliminated(page);
  await expect(page.locator("#app")).toHaveAttribute("data-human-eliminated", "true");
  await expect(page.locator("#game-telemetry")).toHaveAttribute("data-simulation-rate", "6");
  await expect(page.locator("#arena-host")).toHaveAttribute("data-camera-mode", "spectator");
  await panSpectatorCameraWithArrows(page);
  const spectatorArenaBounds = await page.locator("#arena-host").boundingBox();
  expect(spectatorArenaBounds).not.toBeNull();
  if (spectatorArenaBounds !== null) {
    const centerX = spectatorArenaBounds.x + spectatorArenaBounds.width / 2;
    const centerY = spectatorArenaBounds.y + spectatorArenaBounds.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await expect(page.locator("#arena-host")).toHaveAttribute("data-spectator-panning", "true");
    await page.mouse.move(centerX + 80, centerY, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator("#arena-host")).not.toHaveAttribute("data-spectator-panning", "true");
  }
  await page.keyboard.press("p");
  await expect(page.locator("#pause-menu")).toBeVisible();
  await page.getByRole("button", { name: "다시 시작" }).click();

  await expect(page.locator("#app")).toHaveAttribute("data-round", "countdown");
  await finishInstalledClockCountdown(page);
  await expect(page.locator("#app")).not.toHaveAttribute("data-human-eliminated", "true");
  await expect(page.locator("#game-telemetry")).toHaveAttribute("data-simulation-rate", "1");
  await expect(page.locator("#arena-host")).toBeFocused();
});

test("keeps playing silently when browser audio is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined });
    Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: undefined });
    HTMLMediaElement.prototype.play = () => Promise.reject(new Error("media unavailable"));
  });
  await page.goto("/");
  await saveBalancedDefaults(page);
  await startGame(page);

  await expect(page.locator("#app")).toHaveAttribute("data-audio", "unavailable");
  await expect(page.locator("#app")).toHaveAttribute("data-background-music", "unavailable");
  await page.keyboard.press("p");
  await expect(page.locator("#pause-menu")).toBeVisible();
  await expect(page.getByRole("button", { name: "무음" })).toBeDisabled();
  await page.keyboard.press("p");
  await expect(page.locator("#pause-menu")).toBeHidden();
  await expect
    .poll(async () => Number(await page.locator("#game-telemetry").getAttribute("data-tick")))
    .toBeGreaterThan(0);
});

test("honors reduced motion without removing the playable arena", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await saveBalancedDefaults(page);
  await startGame(page);
  await expect(page.locator("#arena-host")).toHaveAttribute("data-motion", "reduced");
  await expect(page.locator("#arena-host canvas")).toBeVisible();
  await expect
    .poll(async () => Number(await page.locator("#game-telemetry").getAttribute("data-tick")))
    .toBeGreaterThan(0);
});

test("@dev-only recovers from an explicitly injected fatal round error", async ({ page }) => {
  await page.goto("/");
  await saveBalancedDefaults(page);
  await startGame(page);
  await expect
    .poll(async () => Number(await page.locator("#game-telemetry").getAttribute("data-tick")))
    .toBeGreaterThan(0);

  await page.evaluate(() => window.dispatchEvent(new Event("shovefall:diagnostic-fatal")));
  await expect(page.locator("#app")).toHaveAttribute("data-round", "fatal");
  await expect(page.locator("#renderer-status")).toHaveText("라운드를 멈췄어");
  await expect(page.getByText("문제가 생겼어. 다시 시작해 줘.")).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시작" })).toBeFocused();

  await page.getByRole("button", { name: "다시 시작" }).click();
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active");
  await expect(page.locator("#arena-host")).toBeFocused();
});

test("pauses on WebGL context loss and resumes after restoration", async ({ page }) => {
  await page.goto("/");
  await saveBalancedDefaults(page);
  await startGame(page);
  await expect
    .poll(async () => Number(await page.locator("#game-telemetry").getAttribute("data-tick")))
    .toBeGreaterThan(0);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active");

  await page.locator("#arena-host canvas").dispatchEvent("webglcontextlost");
  await expect(page.locator("#arena-host")).toHaveAttribute("data-renderer", "lost");
  await expect(page.locator("#renderer-status")).toHaveText("그래픽 연결이 끊겼어");
  const pausedTick = await readSimulationTick(page);
  await page.waitForTimeout(150);
  expect(await readSimulationTick(page)).toBe(pausedTick);

  await page.locator("#arena-host canvas").dispatchEvent("webglcontextrestored");
  await expect(page.locator("#arena-host")).toHaveAttribute("data-renderer", "ready");
  await expect
    .poll(async () => {
      const currentTick = await readSimulationTick(page);
      const roundState = await page.locator("#app").getAttribute("data-round");
      return currentTick > pausedTick || roundState === "completed";
    })
    .toBe(true);
  await expect(page.locator("#renderer-status")).not.toHaveAttribute("data-state", "error");
});

test.describe("narrow fine-pointer settings", () => {
  test.use({ viewport: { width: 260, height: 653 } });

  test("keeps the narrow fine-pointer settings form free of horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/");
    await openSettings(page);
    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      coarse: matchMedia("(pointer: coarse)").matches,
    }));
    expect(layout.coarse).toBe(false);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  });
});

test("keeps narrow fine-pointer trait cards inside the settings form", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await openSettings(page);
  await openSettingsTab(page, "특성");

  const layout = await page.evaluate(() => {
    const form = document.querySelector<HTMLElement>("#game-settings");
    const formRect = form?.getBoundingClientRect();
    const cards = [...document.querySelectorAll<HTMLElement>(".starting-attribute")].map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        left: Math.round(rect.left * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
      };
    });
    return {
      formLeft: formRect === undefined ? null : Math.round(formRect.left * 10) / 10,
      formRight: formRect === undefined ? null : Math.round(formRect.right * 10) / 10,
      formScrollWidth: form?.scrollWidth ?? 0,
      formClientWidth: form?.clientWidth ?? 0,
      cards,
      coarse: matchMedia("(pointer: coarse)").matches,
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
    };
  });
  expect(layout.coarse).toBe(false);
  expect(layout.formScrollWidth).toBeLessThanOrEqual(layout.formClientWidth);
  expect(layout.docScrollWidth).toBeLessThanOrEqual(layout.docClientWidth);
  expect(layout.formLeft).not.toBeNull();
  expect(layout.formRight).not.toBeNull();
  for (const card of layout.cards) {
    expect(card.left).toBeGreaterThanOrEqual(layout.formLeft! - 1);
    expect(card.right).toBeLessThanOrEqual(layout.formRight! + 1);
  }
});

test("keeps narrow fine-pointer pause statistics readable in two columns", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 320, height: 568 });
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await openSettings(page);
  await saveSettings(page);
  await startGame(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active");

  await page.keyboard.press("p");
  await expect(page.locator("#pause-menu")).toBeVisible();

  const layout = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>(".round-statistics__grid");
    const cells =
      grid === null
        ? []
        : [...grid.querySelectorAll<HTMLElement>(":scope > div")].map((cell) => {
            const dt = cell.querySelector<HTMLElement>("dt");
            const dd = cell.querySelector<HTMLElement>("dd");
            return {
              label: dt?.textContent ?? "",
              dtClipped: dt !== null && dt.scrollWidth > dt.clientWidth + 2,
              ddClipped: dd !== null && dd.scrollWidth > dd.clientWidth + 2,
            };
          });
    return {
      coarse: matchMedia("(pointer: coarse)").matches,
      columns: grid === null ? 0 : getComputedStyle(grid).gridTemplateColumns.split(" ").length,
      gridClipped: grid !== null && grid.scrollWidth > grid.clientWidth + 2,
      cells,
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
    };
  });
  expect(layout.coarse).toBe(false);
  expect(layout.columns).toBe(2);
  expect(layout.gridClipped).toBe(false);
  expect(layout.docScrollWidth).toBeLessThanOrEqual(layout.docClientWidth);
  expect(layout.cells.length).toBeGreaterThanOrEqual(6);
  for (const cell of layout.cells) {
    expect(cell.dtClipped).toBe(false);
    expect(cell.ddClipped).toBe(false);
  }
});

test("fits the fine-pointer landscape pause panel on one screen", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 844, height: 390 });
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await openSettings(page);
  await saveSettings(page);
  await startGame(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active");
  await page.keyboard.press("p");
  await expect(page.locator("#pause-menu")).toBeVisible();

  await expect(page.locator(".pause-menu .round-statistics__grid")).toHaveCSS(
    "grid-template-columns",
    /^\d+(?:\.\d+)?px \d+(?:\.\d+)?px \d+(?:\.\d+)?px \d+(?:\.\d+)?px$/u,
  );
  const layout = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>(".pause-menu__panel");
    const resume = document.querySelector<HTMLElement>("#resume-round");
    const resumeRect = resume?.getBoundingClientRect();
    const guide = document.querySelector<HTMLElement>("#pause-control-guide");
    return {
      coarse: matchMedia("(pointer: coarse)").matches,
      panelScrollHeight: panel?.scrollHeight ?? 0,
      panelClientHeight: panel?.clientHeight ?? 0,
      resumeTop: resumeRect === undefined ? null : Math.round(resumeRect.top * 10) / 10,
      resumeBottom: resumeRect === undefined ? null : Math.round(resumeRect.bottom * 10) / 10,
      guideDisplay: guide === null ? "" : getComputedStyle(guide).display,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  expect(layout.coarse).toBe(false);
  expect(layout.panelScrollHeight).toBeLessThan(560);
  expect(layout.resumeTop).not.toBeNull();
  expect(layout.resumeTop).toBeGreaterThanOrEqual(0);
  expect(layout.resumeBottom).toBeLessThanOrEqual(390);
  expect(layout.guideDisplay).toBe("none");
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
});

test("keeps the desktop build-summary skill-efficiency cell unclipped after allocation", async ({
  page,
}) => {
  await page.goto("/");
  await openSettings(page);
  await openSettingsTab(page, "특성");
  await allocateBalancedAttributes(page);

  const layout = await page.evaluate(() => {
    const cells = [...document.querySelectorAll<HTMLElement>(".starting-build-summary > div")];
    return {
      clipped: cells
        .filter((cell) => cell.scrollWidth > cell.clientWidth + 2)
        .map((cell) => ({
          label: cell.querySelector("dt")?.textContent ?? "",
          value: (cell.querySelector("dd")?.textContent ?? "").trim().replace(/\s+/gu, " "),
          sw: cell.scrollWidth,
          cw: cell.clientWidth,
        })),
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
    };
  });
  expect(layout.clipped).toEqual([]);
  expect(layout.docScrollWidth).toBeLessThanOrEqual(layout.docClientWidth);
});
