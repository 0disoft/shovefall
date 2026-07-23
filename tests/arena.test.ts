import { describe, expect, it } from "vitest";
import { createArenaTiles, createParticipantSpawnPositions } from "../src/simulation/arena";
import {
  advanceCollapse,
  createCollapsePlan,
  MINIMUM_REMAINING_LAND_RATIO,
} from "../src/simulation/collapse";
import {
  createTileId,
  normalizeGameConfig,
  type TileId,
  type TileState,
} from "../src/simulation/contracts";
import { RandomStreamSet } from "../src/simulation/random";

const DIRECTIONS = Object.freeze([
  Object.freeze({ column: 1, row: 0 }),
  Object.freeze({ column: -1, row: 0 }),
  Object.freeze({ column: 0, row: 1 }),
  Object.freeze({ column: 0, row: -1 }),
]);

function getComponents(tileIds: ReadonlySet<TileId>): readonly ReadonlySet<TileId>[] {
  const remaining = new Set(tileIds);
  const components: Set<TileId>[] = [];

  while (remaining.size > 0) {
    const start = remaining.values().next().value;

    if (start === undefined) {
      break;
    }
    const component = new Set<TileId>([start]);
    const queue = [start];
    remaining.delete(start);

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const tileId = queue[cursor];

      if (tileId === undefined) {
        continue;
      }

      const [columnText, rowText] = tileId.split(":");
      const column = Number(columnText);
      const row = Number(rowText);

      for (const direction of DIRECTIONS) {
        const neighborId = createTileId(column + direction.column, row + direction.row);

        if (remaining.delete(neighborId)) {
          component.add(neighborId);
          queue.push(neighborId);
        }
      }
    }

    components.push(component);
  }

  return components;
}

function getLakeComponents(
  tiles: readonly TileState[],
  columns: number,
  rows: number,
): readonly ReadonlySet<TileId>[] {
  const voidTiles = tiles.filter(({ state }) => state === "Void");
  const voidById = new Map(voidTiles.map((tile) => [tile.tileId, tile] as const));
  return getComponents(new Set(voidById.keys())).filter((component) =>
    [...component].every((tileId) => {
      const tile = voidById.get(tileId);
      return (
        tile !== undefined &&
        tile.column > 0 &&
        tile.row > 0 &&
        tile.column < columns - 1 &&
        tile.row < rows - 1
      );
    }),
  );
}

describe("procedural island arena", () => {
  const config = normalizeGameConfig({
    participantCount: 16,
    arenaColumns: 20,
    arenaRows: 16,
  });

  it("keeps the seeded coastline deterministic while varying it across seeds", () => {
    const create = (seed: string) =>
      createArenaTiles(config, new RandomStreamSet(seed).get("arena"));
    const left = create("same-island");

    expect(left).toEqual(create("same-island"));
    expect(left).not.toEqual(create("different-island"));
  });

  it("creates one connected playable island with enclosed lakes", () => {
    for (let seed = 0; seed < 24; seed += 1) {
      const tiles = createArenaTiles(config, new RandomStreamSet(`island-${seed}`).get("arena"));
      const landIds = new Set(
        tiles.filter(({ state }) => state === "Stable").map(({ tileId }) => tileId),
      );
      const lakes = getLakeComponents(tiles, config.arenaColumns, config.arenaRows);

      expect(getComponents(landIds)).toHaveLength(1);
      expect(lakes.length).toBeGreaterThanOrEqual(1);
      expect(landIds.size).toBeGreaterThan(config.participantCount * 5);
    }
  });

  it("places every default participant on a distinct supported interior tile", () => {
    const tiles = createArenaTiles(config, new RandomStreamSet("spawn-island").get("arena"));
    const stableIds = new Set(
      tiles.filter(({ state }) => state === "Stable").map(({ tileId }) => tileId),
    );
    const positions = createParticipantSpawnPositions(tiles, config.participantCount, 0.37);
    const spawnIds = positions.map(({ x, y }) => createTileId(Math.floor(x), Math.floor(y)));

    expect(new Set(spawnIds)).toHaveLength(config.participantCount);
    expect(spawnIds.every((tileId) => stableIds.has(tileId))).toBe(true);
  });

  it.each([
    { participantCount: 8, arenaColumns: 16, arenaRows: 13 },
    { participantCount: 16, arenaColumns: 20, arenaRows: 16 },
    { participantCount: 24, arenaColumns: 24, arenaRows: 19 },
    { participantCount: 32, arenaColumns: 28, arenaRows: 22 },
  ])(
    "keeps the $participantCount-player island connected through its protected 20% core",
    ({ participantCount, arenaColumns, arenaRows }) => {
      const tierConfig = normalizeGameConfig({ participantCount, arenaColumns, arenaRows });

      for (let seed = 0; seed < 8; seed += 1) {
        const streams = new RandomStreamSet(`tier-${participantCount}-${seed}`);
        const tiles = createArenaTiles(tierConfig, streams.get("arena"));
        const initialLandCount = tiles.filter(({ state }) => state === "Stable").length;
        const spawnPositions = createParticipantSpawnPositions(
          tiles,
          participantCount,
          streams.get("arena").nextFloat() * Math.PI * 2,
        );
        const plan = createCollapsePlan(
          tiles,
          arenaColumns,
          arenaRows,
          "fast",
          streams.get("collapse"),
        );
        const finalTiles = advanceCollapse(tiles, plan, plan.at(-1)?.voidTick ?? 0).tiles;
        const finalLandIds = new Set(
          finalTiles.filter(({ state }) => state !== "Void").map(({ tileId }) => tileId),
        );

        expect(spawnPositions).toHaveLength(participantCount);
        expect(finalLandIds.size).toBe(Math.ceil(initialLandCount * MINIMUM_REMAINING_LAND_RATIO));
        expect(getComponents(finalLandIds)).toHaveLength(1);
      }
    },
  );
});
