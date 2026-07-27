import { getLandShoreDepths } from "./arena";
import type { ParticipantState, TileState, TreeObstacleState } from "./contracts";
import type { XorShift32 } from "./random";

const TREE_DENSITY = 0.03;
const MINIMUM_TREE_COUNT = 14;
const MAXIMUM_TREE_COUNT = 36;
const MINIMUM_SHORE_DEPTH = 2;
const PARTICIPANT_CLEARANCE_TILES = 1;
const TREE_SPACING_TILES = 2;

function tileDistance(
  left: Readonly<{ column: number; row: number }>,
  right: Readonly<{ column: number; row: number }>,
): number {
  return Math.max(Math.abs(left.column - right.column), Math.abs(left.row - right.row));
}

function shuffleTiles(tiles: readonly TileState[], random: XorShift32): TileState[] {
  const shuffled = [...tiles];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = random.nextUint32() % (index + 1);
    const current = shuffled[index];
    const swap = shuffled[swapIndex];

    if (current !== undefined && swap !== undefined) {
      shuffled[index] = swap;
      shuffled[swapIndex] = current;
    }
  }

  return shuffled;
}

export function createTreeObstacles(
  tiles: readonly TileState[],
  participants: readonly ParticipantState[],
  random: XorShift32,
): readonly TreeObstacleState[] {
  const stableTiles = tiles.filter(({ state }) => state === "Stable");
  const targetCount = Math.min(
    MAXIMUM_TREE_COUNT,
    Math.max(MINIMUM_TREE_COUNT, Math.round(stableTiles.length * TREE_DENSITY)),
  );
  const shoreDepths = getLandShoreDepths(tiles);
  const occupiedTiles = participants.map(({ body }) => ({
    column: Math.floor(body.position.x),
    row: Math.floor(body.position.y),
  }));
  const candidates = shuffleTiles(
    stableTiles.filter(
      (tile) =>
        (shoreDepths.get(tile.tileId) ?? 0) >= MINIMUM_SHORE_DEPTH &&
        occupiedTiles.every(
          (occupied) => tileDistance(tile, occupied) > PARTICIPANT_CLEARANCE_TILES,
        ),
    ),
    random,
  );
  const trees: TreeObstacleState[] = [];

  for (const tile of candidates) {
    if (trees.length >= targetCount) {
      break;
    }

    if (trees.some((tree) => tileDistance(tree, tile) < TREE_SPACING_TILES)) {
      continue;
    }

    trees.push(
      Object.freeze({
        definitionId: "tree",
        tileId: tile.tileId,
        column: tile.column,
        row: tile.row,
      }),
    );
  }

  return Object.freeze(
    trees.toSorted((left, right) => left.row - right.row || left.column - right.column),
  );
}
