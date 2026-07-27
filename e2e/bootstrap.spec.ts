import { expect, test, type Locator, type Page } from "@playwright/test";
import { VERSION_HISTORY } from "../src/app/version-history";
import { PRODUCT_VERSION } from "../src/simulation/versions";

interface CanvasPixelSummary {
  readonly luminanceRange: number;
  readonly sampledPixels: number;
  readonly uniqueColorBuckets: number;
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

async function fastForwardUntilAttribute(
  page: Page,
  selector: string,
  attribute: string,
  expected: string,
  remainingFrames = 75,
): Promise<void> {
  if (
    remainingFrames === 0 ||
    (await page.locator(selector).getAttribute(attribute)) === expected
  ) {
    return;
  }

  await page.clock.fastForward(1_000);
  return fastForwardUntilAttribute(page, selector, attribute, expected, remainingFrames - 1);
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
  name: "특성" | "스킬" | "아이템" | "실험실",
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
  const selectedCount = await page
    .locator('#starting-skills input[name="startingSkill"]:checked')
    .count();
  if (selectedCount >= 2) {
    return;
  }
  await page
    .locator('#starting-skills input[name="startingSkill"]:not(:checked):not(:disabled)')
    .first()
    .check();
  return selectStartingSkills(page);
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

async function clickInventorySlotAfterActiveTick(page: Page, selector: string): Promise<void> {
  const slot = page.locator(selector);
  await expect(slot).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator("#game-telemetry")).toHaveAttribute("data-action", "Ready", {
    timeout: 15_000,
  });
  const tickBeforeClick = await readSimulationTick(page);
  await slot.evaluate((button) => {
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      throw new Error("inventory slot was not actionable at the click boundary");
    }

    button.click();
  });
  await waitForSimulationTickAdvance(page, tickBeforeClick);
}

