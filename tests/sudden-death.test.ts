import { describe, expect, it } from "vitest";
import { createCollapsePlan, MINIMUM_REMAINING_LAND_RATIO } from "../src/simulation/collapse";
import { normalizeGameConfig, type SimulationEventV1 } from "../src/simulation/contracts";
import { vectorLength } from "../src/simulation/math";
import { RandomStreamSet } from "../src/simulation/random";
import { createSuddenDeathPlan, getSuddenDeathPulse } from "../src/simulation/sudden-death";
import { SIMULATION_TUNING } from "../src/simulation/tuning";
import { SimulationWorld } from "../src/simulation/world";

function stepUntil(world: SimulationWorld, targetTick: number): readonly SimulationEventV1[] {
  const events: SimulationEventV1[] = [];

  while (world.tick < targetTick) {
    events.push(...world.step().events);
  }

  return events;
}

describe("protected-core sudden death", () => {
  it("starts after the final collapse and grows on a deterministic two-second cadence", () => {
    const config = normalizeGameConfig({
      participantCount: 4,
      arenaColumns: 9,
      arenaRows: 7,
      collapseSpeed: "fast",
    });
    const seed = "sudden-death-plan";
    const frame = new SimulationWorld(config, seed, {
      arenaLayout: "rectangular-fixture",
    }).createRenderFrame();
    const collapsePlan = createCollapsePlan(
      frame.tiles,
      config.arenaColumns,
      config.arenaRows,
      config.collapseSpeed,
      new RandomStreamSet(seed).get("collapse"),
    );
    const plan = createSuddenDeathPlan(frame.tiles, collapsePlan);
    const finalVoidTick = collapsePlan.at(-1)?.voidTick ?? 0;

    expect(plan?.firstPulseTick).toBe(
      finalVoidTick + SIMULATION_TUNING.suddenDeath.startDelayTicks,
    );
    expect(getSuddenDeathPulse(plan, (plan?.firstPulseTick ?? 0) - 1)).toBeUndefined();
    expect(getSuddenDeathPulse(plan, plan?.firstPulseTick ?? 0)?.strength).toBe(
      SIMULATION_TUNING.suddenDeath.baseImpulse,
    );
    expect(
      getSuddenDeathPulse(
        plan,
        (plan?.firstPulseTick ?? 0) + SIMULATION_TUNING.suddenDeath.intervalTicks,
      )?.strength,
    ).toBe(SIMULATION_TUNING.suddenDeath.baseImpulse + SIMULATION_TUNING.suddenDeath.impulseGrowth);
    expect(
      getSuddenDeathPulse(
        plan,
        (plan?.firstPulseTick ?? 0) + SIMULATION_TUNING.suddenDeath.intervalTicks - 1,
      ),
    ).toBeUndefined();
  });

  it("pushes lighter actors farther without deleting the protected twenty-percent core", () => {
    const config = normalizeGameConfig({
      participantCount: 4,
      arenaColumns: 9,
      arenaRows: 7,
      roundLimitSeconds: 75,
      collapseSpeed: "fast",
      itemsEnabled: false,
    });
    const seed = "sudden-death-world";
    const initialWorld = new SimulationWorld(config, seed, {
      arenaLayout: "rectangular-fixture",
    });
    const initialFrame = initialWorld.createRenderFrame();
    const collapsePlan = createCollapsePlan(
      initialFrame.tiles,
      config.arenaColumns,
      config.arenaRows,
      config.collapseSpeed,
      new RandomStreamSet(seed).get("collapse"),
    );
    const suddenDeathPlan = createSuddenDeathPlan(initialFrame.tiles, collapsePlan);
    const scheduledIds = new Set(collapsePlan.flatMap(({ tileIds }) => tileIds));
    const coreTiles = initialFrame.tiles
      .filter(({ state, tileId }) => state === "Stable" && !scheduledIds.has(tileId))
      .toSorted((left, right) => left.tileId.localeCompare(right.tileId));
    const positions = coreTiles.slice(0, 4).map(({ column, row }) => ({
      x: column + 0.5,
      y: row + 0.5,
    }));
    const position = (index: number) => {
      const selected = positions[index];

      if (selected === undefined) {
        throw new Error(`missing protected-core position ${index}`);
      }

      return selected;
    };
    const world = new SimulationWorld(config, seed, {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        { actorId: 1, position: position(0), massFactor: 0.85 },
        { actorId: 2, position: position(1), massFactor: 1.25 },
        { actorId: 3, position: position(2) },
        { actorId: 4, position: position(3) },
      ],
    });
    const pulseTick = suddenDeathPlan?.firstPulseTick ?? 0;
    const events = stepUntil(world, pulseTick + 1);
    const frame = world.createRenderFrame();
    const light = frame.participants.find(({ actorId }) => actorId === 1);
    const heavy = frame.participants.find(({ actorId }) => actorId === 2);
    const expectedCoreSize = Math.ceil(
      initialFrame.tiles.filter(({ state }) => state === "Stable").length *
        MINIMUM_REMAINING_LAND_RATIO,
    );

    expect(events.filter(({ kind }) => kind === "sudden-death-pulse")).toHaveLength(1);
    expect(vectorLength(light?.velocity ?? { x: 0, y: 0 })).toBeGreaterThan(
      vectorLength(heavy?.velocity ?? { x: 0, y: 0 }),
    );
    expect(frame.tiles.filter(({ state }) => state !== "Void")).toHaveLength(expectedCoreSize);
    expect(light?.progression.creditedEliminations).toBe(0);
    expect(heavy?.progression.creditedEliminations).toBe(0);
  });
});
