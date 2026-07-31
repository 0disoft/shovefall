import type {
  RenderFrameV1,
  RenderParticipantV1,
  TileId,
  TileState,
} from "../simulation/contracts";
import {
  dotVectors,
  normalizeVector,
  subtractVectors,
  type Vector2,
  vectorLength,
} from "../simulation/math";
import { getStartingMovementMultiplier } from "../simulation/starting-attributes";
import {
  DEFAULT_GAMEPLAY_TUNING,
  getMassDodgeSpeedMultiplier,
  type GameplayTuningV1,
} from "../simulation/tuning";

export interface BotNavigationTerrain {
  readonly columns: number;
  readonly rows: number;
  readonly center: Vector2;
  readonly stableTiles: readonly TileState[];
  readonly stableTileDepths: ReadonlyMap<TileId, number>;
  readonly tilesById: ReadonlyMap<TileId, TileState>;
}

const CARDINAL_NEIGHBORS = Object.freeze([
  Object.freeze({ x: 1, y: 0 }),
  Object.freeze({ x: -1, y: 0 }),
  Object.freeze({ x: 0, y: 1 }),
  Object.freeze({ x: 0, y: -1 }),
] as const);
const PATH_NEIGHBORS = Object.freeze([
  ...CARDINAL_NEIGHBORS,
  Object.freeze({ x: 1, y: 1 }),
  Object.freeze({ x: 1, y: -1 }),
  Object.freeze({ x: -1, y: 1 }),
  Object.freeze({ x: -1, y: -1 }),
] as const);
const PATH_SAMPLE_DISTANCE = 0.2;
const PATH_LOOKAHEAD_TILES = 6;
const MAX_PATH_EXPANSIONS = 384;
const DODGE_SAFETY_SAMPLE_DISTANCE = 0.25;
const DODGE_DIRECTION_OFFSETS = Object.freeze([
  0,
  Math.PI / 8,
  -Math.PI / 8,
  Math.PI / 4,
  -Math.PI / 4,
  (Math.PI * 3) / 8,
  (-Math.PI * 3) / 8,
  Math.PI / 2,
  -Math.PI / 2,
  Math.PI,
]);

function toTileId(column: number, row: number): TileId {
  return `${column}:${row}`;
}

function tileCenter(tileId: TileId): Vector2 {
  const [column = 0, row = 0] = tileId.split(":").map(Number);
  return Object.freeze({ x: column + 0.5, y: row + 0.5 });
}

function rotateVector(vector: Vector2, radians: number): Vector2 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return Object.freeze({
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  });
}

export function createBotNavigationTerrain(tiles: RenderFrameV1["tiles"]): BotNavigationTerrain {
  const dimensions = tiles.reduce(
    (result, tile) => ({
      columns: Math.max(result.columns, tile.column + 1),
      rows: Math.max(result.rows, tile.row + 1),
    }),
    { columns: 1, rows: 1 },
  );
  const stableTiles = tiles.filter(({ state }) => state === "Stable");
  const tilesById = new Map(tiles.map((tile) => [tile.tileId, tile] as const));
  const stableTileIds = new Set(stableTiles.map(({ tileId }) => tileId));
  const stableTilesById = new Map(stableTiles.map((tile) => [tile.tileId, tile] as const));
  const stableTileDepths = new Map<TileId, number>();
  let frontier = stableTiles
    .filter(({ column, row }) =>
      CARDINAL_NEIGHBORS.some(({ x, y }) => !stableTileIds.has(toTileId(column + x, row + y))),
    )
    .map(({ tileId }) => tileId);

  for (const tileId of frontier) {
    stableTileDepths.set(tileId, 0);
  }

  let depth = 1;
  while (frontier.length > 0 && stableTileDepths.size < stableTiles.length) {
    const nextFrontier: TileId[] = [];
    for (const tileId of frontier) {
      const tile = stableTilesById.get(tileId);
      if (tile === undefined) {
        continue;
      }

      for (const { x, y } of CARDINAL_NEIGHBORS) {
        const neighborId = toTileId(tile.column + x, tile.row + y);
        if (stableTileIds.has(neighborId) && !stableTileDepths.has(neighborId)) {
          stableTileDepths.set(neighborId, depth);
          nextFrontier.push(neighborId);
        }
      }
    }
    frontier = nextFrontier;
    depth += 1;
  }

  const center = stableTiles.reduce(
    (sum, tile) => ({ x: sum.x + tile.column + 0.5, y: sum.y + tile.row + 0.5 }),
    { x: 0, y: 0 },
  );
  center.x /= Math.max(1, stableTiles.length);
  center.y /= Math.max(1, stableTiles.length);

  return Object.freeze({
    ...dimensions,
    center: Object.freeze(center),
    stableTiles: Object.freeze(stableTiles),
    stableTileDepths,
    tilesById,
  });
}

