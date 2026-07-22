import { expect, test } from "@playwright/test";

test("boots WebGL and drives the fixed-tick gray-box round", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Shovefall");
  await expect(page.getByRole("heading", { level: 1, name: "끝까지 남아." })).toBeVisible();
  await expect(page.getByText("WebGL 준비됨")).toBeVisible();
  await expect(page.locator("#arena-host canvas")).toBeVisible();

  await page.getByRole("button", { name: "빠른 시작" }).click();

  await expect(page.locator("#app")).toHaveAttribute("data-screen", "arena");
  await expect(page.getByText("움직여서 가장자리로 몰아붙여.")).toBeVisible();
  await expect(page.locator("#arena-host")).toBeFocused();
  await expect(page.locator("#game-telemetry")).toBeVisible();
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
