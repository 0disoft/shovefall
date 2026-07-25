import type { CannonShotState, PirateShipState, RockShotState, Tick, TileState } from "./contracts";
import type { CollapseWave } from "./collapse";
import type { Vector2 } from "./math";

export const PIRATE_SHIP_COUNT = 8;
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
  const outside = 2.6;
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

export function createArtilleryPlan(
  tiles: readonly TileState[],
  collapsePlan: readonly CollapseWave[],
  columns: number,
  rows: number,
): ArtilleryPlan {
  const tilesById = new Map(tiles.map((tile) => [tile.tileId, tile] as const));
  const shipPositions = createShipPositions(columns, rows);
  const ammoByShip = Array.from({ length: PIRATE_SHIP_COUNT }, () => 0);
  const cannonLaunchTicksByShip = Array.from({ length: PIRATE_SHIP_COUNT }, (): Tick[] => []);
  const cannonShots: CannonShotState[] = [];
  let shotId = 1;

  for (const wave of collapsePlan) {
    const remainingTelegraphTicks = wave.voidTick - wave.warningTick;
    const launchTick = Math.max(0, wave.warningTick - remainingTelegraphTicks);
    const dangerTick = wave.warningTick + Math.max(1, Math.floor(remainingTelegraphTicks * 0.45));

    const targetChoice = wave.tileIds
      .map((tileId) => tilesById.get(tileId))
      .filter((tile): tile is TileState => tile !== undefined)
      .flatMap((tile) =>
        shipPositions.map((origin, shipIndex) => ({
          tile,
          origin,
          shipIndex,
          distance: Math.hypot(tile.column + 0.5 - origin.x, tile.row + 0.5 - origin.y),
        })),
      )
      .toSorted(
        (left, right) =>
          left.distance - right.distance ||
          left.shipIndex - right.shipIndex ||
          left.tile.tileId.localeCompare(right.tile.tileId),
      )[0];

    if (targetChoice === undefined) {
      continue;
    }

    const { tile, origin, shipIndex } = targetChoice;
    ammoByShip[shipIndex] = (ammoByShip[shipIndex] ?? 0) + 1;
    cannonLaunchTicksByShip[shipIndex]?.push(launchTick);
    cannonShots.push(
      Object.freeze({
        shotId,
        shipId: shipIndex + 1,
        targetTileId: tile.tileId,
        origin,
        target: Object.freeze({ x: tile.column + 0.5, y: tile.row + 0.5 }),
        launchTick,
        warningTick: wave.warningTick,
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
