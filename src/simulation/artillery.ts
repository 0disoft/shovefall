import {
  createTileId,
  type CannonShotState,
  type PirateShipState,
  type RockShotState,
  type Tick,
  type TileState,
} from "./contracts";
import type { CollapseWave } from "./collapse";
import type { Vector2 } from "./math";
import { getOuterOceanTileIds } from "./arena";

export const PIRATE_SHIP_COUNT = 8;
export const CANNON_FLIGHT_TICKS = 210;
export const CANNON_RELOAD_TICKS = 120;
export const PIRATE_SHIP_OFFSHORE_DISTANCE = 1.4;
export const ROCK_FLIGHT_TICKS = 90;
export const ROCK_BLAST_RADIUS = 0.72;

export interface ArtilleryPlan {
  readonly ships: readonly Readonly<{
    shipId: number;
    position: Vector2;
    initialCannonAmmo: number;
  }>[];
  readonly cannonShots: readonly CannonShotState[];
  readonly cannonLaunchTicksByShip: readonly (readonly Tick[])[];
  readonly rockPhaseStartTick: Tick;
}

function countLaunchedShots(launchTicks: readonly Tick[], tick: Tick): number {
  let low = 0;
  let high = launchTicks.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);

    if ((launchTicks[middle] ?? Number.POSITIVE_INFINITY) < tick) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function createShipPositions(columns: number, rows: number): readonly Vector2[] {
  const outside = PIRATE_SHIP_OFFSHORE_DISTANCE;
  return Object.freeze([
    Object.freeze({ x: columns * 0.25, y: -outside }),
    Object.freeze({ x: columns * 0.75, y: -outside }),
    Object.freeze({ x: columns + outside, y: rows * 0.25 }),
    Object.freeze({ x: columns + outside, y: rows * 0.75 }),
    Object.freeze({ x: columns * 0.75, y: rows + outside }),
    Object.freeze({ x: columns * 0.25, y: rows + outside }),
    Object.freeze({ x: -outside, y: rows * 0.75 }),
    Object.freeze({ x: -outside, y: rows * 0.25 }),
  ]);
}

const ORTHOGONAL_OFFSETS = Object.freeze([
  Object.freeze({ column: 0, row: -1 }),
  Object.freeze({ column: 1, row: 0 }),
  Object.freeze({ column: 0, row: 1 }),
  Object.freeze({ column: -1, row: 0 }),
]);

function isCurrentOuterCoast(
  tile: TileState,
  outerWaterIds: ReadonlySet<string>,
  columns: number,
  rows: number,
): boolean {
  return ORTHOGONAL_OFFSETS.some(({ column, row }) => {
    const neighborColumn = tile.column + column;
    const neighborRow = tile.row + row;
    return (
      neighborColumn < 0 ||
      neighborColumn >= columns ||
      neighborRow < 0 ||
      neighborRow >= rows ||
      outerWaterIds.has(createTileId(neighborColumn, neighborRow))
    );
  });
}

function hasClearOceanApproach(
  origin: Vector2,
  target: TileState,
  supportedTileIds: ReadonlySet<string>,
): boolean {
  const targetPosition = Object.freeze({ x: target.column + 0.5, y: target.row + 0.5 });
  const distance = Math.hypot(targetPosition.x - origin.x, targetPosition.y - origin.y);
  const steps = Math.max(1, Math.ceil(distance * 4));

  for (let index = 1; index < steps; index += 1) {
    const progress = index / steps;

    if (distance * (1 - progress) <= 0.55) {
      break;
    }

    const column = Math.floor(origin.x + (targetPosition.x - origin.x) * progress);
    const row = Math.floor(origin.y + (targetPosition.y - origin.y) * progress);
    const sampledTileId = createTileId(column, row);

    if (sampledTileId !== target.tileId && supportedTileIds.has(sampledTileId)) {
      return false;
    }
  }

  return true;
}

