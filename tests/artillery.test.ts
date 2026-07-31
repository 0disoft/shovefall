import { describe, expect, it } from "vitest";
import {
  CANNON_FLIGHT_TICKS,
  CANNON_MAXIMUM_LAUNCH_INTERVAL_TICKS,
  CANNON_MINIMUM_LAUNCH_INTERVAL_TICKS,
  createArtilleryPlan,
  getPredictedRockTarget,
  getActiveCannonShots,
  getPirateShipStates,
  getRockIntervalTicks,
  getRockVolleySize,
  ROCK_BLAST_RADIUS,
  ROCK_MAXIMUM_LEAD_DISTANCE,
} from "../src/simulation/artillery";
import { getOuterOceanTileIds } from "../src/simulation/arena";
import { createCollapsePlan } from "../src/simulation/collapse";
import { createTileId, normalizeGameConfig } from "../src/simulation/contracts";
import { RandomStreamSet } from "../src/simulation/random";
import { SimulationWorld } from "../src/simulation/world";

describe("pirate artillery", () => {
  it("scales readable final-rock volleys with the survivor count", () => {
    expect(getRockIntervalTicks(12)).toBe(72);
    expect(getRockIntervalTicks(8)).toBe(60);
    expect(getRockIntervalTicks(4)).toBe(48);
    expect(getRockVolleySize(12)).toBe(3);
    expect(getRockVolleySize(8)).toBe(2);
    expect(getRockVolleySize(4)).toBe(1);
    expect(ROCK_BLAST_RADIUS).toBe(0.95);
  });

  it("leads a moving rock target without predicting farther than the fair cap", () => {
    const target = getPredictedRockTarget({ x: 4, y: 6 }, { x: 0.2, y: 0.1 });
    const leadDistance = Math.hypot(target.x - 4, target.y - 6);

    expect(leadDistance).toBeCloseTo(ROCK_MAXIMUM_LEAD_DISTANCE, 6);
    expect(target.x).toBeGreaterThan(4);
    expect(target.y).toBeGreaterThan(6);
  });

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
    const plan = createArtilleryPlan(
      tiles,
      collapsePlan,
      config.arenaColumns,
      config.arenaRows,
      new RandomStreamSet(seed).get("artillery-plan"),
    );
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

  it("starts every ship on an independent seeded 1.5-to-2.25-second firing clock", () => {
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
      new RandomStreamSet(seed).get("artillery-plan"),
    );

    expect(collapsePlan[0]).toMatchObject({ warningTick: 240, voidTick: 330 });
    expect(artillery.cannonShots[0]?.launchTick).toBeGreaterThanOrEqual(145);
    expect(artillery.cannonShots[0]?.launchTick).toBeLessThan(325);
    expect(
      artillery.cannonShots.every(({ warningTick, launchTick }) => warningTick === launchTick),
    ).toBe(true);
    const launchTicksByShip = new Map<number, number[]>();
    for (const shot of artillery.cannonShots) {
      const launchTicks = launchTicksByShip.get(shot.shipId) ?? [];
      launchTicks.push(shot.launchTick);
      launchTicksByShip.set(shot.shipId, launchTicks);
    }
    const launchGapsByShip = [...launchTicksByShip.values()].flatMap((launchTicks) =>
      launchTicks.slice(1).map((tick, index) => tick - (launchTicks[index] ?? 0)),
    );
    expect(launchGapsByShip.length).toBeGreaterThan(0);
    expect(launchGapsByShip.every((gap) => gap >= CANNON_MINIMUM_LAUNCH_INTERVAL_TICKS)).toBe(true);
    expect(launchGapsByShip.some((gap) => gap <= CANNON_MAXIMUM_LAUNCH_INTERVAL_TICKS)).toBe(true);
  });

  it("fires one nearby-coast cannonball per warned tile without an ammunition counter", () => {
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
      new RandomStreamSet(seed).get("artillery-plan"),
    );
    const firstShot = plan.cannonShots[0];

    expect(plan.cannonShots).toHaveLength(plan.collapseWaves.length);
    for (const [waveIndex, shot] of plan.cannonShots.entries()) {
      const wave = plan.collapseWaves[waveIndex];
      expect(wave?.tileIds).toEqual([shot.targetTileId]);
      expect(wave?.warningTick).toBe(shot.launchTick);
      expect(shot.warningTick).toBe(shot.launchTick);
      expect(shot.impactTick - shot.launchTick).toBe(CANNON_FLIGHT_TICKS);
    }

    const finalImpactTick = plan.collapseWaves.at(-1)?.voidTick ?? 0;
    expect(finalImpactTick).toBeGreaterThan(0);
    expect(getPirateShipStates(plan)).toEqual(plan.ships);
    expect(firstShot).toBeDefined();
    expect(getActiveCannonShots(plan, firstShot?.warningTick ?? 0)).toContainEqual(firstShot);
    const nearestLandDistances = plan.ships.map(({ position }) =>
      Math.min(
        ...frame.tiles
          .filter(({ state }) => state !== "Void")
          .map(({ column, row }) => Math.hypot(column + 0.5 - position.x, row + 0.5 - position.y)),
      ),
    );
    const visualHullHalfExtent = 1.6;
    const visualWaterClearances = nearestLandDistances.map(
      (distance) => distance - 0.5 - visualHullHalfExtent,
    );
    expect(visualWaterClearances.every((distance) => distance >= 3 && distance <= 4)).toBe(true);
  });

  it("assigns every public-island warning to exactly one cannonball", () => {
    const config = normalizeGameConfig({
      participantCount: 60,
      arenaColumns: 48,
      arenaRows: 40,
      collapseSpeed: "slow",
    });
    const seed = "public-one-shot-one-warning";
    const frame = new SimulationWorld(config, seed).createRenderFrame();
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
      new RandomStreamSet(seed).get("artillery-plan"),
    );

    expect(artillery.collapseWaves.length).toBeGreaterThan(0);
    expect(artillery.collapseWaves.length).toBeLessThanOrEqual(collapsePlan.length);
    expect(artillery.collapseWaves.every(({ tileIds }) => tileIds.length === 1)).toBe(true);
    expect(artillery.cannonShots).toHaveLength(artillery.collapseWaves.length);
    expect(artillery.cannonShots.map(({ targetTileId }) => targetTileId)).toEqual(
      artillery.collapseWaves.map(({ tileIds }) => tileIds[0]),
    );
    expect(
      artillery.cannonShots.every(
        ({ launchTick, impactTick }) => impactTick - launchTick === CANNON_FLIGHT_TICKS,
      ),
    ).toBe(true);
    const globalLaunchGaps = artillery.cannonShots
      .slice(1)
      .map((shot, index) => shot.launchTick - (artillery.cannonShots[index]?.launchTick ?? 0));
    expect(globalLaunchGaps.some((gap) => gap < CANNON_MINIMUM_LAUNCH_INTERVAL_TICKS)).toBe(true);
    const initialLandCount = frame.tiles.filter(({ state }) => state === "Stable").length;
    const protectedLandCount = initialLandCount - artillery.collapseWaves.length;
    expect(protectedLandCount).toBe(0);
  });

  it("keeps firing cannonballs through the final land tile instead of entering a rock phase", () => {
    const config = normalizeGameConfig({
      participantCount: 4,
      arenaColumns: 7,
      arenaRows: 7,
      roundLimitSeconds: 120,
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
      new RandomStreamSet(seed).get("artillery-plan"),
    );
    const initialLandCount = initialFrame.tiles.filter(({ state }) => state === "Stable").length;

    expect(plan.collapseWaves).toHaveLength(initialLandCount);
    expect(plan.cannonShots).toHaveLength(initialLandCount);
    expect(plan.rockPhaseStartTick).toBe(Number.MAX_SAFE_INTEGER);
  });
});
