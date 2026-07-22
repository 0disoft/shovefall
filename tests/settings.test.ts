import { describe, expect, it } from "vitest";
import {
  getArenaSize,
  getMaximumItemCount,
  getPresetCollapseSpeed,
  getPresetItemRespawnSeconds,
  getPresetPlayerCount,
  getRecommendedInitialItemCount,
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
    expect(normalizePlayerCount(Number.NaN)).toBe(12);
    expect(normalizePlayerCount(Number.POSITIVE_INFINITY)).toBe(12);
  });

  it("falls back from unknown presets without discarding a valid count", () => {
    expect(normalizeSettings({ playerCount: 20, preset: "unknown" })).toEqual({
      playerCount: 20,
      preset: "default",
      initialItemCount: 7,
      itemRespawnSeconds: 5,
    });
  });

  it("keeps preset defaults explicit", () => {
    expect(getPresetPlayerCount("default")).toBe(12);
    expect(getPresetPlayerCount("relaxed")).toBe(8);
    expect(getPresetPlayerCount("chaos")).toBe(32);
    expect(getPresetCollapseSpeed("default")).toBe("normal");
    expect(getPresetCollapseSpeed("relaxed")).toBe("slow");
    expect(getPresetCollapseSpeed("chaos")).toBe("fast");
    expect(getPresetItemRespawnSeconds("default")).toBe(5);
    expect(getPresetItemRespawnSeconds("relaxed")).toBe(7);
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
    expect(getArenaSize(4)).toEqual({ columns: 9, rows: 7 });
    expect(getArenaSize(8)).toEqual({ columns: 9, rows: 7 });
    expect(getArenaSize(9)).toEqual({ columns: 11, rows: 9 });
    expect(getArenaSize(24)).toEqual({ columns: 15, rows: 11 });
    expect(getArenaSize(25)).toEqual({ columns: 17, rows: 13 });
    expect(getArenaSize(32)).toEqual({ columns: 17, rows: 13 });
  });
});
