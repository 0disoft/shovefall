import type { CollapseSpeed, Tick, TileId, TileState, TileStateKind } from "./contracts";
import type { XorShift32 } from "./random";

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
    startTick: 15 * 60,
    waveIntervalTicks: 75,
    warningTicks: 120,
    collapsingTicks: 24,
  }),
  normal: Object.freeze({
    startTick: 10 * 60,
    waveIntervalTicks: 60,
    warningTicks: 90,
    collapsingTicks: 18,
  }),
  fast: Object.freeze({
    startTick: 6 * 60,
    waveIntervalTicks: 42,
    warningTicks: 66,
    collapsingTicks: 12,
  }),
});

function getLayer(tile: TileState, columns: number, rows: number): number {
  return Math.min(tile.column, tile.row, columns - tile.column - 1, rows - tile.row - 1);
}

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
  columns: number,
  rows: number,
  speed: CollapseSpeed,
  random: XorShift32,
): readonly CollapseWave[] {
  const timing = COLLAPSE_TIMINGS[speed];
  const layers = new Map<number, TileState[]>();

  for (const tile of tiles) {
    const layer = getLayer(tile, columns, rows);
    const group = layers.get(layer) ?? [];
    group.push(tile);
    layers.set(layer, group);
  }

  const orderedLayers = [...layers.entries()]
    .toSorted(([left], [right]) => left - right)
    .map(([, layerTiles]) => shuffleTiles(layerTiles, random));
  const orderedTiles = orderedLayers.flat();
  const regularBatchSize = Math.max(2, Math.ceil(tiles.length / 24));
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
    const state = scheduledStates.get(tile.tileId) ?? "Stable";

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
