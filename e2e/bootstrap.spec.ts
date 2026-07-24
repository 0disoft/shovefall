import { expect, test, type Page } from "@playwright/test";

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

async function fastForwardUntilRoundCompleted(page: Page, remainingFrames = 550): Promise<void> {
  if (
    remainingFrames === 0 ||
    (await page.locator("#app").getAttribute("data-round")) === "completed"
  ) {
    return;
  }

  await page.clock.fastForward(150);
  return fastForwardUntilRoundCompleted(page, remainingFrames - 1);
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

async function fastForwardUntilAttribute(
  page: Page,
  selector: string,
  attribute: string,
  expected: string,
  remainingFrames = 250,
): Promise<void> {
  if (
    remainingFrames === 0 ||
    (await page.locator(selector).getAttribute(attribute)) === expected
  ) {
    return;
  }

  await page.clock.fastForward(50);
  return fastForwardUntilAttribute(page, selector, attribute, expected, remainingFrames - 1);
}

async function finishInstalledClockCountdown(page: Page, remainingSteps = 24): Promise<void> {
  const round = await page.locator("#app").getAttribute("data-round");

  if (round === "active") {
    return;
  }

  if (remainingSteps === 0) {
    throw new Error(
      `Countdown did not become active; current round state is ${round ?? "missing"}.`,
    );
  }

  if (remainingSteps === 24) {
    await page.clock.fastForward(1_450);
  } else {
    await page.clock.fastForward(10);
  }

  return finishInstalledClockCountdown(page, remainingSteps - 1);
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "settings");
}

async function saveSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "설정 저장" }).click();
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "menu");
}

async function startGame(page: Page): Promise<void> {
  await page.getByRole("button", { name: "게임 시작" }).click();
}

async function readSimulationTick(page: Page): Promise<number> {
  return Number(await page.locator("#game-telemetry").getAttribute("data-tick"));
}

async function clickInventorySlotAfterActiveTick(page: Page, selector: string): Promise<void> {
  const slot = page.locator(selector);
  await expect(slot).toBeEnabled();
  const tickBeforeClick = await readSimulationTick(page);
  await slot.click();
  await expect
    .poll(() => readSimulationTick(page), {
      message: "inventory input should be consumed by a later simulation tick",
      timeout: 15_000,
    })
    .toBeGreaterThan(tickBeforeClick);
}

async function readCameraPosition(page: Page): Promise<string> {
  const arena = page.locator("#arena-host");
  const [x, y] = await Promise.all([
    arena.getAttribute("data-camera-x"),
    arena.getAttribute("data-camera-y"),
  ]);
  return `${x ?? "missing"},${y ?? "missing"}`;
}

async function faceArenaDirection(page: Page, direction: string): Promise<void> {
  await page.locator("#arena-host").focus();
  const positionBeforeFacing = await readCameraPosition(page);
  const tickBeforeFacing = await readSimulationTick(page);
  await page.keyboard.down(direction);

  try {
    await page.clock.fastForward(20);
    await expect.poll(() => readSimulationTick(page)).toBeGreaterThan(tickBeforeFacing);
    await expect.poll(() => readCameraPosition(page)).not.toBe(positionBeforeFacing);
  } finally {
    await page.keyboard.up(direction);
  }
}

