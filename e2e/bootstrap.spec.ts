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
  await expect(page.locator("#version-history-list > li")).toHaveCount(VERSION_HISTORY.length);
  await expect(page.getByText("왜 바꿨냐면요")).toHaveCount(VERSION_HISTORY.length);
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
    /^\d+(?:\.\d+)?px \d+(?:\.\d+)?px \d+(?:\.\d+)?px$/u,
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
    return {
      cardWidth: firstCard?.getBoundingClientRect().width ?? 0,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  expect(mobileHistoryLayout.documentWidth).toBeLessThanOrEqual(mobileHistoryLayout.viewportWidth);
  expect(mobileHistoryLayout.cardWidth).toBeLessThanOrEqual(mobileHistoryLayout.viewportWidth);
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
    await expect(page.getByText("길게 누르면 계속 · 5씩 버튼도 있어")).toBeVisible();
    await expect(page.getByText("Ctrl+클릭은 5씩")).toBeHidden();
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
      expect(pauseBox.x).toBeGreaterThanOrEqual(toggleBox.x + toggleBox.width - 4);
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

  test.describe("extra-large font", () => {
    test.use({ viewport: { width: 320, height: 568 } });

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
        /^\d+(?:\.\d+)?px \d+(?:\.\d+)?px \d+(?:\.\d+)?px$/u,
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
      expect(layout.panelScrollHeight).toBeLessThan(700);
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
