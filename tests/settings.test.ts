import { describe, expect, it } from "vitest";
import {
  FORCED_BOT_DIFFICULTY,
  FORCED_PLAYER_COUNT,
  getArenaSize,
  getMaximumItemCount,
  getPresetCollapseSpeed,
  getPresetItemRespawnSeconds,
  getPresetPlayerCount,
  getRecommendedInitialItemCount,
  getStartingMassFactor,
  isBotDifficulty,
  isCollapseSpeed,
  normalizeInitialItemCount,
  normalizeItemRespawnSeconds,
  normalizePlayerCount,
  normalizeSettings,
  normalizeStartingWeight,
} from "../src/app/settings";

describe("settings normalization", () => {
  it("keeps internal participant fixtures bounded through the forced browser count", () => {
    expect(normalizePlayerCount(-10)).toBe(4);
    expect(normalizePlayerCount(12.4)).toBe(12);
    expect(normalizePlayerCount(100)).toBe(50);
    expect(normalizePlayerCount(Number.NaN)).toBe(50);
  });

  it("forces every browser setting input to the single 50-player hard-AI mode", () => {
    expect(
      normalizeSettings({ playerCount: 8, preset: "relaxed", botDifficulty: "easy" }),
    ).toMatchObject({
      playerCount: FORCED_PLAYER_COUNT,
      preset: "massive",
      botDifficulty: FORCED_BOT_DIFFICULTY,
      collapseSpeed: "normal",
      startingWeight: 75,
      initialItemCount: 17,
      itemRespawnSeconds: 5,
    });
    expect(getPresetPlayerCount("massive")).toBe(50);
    expect(getPresetCollapseSpeed("massive")).toBe("normal");
    expect(getPresetItemRespawnSeconds("massive")).toBe(5);
    expect(isBotDifficulty("hard")).toBe(true);
    expect(isBotDifficulty("normal")).toBe(false);
  });

  it("accepts only bounded collapse-speed overrides", () => {
    expect(isCollapseSpeed("slow")).toBe(true);
    expect(isCollapseSpeed("normal")).toBe(true);
    expect(isCollapseSpeed("fast")).toBe(true);
    expect(isCollapseSpeed("instant")).toBe(false);
    expect(normalizeSettings({ collapseSpeed: "slow" })).toMatchObject({
      collapseSpeed: "slow",
    });
    expect(normalizeSettings({ collapseSpeed: "instant" })).toMatchObject({
      collapseSpeed: "normal",
    });
  });

  it("maps the 50 through 100 weight slider onto the full mass contract", () => {
    expect(normalizeStartingWeight(1)).toBe(50);
    expect(normalizeStartingWeight(74.6)).toBe(75);
    expect(normalizeStartingWeight(500)).toBe(100);
    expect(normalizeStartingWeight(Number.NaN)).toBe(75);
    expect(getStartingMassFactor(50)).toBeCloseTo(0.8, 10);
    expect(getStartingMassFactor(75)).toBeCloseTo(1, 10);
    expect(getStartingMassFactor(100)).toBeCloseTo(1.4, 10);
  });

  it("derives and bounds the item policy for fifty participants", () => {
    expect(getRecommendedInitialItemCount(50)).toBe(17);
    expect(getMaximumItemCount(50)).toBe(25);
    expect(normalizeInitialItemCount(99, 50)).toBe(25);
    expect(normalizeInitialItemCount(Number.NaN, 50)).toBe(17);
    expect(normalizeItemRespawnSeconds(-1, "massive")).toBe(0);
    expect(normalizeItemRespawnSeconds(99, "massive")).toBe(30);
    expect(normalizeItemRespawnSeconds(Number.NaN, "massive")).toBe(5);
  });

  it("keeps fixture tiers and expands the forced fifty-player island", () => {
    expect(getArenaSize(4)).toEqual({ columns: 22, rows: 17 });
    expect(getArenaSize(16)).toEqual({ columns: 25, rows: 20 });
    expect(getArenaSize(24)).toEqual({ columns: 28, rows: 23 });
    expect(getArenaSize(32)).toEqual({ columns: 31, rows: 26 });
    expect(getArenaSize(50)).toEqual({ columns: 44, rows: 36 });
  });

  it("keeps exactly two unique items from the nine-item catalog", () => {
    expect(
      normalizeSettings({
        startingWeight: 58,
        startingItems: ["wind-blast", "grappling-hook"],
      }),
    ).toMatchObject({
      startingWeight: 58,
      startingItems: ["wind-blast", "grappling-hook"],
    });
    expect(normalizeSettings({ startingItems: ["feather", "feather", "unknown"] })).toMatchObject({
      startingItems: ["iron-boots", "spring-glove"],
    });
  });
});