async function setArenaFacingDirection(page: Page, direction: string): Promise<void> {
  await page.locator("#arena-host").focus();
  const tickBeforeFacing = await readSimulationTick(page);
  await page.keyboard.down(direction);

  try {
    await page.clock.fastForward(34);
    await expect.poll(() => readSimulationTick(page)).toBeGreaterThan(tickBeforeFacing);
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

async function useDirectionalInventorySlot(
  page: Page,
  selector: string,
  expectedText: string,
  directions: readonly string[] = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"],
): Promise<void> {
  const [direction, ...remainingDirections] = directions;

  if (direction === undefined) {
    throw new Error(`inventory slot never reached expected state: ${expectedText}`);
  }

  const slot = page.locator(selector);
  await setArenaFacingDirection(page, direction);
  await clickInventorySlotAfterActiveTick(page, selector);

  if ((await slot.textContent())?.includes(expectedText) === true) {
    return;
  }

  return useDirectionalInventorySlot(page, selector, expectedText, remainingDirections);
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

  if ((await page.locator("#round-message").textContent()) === "갈고리가 걸렸어.") {
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
    await expect.poll(() => readSimulationTick(page)).toBeGreaterThan(tickBeforeFacing);
  } finally {
    await page.keyboard.up(direction);
  }
}

test("boots WebGL and drives the fixed-tick gray-box round", async ({ page }) => {
  test.slow();
  await page.clock.install();
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
  await expect(page.locator("#stat-upgrade-form svg")).toHaveCount(0);
  await expect(page.getByText("50명 · AI 어려움", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(productionArtifact ? 3 : 4);
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
  await expect(page.locator(".starting-attributes__grid")).toHaveCSS(
    "grid-template-columns",
    /^\d+(?:\.\d+)?px \d+(?:\.\d+)?px$/u,
  );
  await expect(page.locator("#starting-next-strength")).toContainText("위력 +2.5%");
  await openSettingsTab(page, "스킬");
  await expect(page.locator('#starting-skills input[name="startingSkill"]')).toHaveCount(8);
  await expect(page.locator("#starting-skills .skill-art")).toHaveCount(8);
  await expect(page.getByText("바위 감옥", { exact: true })).toHaveCount(0);
  await expect(page.locator(".skill-art--arc-bolt")).toHaveCSS(
    "background-image",
    /skill-icons\.svg/u,
  );
  await expect(
    page.getByText("전방 3.5칸 안의 첫 적을 조준 보정해 피해 20와 넉백 0.3"),
  ).toBeVisible();
  await expect(page.getByText("5초간 피해 28 흡수, 제어 시간 30% 감소")).toBeVisible();
  await expect(page.locator('#starting-skills input[name="startingSkill"]:checked')).toHaveCount(0);
  await expect(page.locator('input[name="startingItem"]:checked')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "설정 저장" })).toBeDisabled();
  await expect(page.locator("#starting-skills")).toBeVisible();
  await expect(page.locator("#settings-panel-attributes")).toBeHidden();
  await openSettingsTab(page, "아이템");
  await expect(page.locator('[data-item-definition="bomb"] .item-card__meta')).toContainText("2회");
  await expect(page.locator('[data-item-definition="bomb"] .item-card__meta')).toContainText(
    "위치 지정",
  );
  await expect(page.locator('[data-item-definition="bomb"] .item-card__effect')).toHaveText(
    "지정 타일 · 3.5초 뒤 반경 3칸 80 피해 · 설치자는 피해 없음",
  );
  await expect(page.locator("#starting-items .item-art")).toHaveCount(5);
  await expect(page.locator(".item-art--soap")).toHaveCSS("background-image", /item-icons/u);
  await expect(page.locator("#setup-summary")).toHaveCount(0);
  await expect(page.locator("#starting-skill-count")).toHaveText("0");
  await expect(page.locator("#starting-item-count")).toHaveText("0");
  await openSettingsTab(page, "특성");
  await page.getByRole("button", { name: "완력 1 올리기" }).click();
  await expect(page.locator("#starting-total-mass")).toHaveText("+2.5%");
  await expect(page.locator("#starting-effect-strength")).toContainText("무게 보정 +2.5%");
  await expect(page.locator("#starting-effect-strength")).toContainText("위력 +2.5%");
  await expect(page.getByRole("button", { name: "설정 저장" })).toBeDisabled();
  await page.getByRole("button", { name: "취소" }).click();
  await openSettings(page);
  await expect(page.locator("#starting-attribute-strength")).toHaveText("0");
  await expect(page.locator("#setup-summary")).toHaveCount(0);
  await allocateStrengthBuild(page);
  await selectStartingItem(page, "wind-blast");
  await expect(page.locator("#starting-attribute-strength")).toHaveText("8");
  await expect(page.locator('input[name="startingItem"][value="wind-blast"]')).toBeChecked();
  await expect(page.locator("#starting-item-count")).toHaveText("1");

  await saveSettings(page);
  const countdownPauseSnapshot = await page.locator("#start-game").evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Game start control is not a button.");
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
  await expect(page.locator("#arena-host")).toHaveAttribute("data-skill-effect-assets", "8");
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
  await expect(page.locator("#use-skill-slot-0")).toContainText("Q · 충격 장타");
  await expect(page.locator("#use-skill-slot-1")).toContainText("W · 잔상 회피");
  await expect(page.locator("#use-grapple")).toContainText("E · 구조 갈고리");
  await expect(page.locator("#use-item-slot-0")).toContainText("D · 장풍 · 2회");
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

  await expect
    .poll(async () => Number(await page.locator("#game-telemetry").getAttribute("data-tick")))
    .toBeGreaterThan(0);
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
    await page.mouse.move(originX, originY);
    await page.mouse.down();
    await expect(page.locator("#arena-host")).toHaveAttribute("data-pointer-moving", "true");
    await page.mouse.move(originX + 80, originY, { steps: 4 });
    await page.mouse.up();
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
  await expect(page.locator("#power-bonus")).toHaveText("+0%");
  await expect(page.locator("#stability-bonus")).toHaveText("+0%");
  await expect(page.locator("#mobility-bonus")).toHaveText("+0%");
  await expect(page.locator("#reflex-bonus")).toHaveText("0% / 0%");
  await expect(page.locator("#use-skill-slot-0")).toContainText("Q · 충격 장타");
  await expect(page.locator("#use-skill-slot-0")).toHaveAttribute("data-state", "ready");
  await expect(page.locator("#use-skill-slot-1")).toContainText("W · 잔상 회피");
  await expect(page.locator("#use-item-slot-0")).toContainText("D · 벽돌 가방 · 4회");
});

test("equips and launches a Boat in a fresh round", async ({ page }) => {
  await page.clock.install();
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
  await clickInventorySlotAfterActiveTick(page, "#use-item-slot-0");
  await expect(page.locator("#use-item-slot-0")).toContainText("D · 배 · 0회");
  await expect(page.locator("#effect-value")).toContainText(/배 [1-5]초/u);
  await expect(page.locator("#round-message")).toHaveText(
    "배를 띄웠어. 3초 동안 물을 건널 수 있어.",
  );
});

test("equips and places a timed bomb in a fresh round", async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.install();
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
  await useDirectionalInventorySlot(page, "#use-item-slot-0", "시한폭탄 · 1회");
  await expect(page.locator("#use-item-slot-0")).toContainText("시한폭탄 · 1회");
  await expect(page.locator("#round-message")).toHaveText("폭탄을 놨어. 3.5초 뒤 터져.");
});

test("selects Soap in a live production-safe round", async ({ page }) => {
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await openSettings(page);
  await openSettingsTab(page, "아이템");
  const soapCard = page.locator('input[name="startingItem"][value="soap"]');
  await expect(soapCard).toHaveCount(1);
  await expect(page.locator('[data-item-definition="soap"] .item-card__meta')).toContainText("4회");
  await expect(page.locator('[data-item-definition="soap"] .item-card__effect')).toContainText(
    "1초 미끄러짐",
  );
  await soapCard.check();
  await expect(soapCard).toBeChecked();
  await saveSettings(page);
  await startGame(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active", { timeout: 5_000 });
  await expect(page.locator("#use-item-slot-0")).toContainText("D · 비누 · 4회");
  await expect(page.locator("#use-item-slot-0")).toBeEnabled();
});

test("fires the built-in grapple in a fresh round", async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.install();
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await pauseInstalledClock(page);
  await openSettings(page);
  await selectStartingItem(page, "soap");
  await expect(page.locator('input[name="startingItem"][value="soap"]')).toBeChecked();
  await saveSettings(page);
  await startGame(page);
  await finishInstalledClockCountdown(page);
  await expect(page.locator("#use-grapple")).toContainText("E · 구조 갈고리 · 준비");
  await useDirectionalGrapple(page);
  await expect(page.locator("#round-message")).toHaveText("갈고리가 걸렸어.");
});

test("offers a working touch joystick and action buttons on a narrow viewport", async ({
  page,
}) => {
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
  await expect(page.locator("#use-skill-slot-0")).toHaveAttribute("data-state", "cooldown");
  await expect(page.locator("#mana-value")).not.toHaveText("100 / 100");

  const joystick = page.locator("#pointer-joystick");
  await expect(joystick).toBeVisible();
  const positionBefore = await readCameraPosition(page);
  const joystickBounds = await joystick.boundingBox();
  expect(joystickBounds).not.toBeNull();
  if (joystickBounds !== null) {
    const centerX = joystickBounds.x + joystickBounds.width / 2;
    const centerY = joystickBounds.y + joystickBounds.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + joystickBounds.width / 2, centerY, { steps: 4 });
    await page.waitForTimeout(120);
    await expect(joystick).toHaveAttribute("data-active", "true");
    await page.mouse.up();
  }
  await expect.poll(() => readCameraPosition(page)).not.toBe(positionBefore);
  await expect(joystick).not.toHaveAttribute("data-active", "true");
});

