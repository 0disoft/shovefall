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
  isBotDifficulty,
  isCollapseSpeed,
  normalizeInitialItemCount,
  normalizeItemRespawnSeconds,
  normalizePlayerCount,
  normalizeSettings,
} from "../src/app/settings";
import {
  DEFAULT_STARTING_ATTRIBUTES,
  getStartingControlDurationMultiplier,
  getStartingCooldownMultiplier,
  getStartingDamageTakenMultiplier,
  getStartingIncomingImpulseMultiplier,
  getStartingMassFactor,
  getStartingMaximumHealthBonus,
  getStartingMaximumManaBonus,
  getStartingMovementMultiplier,
  getStartingOutgoingMultiplier,
  getStartingShieldMultiplier,
  normalizeStartingAttributes,
} from "../src/simulation/starting-attributes";

describe("settings normalization", () => {
  it("keeps internal participant fixtures bounded through the forced browser count", () => {
    expect(normalizePlayerCount(-10)).toBe(4);
    expect(normalizePlayerCount(12.4)).toBe(12);
    expect(normalizePlayerCount(100)).toBe(60);
    expect(normalizePlayerCount(Number.NaN)).toBe(60);
  });

  it("forces every browser setting input to the single 60-player hard-AI mode", () => {
    expect(
      normalizeSettings({ playerCount: 8, preset: "relaxed", botDifficulty: "easy" }),
    ).toMatchObject({
      playerCount: FORCED_PLAYER_COUNT,
      preset: "massive",
      botDifficulty: FORCED_BOT_DIFFICULTY,
      collapseSpeed: "slow",
      startingAttributes: DEFAULT_STARTING_ATTRIBUTES,
      initialItemCount: 8,
      itemRespawnSeconds: 7,
    });
    expect(getPresetPlayerCount("massive")).toBe(60);
    expect(getPresetCollapseSpeed("massive")).toBe("slow");
    expect(getPresetItemRespawnSeconds("massive")).toBe(7);
    expect(isBotDifficulty("hard")).toBe(true);
    expect(isBotDifficulty("normal")).toBe(false);
  });

  it("keeps internal collapse tiers valid while fixing browser play to slow", () => {
    expect(isCollapseSpeed("slow")).toBe(true);
    expect(isCollapseSpeed("normal")).toBe(true);
    expect(isCollapseSpeed("fast")).toBe(true);
    expect(isCollapseSpeed("instant")).toBe(false);
    expect(normalizeSettings({ collapseSpeed: "slow" })).toMatchObject({
      collapseSpeed: "slow",
    });
    expect(normalizeSettings({ collapseSpeed: "fast" })).toMatchObject({
      collapseSpeed: "slow",
    });
    expect(normalizeSettings({ collapseSpeed: "instant" })).toMatchObject({
      collapseSpeed: "slow",
    });
  });

  it("normalizes exactly twenty starting points across all six attributes", () => {
    expect(normalizeStartingAttributes({ ...DEFAULT_STARTING_ATTRIBUTES })).toEqual(
      DEFAULT_STARTING_ATTRIBUTES,
    );
    expect(normalizeStartingAttributes({ ...DEFAULT_STARTING_ATTRIBUTES, strength: 5 })).toEqual(
      DEFAULT_STARTING_ATTRIBUTES,
    );
    expect(DEFAULT_STARTING_ATTRIBUTES).toEqual({
      strength: 4,
      agility: 4,
      constitution: 4,
      spirit: 4,
      balance: 4,
      willpower: 0,
    });
    expect(getStartingMassFactor(DEFAULT_STARTING_ATTRIBUTES)).toBe(1.1);
    expect(getStartingMovementMultiplier(DEFAULT_STARTING_ATTRIBUTES)).toBe(1.16);
    expect(getStartingCooldownMultiplier(DEFAULT_STARTING_ATTRIBUTES)).toBe(0.84);
    expect(getStartingOutgoingMultiplier(DEFAULT_STARTING_ATTRIBUTES)).toBe(1.1);
    expect(getStartingIncomingImpulseMultiplier(DEFAULT_STARTING_ATTRIBUTES)).toBe(0.86);
    expect(getStartingControlDurationMultiplier(DEFAULT_STARTING_ATTRIBUTES)).toBe(0.9);
    expect(getStartingMaximumHealthBonus(DEFAULT_STARTING_ATTRIBUTES)).toBe(24);
    expect(getStartingMaximumManaBonus(DEFAULT_STARTING_ATTRIBUTES)).toBe(32);
    expect(getStartingDamageTakenMultiplier(DEFAULT_STARTING_ATTRIBUTES)).toBe(1);
    expect(getStartingShieldMultiplier(DEFAULT_STARTING_ATTRIBUTES)).toBe(1);
  });

  it("allows a full twenty-point specialization without a soft cap", () => {
    const strength = normalizeStartingAttributes({
      strength: 20,
      agility: 0,
      constitution: 0,
      spirit: 0,
      balance: 0,
      willpower: 0,
    });
    const agility = normalizeStartingAttributes({
      strength: 0,
      agility: 20,
      constitution: 0,
      spirit: 0,
      balance: 0,
      willpower: 0,
    });
    const willpower = normalizeStartingAttributes({
      strength: 0,
      agility: 0,
      constitution: 0,
      spirit: 0,
      balance: 0,
      willpower: 20,
    });
    expect(getStartingMassFactor(strength)).toBe(1.5);
    expect(getStartingOutgoingMultiplier(strength)).toBe(1.5);
    expect(getStartingMovementMultiplier(agility)).toBe(1.8);
    expect(getStartingCooldownMultiplier(agility)).toBe(0.2);
    expect(getStartingDamageTakenMultiplier(willpower)).toBe(0.6);
    expect(getStartingShieldMultiplier(willpower)).toBe(1.4);
  });

  it("derives and bounds the item policy for fifty participants", () => {
    expect(getRecommendedInitialItemCount(50)).toBe(8);
    expect(getMaximumItemCount(50)).toBe(25);
    expect(normalizeInitialItemCount(99, 50)).toBe(25);
    expect(normalizeInitialItemCount(Number.NaN, 50)).toBe(8);
    expect(normalizeItemRespawnSeconds(-1, "massive")).toBe(0);
    expect(normalizeItemRespawnSeconds(99, "massive")).toBe(30);
    expect(normalizeItemRespawnSeconds(Number.NaN, "massive")).toBe(7);
  });

  it("keeps fixture tiers and the large-island boundary", () => {
    expect(getArenaSize(4)).toEqual({ columns: 22, rows: 17 });
    expect(getArenaSize(16)).toEqual({ columns: 25, rows: 20 });
    expect(getArenaSize(24)).toEqual({ columns: 28, rows: 23 });
    expect(getArenaSize(32)).toEqual({ columns: 31, rows: 26 });
    expect(getArenaSize(50)).toEqual({ columns: 48, rows: 40 });
  });

  it("keeps one active item and two unique skills", () => {
    expect(
      normalizeSettings({
        startingAttributes: {
          strength: 8,
          agility: 0,
          constitution: 4,
          spirit: 4,
          balance: 4,
          willpower: 0,
        },
        startingItems: ["soap"],
        startingSkills: ["blink-step", "chain-bind"],
      }),
    ).toMatchObject({
      startingAttributes: {
        strength: 8,
        agility: 0,
        constitution: 4,
        spirit: 4,
        balance: 4,
        willpower: 0,
      },
      startingItems: ["soap"],
      startingSkills: ["blink-step", "chain-bind"],
    });
    expect(normalizeSettings({ startingItems: ["feather", "feather", "unknown"] })).toMatchObject({
      startingItems: ["bomb"],
      startingSkills: ["force-palm", "blink-step"],
    });
    expect(normalizeSettings({ startingItems: ["grappling-hook"] })).toMatchObject({
      startingItems: ["bomb"],
    });
    expect(
      normalizeSettings({ startingSkills: ["blink-step", "blink-step", "unknown"] }),
    ).toMatchObject({
      startingSkills: ["force-palm", "blink-step"],
    });
  });
});
