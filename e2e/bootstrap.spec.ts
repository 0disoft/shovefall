import { expect, test, type Page } from "@playwright/test";

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

test("boots WebGL and drives the fixed-tick gray-box round", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Shovefall");
  await expect(page.getByRole("heading", { level: 1, name: "끝까지 남아." })).toBeVisible();
  await expect(page.getByText("WebGL 준비됨")).toBeVisible();
  await expect(page.locator("#arena-host canvas")).toBeVisible();
  await expect(page.locator("#setup-summary")).toHaveText("12명 · 시작 아이템 4개 · 5초마다 1개");

  await page.getByRole("button", { name: "빠른 시작" }).click();

  await expect(page.locator("#app")).toHaveAttribute("data-screen", "arena");
  await expect(page.getByText("움직여서 가장자리로 몰아붙여.")).toBeVisible();
  await expect(page.locator("#arena-host")).toBeFocused();
  await expect(page.locator("#game-telemetry")).toBeVisible();
  await expect(page.locator("#app")).toHaveAttribute("data-initial-items", "4");
  await expect
    .poll(async () => Number(await page.locator("#game-telemetry").getAttribute("data-tick")))
    .toBeGreaterThan(0);

  const positionBefore = await page.locator("#position-value").textContent();
  await page.keyboard.down("d");
  await page.waitForTimeout(250);
  await page.keyboard.up("d");
  await expect.poll(() => page.locator("#position-value").textContent()).not.toBe(positionBefore);

  await page.keyboard.press("Space");
  await expect(page.locator("#game-telemetry")).toHaveAttribute(
    "data-action",
    /ShoveWindup|ShoveActive|ShoveRecovery|Stumbling/u,
  );

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByText("일시 정지")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("플레이 중")).toBeVisible();

  await page.getByRole("button", { name: "설정으로" }).click();

  await expect(page.locator("#app")).toHaveAttribute("data-screen", "setup");
  await expect(page.getByRole("button", { name: "빠른 시작" })).toBeFocused();
  await expect(page.locator("#game-telemetry")).toBeHidden();
});

test("completes a collapsing round and starts a fresh world", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");

  await page.getByLabel("난장판").check();
  await expect(page.locator("#setup-summary")).toContainText("32명");
  await expect(page.locator("#setup-summary")).toContainText("난장판");
  await expect(page.locator("#initial-item-count-value")).toHaveText("11개");
  await expect(page.locator("#item-respawn-value")).toHaveText("3초");
  await page.locator("#player-count").fill("4");
  await expect(page.locator("#player-count-value")).toHaveText("4명");
  await expect(page.locator("#initial-item-count-value")).toHaveText("2개");
  await page.getByRole("button", { name: "빠른 시작" }).click();

  await expect(page.locator("#app")).toHaveAttribute("data-round", "active");
  await fastForwardUntilRoundCompleted(page);
  await expect(page.locator("#app")).toHaveAttribute("data-round", "completed");
  await expect(page.getByRole("button", { name: "다시 시작" })).toBeFocused();
  await expect(page.locator("#renderer-status")).toHaveText(/승리|라운드 종료/u);

  const completedTick = Number(await page.locator("#tick-value").textContent());
  const completedHash = await page.locator("#hash-value").textContent();
  await page.getByRole("button", { name: "다시 시작" }).click();

  await expect(page.locator("#app")).toHaveAttribute("data-round", "active");
  await expect(page.locator("#arena-host")).toBeFocused();
  const restartedTick = Number(await page.locator("#tick-value").textContent());
  expect(restartedTick).toBeLessThan(completedTick);
  await expect(page.locator("#hash-value")).not.toHaveText(completedHash ?? "");
});