export function createBotBlockedTileIds(frame: RenderFrameV1): ReadonlySet<TileId> {
  return new Set([
    ...frame.brickWalls.map(({ tileId }) => tileId),
    ...frame.trees.map(({ tileId }) => tileId),
  ]);
}

function isTileTraversable(
  terrain: BotNavigationTerrain,
  blockedTileIds: ReadonlySet<TileId>,
  column: number,
  row: number,
): boolean {
  const tileId = toTileId(column, row);
  return terrain.tilesById.get(tileId)?.state === "Stable" && !blockedTileIds.has(tileId);
}

function isPositionTraversable(
  terrain: BotNavigationTerrain,
  blockedTileIds: ReadonlySet<TileId>,
  positionX: number,
  positionY: number,
  radius: number,
): boolean {
  const clearance = Math.max(0, radius * 0.92);
  return (
    isTileTraversable(terrain, blockedTileIds, Math.floor(positionX), Math.floor(positionY)) &&
    isTileTraversable(
      terrain,
      blockedTileIds,
      Math.floor(positionX + clearance),
      Math.floor(positionY),
    ) &&
    isTileTraversable(
      terrain,
      blockedTileIds,
      Math.floor(positionX - clearance),
      Math.floor(positionY),
    ) &&
    isTileTraversable(
      terrain,
      blockedTileIds,
      Math.floor(positionX),
      Math.floor(positionY + clearance),
    ) &&
    isTileTraversable(
      terrain,
      blockedTileIds,
      Math.floor(positionX),
      Math.floor(positionY - clearance),
    )
  );
}

export function getBotNavigationPositionDepth(
  terrain: BotNavigationTerrain,
  blockedTileIds: ReadonlySet<TileId>,
  position: Vector2,
  radius = 0,
): number | undefined {
  if (!isPositionTraversable(terrain, blockedTileIds, position.x, position.y, radius)) {
    return undefined;
  }
  return terrain.stableTileDepths.get(toTileId(Math.floor(position.x), Math.floor(position.y)));
}

export function isBotNavigationSegmentClear(
  terrain: BotNavigationTerrain,
  blockedTileIds: ReadonlySet<TileId>,
  start: Vector2,
  end: Vector2,
  radius = 0,
): boolean {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const distance = Math.hypot(deltaX, deltaY);
  const sampleCount = Math.max(1, Math.ceil(distance / PATH_SAMPLE_DISTANCE));

  for (let sample = 0; sample <= sampleCount; sample += 1) {
    const ratio = sample / sampleCount;
    if (
      !isPositionTraversable(
        terrain,
        blockedTileIds,
        start.x + deltaX * ratio,
        start.y + deltaY * ratio,
        radius,
      )
    ) {
      return false;
    }
  }
  return true;
}

export function getBotEdgeDistance(
  participant: RenderParticipantV1,
  terrain: BotNavigationTerrain,
): number {
  const tileId = toTileId(Math.floor(participant.position.x), Math.floor(participant.position.y));
  const depth = terrain.stableTileDepths.get(tileId);
  return depth === undefined ? 0 : depth + 0.5;
}

