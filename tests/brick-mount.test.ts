import { describe, expect, it } from "vitest";
import { createNeutralCommand, normalizeGameConfig } from "../src/simulation/contracts";
import { SimulationWorld } from "../src/simulation/world";

function getActor(world: SimulationWorld, actorId: number) {
  const actor = world
    .createRenderFrame()
    .participants.find((participant) => participant.actorId === actorId);

  if (actor === undefined) {
    throw new Error(`missing actor ${actorId}`);
  }

  return actor;
}

describe("brick dodge mounting", () => {
  it("lands a dodge on the contacted wall, blocks shoves, and dismounts by movement", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({
        participantCount: 4,
        arenaColumns: 9,
        arenaRows: 7,
        roundLimitSeconds: 20,
        itemsEnabled: false,
      }),
      "brick-mount",
      {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 3.5, y: 3.5 },
            facing: { x: 1, y: 0 },
            startingItems: ["brick-bag"],
          },
          { actorId: 2, position: { x: 2.5, y: 3.5 }, facing: { x: 1, y: 0 } },
          { actorId: 3, position: { x: 6.5, y: 1.5 } },
          { actorId: 4, position: { x: 6.5, y: 5.5 } },
        ],
      },
    );

    world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);
    expect(world.createRenderFrame().brickWalls).toContainEqual(
      expect.objectContaining({ tileId: "4:3" }),
    );

    for (let tick = 0; tick < 20; tick += 1) {
      world.step([{ ...createNeutralCommand(world.tick, 1), move: { x: 0, y: -1 } }]);
    }

    for (let tick = 0; tick < 30; tick += 1) {
      world.step([{ ...createNeutralCommand(world.tick, 2), move: { x: 1, y: 0 } }]);
    }

    const landing = world.step([
      {
        ...createNeutralCommand(world.tick, 2),
        move: { x: 1, y: 0 },
        dodgePressed: true,
      },
    ]);
    const mounted = getActor(world, 2);
    expect(landing.events).toContainEqual(
      expect.objectContaining({ kind: "dodge-started", actorId: 2 }),
    );
    expect(mounted.action).toBe("Anchored");
    expect(mounted.position).toEqual({ x: 4.5, y: 3.5 });
    expect(mounted.velocity).toEqual({ x: 0, y: 0 });

    for (let tick = 0; tick < 20; tick += 1) {
      world.step([{ ...createNeutralCommand(world.tick, 1), move: { x: 0, y: 1 } }]);
    }

    const blocked = world.step([
      { ...createNeutralCommand(world.tick, 1), shovePressed: true, move: { x: 1, y: 0 } },
      { ...createNeutralCommand(world.tick, 2), shovePressed: true },
    ]);
    expect(blocked.events.some(({ kind }) => kind === "shove-hit")).toBe(false);
    expect(getActor(world, 2).action).toBe("Anchored");
    expect(getActor(world, 2).position).toEqual({ x: 4.5, y: 3.5 });

    world.step([{ ...createNeutralCommand(world.tick, 2), move: { x: -1, y: 0 } }]);
    expect(getActor(world, 2).action).toBe("Ready");
    expect(getActor(world, 2).position.x).toBeLessThan(4);
  });
});
