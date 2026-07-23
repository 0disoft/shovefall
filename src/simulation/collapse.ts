import {
  createTileId,
  type CollapseSpeed,
  type Tick,
  type TileId,
  type TileState,
  type TileStateKind,
} from "./contracts";
import type { XorShift32 } from "./random";
import { getLandShoreDepths } from "./arena";

export const MINIMUM_REMAINING_LAND_RATIO = 0.2;

export interface CollapseWave {
  readonly tileIds: readonly TileId[];
  readonly warningTick: Tick;
  readonly collapsingTick: Tick;
  readonly voidTick: Tick;
}

interface CollapseTiming {
  readonly startTick: Tick;
  readonly waveIntervalTicks: number;
  readonly warningTicks: number;
  readonly collapsingTicks: number;
}

const COLLAPSE_TIMINGS: Readonly<Record<CollapseSpeed, CollapseTiming>> = Object.freeze({
  slow: Object.freeze({
    startTick: 18 * 60,
    waveIntervalTicks: 84,
    warningTicks: 120,
    collapsingTicks: 24,
  }),
  normal: Object.freeze({
    startTick: 13 * 60,
    waveIntervalTicks: 66,
    warningTicks: 90,
    collapsingTicks: 18,
  }),
  fast: Object.freeze({
    startTick: 8 * 60,
    waveIntervalTicks: 48,
    warningTicks: 66,
    collapsingTicks: 12,
  }),
});

function shuffleTiles(tiles: readonly TileState[], random: XorShift32): readonly TileState[] {
  const shuffled = [...tiles];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = random.nextUint32() % (index + 1);
    const current = shuffled[index];
    const replacement = shuffled[swapIndex];

    if (current !== undefined && replacement !== undefined) {
      shuffled[index] = replacement;
      shuffled[swapIndex] = current;
    }
  }

  return Object.freeze(shuffled);
}

export function createCollapsePlan(
  tiles: readonly TileState[],
  _columns: number,
  _rows: number,
  speed: CollapseSpeed,
  random: XorShift32,
): readonly CollapseWave[] {
  const timing = COLLAPSE_TIMINGS[speed];
  const landTiles = tiles.filter(({ state }) => state === "Stable");
  const shoreDepths = getLandShoreDepths(tiles);
  const minimumRemainingTiles = Math.ceil(landTiles.length * MINIMUM_REMAINING_LAND_RATIO);
  const protectedIds = selectProtectedCore(landTiles, shoreDepths, minimumRemainingTiles);
  const layers = new Map<number, TileState[]>();

  for (const tile of landTiles) {
    if (protectedIds.has(tile.tileId)) {
      continue;
    }

    const layer = shoreDepths.get(tile.tileId) ?? 0;
    const group = layers.get(layer) ?? [];
    group.push(tile);
    layers.set(layer, group);
  }

  const orderedLayers = [...layers.entries()]
    .toSorted(([left], [right]) => left - right)
    .map(([, layerTiles]) => shuffleTiles(layerTiles, random));
  const orderedTiles = orderedLayers.flat();
  const regularBatchSize = Math.max(2, Math.ceil(orderedTiles.length / 24));
  const waves: TileState[][] = [];
  const finaleStartIndex = Math.max(0, orderedTiles.length - 4);
  let consumedTiles = 0;

  for (const layerTiles of orderedLayers) {
    const regularTilesInLayer = layerTiles.slice(
      0,
      Math.max(0, Math.min(layerTiles.length, finaleStartIndex - consumedTiles)),
    );

    for (let cursor = 0; cursor < regularTilesInLayer.length; cursor += regularBatchSize) {
      waves.push(regularTilesInLayer.slice(cursor, cursor + regularBatchSize));
    }

    consumedTiles += layerTiles.length;
  }

  let cursor = finaleStartIndex;

  while (cursor < orderedTiles.length) {
    const tile = orderedTiles[cursor];

    if (tile !== undefined) {
      waves.push([tile]);
    }

    cursor += 1;
  }

  return Object.freeze(
    waves.map((wave, index) => {
      const warningTick = timing.startTick + index * timing.waveIntervalTicks;
      const collapsingTick = warningTick + timing.warningTicks;
      return Object.freeze({
        tileIds: Object.freeze(wave.map(({ tileId }) => tileId)),
        warningTick,
        collapsingTick,
        voidTick: collapsingTick + timing.collapsingTicks,
      });
    }),
  );
}