test("keeps bounded debug tuning in development and removes it from production", async ({
  page,
}) => {
  await installClipboardCapture(page);
  await page.goto("/");
  await openSettings(page);

  const debugPanel = page.locator("#debug-tuning");
  const labTab = page.getByRole("tab", { name: "실험실", exact: true });
  const productionArtifact = new URL(page.url()).port === "4175";
  if (productionArtifact) {
    await expect(debugPanel).toHaveCount(0);
    await expect(labTab).toHaveCount(0);
    return;
  }

  await expect(labTab).toBeVisible();
  await labTab.click();
  await expect(debugPanel).toBeVisible();
  const movementSpeed = page.locator("#debug-movement-speed");
  await expect(movementSpeed).toBeDisabled();
  await page.getByLabel("조정값 사용").check();
  await expect(movementSpeed).toBeEnabled();

  await movementSpeed.fill("0.04");
  await page.locator("#debug-lightweight-speed").fill("1.5");
  await page.locator("#debug-shove-reach").fill("0.24");
  await page.locator("#debug-shove-ticks").fill("4");
  await page.locator("#debug-shove-windup-ticks").fill("10");
  await page.locator("#debug-health-regen-per-tick").fill("0.08");
  await page.locator("#debug-bomb-blast-radius").fill("4.5");
  await page.locator("#debug-dodge-speed").fill("0.095");
  await page.locator("#debug-dodge-ticks").fill("4");

  await expect(page.locator("#debug-tuning-summary")).toContainText("기본 2.4칸/초");
  await expect(page.locator("#debug-tuning-summary")).toContainText("손길이 0.24칸");
  await expect(page.locator("#debug-tuning-summary")).toContainText("회피 약 0.38칸");

  await page.getByRole("button", { name: "튜닝값 복사" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { shovefallClipboardCapture?: string }).shovefallClipboardCapture,
      ),
    )
    .toContain("shovefall-debug-tuning/v1");
  const copiedTuning: unknown = JSON.parse(
    (await page.evaluate(
      () => (window as Window & { shovefallClipboardCapture?: string }).shovefallClipboardCapture,
    )) ?? "null",
  );
  expect(copiedTuning).toMatchObject({
    tuning: {
      movementMaximumSpeed: 0.04,
      shoveWindupTicks: 10,
      shoveActiveTicks: 4,
      shoveReach: 0.24,
      dodgeActiveTicks: 4,
      healthRegenPerTick: 0.08,
      bombBlastRadius: 4.5,
    },
  });

  await saveSettings(page);
  await startGame(page);
  await expect(page.locator("#app")).toHaveAttribute("data-gameplay-tuning", "debug");
});

