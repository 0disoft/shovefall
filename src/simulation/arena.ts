import { createTileId, type GameConfigV1, type TileId, type TileState } from "./contracts";
import type { Vector2 } from "./math";
import type { XorShift32 } from "./random";

const COAST_SAMPLE_COUNT = 24;
const ORTHOGONAL_DIRECTIONS = Object.freeze([
  Object.freeze({ column: 1, row: 0 }),
  Object.freeze({ column: -1, row: 0 }),
  Object.freeze({ column: 0, row: 1 }),
  Object.freeze({ column: 0, row: -1 }),
]);

function getNeighbors(tile: TileState): readonly TileId[] {
  return ORTHOGONAL_DIRECTIONS.map(({ column, row }) =>
    createTileId(tile.column + column, tile.row + row),
  );
}

function shuffle<T>(values: readonly T[], random: XorShift32): T[] {
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = random.nextUint32() % (index + 1);
    const current = shuffled[index];
    const replacement = shuffled[swapIndex];

    if (current !== undefined && replacement !== undefined) {
      shuffled[index] = replacement;
      shuffled[swapIndex] = current;
    }
  }

  return shuffled;
}

function smoothCircularSamples(samples: readonly number[]): readonly number[] {
  return Object.freeze(
    samples.map((sample, index) => {
      const previous = samples[(index - 1 + samples.length) % samples.length] ?? sample;
      const next = samples[(index + 1) % samples.length] ?? sample;
      return previous * 0.25 + sample * 0.5 + next * 0.25;
    }),
  );
}

function createCoastSamples(random: XorShift32): readonly number[] {
  let samples: readonly number[] = Object.freeze(
    Array.from({ length: COAST_SAMPLE_COUNT }, () => 0.82 + random.nextFloat() * 0.22),
  );
  samples = smoothCircularSamples(samples);
  return smoothCircularSamples(samples);
}

