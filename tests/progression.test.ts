import { describe, expect, it } from "vitest";
import { normalizeGameConfig } from "../src/simulation/contracts";
import {
  awardStatPoint,
  canSpendStatPoint,
  canSpendSkillPoint,
  createParticipantProgression,
  getSkillCooldownMultiplier,
  getNextPlannedUpgrade,
  getMobilityMultiplier,
  getPowerMultiplier,
  getStabilityMultiplier,
  normalizeUpgradePlan,
  spendSkillPoint,
  spendStatPoint,
} from "../src/simulation/progression";
import { SimulationWorld } from "../src/simulation/world";

describe("elimination progression", () => {
  it("initializes a selected base mass, one item, and three skills", () => {
    const world = new SimulationWorld(normalizeGameConfig({ participantCount: 4 }), "loadout", {
      participantOverrides: [
        {
          actorId: 1,
          massFactor: 0.85,
          startingItems: ["bomb"],
          startingSkills: ["blink-step", "chain-bind", "aegis"],
        },
      ],
    });
    const human = world.createRenderFrame().participants.find(({ actorId }) => actorId === 1);

    expect(human?.massFactor).toBe(0.85);
    expect(human?.effects).toEqual([]);
    expect(human?.inventory).toEqual([{ slotIndex: 0, definitionId: "bomb", charges: 2 }]);
    expect(human?.skills).toEqual([
      { slotIndex: 0, definitionId: "blink-step", readyTick: 0 },
      { slotIndex: 1, definitionId: "chain-bind", readyTick: 0 },
      { slotIndex: 2, definitionId: "aegis", readyTick: 0 },
    ]);
  });

  it("turns one credited elimination into one bounded stat choice", () => {
    const earned = awardStatPoint(createParticipantProgression());
    const upgraded = spendStatPoint(earned, "power");

    expect(upgraded).toMatchObject({
      statPoints: 0,
      creditedEliminations: 1,
      stats: { power: 1, stability: 0, mobility: 0, reflex: 0 },
    });
    expect(getPowerMultiplier(upgraded?.stats ?? earned.stats)).toBeCloseTo(1.08, 10);
    expect(getStabilityMultiplier({ ...earned.stats, stability: 5 })).toBeCloseTo(0.5, 10);
    expect(getMobilityMultiplier({ ...earned.stats, mobility: 5 })).toBeCloseTo(1.25, 10);

    let capped = earned;
    for (let level = 0; level < 5; level += 1) {
      capped = spendStatPoint(awardStatPoint(capped), "power") ?? capped;
    }
    expect(spendStatPoint(awardStatPoint(capped), "power")).toBeUndefined();
  });

  it("spends the same kill reward through prerequisite-gated skill ranks", () => {
    const firstPoint = awardStatPoint(createParticipantProgression());
    expect(canSpendSkillPoint(firstPoint, 0)).toBe(false);
    const powerOne = spendStatPoint(firstPoint, "power")!;
    expect(canSpendStatPoint(awardStatPoint(powerOne), "stability")).toBe(true);
    const stabilityOne = spendStatPoint(awardStatPoint(powerOne), "stability")!;
    const firstRank = spendSkillPoint(awardStatPoint(stabilityOne), 0);

    expect(firstRank).toMatchObject({ statPoints: 0, skillRanks: [1, 0, 0] });
    expect(getSkillCooldownMultiplier(0)).toBe(1);
    expect(getSkillCooldownMultiplier(1)).toBe(0.9);
    expect(getSkillCooldownMultiplier(3)).toBe(0.7);

    const blockedSecondRank = awardStatPoint(firstRank ?? stabilityOne);
    expect(canSpendSkillPoint(blockedSecondRank, 0)).toBe(false);
    expect(spendSkillPoint(blockedSecondRank, 0)).toBeUndefined();

    const powerTwo = spendStatPoint(blockedSecondRank, "power")!;
    const stabilityTwo = spendStatPoint(awardStatPoint(powerTwo), "stability")!;
    const eligibleSecondRank = awardStatPoint(stabilityTwo);
    expect(canSpendSkillPoint(eligibleSecondRank, 0)).toBe(true);
    expect(spendSkillPoint(eligibleSecondRank, 0)).toMatchObject({
      statPoints: 0,
      skillRanks: [2, 0, 0],
    });
  });

  it("offers all six traits directly without branch prerequisites", () => {
    const initial = awardStatPoint(createParticipantProgression());
    expect(canSpendStatPoint(initial, "power")).toBe(true);
    expect(canSpendStatPoint(initial, "stability")).toBe(true);
    expect(canSpendStatPoint(initial, "mobility")).toBe(true);
    expect(canSpendStatPoint(initial, "reflex")).toBe(true);
    expect(canSpendStatPoint(initial, "vitality")).toBe(true);
    expect(canSpendStatPoint(initial, "focus")).toBe(true);

    const progression = {
      ...createParticipantProgression(),
      statPoints: 1,
      stats: {
        power: 3,
        stability: 3,
        mobility: 1,
        reflex: 1,
        vitality: 0,
        focus: 0,
      },
      skillRanks: [2, 0, 0] as const,
    };
    expect(canSpendSkillPoint(progression, 0)).toBe(false);
    expect(canSpendSkillPoint({ ...progression, skillRanks: [2, 1, 0] as const }, 0)).toBe(true);
  });

  it("normalizes and follows a bounded pre-round automatic upgrade order", () => {
    const plan = normalizeUpgradePlan([
      "mobility",
      "power",
      "mobility",
      "mobility",
      "mobility",
      "mobility",
      "mobility",
      "unknown",
    ]);
    const earned = awardStatPoint(createParticipantProgression());

    expect(plan).toEqual(["mobility", "power", "mobility", "mobility", "mobility", "mobility"]);
    expect(getNextPlannedUpgrade(earned, plan)).toBe("mobility");
    const upgraded = spendStatPoint(earned, "mobility");
    expect(getNextPlannedUpgrade(awardStatPoint(upgraded ?? earned), plan)).toBe("power");
    expect(normalizeUpgradePlan([])).toEqual([]);
    expect(normalizeUpgradePlan(undefined)).toHaveLength(30);
  });
});