function selectProtectedCore(
  landTiles: readonly TileState[],
  shoreDepths: ReadonlyMap<TileId, number>,
  targetSize: number,
): ReadonlySet<TileId> {
  const byId = new Map(landTiles.map((tile) => [tile.tileId, tile] as const));
  const centerX = landTiles.reduce((sum, tile) => sum + tile.column + 0.5, 0) / landTiles.length;
  const centerY = landTiles.reduce((sum, tile) => sum + tile.row + 0.5, 0) / landTiles.length;
  const ranked = (tileIds: readonly TileId[]) =>
    tileIds.toSorted((leftId, rightId) => {
      const left = byId.get(leftId);
      const right = byId.get(rightId);

      if (left === undefined || right === undefined) {
        return leftId.localeCompare(rightId);
      }

      const depthDifference = (shoreDepths.get(rightId) ?? 0) - (shoreDepths.get(leftId) ?? 0);
      const leftDistance = Math.hypot(left.column + 0.5 - centerX, left.row + 0.5 - centerY);
      const rightDistance = Math.hypot(right.column + 0.5 - centerX, right.row + 0.5 - centerY);
      return depthDifference || leftDistance - rightDistance || leftId.localeCompare(rightId);
    });
  const seed = ranked(landTiles.map(({ tileId }) => tileId))[0];

  if (seed === undefined) {
    return new Set();
  }

  const protectedIds = new Set<TileId>([seed]);
  const frontier = new Set<TileId>();
  const addNeighbors = (tileId: TileId) => {
    const tile = byId.get(tileId);

    if (tile === undefined) {
      return;
    }

    for (const [column, row] of [
      [tile.column + 1, tile.row],
      [tile.column - 1, tile.row],
      [tile.column, tile.row + 1],
      [tile.column, tile.row - 1],
    ] as const) {
      const neighborId = createTileId(column, row);

      if (byId.has(neighborId) && !protectedIds.has(neighborId)) {
        frontier.add(neighborId);
      }
    }
  };
  addNeighbors(seed);

  while (protectedIds.size < targetSize && frontier.size > 0) {
    const selected = ranked([...frontier])[0];

    if (selected === undefined) {
      break;
    }

    frontier.delete(selected);
    protectedIds.add(selected);
    addNeighbors(selected);
  }

  return protectedIds;
}

function getScheduledState(tick: Tick, wave: CollapseWave): TileStateKind {
  if (tick >= wave.voidTick) {
    return "Void";
  }

  if (tick >= wave.collapsingTick) {
    return "Collapsing";
  }

  if (tick >= wave.warningTick) {
    return "Warning";
  }

  return "Stable";
}

export interface CollapseAdvanceResult {
  readonly tiles: readonly TileState[];
  readonly transitions: readonly Readonly<{
    tileId: TileId;
    from: TileStateKind;
    to: TileStateKind;
  }>[];
}

export function advanceCollapse(
  tiles: readonly TileState[],
  plan: readonly CollapseWave[],
  tick: Tick,
): CollapseAdvanceResult {
  const scheduledStates = new Map<TileId, TileStateKind>();

  for (const wave of plan) {
    const state = getScheduledState(tick, wave);

    for (const tileId of wave.tileIds) {
      scheduledStates.set(tileId, state);
    }
  }

  const transitions: Array<{ tileId: TileId; from: TileStateKind; to: TileStateKind }> = [];
  const nextTiles = tiles.map((tile) => {
    const state = scheduledStates.get(tile.tileId) ?? tile.state;

    if (state === tile.state) {
      return tile;
    }

    transitions.push({ tileId: tile.tileId, from: tile.state, to: state });
    return Object.freeze({ ...tile, state });
  });

  return Object.freeze({
    tiles: Object.freeze(nextTiles),
    transitions: Object.freeze(transitions.map((transition) => Object.freeze(transition))),
  });
}