test("completes a collapsing round and starts a fresh world", async ({ page }) => {
  test.setTimeout(180_000);
  await page.clock.install();
  await installClipboardCapture(page);
  await page.goto("/");
  await pauseInstalledClock(page);
  await openSettings(page);

  await expect(page.locator("#setup-summary")).toHaveCount(0);
  await saveSettings(page);
  await startGame(page);

  await finishInstalledClockCountdown(page);
  await fastForwardUntilRoundCompleted(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "completed");
  await expect(page.getByRole("button", { name: "계속", exact: true })).toBeHidden();
  await expect(page.locator("#resume-round")).toBeDisabled();
  await expect(page.getByRole("button", { name: "다시 시작" })).toBeFocused();
  await expect(page.locator("#renderer-status")).toHaveText(/승리|라운드 종료/u);

  const copyButton = page.getByRole("button", { name: "기록 복사" });
  await expect(copyButton).toBeVisible();
  await copyButton.click();
  await expect(page.getByRole("button", { name: "복사됨" })).toBeVisible();
  const copiedReport = await page.evaluate(
    () => (window as Window & { shovefallClipboardCapture?: string }).shovefallClipboardCapture,
  );
  const parsedReport: unknown = JSON.parse(copiedReport ?? "null");
  expect(parsedReport).toMatchObject({
    schemaVersion: "shovefall-playtest-round/v9",
    seed: expect.any(String),
    stateHash: expect.stringMatching(/^fnv1a32:[0-9a-f]{8}$/u),
    settings: {
      participantCount: 60,
      startingAttributes: {
        strength: 4,
        agility: 4,
        constitution: 4,
        spirit: 4,
        balance: 4,
        willpower: 0,
      },
      roundLimitSeconds: 120,
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
  test.slow();
  await page.clock.install();
  await installFixedRoundSeed(page, 8, 1);
  await page.goto("/");
  await pauseInstalledClock(page);
  await openSettings(page);
  await saveSettings(page);
  await startGame(page);

  await finishInstalledClockCountdown(page);

  await fastForwardUntilAttribute(page, "#app", "data-human-eliminated", "true");
  await expect(page.locator("#app")).toHaveAttribute("data-human-eliminated", "true");
  await expect(page.locator("#game-telemetry")).toHaveAttribute("data-simulation-rate", "6");
  await page.keyboard.press("p");
  await expect(page.locator("#pause-menu")).toBeVisible();
  await page.getByRole("button", { name: "다시 시작" }).click();

  await expect(page.locator("#app")).toHaveAttribute("data-round", "countdown");
  await finishInstalledClockCountdown(page);
  await expect(page.locator("#app")).not.toHaveAttribute("data-human-eliminated", "true");
  await expect(page.locator("#game-telemetry")).toHaveAttribute("data-simulation-rate", "1");
  await expect(page.locator("#arena-host")).toBeFocused();
});

test("keeps playing silently when Web Audio is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined });
    Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: undefined });
  });
  await page.goto("/");
  await saveBalancedDefaults(page);
  await startGame(page);

  await expect(page.locator("#app")).toHaveAttribute("data-audio", "unavailable");
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