export function getImmediateBotTileEscape(
  participant: RenderParticipantV1,
  terrain: BotNavigationTerrain,
  blockedTileIds: ReadonlySet<TileId>,
): Vector2 | undefined {
  const column = Math.floor(participant.position.x);
  const row = Math.floor(participant.position.y);
  const currentTile = terrain.tilesById.get(toTileId(column, row));

  if (
    currentTile?.state === "Stable" &&
    !blockedTileIds.has(currentTile.tileId) &&
    getBotEdgeDistance(participant, terrain) > 0.5
  ) {
    return undefined;
  }

  const currentIsStable = currentTile?.state === "Stable";
  let safeTile: TileState | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const tile of terrain.stableTiles) {
    if (blockedTileIds.has(tile.tileId)) {
      continue;
    }
    const position = Object.freeze({ x: tile.column + 0.5, y: tile.row + 0.5 });
    const distance = vectorLength(subtractVectors(position, participant.position));
    const depth = terrain.stableTileDepths.get(tile.tileId) ?? 0;
    if (currentIsStable && (distance > 2.5 || depth === 0)) {
      continue;
    }
    const score = currentIsStable ? depth * 4 - distance : depth * 0.1 - distance;
    if (
      score > bestScore ||
      (score === bestScore && tile.tileId.localeCompare(safeTile?.tileId ?? "") < 0)
    ) {
      safeTile = tile;
      bestScore = score;
    }
  }

  return safeTile === undefined
    ? undefined
    : findBotNavigationDirection(
        terrain,
        blockedTileIds,
        participant.position,
        Object.freeze({ x: safeTile.column + 0.5, y: safeTile.row + 0.5 }),
        participant.radius,
      );
}

function canTraverseNeighbor(
  terrain: BotNavigationTerrain,
  blockedTileIds: ReadonlySet<TileId>,
  column: number,
  row: number,
  delta: Vector2,
): boolean {
  const nextColumn = column + delta.x;
  const nextRow = row + delta.y;
  if (!isTileTraversable(terrain, blockedTileIds, nextColumn, nextRow)) {
    return false;
  }
  if (delta.x === 0 || delta.y === 0) {
    return true;
  }
  return (
    isTileTraversable(terrain, blockedTileIds, column + delta.x, row) &&
    isTileTraversable(terrain, blockedTileIds, column, row + delta.y)
  );
}

function reconstructPath(
  parents: ReadonlyMap<TileId, TileId | null>,
  destination: TileId,
): readonly TileId[] {
  const reversed: TileId[] = [];
  let cursor: TileId | null | undefined = destination;
  while (cursor !== null && cursor !== undefined) {
    reversed.push(cursor);
    cursor = parents.get(cursor);
  }
  return Object.freeze(reversed.toReversed());
}

export function findBotNavigationDirection(
  terrain: BotNavigationTerrain,
  blockedTileIds: ReadonlySet<TileId>,
  start: Vector2,
  goal: Vector2,
  radius = 0,
): Vector2 | undefined {
  const direct = normalizeVector(subtractVectors(goal, start));
  if (vectorLength(direct) === 0) {
    return undefined;
  }
  if (isBotNavigationSegmentClear(terrain, blockedTileIds, start, goal, radius)) {
    return direct;
  }

  const startColumn = Math.floor(start.x);
  const startRow = Math.floor(start.y);
  const startId = toTileId(startColumn, startRow);
  const goalId = toTileId(Math.floor(goal.x), Math.floor(goal.y));

  const queue: TileId[] = [startId];
  const parents = new Map<TileId, TileId | null>([[startId, null]]);
  let queueIndex = 0;
  let bestId = startId;
  let bestDistance = vectorLength(subtractVectors(tileCenter(startId), goal));
  let bestDepth = terrain.stableTileDepths.get(startId) ?? 0;

  while (queueIndex < queue.length && queueIndex < MAX_PATH_EXPANSIONS) {
    const currentId = queue[queueIndex];
    queueIndex += 1;
    if (currentId === undefined) {
      continue;
    }
    const currentTile = terrain.tilesById.get(currentId);
    if (currentTile === undefined) {
      continue;
    }
    const currentDistance = vectorLength(subtractVectors(tileCenter(currentId), goal));
    const currentDepth = terrain.stableTileDepths.get(currentId) ?? 0;
    if (
      currentDistance < bestDistance ||
      (currentDistance === bestDistance && currentDepth > bestDepth) ||
      (currentDistance === bestDistance && currentDepth === bestDepth && currentId < bestId)
    ) {
      bestId = currentId;
      bestDistance = currentDistance;
      bestDepth = currentDepth;
    }
    if (currentId === goalId) {
      bestId = currentId;
      break;
    }

    for (const delta of PATH_NEIGHBORS) {
      if (
        !canTraverseNeighbor(terrain, blockedTileIds, currentTile.column, currentTile.row, delta)
      ) {
        continue;
      }
      const neighborId = toTileId(currentTile.column + delta.x, currentTile.row + delta.y);
      if (parents.has(neighborId)) {
        continue;
      }
      parents.set(neighborId, currentId);
      queue.push(neighborId);
    }
  }

  const path = reconstructPath(parents, bestId);
  if (path.length < 2) {
    return undefined;
  }
  let waypoint = tileCenter(path[1] ?? bestId);
  const furthestLookahead = Math.min(path.length - 1, PATH_LOOKAHEAD_TILES);
  for (let index = furthestLookahead; index >= 1; index -= 1) {
    const candidateId = path[index];
    if (candidateId === undefined) {
      continue;
    }
    const candidate = tileCenter(candidateId);
    if (isBotNavigationSegmentClear(terrain, blockedTileIds, start, candidate, radius)) {
      waypoint = candidate;
      break;
    }
  }
  return normalizeVector(subtractVectors(waypoint, start));
}

