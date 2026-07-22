import { expect, test } from "@playwright/test";

test("boots the WebGL arena and moves between setup and ready states", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Shovefall");
  await expect(page.getByRole("heading", { level: 1, name: "끝까지 남아." })).toBeVisible();
  await expect(page.getByText("WebGL 준비됨")).toBeVisible();
  await expect(page.locator("#arena-host canvas")).toBeVisible();

  await page.getByRole("button", { name: "빠른 시작" }).click();

  await expect(page.locator("#app")).toHaveAttribute("data-screen", "arena");
  await expect(page.getByText("아레나 준비 완료.")).toBeVisible();
  await expect(page.getByRole("button", { name: "설정으로 돌아가기" })).toBeFocused();

  await page.getByRole("button", { name: "설정으로 돌아가기" }).click();

  await expect(page.locator("#app")).toHaveAttribute("data-screen", "setup");
  await expect(page.getByRole("button", { name: "빠른 시작" })).toBeFocused();
});
