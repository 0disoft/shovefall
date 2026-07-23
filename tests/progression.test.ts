import { describe, expect, it } from "vitest";
import { createNeutralCommand, normalizeGameConfig } from "../src/simulation/contracts";
import {
  awardStatPoint,
  createParticipantProgression,
  getMobilityMultiplier,
  getPowerMultiplier,
  getStabilityMultiplier,
  spendStatPoint,
} from "../src/simulation/progression";
import { SimulationWorld } from "../src/simulation/world";

describe("elimination progression", () => {
  it("initializes a selected base mass and two distinct starting items", () => {
    const world = new SimulationWorld(normalizeGameConfig({ participantCount: 4 }), "loadout", {
      participantOverrides: [
        {
          actorId: 1,
          massFactor: 0.85,
          startingItems: ["feather", "spring-glove"],
        },
      ],
    });
    const human = world.createRenderFrame().participants.find(({ actorId }) => actorId === 1);

    expect(human?.massFactor).toBe(0.85);
    expect(human?.effects).toEqual([]);
    expect(human?.inventory).toEqual([
      { slotIndex: 0, definitionId: "feather", charges: null },
      { slotIndex: 1, definitionId: "spring-glove", charges: null },
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

  it("credits the last shove when its target enters irreversible falling", () => {
    const config = normalizeGameConfig({
      participantCount: 4,
      arenaColumns: 8,
      arenaRows: 8,
      roundLimitSeconds: 10,
      itemsEnabled: false,
    });
    const world = new SimulationWorld(config, "credited-shove", {
      participantOverrides: [
        { actorId: 1, position: { x: 1.05, y: 4.5 }, facing: { x: -1, y: 0 } },
        { actorId: 2, position: { x: 0.36, y: 4.5 }, facing: { x: 1, y: 0 } },
        { actorId: 3, position: { x: 5.5, y: 2.5 } },
        { actorId: 4, position: { x: 5.5, y: 5.5 } },
      ],
    });
    let earned = false;
    let earnedProgression;

    for (
      let tick = 0;
      tick < 120 && world.createRenderFrame().round.status === "Active";
      tick += 1
    ) {
      const command = {
        ...createNeutralCommand(world.tick, 1),
        move: { x: -1, y: 0 },
        shovePressed: tick === 0,
      };
      const result = world.step([command]);
      earned ||= result.events.some(
        ({ kind, actorId, targetActorId }) =>
          kind === "stat-point-earned" && actorId === 1 && targetActorId === 2,
      );

      if (earned) {
        earnedProgression = result.frame.participants.find(
          ({ actorId }) => actorId === 1,
        )?.progression;
        break;
      }
    }

    expect(earned).toBe(true);
    expect(earnedProgression).toMatchObject({ statPoints: 1, creditedEliminations: 1 });
  });
});
