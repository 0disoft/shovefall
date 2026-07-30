import {
  createTileId,
  type CannonShotState,
  type PirateShipState,
  type RockShotState,
  type Tick,
  type TileId,
  type TileState,
} from "./contracts";
import { COLLAPSE_COAST_SECTOR_COUNT, type CollapseWave } from "./collapse";
import type { Vector2 } from "./math";
import type { XorShift32 } from "./random";
import { getOuterOceanTileIds } from "./arena";

export const PIRATE_SHIP_COUNT = COLLAPSE_COAST_SECTOR_COUNT;
export const CANNON_FLIGHT_TICKS = 185;
export const CANNON_MINIMUM_LAUNCH_INTERVAL_TICKS = 120;
export const CANNON_MAXIMUM_LAUNCH_INTERVAL_TICKS = 180;
export const PIRATE_SHIP_OFFSHORE_DISTANCE = 5.25;
export const CANNON_LANDING_APPROACH_TILES = 1.25;
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
  readonly collapseWaves: readonly CollapseWave[];
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

const ORTHOGONAL_OFFSETS = Object.freeze([
  Object.freeze({ column: 0, row: -1 }),
  Object.freeze({ column: 1, row: 0 }),
  Object.freeze({ column: 0, row: 1 }),
  Object.freeze({ column: -1, row: 0 }),
]);

