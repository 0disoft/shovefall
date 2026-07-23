import { describe, expect, it } from "vitest";
import {
  advanceCollapse,
  createCollapsePlan,
  MINIMUM_REMAINING_LAND_RATIO,
} from "../src/simulation/collapse";
import { normalizeGameConfig, type SimulationEventV1 } from "../src/simulation/contracts";
import { SimulationContractError } from "../src/simulation/math";
import { RandomStreamSet } from "../src/simulation/random";
import { SIMULATION_TUNING } from "../src/simulation/tuning";
import { SimulationWorld } from "../src/simulation/world";

function stepUntil(world: SimulationWorld, targetTick: number): readonly SimulationEventV1[] {
  const events: SimulationEventV1[] = [];

  while (world.tick < targetTick) {
    events.push(...world.step().events);
  }

  return events;
}

describe("collapse and round lifecycle", () => {
  it("warns, collapses, and removes a seeded outer-ring wave in readable phases", () => {
    const config = normalizeGameConfig({
      participantCount: 4,
      arenaColumns: 9,
      arenaRows: 7,
      roundLimitSeconds: 20,
      collapseSpeed: "fast",
    });
    const world = new SimulationWorld(config, "collapse-phases");

    const warningEvents = stepUntil(world, 481).filter(({ kind }) => kind === "tile-warning");
    expect(warningEvents.length).toBeGreaterThan(0);
    expect(world.createRenderFrame().tiles.filter(({ state }) => state === "Warning")).toHaveLength(
      warningEvents.length,
    );

    const collapsingEvents = stepUntil(world, 547).filter(({ kind }) => kind === "tile-collapsing");
    expect(collapsingEvents.map(({ tileId }) => tileId)).toEqual(
      warningEvents.map(({ tileId }) => tileId),
    );

    const voidEvents = stepUntil(world, 559).filter(({ kind }) => kind === "tile-void");
    expect(voidEvents.map(({ tileId }) => tileId)).toEqual(
      warningEvents.map(({ tileId }) => tileId),
    );
  });

  it("keeps the collapse order deterministic and starts at the outer edge", () => {
    const config = normalizeGameConfig({
      participantCount: 4,
      arenaColumns: 9,
      arenaRows: 7,
      collapseSpeed: "normal",
    });
    const frame = new SimulationWorld(config, "plan-source").createRenderFrame();

    function plan(seed: string) {
      return createCollapsePlan(
        frame.tiles,
        config.arenaColumns,
        config.arenaRows,
        config.collapseSpeed,
        new RandomStreamSet(seed).get("collapse"),
      );
    }

    const samePlan = plan("same-plan");
    expect(samePlan).toEqual(plan("same-plan"));
    expect(samePlan).not.toEqual(plan("different-plan"));

    const stableIds = new Set(
      frame.tiles.filter(({ state }) => state === "Stable").map(({ tileId }) => tileId),
    );
    const firstWaveIds = new Set(samePlan[0]?.tileIds);
    const firstWaveTiles = frame.tiles.filter(({ tileId }) => firstWaveIds.has(tileId));
    expect(
      firstWaveTiles.every(
        ({ column, row }) =>
          !stableIds.has(`${column + 1}:${row}`) ||
          !stableIds.has(`${column - 1}:${row}`) ||
          !stableIds.has(`${column}:${row + 1}`) ||
          !stableIds.has(`${column}:${row - 1}`),
      ),
    ).toBe(true);

    const scheduledIds = samePlan.flatMap(({ tileIds }) => tileIds);
    const expectedRemaining = Math.ceil(stableIds.size * MINIMUM_REMAINING_LAND_RATIO);
    expect(new Set(scheduledIds)).toHaveLength(scheduledIds.length);
    expect(scheduledIds).toHaveLength(stableIds.size - expectedRemaining);

    const finalTick = samePlan.at(-1)?.voidTick ?? 0;
    const collapsed = advanceCollapse(frame.tiles, samePlan, finalTick).tiles;
    expect(collapsed.filter(({ state }) => state !== "Void")).toHaveLength(expectedRemaining);
    expect(
      frame.tiles
        .filter(({ state }) => state === "Void")
        .every((tile) => collapsed.find(({ tileId }) => tileId === tile.tileId)?.state === "Void"),
    ).toBe(true);
  });

  it("declares the only standing actor the winner and seals the completed world", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({ participantCount: 4, roundLimitSeconds: 10 }),
      "last-standing",
      {
        participantOverrides: [
          { actorId: 1, position: { x: 4.5, y: 3.5 } },
          { actorId: 2, position: { x: -2, y: 1 } },
          { actorId: 3, position: { x: -2, y: 3 } },
          { actorId: 4, position: { x: -2, y: 5 } },
        ],
      },
    );
    const events = stepUntil(world, SIMULATION_TUNING.support.graceTicks);
    const frame = world.createRenderFrame();

    expect(frame.round).toEqual({
      status: "Completed",
      winnerActorId: 1,
      reason: "last-standing",
      completedTick: SIMULATION_TUNING.support.graceTicks,
    });
    expect(events.find(({ kind }) => kind === "round-completed")?.winnerActorId).toBe(1);
    expect(() => world.step()).toThrow(SimulationContractError);
  });

  it("ends honestly without inventing a winner at the hard time limit", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({ participantCount: 4, roundLimitSeconds: 1 }),
      "time-limit",
    );
    const events = stepUntil(world, 60);

    expect(world.createRenderFrame().round).toEqual({
      status: "Completed",
      winnerActorId: null,
      reason: "time-limit",
      completedTick: 60,
    });
    expect(events.find(({ kind }) => kind === "round-completed")?.reason).toBe("time-limit");
  });
});