test("boots WebGL and drives the fixed-tick gray-box round", async ({ page }) => {
  test.slow();
  await page.clock.install();
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");

  await expect(page).toHaveTitle("바닥이 사라지는 술래잡기");
  await expect(
    page.getByRole("heading", { level: 1, name: "바닥이 사라지는 술래잡기" }),
  ).toBeVisible();
  await expect(page.getByText("SHOVE · DODGE · SURVIVE")).toHaveCount(0);
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "menu");
  await expect(page.getByRole("button", { name: "게임 시작" })).toBeVisible();
  await expect(page.getByRole("button", { name: "설정", exact: true })).toBeVisible();
  const versionHistoryButton = page.getByRole("button", { name: "버전 기록", exact: true });
  await expect(versionHistoryButton).toBeVisible();
  await expect(page.getByText("F11 키로 전체화면을 켠 뒤 시작해.")).toBeVisible();
  await expect(page.locator("#arena-host canvas")).toBeHidden();
  await versionHistoryButton.click();
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "history");
  await expect(page.getByRole("heading", { level: 2, name: "버전 기록" })).toBeFocused();
  await expect(page.locator("#current-version")).toHaveText("v0.34.1");
  await expect(page.locator("#version-history-list > li")).toHaveCount(17);
  await expect(page.getByText("왜 바꿨냐면")).toHaveCount(17);
  await expect(page.locator("#arena-host canvas")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#app")).toHaveAttribute("data-screen", "menu");
  await expect(versionHistoryButton).toBeFocused();
  await openSettings(page);
  await expect(page.locator('input[name="preset"]')).toHaveCount(0);
  await expect(page.locator('input[name="botDifficulty"]')).toHaveCount(0);
  await expect(page.locator("#player-count")).toHaveCount(0);
  await expect(page.locator("#starting-weight-value")).toHaveText("75");
  await expect(page.locator("#setup-summary")).toHaveText(
    "50명 · AI 어려움 · 붕괴 보통 · 몸무게 75 · 철 장화 + 스프링 장갑 · 맵 아이템 17개 · 5초마다 1개",
  );
  await page.locator("#starting-weight").fill("58");
  await page.locator('input[name="collapseSpeed"][value="slow"]').check();
  await page.getByRole("button", { name: "취소" }).click();
  await openSettings(page);
  await expect(page.locator("#starting-weight-value")).toHaveText("75");
  await expect(page.locator("#setup-summary")).toHaveText(
    "50명 · AI 어려움 · 붕괴 보통 · 몸무게 75 · 철 장화 + 스프링 장갑 · 맵 아이템 17개 · 5초마다 1개",
  );
  await page.locator("#starting-weight").fill("58");
  await page.locator('input[name="collapseSpeed"][value="slow"]').check();
  await page.locator('input[name="startingItem"][value="spring-glove"]').uncheck();
  await page.locator('input[name="startingItem"][value="wind-blast"]').check();
  await expect(page.locator("#setup-summary")).toContainText("몸무게 58");
  await expect(page.locator("#setup-summary")).toContainText("붕괴 느림");
  await expect(page.locator("#setup-summary")).toContainText("철 장화 + 장풍");

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
  await expect(page.locator("#game-telemetry")).toHaveAttribute("data-tick", "0");
  await expect(page.locator("#game-telemetry")).toBeVisible();
  const developerTelemetry = page.locator("#developer-telemetry");
  const productionArtifact = new URL(page.url()).port === "4175";
  await expect(developerTelemetry).toHaveCount(productionArtifact ? 0 : 1);
  if (!productionArtifact) {
    await expect(developerTelemetry).toBeVisible();
    await expect(developerTelemetry).not.toHaveAttribute("open", "");
  }
  await expect(page.locator("#app")).toHaveAttribute("data-initial-items", "17");
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
  await finishInstalledClockCountdown(page);
  await expect(page.getByText("시작!", { exact: true })).toBeVisible();
  await expect(page.locator("#game-telemetry")).toHaveAttribute("data-action", "Ready");
  await expect(page.locator("#inventory-actions")).toBeVisible();
  await expect(page.locator("#use-item-slot-0")).toContainText("철 장화 · 상시");
  await expect(page.locator("#use-item-slot-0")).toBeDisabled();
  await expect(page.locator("#use-item-slot-1")).toContainText("장풍 · 2회");
  const activeCanvas = await captureArenaCanvas(page);
  expect(activeCanvas.summary.uniqueColorBuckets).toBeGreaterThan(4);
  expect(activeCanvas.summary.luminanceRange).toBeGreaterThan(20);

  const positionBefore = await readCameraPosition(page);
  await faceArenaDirection(page, "d");
  expect(await readCameraPosition(page)).not.toBe(positionBefore);
  const movedCanvas = await captureArenaCanvas(page);
  expect(movedCanvas.png.equals(activeCanvas.png)).toBe(false);

  const arrowPositionBefore = await readCameraPosition(page);
  await faceArenaDirection(page, "ArrowUp");
  expect(await readCameraPosition(page)).not.toBe(arrowPositionBefore);

  const tickBeforeItem = await readSimulationTick(page);
  await page.keyboard.press("KeyE");
  await page.clock.fastForward(20);
  await expect.poll(() => readSimulationTick(page)).toBeGreaterThan(tickBeforeItem);
  await expect(page.locator("#use-item-slot-1")).toContainText("장풍 · 1회");
  const tickBeforeShove = await readSimulationTick(page);
  await page.keyboard.down("Space");
  await page.clock.fastForward(80);
  await page.keyboard.up("Space");
  await expect.poll(() => readSimulationTick(page)).toBeGreaterThan(tickBeforeShove);
  await expect(page.locator("#round-message")).toHaveText(/밀치기 적중!|헛밀치기! 균형을 잡아\./u);
  await expect
    .poll(async () => Number(await page.locator("#game-telemetry").getAttribute("data-tick")))
    .toBeGreaterThan(0);

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByText("일시 정지")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("#renderer-status")).toHaveAttribute(
    "data-state",
    /playing|spectating/u,
  );

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
});

