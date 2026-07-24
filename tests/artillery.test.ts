import { describe, expect, it } from "vitest";
import {
  createArtilleryPlan,
  getActiveCannonShots,
  getPirateShipStates,
  ROCK_FLIGHT_TICKS,
} from "../src/simulation/artillery";
import { createCollapsePlan, MINIMUM_REMAINING_LAND_RATIO } from "../src/simulation/collapse";
import {
  createNeutralCommand,
  normalizeGameConfig,
  type SimulationEventV1,
} from "../src/simulation/contracts";
import { RandomStreamSet } from "../src/simulation/random";
import { SimulationWorld } from "../src/simulation/world";

describe("pirate artillery", () => {
  it("distributes exactly one cannonball per doomed tile and exposes live ship ammo", () => {
    const config = normalizeGameConfig({
      participantCount: 4,
      arenaColumns: 9,
      arenaRows: 7,
      collapseSpeed: "fast",
    });
    const seed = "artillery-plan";
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
    const plan = createArtilleryPlan(
      frame.tiles,
      collapsePlan,
      config.arenaColumns,
      config.arenaRows,
    );
    const doomedTileCount = collapsePlan.reduce((total, wave) => total + wave.tileIds.length, 0);
    const initialAmmo = plan.ships.map(({ initialCannonAmmo }) => initialCannonAmmo);
    const firstShot = plan.cannonShots[0];

    expect(plan.cannonShots).toHaveLength(doomedTileCount);
    expect(initialAmmo.reduce((total, ammo) => total + ammo, 0)).toBe(doomedTileCount);
    expect(Math.max(...initialAmmo) - Math.min(...initialAmmo)).toBeLessThanOrEqual(1);
    expect(
      getPirateShipStates(plan, 0).map(({ cannonAmmoRemaining }) => cannonAmmoRemaining),
    ).toEqual(initialAmmo);
    expect(firstShot).toBeDefined();
    expect(getActiveCannonShots(plan, firstShot?.warningTick ?? 0)).toContainEqual(firstShot);
  });

  it("stops at the connected twenty-percent core, then telegraphs lethal rocks", () => {
    const config = normalizeGameConfig({
      participantCount: 4,
      arenaColumns: 9,
      arenaRows: 7,
      roundLimitSeconds: 75,
      collapseSpeed: "fast",
      itemsEnabled: false,
    });
    const seed = "rock-final-showdown";
    const probe = new SimulationWorld(config, seed, { arenaLayout: "rectangular-fixture" });
    const initialFrame = probe.createRenderFrame();
    const collapsePlan = createCollapsePlan(
      initialFrame.tiles,
      config.arenaColumns,
      config.arenaRows,
      config.collapseSpeed,
      new RandomStreamSet(seed).get("collapse"),
    );
    const plan = createArtilleryPlan(
      initialFrame.tiles,
      collapsePlan,
      config.arenaColumns,
      config.arenaRows,
    );
    const scheduledIds = new Set(collapsePlan.flatMap(({ tileIds }) => tileIds));
    const coreTiles = initialFrame.tiles.filter(
      ({ state, tileId }) => state === "Stable" && !scheduledIds.has(tileId),
    );
    const positions = coreTiles.slice(0, 4).map(({ column, row }) => ({
      x: column + 0.5,
      y: row + 0.5,
    }));
    const world = new SimulationWorld(config, seed, {
      arenaLayout: "rectangular-fixture",
      participantOverrides: positions.map((position, index) => ({
        actorId: index + 1,
        position,
      })),
    });
    const events: SimulationEventV1[] = [];
    const endTick = plan.rockPhaseStartTick + ROCK_FLIGHT_TICKS + 1;

    while (world.tick < endTick && world.createRenderFrame().round.status === "Active") {
      events.push(
        ...world.step(
          world
            .createRenderFrame()
            .participants.filter(({ active }) => active)
            .map(({ actorId }) => createNeutralCommand(world.tick, actorId)),
        ).events,
      );
    }

    const frame = world.createRenderFrame();
    const expectedCoreSize = Math.ceil(
      initialFrame.tiles.filter(({ state }) => state === "Stable").length *
        MINIMUM_REMAINING_LAND_RATIO,
    );

    expect(events.some(({ kind }) => kind === "rock-fired")).toBe(true);
    expect(events.some(({ kind }) => kind === "rock-impact")).toBe(true);
    expect(events.some(({ kind }) => kind === "eliminated")).toBe(true);
    expect(frame.tiles.filter(({ state }) => state !== "Void")).toHaveLength(expectedCoreSize);
  });
});
