import { describe, expect, it } from "vitest";
import {
  CANNON_FLIGHT_TICKS,
  CANNON_RELOAD_TICKS,
  createArtilleryPlan,
  getActiveCannonShots,
  getPirateShipStates,
  PIRATE_SHIP_COUNT,
  PIRATE_SHIP_OFFSHORE_DISTANCE,
  ROCK_FLIGHT_TICKS,
} from "../src/simulation/artillery";
import { getOuterOceanTileIds } from "../src/simulation/arena";
import { createCollapsePlan, MINIMUM_REMAINING_LAND_RATIO } from "../src/simulation/collapse";
import {
  createTileId,
  createNeutralCommand,
  normalizeGameConfig,
  type SimulationEventV1,
} from "../src/simulation/contracts";
import { RandomStreamSet } from "../src/simulation/random";
import { SimulationWorld } from "../src/simulation/world";

describe("pirate artillery", () => {
  it("keeps enclosed lake water out of the outer-ocean targeting frontier", () => {
    const config = normalizeGameConfig({
      participantCount: 4,
      arenaColumns: 9,
      arenaRows: 9,
      collapseSpeed: "slow",
    });
    const seed = "outer-coast-not-lake";
    const baseFrame = new SimulationWorld(config, seed, {
      arenaLayout: "rectangular-fixture",
    }).createRenderFrame();
    const lakeTileId = createTileId(4, 4);
    const tiles = Object.freeze(
      baseFrame.tiles.map((tile) =>
        tile.tileId === lakeTileId ? Object.freeze({ ...tile, state: "Void" as const }) : tile,
      ),
    );
    const collapsePlan = createCollapsePlan(
      tiles,
      config.arenaColumns,
      config.arenaRows,
      config.collapseSpeed,
      new RandomStreamSet(seed).get("collapse"),
    );
    const plan = createArtilleryPlan(tiles, collapsePlan, config.arenaColumns, config.arenaRows);
    const lakeNeighborIds = new Set([
      createTileId(4, 3),
      createTileId(5, 4),
      createTileId(4, 5),
      createTileId(3, 4),
    ]);

    expect(getOuterOceanTileIds(tiles, config.arenaColumns, config.arenaRows)).not.toContain(
      lakeTileId,
    );
    expect(lakeNeighborIds.has(plan.cannonShots[0]?.targetTileId ?? createTileId(-1, -1))).toBe(
      false,
    );
  });

  it("starts the public slow barrage during the opening seconds and spaces waves evenly", () => {
    const config = normalizeGameConfig({
      participantCount: 4,
      arenaColumns: 12,
      arenaRows: 10,
      collapseSpeed: "slow",
    });
    const seed = "opening-slow-barrage";
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
    const artillery = createArtilleryPlan(
      frame.tiles,
      collapsePlan,
      config.arenaColumns,
      config.arenaRows,
    );

    expect(collapsePlan[0]).toMatchObject({ warningTick: 120, voidTick: 210 });
    expect(collapsePlan[1]?.warningTick).toBe(162);
    expect(artillery.cannonShots[0]?.launchTick).toBe(0);
    expect(artillery.cannonShots[1]?.launchTick).toBe(42);
    expect(
      (artillery.cannonShots[1]?.impactTick ?? 0) - (artillery.cannonShots[1]?.launchTick ?? 0),
    ).toBe(CANNON_FLIGHT_TICKS);
  });

  it("fires one nearby-coast cannonball per collapse wave and exposes bounded live ammo", () => {
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
    const initialAmmo = plan.ships.map(({ initialCannonAmmo }) => initialCannonAmmo);
    const firstShot = plan.cannonShots[0];

    expect(plan.cannonShots).toHaveLength(collapsePlan.length);
    expect(initialAmmo.reduce((total, ammo) => total + ammo, 0)).toBe(collapsePlan.length);
    for (const [waveIndex, shot] of plan.cannonShots.entries()) {
      const wave = collapsePlan[waveIndex];
      expect(wave?.tileIds).toContain(shot.targetTileId);
    }

    const reloadGaps = plan.cannonShots.flatMap((shot, shotIndex) => {
      const priorShotFromShip = plan.cannonShots
        .slice(0, shotIndex)
        .findLast(({ shipId }) => shipId === shot.shipId);
      return priorShotFromShip === undefined
        ? []
        : [shot.launchTick - priorShotFromShip.impactTick];
    });
    expect(reloadGaps.every((gap) => gap >= CANNON_RELOAD_TICKS)).toBe(true);

    const finalImpactTick = collapsePlan.at(-1)?.voidTick ?? 0;
    const maximumShotsInFlight = Array.from(
      { length: finalImpactTick + 1 },
      (_, tick) => getActiveCannonShots(plan, tick).length,
    ).reduce((maximum, count) => Math.max(maximum, count), 0);
    expect(maximumShotsInFlight).toBeLessThanOrEqual(PIRATE_SHIP_COUNT);
    for (let tick = 0; tick <= finalImpactTick; tick += 1) {
      const activeShipIds = getActiveCannonShots(plan, tick).map(({ shipId }) => shipId);
      expect(new Set(activeShipIds).size).toBe(activeShipIds.length);
    }
    expect(
      getPirateShipStates(plan, 0).map(({ cannonAmmoRemaining }) => cannonAmmoRemaining),
    ).toEqual(initialAmmo);
    expect(firstShot).toBeDefined();
    expect(getActiveCannonShots(plan, firstShot?.warningTick ?? 0)).toContainEqual(firstShot);
    expect(
      plan.ships.every(
        ({ position }) =>
          position.x === -PIRATE_SHIP_OFFSHORE_DISTANCE ||
          position.x === config.arenaColumns + PIRATE_SHIP_OFFSHORE_DISTANCE ||
          position.y === -PIRATE_SHIP_OFFSHORE_DISTANCE ||
          position.y === config.arenaRows + PIRATE_SHIP_OFFSHORE_DISTANCE,
      ),
    ).toBe(true);
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
