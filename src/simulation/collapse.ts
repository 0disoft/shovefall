import {
  createTileId,
  type CollapseSpeed,
  type Tick,
  type TileId,
  type TileState,
  type TileStateKind,
} from "./contracts";
import type { XorShift32 } from "./random";
import { getOuterCoastDepths } from "./arena";

export const MINIMUM_REMAINING_LAND_RATIO = 0.1;
export const COLLAPSE_COAST_SECTOR_COUNT = 16;

export interface CollapseWave {
  readonly tileIds: readonly TileId[];
  readonly warningTick: Tick;
  readonly collapsingTick: Tick;
  readonly voidTick: Tick;
}

interface CollapseTiming {
  readonly startTick: Tick;
  readonly minimumWaveIntervalTicks: number;
  readonly maximumWaveIntervalTicks: number;
  readonly warningTicks: number;
  readonly collapsingTicks: number;
}

const COLLAPSE_TIMINGS: Readonly<Record<CollapseSpeed, CollapseTiming>> = Object.freeze({
  slow: Object.freeze({
    startTick: 4 * 60,
    minimumWaveIntervalTicks: 120,
    maximumWaveIntervalTicks: 120,
    warningTicks: 60,
    collapsingTicks: 30,
  }),
  normal: Object.freeze({
    startTick: 13 * 60,
    minimumWaveIntervalTicks: 60,
    maximumWaveIntervalTicks: 150,
    warningTicks: 90,
    collapsingTicks: 18,
  }),
  fast: Object.freeze({
    startTick: 8 * 60,
    minimumWaveIntervalTicks: 60,
    maximumWaveIntervalTicks: 120,
    warningTicks: 66,
    collapsingTicks: 12,
  }),
});

function orderLayerTilesSpatially(
  tiles: readonly TileState[],
  centerX: number,
  centerY: number,
  random: XorShift32,
): readonly TileState[] {
  if (tiles.length < 2) {
    return tiles;
  }

  const ordered = tiles.toSorted((left, right) => {
    const leftAngle = Math.atan2(left.row + 0.5 - centerY, left.column + 0.5 - centerX);
    const rightAngle = Math.atan2(right.row + 0.5 - centerY, right.column + 0.5 - centerX);
    return leftAngle - rightAngle || left.tileId.localeCompare(right.tileId);
  });
  const offset = random.nextUint32() % ordered.length;
  const rotated = [...ordered.slice(offset), ...ordered.slice(0, offset)];
  const sectorSize = Math.max(1, Math.ceil(rotated.length / COLLAPSE_COAST_SECTOR_COUNT));
  const sectors = Array.from({ length: COLLAPSE_COAST_SECTOR_COUNT }, (_, index) =>
    rotated.slice(index * sectorSize, (index + 1) * sectorSize),
  ).filter((sector) => sector.length > 0);
  const interleaved: TileState[] = [];

  for (let depth = 0; depth < sectorSize; depth += 1) {
    for (const sector of sectors) {
      const tile = sector[depth];

      if (tile !== undefined) {
        interleaved.push(tile);
      }
    }
  }

  return Object.freeze(interleaved);
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
  const shoreDepths = getOuterCoastDepths(tiles, _columns, _rows);
  const minimumRemainingTiles = Math.max(
    1,
    Math.floor(landTiles.length * MINIMUM_REMAINING_LAND_RATIO),
  );
  const protectedIds = selectProtectedCore(landTiles, shoreDepths, minimumRemainingTiles);
  const centerX = landTiles.reduce((sum, tile) => sum + tile.column + 0.5, 0) / landTiles.length;
  const centerY = landTiles.reduce((sum, tile) => sum + tile.row + 0.5, 0) / landTiles.length;
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
    .map(([, layerTiles]) => orderLayerTilesSpatially(layerTiles, centerX, centerY, random));
  const orderedTiles = orderedLayers.flat();
  const waves = orderedTiles.map((tile) => Object.freeze([tile]));
  let nextWarningTick = timing.startTick;

  return Object.freeze(
    waves.map((wave) => {
      const warningTick = nextWarningTick;
      const collapsingTick = warningTick + timing.warningTicks;
      const intervalRange = timing.maximumWaveIntervalTicks - timing.minimumWaveIntervalTicks + 1;
      nextWarningTick += timing.minimumWaveIntervalTicks + (random.nextUint32() % intervalRange);
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
