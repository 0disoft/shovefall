import { describe, expect, it } from "vitest";
import { createNeutralCommand, normalizeGameConfig } from "../src/simulation/contracts";
import { SimulationWorld } from "../src/simulation/world";

describe("tree obstacles", () => {
  it("starts the public seventy-participant island with exactly sixty trees", () => {
    const frame = new SimulationWorld(
      normalizeGameConfig({
        participantCount: 70,
        arenaColumns: 57,
        arenaRows: 48,
      }),
      "public-seventy-tree-count",
    ).createRenderFrame();

    expect(frame.trees).toHaveLength(60);
  });

  it("generates deterministic inland trees away from all starting bodies", () => {
    const config = normalizeGameConfig({
      participantCount: 50,
      arenaColumns: 48,
      arenaRows: 40,
    });
    const left = new SimulationWorld(config, "tree-layout").createRenderFrame();
    const right = new SimulationWorld(config, "tree-layout").createRenderFrame();

    expect(left.trees).toEqual(right.trees);
    expect(left.trees.length).toBeGreaterThanOrEqual(14);
    expect(left.trees.length).toBeLessThanOrEqual(36);

    for (const tree of left.trees) {
      expect(
        left.participants.every(
          ({ position }) =>
            Math.max(
              Math.abs(Math.floor(position.x) - tree.column),
              Math.abs(Math.floor(position.y) - tree.row),
            ) > 1,
        ),
      ).toBe(true);
    }
  });

  it("stops direct movement at the tree trunk tile", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({
        participantCount: 4,
        arenaColumns: 9,
        arenaRows: 7,
        itemsEnabled: false,
      }),
      "tree-contact",
      {
        arenaLayout: "rectangular-fixture",
        treeOverrides: [
          Object.freeze({
            definitionId: "tree",
            tileId: "4:3",
            column: 4,
            row: 3,
          }),
        ],
        participantOverrides: [
          { actorId: 1, position: { x: 2.5, y: 3.5 } },
          { actorId: 2, position: { x: 7.5, y: 1.5 } },
          { actorId: 3, position: { x: 7.5, y: 3.5 } },
          { actorId: 4, position: { x: 7.5, y: 5.5 } },
        ],
      },
    );

    for (let tick = 0; tick < 40; tick += 1) {
      world.step([
        {
          ...createNeutralCommand(world.tick, 1),
          move: { x: 1, y: 0 },
        },
      ]);
    }

    const actor = world.createRenderFrame().participants.find(({ actorId }) => actorId === 1);
    expect(actor?.position.x).toBeLessThanOrEqual(3.660_1);
    expect(actor?.velocity.x).toBe(0);
  });
});
