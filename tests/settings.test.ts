import { describe, expect, it } from "vitest";
import {
  getArenaSize,
  getMaximumItemCount,
  getPresetCollapseSpeed,
  getPresetItemRespawnSeconds,
  getPresetPlayerCount,
  getRecommendedInitialItemCount,
  isBotDifficulty,
  isCollapseSpeed,
  normalizeInitialItemCount,
  normalizeItemRespawnSeconds,
  normalizePlayerCount,
  normalizeSettings,
} from "../src/app/settings";

describe("settings normalization", () => {
  it("clamps participant counts to the supported range", () => {
    expect(normalizePlayerCount(-10)).toBe(4);
    expect(normalizePlayerCount(12.4)).toBe(12);
    expect(normalizePlayerCount(100)).toBe(32);
  });

  it("replaces non-finite participant counts with the default", () => {
    expect(normalizePlayerCount(Number.NaN)).toBe(16);
    expect(normalizePlayerCount(Number.POSITIVE_INFINITY)).toBe(16);
  });

  it("falls back from unknown presets without discarding a valid count", () => {
    expect(normalizeSettings({ playerCount: 20, preset: "unknown" })).toEqual({
      playerCount: 20,
      preset: "default",
      collapseSpeed: "normal",
      initialItemCount: 7,
      itemRespawnSeconds: 5,
      botDifficulty: "normal",
      startingMass: "normal",
      startingItems: ["iron-boots", "spring-glove"],
    });
  });

  it("uses preset collapse defaults and accepts an explicit bounded override", () => {
    expect(isCollapseSpeed("slow")).toBe(true);
    expect(isCollapseSpeed("normal")).toBe(true);
    expect(isCollapseSpeed("fast")).toBe(true);
    expect(isCollapseSpeed("instant")).toBe(false);
    expect(normalizeSettings({ playerCount: 8, preset: "relaxed" })).toMatchObject({
      collapseSpeed: "slow",
    });
    expect(
      normalizeSettings({ playerCount: 16, preset: "default", collapseSpeed: "slow" }),
    ).toMatchObject({ collapseSpeed: "slow" });
    expect(
      normalizeSettings({ playerCount: 16, preset: "default", collapseSpeed: "instant" }),
    ).toMatchObject({ collapseSpeed: "normal" });
  });

  it("accepts only the bounded bot difficulty values", () => {
    expect(isBotDifficulty("easy")).toBe(true);
    expect(isBotDifficulty("normal")).toBe(true);
    expect(isBotDifficulty("hard")).toBe(true);
    expect(isBotDifficulty("impossible")).toBe(false);
    expect(
      normalizeSettings({ playerCount: 16, preset: "default", botDifficulty: "hard" }),
    ).toMatchObject({ botDifficulty: "hard" });
    expect(
      normalizeSettings({ playerCount: 16, preset: "default", botDifficulty: "cheat" }),
    ).toMatchObject({ botDifficulty: "normal" });
  });

  it("keeps preset defaults explicit", () => {
    expect(getPresetPlayerCount("default")).toBe(16);
    expect(getPresetPlayerCount("relaxed")).toBe(8);
    expect(getPresetPlayerCount("crowded")).toBe(24);
    expect(getPresetPlayerCount("chaos")).toBe(32);
    expect(getPresetCollapseSpeed("default")).toBe("normal");
    expect(getPresetCollapseSpeed("relaxed")).toBe("slow");
    expect(getPresetCollapseSpeed("crowded")).toBe("normal");
    expect(getPresetCollapseSpeed("chaos")).toBe("fast");
    expect(getPresetItemRespawnSeconds("default")).toBe(5);
    expect(getPresetItemRespawnSeconds("relaxed")).toBe(7);
    expect(getPresetItemRespawnSeconds("crowded")).toBe(4);
    expect(getPresetItemRespawnSeconds("chaos")).toBe(3);
  });

  it("derives and bounds the item policy at scale tiers", () => {
    expect(getRecommendedInitialItemCount(4)).toBe(2);
    expect(getRecommendedInitialItemCount(24)).toBe(8);
    expect(getRecommendedInitialItemCount(25)).toBe(9);
    expect(getRecommendedInitialItemCount(32)).toBe(11);
    expect(getMaximumItemCount(4)).toBe(2);
    expect(getMaximumItemCount(32)).toBe(16);
    expect(normalizeInitialItemCount(99, 12)).toBe(6);
    expect(normalizeInitialItemCount(Number.NaN, 12)).toBe(4);
    expect(normalizeItemRespawnSeconds(-1, "default")).toBe(0);
    expect(normalizeItemRespawnSeconds(99, "default")).toBe(30);
    expect(normalizeItemRespawnSeconds(Number.NaN, "chaos")).toBe(3);
  });

  it("derives larger arenas at the participant tier boundaries", () => {
    expect(getArenaSize(4)).toEqual({ columns: 12, rows: 10 });
    expect(getArenaSize(8)).toEqual({ columns: 12, rows: 10 });
    expect(getArenaSize(9)).toEqual({ columns: 15, rows: 12 });
    expect(getArenaSize(24)).toEqual({ columns: 18, rows: 14 });
    expect(getArenaSize(25)).toEqual({ columns: 20, rows: 15 });
    expect(getArenaSize(32)).toEqual({ columns: 20, rows: 15 });
  });

  it("normalizes the human starting mass and exactly two unique items", () => {
    expect(
      normalizeSettings({
        playerCount: 16,
        preset: "default",
        startingMass: "light",
        startingItems: ["feather", "spring-glove"],
      }),
    ).toMatchObject({
      startingMass: "light",
      startingItems: ["feather", "spring-glove"],
    });
    expect(
      normalizeSettings({
        playerCount: 16,
        preset: "default",
        startingMass: "giant",
        startingItems: ["feather", "feather", "unknown"],
      }),
    ).toMatchObject({
      startingMass: "normal",
      startingItems: ["iron-boots", "spring-glove"],
    });
  });
});
