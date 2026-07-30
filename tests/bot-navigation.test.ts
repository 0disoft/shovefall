import { describe, expect, it } from "vitest";
import {
  createBotBlockedTileIds,
  createBotNavigationTerrain,
  findBotNavigationDirection,
  getSafeBotDodgeDirection,
  isBotNavigationSegmentClear,
} from "../src/ai/bot-navigation";
import { normalizeGameConfig } from "../src/simulation/contracts";
import { addVectors, scaleVector } from "../src/simulation/math";
import { normalizeGameplayTuning } from "../src/simulation/tuning";
import { SimulationWorld } from "../src/simulation/world";

function createTreeCorridorWorld(): SimulationWorld {
  return new SimulationWorld(
    normalizeGameConfig({
      participantCount: 4,
      arenaColumns: 9,
      arenaRows: 7,
      initialItemCount: 0,
      itemsEnabled: false,
    }),
    "bot-tree-corridor",
    {
      arenaLayout: "rectangular-fixture",
      treeOverrides: [Object.freeze({ definitionId: "tree", tileId: "4:3", column: 4, row: 3 })],
      participantOverrides: [
        { actorId: 1, position: { x: 6.5, y: 3.5 } },
        { actorId: 2, position: { x: 2.5, y: 3.5 } },
        { actorId: 3, position: { x: 7.5, y: 1.5 } },
        { actorId: 4, position: { x: 7.5, y: 5.5 } },
      ],
    },
  );
}

describe("bot navigation", () => {
  it("finds a deterministic clear first step around a tree instead of steering into it", () => {
    const frame = createTreeCorridorWorld().createRenderFrame();
    const terrain = createBotNavigationTerrain(frame.tiles);
    const blockedTileIds = createBotBlockedTileIds(frame);
    const actor = frame.participants.find(({ actorId }) => actorId === 2);
    const target = frame.participants.find(({ actorId }) => actorId === 1);
    expect(actor).toBeDefined();
    expect(target).toBeDefined();

    const direction = findBotNavigationDirection(
      terrain,
      blockedTileIds,
      actor?.position ?? { x: 0, y: 0 },
      target?.position ?? { x: 0, y: 0 },
      actor?.radius ?? 0,
    );
    expect(direction).toBeDefined();
    expect(Math.abs(direction?.y ?? 0)).toBeGreaterThan(0.2);
    const probeEnd = addVectors(
      actor?.position ?? { x: 0, y: 0 },
      scaleVector(direction ?? { x: 0, y: 0 }, 1.25),
    );
    expect(
      isBotNavigationSegmentClear(
        terrain,
        blockedTileIds,
        actor?.position ?? { x: 0, y: 0 },
        probeEnd,
        actor?.radius ?? 0,
      ),
    ).toBe(true);
  });

  it("rejects a dodge route through a tree and chooses another stable direction", () => {
    const frame = createTreeCorridorWorld().createRenderFrame();
    const terrain = createBotNavigationTerrain(frame.tiles);
    const blockedTileIds = createBotBlockedTileIds(frame);
    const actor = frame.participants.find(({ actorId }) => actorId === 2);
    expect(actor).toBeDefined();

    const direction = getSafeBotDodgeDirection(
      actor ?? frame.participants[0]!,
      { x: 1, y: 0 },
      terrain,
      blockedTileIds,
    );
    expect(direction).toBeDefined();
    expect(Math.abs(direction?.y ?? 0)).toBeGreaterThan(0.2);
  });

  it("uses the effective gameplay tuning when predicting a dodge landing", () => {
    const frame = createTreeCorridorWorld().createRenderFrame();
    const terrain = createBotNavigationTerrain(frame.tiles);
    const blockedTileIds = createBotBlockedTileIds(frame);
    const actor = frame.participants.find(({ actorId }) => actorId === 2);
    expect(actor).toBeDefined();

    const direction = getSafeBotDodgeDirection(
      actor ?? frame.participants[0]!,
      { x: 1, y: 0 },
      terrain,
      blockedTileIds,
      normalizeGameplayTuning({ dodgeSpeed: 0.07, dodgeActiveTicks: 3 }),
    );

    expect(direction?.x).toBeGreaterThan(0.99);
    expect(Math.abs(direction?.y ?? 1)).toBeLessThan(0.01);
  });
});