export function createArtilleryPlan(
  tiles: readonly TileState[],
  collapsePlan: readonly CollapseWave[],
  columns: number,
  rows: number,
): ArtilleryPlan {
  const tilesById = new Map(tiles.map((tile) => [tile.tileId, tile] as const));
  const shipPositions = createShipPositions(columns, rows);
  const outerWaterIds = new Set(getOuterOceanTileIds(tiles, columns, rows));
  const supportedTileIds = new Set(
    tiles.filter(({ state }) => state !== "Void").map(({ tileId }) => tileId),
  );
  const ammoByShip = Array.from({ length: PIRATE_SHIP_COUNT }, () => 0);
  const cannonLaunchTicksByShip = Array.from({ length: PIRATE_SHIP_COUNT }, (): Tick[] => []);
  const availableTickByShip = Array.from({ length: PIRATE_SHIP_COUNT }, () => 0);
  const cannonShots: CannonShotState[] = [];
  let shotId = 1;

  for (const wave of collapsePlan) {
    const preferredLaunchTick = Math.max(0, wave.voidTick - CANNON_FLIGHT_TICKS);
    const outerCoastTiles = wave.tileIds
      .map((tileId) => tilesById.get(tileId))
      .filter((tile): tile is TileState => tile !== undefined)
      .filter((tile) => isCurrentOuterCoast(tile, outerWaterIds, columns, rows));
    const targetChoices = outerCoastTiles
      .flatMap((tile) =>
        shipPositions
          .map((origin, shipIndex) => ({
            tile,
            origin,
            shipIndex,
            distance: Math.hypot(tile.column + 0.5 - origin.x, tile.row + 0.5 - origin.y),
          }))
          .filter(({ origin }) => hasClearOceanApproach(origin, tile, supportedTileIds)),
      )
      .toSorted(
        (left, right) =>
          left.distance - right.distance ||
          left.shipIndex - right.shipIndex ||
          left.tile.tileId.localeCompare(right.tile.tileId),
      );
    const targetChoice =
      targetChoices.find(
        ({ shipIndex }) => (availableTickByShip[shipIndex] ?? 0) <= preferredLaunchTick,
      ) ??
      targetChoices.find(({ shipIndex }) => (availableTickByShip[shipIndex] ?? 0) < wave.voidTick);

    for (const tileId of wave.tileIds) {
      supportedTileIds.delete(tileId);
      outerWaterIds.add(tileId);
    }

    if (targetChoice === undefined) {
      continue;
    }

    const { tile, origin, shipIndex } = targetChoice;
    const launchTick = Math.max(preferredLaunchTick, availableTickByShip[shipIndex] ?? 0);
    const visibleWarningTick = Math.max(wave.warningTick, launchTick);
    const remainingFlightTicks = Math.max(1, wave.voidTick - visibleWarningTick);
    const dangerTick = Math.min(
      wave.voidTick,
      visibleWarningTick + Math.max(1, Math.floor(remainingFlightTicks * 0.45)),
    );
    ammoByShip[shipIndex] = (ammoByShip[shipIndex] ?? 0) + 1;
    cannonLaunchTicksByShip[shipIndex]?.push(launchTick);
    availableTickByShip[shipIndex] = wave.voidTick + CANNON_RELOAD_TICKS;
    cannonShots.push(
      Object.freeze({
        shotId,
        shipId: shipIndex + 1,
        targetTileId: tile.tileId,
        origin,
        target: Object.freeze({ x: tile.column + 0.5, y: tile.row + 0.5 }),
        launchTick,
        warningTick: visibleWarningTick,
        dangerTick,
        impactTick: wave.voidTick,
      }),
    );
    shotId += 1;
  }

  const ships = shipPositions.map((position, index) =>
    Object.freeze({
      shipId: index + 1,
      position,
      initialCannonAmmo: ammoByShip[index] ?? 0,
    }),
  );
  const finalImpactTick = collapsePlan.at(-1)?.voidTick ?? 0;
  return Object.freeze({
    ships: Object.freeze(ships),
    cannonShots: Object.freeze(cannonShots),
    cannonLaunchTicksByShip: Object.freeze(
      cannonLaunchTicksByShip.map((launchTicks) => Object.freeze(launchTicks)),
    ),
    rockPhaseStartTick: finalImpactTick + 60,
  });
}

export function getPirateShipStates(plan: ArtilleryPlan, tick: Tick): readonly PirateShipState[] {
  return Object.freeze(
    plan.ships.map((ship) => {
      const fired = countLaunchedShots(
        plan.cannonLaunchTicksByShip[ship.shipId - 1] ?? Object.freeze([]),
        tick,
      );
      return Object.freeze({
        ...ship,
        cannonAmmoRemaining: Math.max(0, ship.initialCannonAmmo - fired),
      });
    }),
  );
}

export function getActiveCannonShots(plan: ArtilleryPlan, tick: Tick): readonly CannonShotState[] {
  return Object.freeze(
    plan.cannonShots.filter((shot) => tick >= shot.launchTick && tick <= shot.impactTick),
  );
}

export function getRockIntervalTicks(standingCount: number): number {
  if (standingCount <= 4) {
    return 48;
  }

  if (standingCount <= 8) {
    return 66;
  }

  return 90;
}

export function createRockShot(
  shotId: number,
  ship: ArtilleryPlan["ships"][number],
  targetActorId: number,
  target: Vector2,
  launchTick: Tick,
): RockShotState {
  return Object.freeze({
    shotId,
    shipId: ship.shipId,
    targetActorId,
    origin: ship.position,
    target: Object.freeze({ ...target }),
    launchTick,
    impactTick: launchTick + ROCK_FLIGHT_TICKS,
    blastRadius: ROCK_BLAST_RADIUS,
  });
}
