import { describe, expect, it } from "vitest";
import { VERSION_HISTORY } from "../src/app/version-history";
import { PRODUCT_VERSION } from "../src/simulation/versions";

describe("version history", () => {
  it("keeps the current product version first and records concise reasons and changes", () => {
    expect(VERSION_HISTORY[0]?.version).toBe(PRODUCT_VERSION);
    expect(VERSION_HISTORY[0]).toMatchObject({
      version: "0.33.0",
      title: expect.stringContaining("무인도"),
      change: expect.stringContaining("호수가 여덟"),
    });
    expect(VERSION_HISTORY[1]).toMatchObject({
      version: "0.32.1",
      title: expect.stringContaining("개발 정보"),
      change: expect.stringContaining("공개 빌드"),
    });
    expect(VERSION_HISTORY[2]).toMatchObject({
      version: "0.32.0",
      change: expect.stringContaining("구조 갈고리"),
    });
    expect(VERSION_HISTORY.length).toBeGreaterThanOrEqual(6);

    for (const entry of VERSION_HISTORY) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(entry.change.length).toBeGreaterThan(0);
    }
  });
});