function createShipPositions(
  tiles: readonly TileState[],
  columns: number,
  rows: number,
): readonly Vector2[] {
  const outerWaterIds = getOuterOceanTileIds(tiles, columns, rows);
  const coastTiles = tiles.filter(
    (tile) => tile.state !== "Void" && isCurrentOuterCoast(tile, outerWaterIds, columns, rows),
  );
  const center = Object.freeze({ x: columns / 2, y: rows / 2 });
  const orderedCoast = coastTiles.toSorted((left, right) => {
    const leftAngle = Math.atan2(left.row + 0.5 - center.y, left.column + 0.5 - center.x);
    const rightAngle = Math.atan2(right.row + 0.5 - center.y, right.column + 0.5 - center.x);
    return leftAngle - rightAngle || left.tileId.localeCompare(right.tileId);
  });

  return Object.freeze(
    Array.from({ length: PIRATE_SHIP_COUNT }, (_, index) => {
      const coast =
        orderedCoast[Math.floor(((index + 0.5) * orderedCoast.length) / PIRATE_SHIP_COUNT)];

      if (coast === undefined) {
        const angle = -Math.PI / 2 + (index * Math.PI * 2) / PIRATE_SHIP_COUNT;
        const direction = Object.freeze({ x: Math.cos(angle), y: Math.sin(angle) });
        return Object.freeze({
          x: center.x + direction.x * (columns / 2 + PIRATE_SHIP_OFFSHORE_DISTANCE),
          y: center.y + direction.y * (rows / 2 + PIRATE_SHIP_OFFSHORE_DISTANCE),
        });
      }

      const radialOffset = Object.freeze({
        x: coast.column + 0.5 - center.x,
        y: coast.row + 0.5 - center.y,
      });
      const outerWaterDirection = ORTHOGONAL_OFFSETS.reduce(
        (direction, offset) => {
          const neighborColumn = coast.column + offset.column;
          const neighborRow = coast.row + offset.row;
          const outsideArena =
            neighborColumn < 0 ||
            neighborColumn >= columns ||
            neighborRow < 0 ||
            neighborRow >= rows;
          if (outsideArena || outerWaterIds.has(createTileId(neighborColumn, neighborRow))) {
            direction.x += offset.column;
            direction.y += offset.row;
          }
          return direction;
        },
        { x: 0, y: 0 },
      );
      const directionSource =
        Math.hypot(outerWaterDirection.x, outerWaterDirection.y) > 0.001
          ? outerWaterDirection
          : radialOffset;
      const directionLength = Math.max(0.001, Math.hypot(directionSource.x, directionSource.y));
      const direction = Object.freeze({
        x: directionSource.x / directionLength,
        y: directionSource.y / directionLength,
      });

      return Object.freeze({
        x: coast.column + 0.5 + direction.x * PIRATE_SHIP_OFFSHORE_DISTANCE,
        y: coast.row + 0.5 + direction.y * PIRATE_SHIP_OFFSHORE_DISTANCE,
      });
    }),
  );
}

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

    if (distance * (1 - progress) <= CANNON_LANDING_APPROACH_TILES) {
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
  random: XorShift32,
): ArtilleryPlan {
  const tilesById = new Map(tiles.map((tile) => [tile.tileId, tile] as const));
  const shipPositions = createShipPositions(tiles, columns, rows);
  const outerWaterIds = new Set(getOuterOceanTileIds(tiles, columns, rows));
  const supportedTileIds = new Set(
    tiles.filter(({ state }) => state !== "Void").map(({ tileId }) => tileId),
  );
  const ammoByShip = Array.from({ length: PIRATE_SHIP_COUNT }, () => 0);
  const cannonLaunchTicksByShip = Array.from({ length: PIRATE_SHIP_COUNT }, (): Tick[] => []);
  const cannonShots: CannonShotState[] = [];
  const collapseWaves: CollapseWave[] = [];
  const scheduledImpacts: { tick: Tick; tileId: TileId }[] = [];
  const reservedTileIds = new Set<TileId>();
  let shotId = 1;
  const openingLaunchTick = Math.max(
    0,
    (collapsePlan[0]?.voidTick ?? CANNON_FLIGHT_TICKS) - CANNON_FLIGHT_TICKS,
  );
  const nextInterval = (): number =>
    CANNON_MINIMUM_LAUNCH_INTERVAL_TICKS +
    (random.nextUint32() %
      (CANNON_MAXIMUM_LAUNCH_INTERVAL_TICKS - CANNON_MINIMUM_LAUNCH_INTERVAL_TICKS + 1));
  const nextLaunchTickByShip = Array.from(
    { length: PIRATE_SHIP_COUNT },
    () => openingLaunchTick + (random.nextUint32() % CANNON_MAXIMUM_LAUNCH_INTERVAL_TICKS),
  );

  const pendingByTileId = new Map(
    collapsePlan.flatMap((wave, priority) =>
      wave.tileIds.map((tileId) => [tileId, { wave, priority }] as const),
    ),
  );
  const frontierTileIds = new Set(
    [...pendingByTileId.keys()].filter((tileId) => {
      const tile = tilesById.get(tileId);
      return tile !== undefined && isCurrentOuterCoast(tile, outerWaterIds, columns, rows);
    }),
  );

  const exposeNeighbors = (tile: TileState): void => {
    supportedTileIds.delete(tile.tileId);
    outerWaterIds.add(tile.tileId);
    for (const offset of ORTHOGONAL_OFFSETS) {
      const neighborId = createTileId(tile.column + offset.column, tile.row + offset.row);
      const neighbor = tilesById.get(neighborId);

      if (
        pendingByTileId.has(neighborId) &&
        neighbor !== undefined &&
        isCurrentOuterCoast(neighbor, outerWaterIds, columns, rows)
      ) {
        frontierTileIds.add(neighborId);
      }
    }
  };
  let impactCursor = 0;
  let consecutiveMisses = 0;

  while (pendingByTileId.size > 0) {
    const shipIndex = nextLaunchTickByShip.reduce(
      (selected, tick, index, ticks) =>
        tick < (ticks[selected] ?? Number.MAX_SAFE_INTEGER) ? index : selected,
      0,
    );
    const launchTick = nextLaunchTickByShip[shipIndex] ?? openingLaunchTick;

    while ((scheduledImpacts[impactCursor]?.tick ?? Number.MAX_SAFE_INTEGER) <= launchTick) {
      const impact = scheduledImpacts[impactCursor];
      const impactedTile = impact === undefined ? undefined : tilesById.get(impact.tileId);
      if (impact !== undefined) {
        reservedTileIds.delete(impact.tileId);
      }
      if (impactedTile !== undefined) {
        exposeNeighbors(impactedTile);
      }
      impactCursor += 1;
    }

    const origin = shipPositions[shipIndex];
    if (origin === undefined) {
      break;
    }
    const targetChoice = [...frontierTileIds]
      .filter((tileId) => !reservedTileIds.has(tileId))
      .map((tileId) => ({
        pending: pendingByTileId.get(tileId),
        tile: tilesById.get(tileId),
      }))
      .filter(
        (
          choice,
        ): choice is {
          pending: { wave: CollapseWave; priority: number };
          tile: TileState;
        } =>
          choice.pending !== undefined &&
          choice.tile !== undefined &&
          hasClearOceanApproach(origin, choice.tile, supportedTileIds),
      )
      .toSorted(
        (left, right) =>
          Math.hypot(left.tile.column + 0.5 - origin.x, left.tile.row + 0.5 - origin.y) -
            Math.hypot(right.tile.column + 0.5 - origin.x, right.tile.row + 0.5 - origin.y) ||
          left.pending.priority - right.pending.priority ||
          left.tile.tileId.localeCompare(right.tile.tileId),
      )[0];

    if (targetChoice === undefined) {
      consecutiveMisses += 1;
      const nextImpactTick = scheduledImpacts[impactCursor]?.tick;
      nextLaunchTickByShip[shipIndex] =
        nextImpactTick === undefined
          ? launchTick + nextInterval()
          : Math.max(launchTick + 1, nextImpactTick);
      if (consecutiveMisses >= PIRATE_SHIP_COUNT && nextImpactTick === undefined) {
        break;
      }
      continue;
    }

    consecutiveMisses = 0;
    const { wave } = targetChoice.pending;
    const { tile } = targetChoice;
    const impactTick = launchTick + CANNON_FLIGHT_TICKS;
    const collapsingDurationTicks = Math.max(1, wave.voidTick - wave.collapsingTick);
    const collapsingTick = Math.max(launchTick, impactTick - collapsingDurationTicks);
    const dangerTick = Math.min(
      impactTick,
      launchTick + Math.max(1, Math.floor(CANNON_FLIGHT_TICKS * 0.45)),
    );
    const acceptedWave = Object.freeze({
      ...wave,
      warningTick: launchTick,
      collapsingTick,
      voidTick: impactTick,
    });
    collapseWaves.push(acceptedWave);
    ammoByShip[shipIndex] = (ammoByShip[shipIndex] ?? 0) + 1;
    cannonLaunchTicksByShip[shipIndex]?.push(launchTick);
    pendingByTileId.delete(tile.tileId);
    frontierTileIds.delete(tile.tileId);
    reservedTileIds.add(tile.tileId);
    scheduledImpacts.push({ tick: impactTick, tileId: tile.tileId });
    cannonShots.push(
      Object.freeze({
        shotId,
        shipId: shipIndex + 1,
        targetTileId: tile.tileId,
        origin,
        target: Object.freeze({ x: tile.column + 0.5, y: tile.row + 0.5 }),
        launchTick,
        warningTick: launchTick,
        dangerTick,
        impactTick,
      }),
    );
    shotId += 1;
    nextLaunchTickByShip[shipIndex] = launchTick + nextInterval();
  }

  const ships = shipPositions.map((position, index) =>
    Object.freeze({
      shipId: index + 1,
      position,
      initialCannonAmmo: ammoByShip[index] ?? 0,
    }),
  );
  const finalImpactTick = collapseWaves.at(-1)?.voidTick ?? 0;
  return Object.freeze({
    ships: Object.freeze(ships),
    cannonShots: Object.freeze(cannonShots),
    cannonLaunchTicksByShip: Object.freeze(
      cannonLaunchTicksByShip.map((launchTicks) => Object.freeze(launchTicks)),
    ),
    collapseWaves: Object.freeze(collapseWaves),
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
