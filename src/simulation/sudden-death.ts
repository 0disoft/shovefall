import type { Tick, TileState } from "./contracts";
import type { CollapseWave } from "./collapse";
import type { Vector2 } from "./math";
import { SIMULATION_TUNING } from "./tuning";

export interface SuddenDeathPlan {
  readonly center: Vector2;
  readonly firstPulseTick: Tick;
}

export interface SuddenDeathPulse {
  readonly center: Vector2;
  readonly index: number;
  readonly strength: number;
}

export function createSuddenDeathPlan(
  tiles: readonly TileState[],
  collapsePlan: readonly CollapseWave[],
): SuddenDeathPlan | undefined {
  const lastWave = collapsePlan.at(-1);

  if (lastWave === undefined) {
    return undefined;
  }

  const scheduledTileIds = new Set(collapsePlan.flatMap(({ tileIds }) => tileIds));
  const protectedTiles = tiles.filter(
    ({ state, tileId }) => state === "Stable" && !scheduledTileIds.has(tileId),
  );

  if (protectedTiles.length === 0) {
    return undefined;
  }

  const center = Object.freeze({
    x: protectedTiles.reduce((sum, tile) => sum + tile.column + 0.5, 0) / protectedTiles.length,
    y: protectedTiles.reduce((sum, tile) => sum + tile.row + 0.5, 0) / protectedTiles.length,
  });

  return Object.freeze({
    center,
    firstPulseTick: lastWave.voidTick + SIMULATION_TUNING.suddenDeath.startDelayTicks,
  });
}

export function getSuddenDeathPulse(
  plan: SuddenDeathPlan | undefined,
  tick: Tick,
): SuddenDeathPulse | undefined {
  if (plan === undefined || tick < plan.firstPulseTick) {
    return undefined;
  }

  const elapsedTicks = tick - plan.firstPulseTick;

  if (elapsedTicks % SIMULATION_TUNING.suddenDeath.intervalTicks !== 0) {
    return undefined;
  }

  const index = Math.floor(elapsedTicks / SIMULATION_TUNING.suddenDeath.intervalTicks);
  return Object.freeze({
    center: plan.center,
    index,
    strength: Math.min(
      SIMULATION_TUNING.suddenDeath.baseImpulse +
        index * SIMULATION_TUNING.suddenDeath.impulseGrowth,
      SIMULATION_TUNING.suddenDeath.maximumImpulse,
    ),
  });
}
