import { expect, test, type Page } from "@playwright/test";

interface CanvasPixelSummary {
  readonly luminanceRange: number;
  readonly sampledPixels: number;
  readonly uniqueColorBuckets: number;
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

async function fastForwardUntilRoundCompleted(page: Page, remainingFrames = 250): Promise<void> {
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

async function finishInstalledClockCountdown(page: Page): Promise<void> {
  await page.clock.fastForward(1_600);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active");
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

test("boots WebGL and drives the fixed-tick gray-box round", async ({ page }) => {
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
  await expect(page.getByText("F11 키로 전체화면을 켠 뒤 시작해.")).toBeVisible();
  await expect(page.locator("#arena-host canvas")).toBeHidden();
  await openSettings(page);
  await page.getByLabel("쉬움").check();
  await page.getByRole("button", { name: "취소" }).click();
  await openSettings(page);
  await expect(page.locator('input[name="botDifficulty"][value="normal"]')).toBeChecked();
  await expect(page.locator("#setup-summary")).toHaveText(
    "16명 · AI 보통 · 붕괴 보통 · 내 체급 보통 · 철 장화 + 스프링 장갑 · 맵 아이템 6개 · 5초마다 1개",
  );
  await page.getByLabel("어려움").check();
  await page.locator('input[name="collapseSpeed"][value="slow"]').check();
  await page.locator("#player-count").fill("8");
  await expect(page.locator("#setup-summary")).toContainText("AI 어려움");
  await page.getByLabel("쉬움").check();
  await expect(page.locator("#setup-summary")).toContainText("AI 쉬움");
  await expect(page.locator("#setup-summary")).toContainText("붕괴 느림");

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
  await expect(page.locator("#tick-value")).toHaveText("0");
  await expect(page.locator("#game-telemetry")).toBeVisible();
  await expect(page.locator("#developer-telemetry")).not.toHaveAttribute("open", "");
  await expect(page.locator("#app")).toHaveAttribute("data-initial-items", "3");
  await expect(page.locator("#app")).toHaveAttribute("data-bot-difficulty", "easy");
  await expect(page.locator("#app")).toHaveAttribute("data-collapse-speed", "slow");
  await expect(page.locator("#renderer-status")).toHaveText("일시 정지");
  await page.waitForTimeout(600);
  await expect(page.locator("#tick-value")).toHaveText("0");
  await expect(page.locator("#game-telemetry")).toHaveAttribute(
    "data-countdown",
    countdownPauseSnapshot.countdown ?? "",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active");
  await expect(page.getByText("시작!", { exact: true })).toBeVisible();
  await expect(page.locator("#game-telemetry")).toHaveAttribute("data-action", "Ready");
  await expect
    .poll(async () => Number(await page.locator("#game-telemetry").getAttribute("data-tick")))
    .toBeGreaterThan(0);
  const activeCanvas = await captureArenaCanvas(page);
  expect(activeCanvas.summary.uniqueColorBuckets).toBeGreaterThan(4);
  expect(activeCanvas.summary.luminanceRange).toBeGreaterThan(20);

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByText("일시 정지")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("#renderer-status")).toHaveAttribute(
    "data-state",
    /playing|spectating/u,
  );

  await page.locator("#arena-host").focus();
  const positionBefore = await page.locator("#position-value").textContent();
  await page.keyboard.down("d");
  await page.waitForTimeout(100);
  await page.keyboard.up("d");
  await expect.poll(() => page.locator("#position-value").textContent()).not.toBe(positionBefore);
  const movedCanvas = await captureArenaCanvas(page);
  expect(movedCanvas.png.equals(activeCanvas.png)).toBe(false);

  const arrowPositionBefore = await page.locator("#position-value").textContent();
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(100);
  await page.keyboard.up("ArrowUp");
  await expect
    .poll(() => page.locator("#position-value").textContent())
    .not.toBe(arrowPositionBefore);

  const pointerPositionBefore = await page.locator("#position-value").textContent();
  const arenaBounds = await page.locator("#arena-host").boundingBox();
  expect(arenaBounds).not.toBeNull();
  if (arenaBounds !== null) {
    const originX = arenaBounds.x + arenaBounds.width / 2;
    const originY = arenaBounds.y + arenaBounds.height / 2;
    await page.mouse.move(originX, originY);
    await page.mouse.down();
    await page.mouse.move(originX + 80, originY, { steps: 4 });
    await page.waitForTimeout(100);
    await page.mouse.up();
  }
  await expect
    .poll(() => page.locator("#position-value").textContent())
    .not.toBe(pointerPositionBefore);

  await page.keyboard.press("Space");
  await expect(page.locator("#game-telemetry")).toHaveAttribute(
    "data-action",
    /ShoveWindup|ShoveActive|ShoveRecovery|Stumbling/u,
  );

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
});

test("offers a working touch joystick and action buttons on a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await startGame(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "active");

  const joystick = page.locator("#pointer-joystick");
  await expect(joystick).toBeVisible();
  const positionBefore = await page.locator("#position-value").textContent();
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
  await expect.poll(() => page.locator("#position-value").textContent()).not.toBe(positionBefore);
  await expect(joystick).not.toHaveAttribute("data-active", "true");

  await page.locator("#touch-shove").click();
  await expect(page.locator("#game-telemetry")).toHaveAttribute(
    "data-action",
    /ShoveWindup|ShoveActive|ShoveRecovery|Stumbling/u,
  );
});

test("applies and copies bounded debug tuning for the next round", async ({ page }) => {
  await installClipboardCapture(page);
  await page.goto("/");
  await openSettings(page);

  const debugPanel = page.locator("#debug-tuning");
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
  await page.clock.install();
  await installClipboardCapture(page);
  await page.goto("/");
  await openSettings(page);

  await page.getByLabel("난장판").check();
  await expect(page.locator("#setup-summary")).toContainText("32명");
  await expect(page.locator("#setup-summary")).toContainText("난장판");
  await expect(page.locator("#initial-item-count-value")).toHaveText("11개");
  await expect(page.locator("#item-respawn-value")).toHaveText("3초");
  await page.locator("#player-count").fill("8");
  await expect(page.locator("#player-count-value")).toHaveText("8명");
  await expect(page.locator("#initial-item-count-value")).toHaveText("3개");
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
    schemaVersion: "shovefall-playtest-round/v3",
    seed: await page.locator("#seed-value").textContent(),
    stateHash: await page.locator("#hash-value").textContent(),
    settings: { participantCount: 8 },
    result: { completedTick: Number(await page.locator("#tick-value").textContent()) },
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
  await expect(page.getByText("복사하지 못했어. 시드와 상태 해시를 직접 기록해 줘.")).toBeVisible();

  const completedTick = Number(await page.locator("#tick-value").textContent());
  const completedHash = await page.locator("#hash-value").textContent();
  await page.getByRole("button", { name: "다시 시작" }).click();

  await expect(page.locator("#app")).toHaveAttribute("data-round", "countdown");
  await expect(copyButton).toBeHidden();
  await expect(page.locator("#tick-value")).toHaveText("0");
  await finishInstalledClockCountdown(page);
  await expect(page.locator("#arena-host")).toBeFocused();
  const restartedTick = Number(await page.locator("#tick-value").textContent());
  expect(restartedTick).toBeLessThan(completedTick);
  await expect(page.locator("#hash-value")).not.toHaveText(completedHash ?? "");
});

test("allows an immediate fresh restart after a deterministic human defeat", async ({ page }) => {
  await page.clock.install();
  await installFixedRoundSeed(page, 8, 1);
  await page.goto("/");
  await openSettings(page);
  await page.getByLabel("난장판").check();
  await page.locator("#player-count").fill("8");
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
  const pausedTick = Number(await page.locator("#tick-value").textContent());
  await page.waitForTimeout(150);
  expect(Number(await page.locator("#tick-value").textContent())).toBe(pausedTick);

  await page.locator("#arena-host canvas").dispatchEvent("webglcontextrestored");
  await expect(page.locator("#arena-host")).toHaveAttribute("data-renderer", "ready");
  await expect
    .poll(async () => {
      const currentTick = Number(await page.locator("#tick-value").textContent());
      const roundState = await page.locator("#app").getAttribute("data-round");
      return currentTick > pausedTick || roundState === "completed";
    })
    .toBe(true);
  await expect(page.locator("#renderer-status")).not.toHaveAttribute("data-state", "error");
});
