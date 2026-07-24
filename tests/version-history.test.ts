import { describe, expect, it } from "vitest";
import { VERSION_HISTORY } from "../src/app/version-history";
import { PRODUCT_VERSION } from "../src/simulation/versions";

describe("version history", () => {
  it("keeps the current product version first and records concise reasons and changes", () => {
    expect(VERSION_HISTORY[0]?.version).toBe(PRODUCT_VERSION);
    expect(VERSION_HISTORY[0]).toMatchObject({
      version: "0.36.0",
      title: expect.stringContaining("아이템"),
      change: expect.stringContaining("봇"),
    });
    expect(VERSION_HISTORY[1]).toMatchObject({
      version: "0.35.0",
      title: expect.stringContaining("대포"),
      change: expect.stringContaining("돌탄"),
    });
    expect(VERSION_HISTORY[2]).toMatchObject({
      version: "0.34.1",
      change: expect.stringContaining("개발자"),
    });
    expect(VERSION_HISTORY[3]).toMatchObject({
      version: "0.34.0",
      title: expect.stringContaining("마지막 땅"),
    });
    expect(VERSION_HISTORY[4]).toMatchObject({
      version: "0.33.0",
      change: expect.stringContaining("호수"),
    });
    expect(VERSION_HISTORY.length).toBeGreaterThanOrEqual(6);

    for (const entry of VERSION_HISTORY) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(entry.change.length).toBeGreaterThan(0);
      expect(`${entry.title} ${entry.reason} ${entry.change}`).toContain("다요");
    }
  });
});