function getCoastRadius(samples: readonly number[], angle: number): number {
  const normalized = ((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
  const samplePosition = normalized * samples.length;
  const leftIndex = Math.floor(samplePosition) % samples.length;
  const rightIndex = (leftIndex + 1) % samples.length;
  const mix = samplePosition - Math.floor(samplePosition);
  const left = samples[leftIndex] ?? 0.9;
  const right = samples[rightIndex] ?? left;
  return left + (right - left) * mix;
}

function isConnected(landIds: ReadonlySet<TileId>): boolean {
  const start = landIds.values().next().value;

  if (start === undefined) {
    return false;
  }

  const visited = new Set<TileId>([start]);
  const queue: TileId[] = [start];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const tileId = queue[cursor];

    if (tileId === undefined) {
      continue;
    }

    const [columnText, rowText] = tileId.split(":");
    const column = Number(columnText);
    const row = Number(rowText);

    for (const direction of ORTHOGONAL_DIRECTIONS) {
      const neighborId = createTileId(column + direction.column, row + direction.row);

      if (landIds.has(neighborId) && !visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }
  }

  return visited.size === landIds.size;
}

export function getLandShoreDepths(tiles: readonly TileState[]): ReadonlyMap<TileId, number> {
  const landTiles = tiles.filter(({ state }) => state !== "Void");
  const landIds = new Set(landTiles.map(({ tileId }) => tileId));
  const landById = new Map(landTiles.map((tile) => [tile.tileId, tile] as const));
  const depths = new Map<TileId, number>();
  let frontier = landTiles
    .filter((tile) => getNeighbors(tile).some((neighborId) => !landIds.has(neighborId)))
    .map(({ tileId }) => tileId);

  for (const tileId of frontier) {
    depths.set(tileId, 0);
  }

  let depth = 1;

  while (frontier.length > 0 && depths.size < landTiles.length) {
    const nextFrontier: TileId[] = [];

    for (const tileId of frontier) {
      const tile = landById.get(tileId);

      if (tile === undefined) {
        continue;
      }

      for (const neighborId of getNeighbors(tile)) {
        if (landIds.has(neighborId) && !depths.has(neighborId)) {
          depths.set(neighborId, depth);
          nextFrontier.push(neighborId);
        }
      }
    }

    frontier = nextFrontier;
    depth += 1;
  }

  return depths;
}

function carveLakes(
  tiles: readonly TileState[],
  config: GameConfigV1,
  random: XorShift32,
): readonly TileState[] {
  let landIds = new Set(
    tiles.filter(({ state }) => state === "Stable").map(({ tileId }) => tileId),
  );
  const minimumLandCount = Math.max(config.participantCount * 5, Math.ceil(landIds.size * 0.72));
  const lakeCount = Math.max(
    1,
    Math.min(3, Math.floor(Math.min(config.arenaColumns, config.arenaRows) / 8)),
  );
  const carvedIds = new Set<TileId>();

  for (let lakeIndex = 0; lakeIndex < lakeCount; lakeIndex += 1) {
    const currentTiles = tiles.map((tile) =>
      carvedIds.has(tile.tileId) ? Object.freeze({ ...tile, state: "Void" as const }) : tile,
    );
    const depths = getLandShoreDepths(currentTiles);
    const seeds = shuffle(
      currentTiles.filter(
        (tile) =>
          tile.state === "Stable" &&
          (depths.get(tile.tileId) ?? 0) >= 2 &&
          !carvedIds.has(tile.tileId),
      ),
      random,
    );
    const targetSize = Math.min(7, 2 + (random.nextUint32() % 5));
    let accepted: readonly TileId[] | undefined;

    for (const seed of seeds) {
      const lake = new Set<TileId>([seed.tileId]);
      let frontier = getNeighbors(seed).filter(
        (tileId) => landIds.has(tileId) && (depths.get(tileId) ?? 0) >= 2,
      );

      while (lake.size < targetSize && frontier.length > 0) {
        const selectionIndex = random.nextUint32() % frontier.length;
        const selected = frontier[selectionIndex];
        frontier = frontier.filter((tileId) => tileId !== selected);

        if (selected === undefined || lake.has(selected)) {
          continue;
        }

        lake.add(selected);
        const selectedTile = currentTiles.find(({ tileId }) => tileId === selected);

        if (selectedTile !== undefined) {
          frontier.push(
            ...getNeighbors(selectedTile).filter(
              (tileId) =>
                landIds.has(tileId) &&
                !lake.has(tileId) &&
                (depths.get(tileId) ?? 0) >= 2 &&
                !frontier.includes(tileId),
            ),
          );
        }
      }

      const nextLandIds = new Set([...landIds].filter((tileId) => !lake.has(tileId)));

      if (lake.size >= 2 && nextLandIds.size >= minimumLandCount && isConnected(nextLandIds)) {
        accepted = Object.freeze([...lake]);
        landIds = nextLandIds;
        break;
      }
    }

    if (accepted === undefined) {
      break;
    }

    for (const tileId of accepted) {
      carvedIds.add(tileId);
    }
  }

  return Object.freeze(
    tiles.map((tile) =>
      carvedIds.has(tile.tileId) ? Object.freeze({ ...tile, state: "Void" as const }) : tile,
    ),
  );
}

export function createArenaTiles(config: GameConfigV1, random: XorShift32): readonly TileState[] {
  const centerX = config.arenaColumns / 2;
  const centerY = config.arenaRows / 2;
  const radiusX = Math.max(2.5, (config.arenaColumns - 2.2) / 2);
  const radiusY = Math.max(2.5, (config.arenaRows - 2.2) / 2);
  const coastSamples = createCoastSamples(random);
  const candidates: Array<{
    readonly column: number;
    readonly row: number;
    readonly score: number;
  }> = [];

  for (let row = 0; row < config.arenaRows; row += 1) {
    for (let column = 0; column < config.arenaColumns; column += 1) {
      const offsetX = column + 0.5 - centerX;
      const offsetY = row + 0.5 - centerY;
      const angle = Math.atan2(offsetY / radiusY, offsetX / radiusX);
      const normalizedRadius = Math.hypot(offsetX / radiusX, offsetY / radiusY);
      candidates.push(
        Object.freeze({
          column,
          row,
          score: normalizedRadius / getCoastRadius(coastSamples, angle),
        }),
      );
    }
  }

  const targetLandCount = Math.max(
    config.participantCount * 6,
    Math.round(config.arenaColumns * config.arenaRows * 0.58),
  );
  const landIds = new Set(
    candidates
      .toSorted(
        (left, right) =>
          left.score - right.score || left.row - right.row || left.column - right.column,
      )
      .slice(0, targetLandCount)
      .map(({ column, row }) => createTileId(column, row)),
  );
  const tiles = candidates.map(({ column, row }) => {
    const tileId = createTileId(column, row);
    return Object.freeze({
      tileId,
      column,
      row,
      state: landIds.has(tileId) ? ("Stable" as const) : ("Void" as const),
    });
  });

  return carveLakes(Object.freeze(tiles), config, random);
}

export function createRectangularArenaTiles(config: GameConfigV1): readonly TileState[] {
  return Object.freeze(
    Array.from({ length: config.arenaColumns * config.arenaRows }, (_, index) => {
      const column = index % config.arenaColumns;
      const row = Math.floor(index / config.arenaColumns);
      return Object.freeze({
        tileId: createTileId(column, row),
        column,
        row,
        state: "Stable" as const,
      });
    }),
  );
}

export function createParticipantSpawnPositions(
  tiles: readonly TileState[],
  participantCount: number,
  phase: number,
): readonly Vector2[] {
  const stableTiles = tiles.filter(({ state }) => state === "Stable");
  const depths = getLandShoreDepths(tiles);
  const center = stableTiles.reduce(
    (sum, tile) => ({ x: sum.x + tile.column + 0.5, y: sum.y + tile.row + 0.5 }),
    { x: 0, y: 0 },
  );
  center.x /= Math.max(1, stableTiles.length);
  center.y /= Math.max(1, stableTiles.length);
  const maximumDepth = Math.max(0, ...depths.values());
  const preferredDepth = maximumDepth >= 2 ? 1 : 0;
  const candidates = stableTiles.filter((tile) => (depths.get(tile.tileId) ?? 0) >= preferredDepth);
  const radius =
    Math.min(
      Math.max(...stableTiles.map((tile) => Math.abs(tile.column + 0.5 - center.x))),
      Math.max(...stableTiles.map((tile) => Math.abs(tile.row + 0.5 - center.y))),
    ) * 0.62;
  const remaining = new Map(candidates.map((tile) => [tile.tileId, tile] as const));
  const positions: Vector2[] = [];

  for (let index = 0; index < participantCount; index += 1) {
    const angle = phase + (index / participantCount) * Math.PI * 2;
    const target = {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
    const selected = [...remaining.values()].toSorted((left, right) => {
      const leftDistance = Math.hypot(left.column + 0.5 - target.x, left.row + 0.5 - target.y);
      const rightDistance = Math.hypot(right.column + 0.5 - target.x, right.row + 0.5 - target.y);
      return (
        leftDistance - rightDistance ||
        (depths.get(right.tileId) ?? 0) - (depths.get(left.tileId) ?? 0) ||
        left.tileId.localeCompare(right.tileId)
      );
    })[0];

    if (selected === undefined) {
      throw new Error("arena does not contain enough safe participant spawn tiles");
    }

    remaining.delete(selected.tileId);
    positions.push(Object.freeze({ x: selected.column + 0.5, y: selected.row + 0.5 }));
  }

  return Object.freeze(positions);
}