test("equips Brick Bag in a live production round", async ({ page }) => {
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await openSettings(page);
  await page.locator('input[name="startingItem"][value="iron-boots"]').uncheck();
  await page.locator('input[name="startingItem"][value="spring-glove"]').uncheck();
  await page.locator('input[name="startingItem"][value="brick-bag"]').check();
  await page.locator('input[name="startingItem"][value="boat"]').check();
  await page.locator("#initial-item-count").fill("0");
  await expect(page.locator("#setup-summary")).toContainText("벽돌 가방 + 배");
  await saveSettings(page);
  await startGame(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active", { timeout: 5_000 });
  await expect(page.locator("#use-item-slot-0")).toContainText("벽돌 가방 · 4회");
  await expect(page.locator("#use-item-slot-1")).toContainText("배 · 1회");
  await expect(page.locator("#use-item-slot-0")).toBeEnabled();
  await expect(page.locator("#use-item-slot-1")).toBeEnabled();
});

test("equips and launches a Boat in a fresh round", async ({ page }) => {
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await openSettings(page);
  await page.locator('input[name="startingItem"][value="iron-boots"]').uncheck();
  await page.locator('input[name="startingItem"][value="spring-glove"]').uncheck();
  await page.locator('input[name="startingItem"][value="iron-boots"]').check();
  await page.locator('input[name="startingItem"][value="boat"]').check();
  await expect(page.locator("#setup-summary")).toContainText("철 장화 + 배");
  await saveSettings(page);
  await startGame(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active", { timeout: 5_000 });
  await expect(page.locator("#use-item-slot-1")).toContainText("배 · 1회");
  await clickInventorySlotAfterActiveTick(page, "#use-item-slot-1");
  await expect(page.locator("#use-item-slot-1")).toContainText("배 · 0회");
  await expect(page.locator("#effect-value")).toContainText(/배 [1-5]초/u);
  await expect(page.getByText("배를 띄웠어. 5초 동안 물을 건널 수 있어.")).toBeVisible();
});

test("equips and places a timed bomb in a fresh round", async ({ page }) => {
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await openSettings(page);
  await page.locator('input[name="startingItem"][value="iron-boots"]').uncheck();
  await page.locator('input[name="startingItem"][value="spring-glove"]').uncheck();
  await page.locator('input[name="startingItem"][value="iron-boots"]').check();
  await page.locator('input[name="startingItem"][value="bomb"]').check();
  await expect(page.locator("#setup-summary")).toContainText("철 장화 + 시한폭탄");
  await saveSettings(page);
  await startGame(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active", { timeout: 5_000 });
  await expect(page.locator("#use-item-slot-1")).toContainText("시한폭탄 · 2회");
  await expect(page.locator("#use-item-slot-1")).toBeEnabled();
  await page.locator("#use-item-slot-1").click();
  await expect(page.locator("#use-item-slot-1")).toContainText("시한폭탄 · 1회");
  await expect(page.getByText("폭탄을 놨어. 5초 뒤 터져.")).toBeVisible();
});

test("selects Soap in a live production-safe round", async ({ page }) => {
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await openSettings(page);
  const soapCard = page.locator('input[name="startingItem"][value="soap"]');
  await expect(soapCard).toHaveCount(1);
  await expect(page.getByText("3개 · 앞 칸에 미끄럼 함정", { exact: true })).toBeVisible();
  await page.locator('input[name="startingItem"][value="iron-boots"]').uncheck();
  await page.locator('input[name="startingItem"][value="spring-glove"]').uncheck();
  await page.locator('input[name="startingItem"][value="boat"]').check();
  await soapCard.check();
  await page.locator("#initial-item-count").fill("0");
  await expect(page.locator("#setup-summary")).toContainText("배 + 비누");
  await saveSettings(page);
  await startGame(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active", { timeout: 5_000 });
  await expect(page.locator("#use-item-slot-0")).toContainText("배 · 1회");
  await expect(page.locator("#use-item-slot-1")).toContainText("비누 · 3회");
  await expect(page.locator("#use-item-slot-0")).toBeEnabled();
  await expect(page.locator("#use-item-slot-1")).toBeEnabled();
});

test("selects Grappling Hook and catches a deterministic anchor in a fresh round", async ({
  page,
}) => {
  await installFixedRoundSeed(page, 1, 0);
  await page.goto("/");
  await openSettings(page);
  const grapplingHookCard = page.locator('input[name="startingItem"][value="grappling-hook"]');
  await expect(grapplingHookCard).toHaveCount(1);
  await expect(page.getByText("2회 · 땅이나 벽을 붙잡아", { exact: true })).toBeVisible();
  await page.locator('input[name="startingItem"][value="spring-glove"]').uncheck();
  await grapplingHookCard.check();
  await expect(page.locator("#setup-summary")).toContainText("철 장화 + 구조 갈고리");
  await saveSettings(page);
  await startGame(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active", { timeout: 5_000 });
  const slot = page.locator("#use-item-slot-1");
  await expect(slot).toContainText("구조 갈고리 · 2회");
  await faceArenaDirection(page, "ArrowRight");
  await expect(slot).toBeEnabled();
  await slot.click();

  await expect(slot).toContainText("구조 갈고리 · 1회");
  await expect(page.getByText("갈고리가 걸렸어.", { exact: true })).toBeVisible();
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
  await page.locator("#starting-weight").fill("100");
  await page.locator('input[name="collapseSpeed"][value="slow"]').check();
  await saveSettings(page);
  await startGame(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active");

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

  await page.locator("#touch-shove").dispatchEvent("pointerdown", {
    button: 0,
    isPrimary: true,
    pointerId: 99,
    pointerType: "touch",
  });
  await expect(page.locator("#game-telemetry")).toHaveAttribute(
    "data-action",
    /ShoveWindup|ShoveActive|ShoveRecovery|Stumbling/u,
  );
});

test("keeps bounded debug tuning in development and removes it from production", async ({
  page,
}) => {
  await installClipboardCapture(page);
  await page.goto("/");
  await openSettings(page);

  const debugPanel = page.locator("#debug-tuning");
  const productionArtifact = new URL(page.url()).port === "4175";
  if (productionArtifact) {
    await expect(debugPanel).toHaveCount(0);
    return;
  }

  await expect(debugPanel).toBeVisible();
  const movementSpeed = page.locator("#debug-movement-speed");
  await expect(movementSpeed).toBeDisabled();
  await debugPanel.locator("summary").click();
  await page.getByLabel("조정값 사용").check();
  await expect(movementSpeed).toBeEnabled();

  await movementSpeed.fill("0.04");
  await page.locator("#debug-movement-acceleration").fill("0.004");
  await page.locator("#debug-lightweight-speed").fill("1.5");
  await page.locator("#debug-shove-reach").fill("0.24");
  await page.locator("#debug-shove-ticks").fill("4");
  await page.locator("#debug-dodge-speed").fill("0.085");
  await page.locator("#debug-dodge-ticks").fill("4");

  await expect(page.locator("#debug-tuning-summary")).toContainText("기본 2.4칸/초");
  await expect(page.locator("#debug-tuning-summary")).toContainText("손길이 0.24칸");
  await expect(page.locator("#debug-tuning-summary")).toContainText("회피 약 0.34칸");

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
      shoveActiveTicks: 4,
      shoveReach: 0.24,
      dodgeActiveTicks: 4,
    },
  });

  await saveSettings(page);
  await startGame(page);
  await expect(page.locator("#app")).toHaveAttribute("data-gameplay-tuning", "debug");
});

test("completes a collapsing round and starts a fresh world", async ({ page }) => {
  test.slow();
  await page.clock.install();
  await installClipboardCapture(page);
  await page.goto("/");
  await openSettings(page);

  await expect(page.locator("#setup-summary")).toContainText("50명 · AI 어려움");
  await expect(page.locator("#initial-item-count-value")).toHaveText("17개");
  await expect(page.locator("#item-respawn-value")).toHaveText("5초");
  await page.locator('input[name="collapseSpeed"][value="fast"]').check();
  await saveSettings(page);
  await startGame(page);

  await finishInstalledClockCountdown(page);
  await fastForwardUntilRoundCompleted(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "completed");
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
    schemaVersion: "shovefall-playtest-round/v4",
    seed: expect.any(String),
    stateHash: expect.stringMatching(/^fnv1a32:[0-9a-f]{8}$/u),
    settings: { participantCount: 50, startingWeight: 75 },
    result: { completedTick: expect.any(Number) },
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
  await openSettings(page);
  await page.locator('input[name="collapseSpeed"][value="fast"]').check();
  await saveSettings(page);
  await startGame(page);

  await finishInstalledClockCountdown(page);

  await fastForwardUntilAttribute(page, "#app", "data-human-eliminated", "true");
  await expect(page.locator("#app")).toHaveAttribute("data-human-eliminated", "true");
  await expect(page.locator("#game-telemetry")).toHaveAttribute("data-simulation-rate", "6");
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
  await startGame(page);

  await expect(page.locator("#app")).toHaveAttribute("data-audio", "unavailable");
  await expect(page.getByRole("button", { name: "무음" })).toBeDisabled();
  await expect
    .poll(async () => Number(await page.locator("#game-telemetry").getAttribute("data-tick")))
    .toBeGreaterThan(0);
});

test("honors reduced motion without removing the playable arena", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await startGame(page);
  await expect(page.locator("#arena-host")).toHaveAttribute("data-motion", "reduced");
  await expect(page.locator("#arena-host canvas")).toBeVisible();
  await expect
    .poll(async () => Number(await page.locator("#game-telemetry").getAttribute("data-tick")))
    .toBeGreaterThan(0);
});

test("@dev-only recovers from an explicitly injected fatal round error", async ({ page }) => {
  await page.goto("/");
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