function getBotDodgeDistance(
  participant: RenderParticipantV1,
  gameplayTuning: GameplayTuningV1,
): number {
  return (
    gameplayTuning.dodgeSpeed *
    gameplayTuning.dodgeActiveTicks *
    getMassDodgeSpeedMultiplier(participant.massFactor) *
    getStartingMovementMultiplier(participant.startingAttributes)
  );
}

function getDodgeLandingDepth(
  participant: RenderParticipantV1,
  direction: Vector2,
  terrain: BotNavigationTerrain,
  blockedTileIds: ReadonlySet<TileId>,
  gameplayTuning: GameplayTuningV1,
): number | undefined {
  const normalizedDirection = normalizeVector(direction);
  if (vectorLength(normalizedDirection) === 0) {
    return undefined;
  }
  const distance = getBotDodgeDistance(participant, gameplayTuning);
  const sampleCount = Math.max(1, Math.ceil(distance / DODGE_SAFETY_SAMPLE_DISTANCE));
  for (let sample = 1; sample <= sampleCount; sample += 1) {
    const sampleRatio = distance * (sample / sampleCount);
    const positionX = participant.position.x + normalizedDirection.x * sampleRatio;
    const positionY = participant.position.y + normalizedDirection.y * sampleRatio;
    if (!isPositionTraversable(terrain, blockedTileIds, positionX, positionY, participant.radius)) {
      return undefined;
    }
  }
  const landingX = participant.position.x + normalizedDirection.x * distance;
  const landingY = participant.position.y + normalizedDirection.y * distance;
  return terrain.stableTileDepths.get(toTileId(Math.floor(landingX), Math.floor(landingY)));
}

export function getSafeBotDodgeDirection(
  participant: RenderParticipantV1,
  preferredDirection: Vector2,
  terrain: BotNavigationTerrain,
  blockedTileIds: ReadonlySet<TileId>,
  gameplayTuning: GameplayTuningV1 = DEFAULT_GAMEPLAY_TUNING,
): Vector2 | undefined {
  const preferred = normalizeVector(preferredDirection);
  if (vectorLength(preferred) === 0) {
    return undefined;
  }
  let safestDirection: Vector2 | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const radians of DODGE_DIRECTION_OFFSETS) {
    const candidate = normalizeVector(rotateVector(preferred, radians));
    const landingDepth = getDodgeLandingDepth(
      participant,
      candidate,
      terrain,
      blockedTileIds,
      gameplayTuning,
    );
    if (landingDepth === undefined) {
      continue;
    }
    const score = dotVectors(candidate, preferred) * 8 + landingDepth;
    if (score > bestScore) {
      safestDirection = candidate;
      bestScore = score;
    }
  }
  return safestDirection;
}
