import { describe, expect, it } from "vitest";
import {
  createNeutralCommand,
  normalizeGameConfig,
  type SimulationEventV1,
} from "../src/simulation/contracts";
import { getItemSpawnBand } from "../src/simulation/items";
import { vectorLength, subtractVectors } from "../src/simulation/math";
import { SIMULATION_TUNING } from "../src/simulation/tuning";
import { SimulationWorld, type ParticipantSpawnOverride } from "../src/simulation/world";

const PARTICIPANT_OVERRIDES: readonly ParticipantSpawnOverride[] = Object.freeze([
  { actorId: 1, position: { x: 4, y: 4.5 }, facing: { x: 1, y: 0 } },
  { actorId: 2, position: { x: 7.5, y: 4.5 }, facing: { x: -1, y: 0 } },
  { actorId: 3, position: { x: 7.5, y: 1.5 } },
  { actorId: 4, position: { x: 1.5, y: 7.5 } },
]);

function createItemConfig(overrides: { initialItemCount?: number; respawnSeconds?: number } = {}) {
  return normalizeGameConfig({
    participantCount: 4,
    arenaColumns: 9,
    arenaRows: 9,
    roundLimitSeconds: 30,
    collapseSpeed: "slow",
    itemsEnabled: true,
    initialItemCount: overrides.initialItemCount ?? 0,
    itemRespawnSeconds: overrides.respawnSeconds ?? 0,
  });
}

function getActor(world: SimulationWorld, actorId: number) {
  const actor = world
    .createRenderFrame()
    .participants.find((participant) => participant.actorId === actorId);

  if (actor === undefined) {
    throw new Error(`missing actor ${actorId}`);
  }

  return actor;
}

function beginShove(world: SimulationWorld, actorId = 1) {
  return world.step([
    {
      ...createNeutralCommand(world.tick, actorId),
      shovePressed: true,
    },
  ]);
}

function stepUntilHit(world: SimulationWorld) {
  for (let index = 0; index < 20; index += 1) {
    const result = world.step();

    if (result.events.some(({ kind }) => kind === "shove-hit")) {
      return result;
    }
  }

  throw new Error("expected shove hit");
}

describe("deterministic item effects", () => {
  it("keeps starting passives permanent and assigns bounded active-item charges", () => {
    const passiveWorld = new SimulationWorld(createItemConfig(), "permanent-loadout", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        { ...PARTICIPANT_OVERRIDES[0]!, startingItems: ["iron-boots", "spring-glove"] },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
    });

    for (let tick = 0; tick <= 480; tick += 1) {
      passiveWorld.step();
    }

    expect(getActor(passiveWorld, 1).inventory).toEqual([
      { slotIndex: 0, definitionId: "iron-boots", charges: null },
      { slotIndex: 1, definitionId: "spring-glove", charges: null },
    ]);
    expect(getActor(passiveWorld, 1).massFactor).toBeCloseTo(1.4, 10);
    beginShove(passiveWorld);
    expect(getActor(passiveWorld, 1).inventory[1]?.definitionId).toBe("spring-glove");

    const activeWorld = new SimulationWorld(createItemConfig(), "charged-loadout", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        { ...PARTICIPANT_OVERRIDES[0]!, startingItems: ["wind-blast", "brick-bag"] },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
    });

    expect(getActor(activeWorld, 1).inventory).toEqual([
      { slotIndex: 0, definitionId: "wind-blast", charges: 2 },
      { slotIndex: 1, definitionId: "brick-bag", charges: 4 },
    ]);
    expect(getActor(activeWorld, 1).effects).toEqual([]);
    expect(getActor(activeWorld, 1).massFactor).toBe(1);
  });

  it("fires Wind Blast from an inventory slot, spends a charge, and transfers motion", () => {
    const world = new SimulationWorld(createItemConfig(), "wind-blast-chain", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 2, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["wind-blast"],
        },
        { actorId: 2, position: { x: 4, y: 4.5 }, facing: { x: -1, y: 0 } },
        { actorId: 3, position: { x: 4.8, y: 4.5 }, facing: { x: -1, y: 0 } },
        { actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
    });
    const beforeTarget = getActor(world, 2).position.x;
    const beforeBystander = getActor(world, 3).position.x;
    const result = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);
    const blast = result.events.find(({ kind }) => kind === "wind-blast-hit");

    expect(result.events).toContainEqual(
      expect.objectContaining({
        kind: "item-used",
        actorId: 1,
        itemDefinitionId: "wind-blast",
      }),
    );
    expect(blast).toMatchObject({ actorId: 1, targetActorId: 2 });
    expect(vectorLength(blast?.vector ?? { x: 0, y: 0 })).toBeGreaterThanOrEqual(
      SIMULATION_TUNING.shove.baseImpulse * 3,
    );
    expect(getActor(world, 1).inventory[0]?.charges).toBe(1);
    expect(getActor(world, 2).position.x).toBeGreaterThan(beforeTarget);
    expect(getActor(world, 3).position.x).toBeGreaterThan(beforeBystander);
  });

  it("makes heavy targets resist Wind Blast deterministically", () => {
    const blastStrength = (massFactor: number): number => {
      const world = new SimulationWorld(createItemConfig(), `wind-mass-${massFactor}`, {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 2, y: 4.5 },
            facing: { x: 1, y: 0 },
            startingItems: ["wind-blast"],
          },
          { actorId: 2, position: { x: 5, y: 4.5 }, massFactor },
          { actorId: 3, position: { x: 7.5, y: 1.5 } },
          { actorId: 4, position: { x: 1.5, y: 7.5 } },
        ],
      });
      const result = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);
      return vectorLength(
        result.events.find(({ kind }) => kind === "wind-blast-hit")?.vector ?? { x: 0, y: 0 },
      );
    };

    expect(blastStrength(0.8)).toBeGreaterThan(blastStrength(1.4));
  });

  it("lets a same-tick dodge evade Wind Blast while still spending its charge", () => {
    const world = new SimulationWorld(createItemConfig(), "wind-dodge", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 2, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["wind-blast"],
        },
        { actorId: 2, position: { x: 5, y: 4.5 }, facing: { x: 0, y: -1 } },
        { actorId: 3, position: { x: 7.5, y: 1.5 } },
        { actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
    });
    const result = world.step([
      { ...createNeutralCommand(world.tick, 1), useItemSlot: 0, shovePressed: true },
      { ...createNeutralCommand(world.tick, 2), dodgePressed: true },
    ]);

    expect(result.events.some(({ kind }) => kind === "wind-blast-hit")).toBe(false);
    expect(result.events.some(({ kind }) => kind === "shove-started")).toBe(false);
    expect(result.events).toContainEqual(
      expect.objectContaining({ kind: "dodge-succeeded", actorId: 2, targetActorId: 1 }),
    );
    expect(getActor(world, 1).inventory[0]?.charges).toBe(1);
  });

  it("spends a Wind Blast charge on a miss without inventing a target", () => {
    const world = new SimulationWorld(createItemConfig(), "wind-miss", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 4, y: 4.5 },
          facing: { x: 0, y: -1 },
          startingItems: ["wind-blast"],
        },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
    });
    const result = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);

    expect(result.events.some(({ kind }) => kind === "item-used")).toBe(true);
    expect(result.events.some(({ kind }) => kind === "wind-blast-hit")).toBe(false);
    expect(getActor(world, 1).inventory[0]?.charges).toBe(1);
  });

  it("allows exactly two Wind Blasts and falls through to shove after the charges are gone", () => {
    const world = new SimulationWorld(createItemConfig(), "wind-two-charges", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 4, y: 4.5 },
          facing: { x: 0, y: -1 },
          startingItems: ["wind-blast"],
        },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
    });

    for (let use = 0; use < 2; use += 1) {
      const result = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);
      expect(result.events.filter(({ kind }) => kind === "item-used")).toHaveLength(1);
    }

    expect(getActor(world, 1).inventory[0]?.charges).toBe(0);
    const exhausted = world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        useItemSlot: 0,
        shovePressed: true,
      },
    ]);
    expect(exhausted.events.some(({ kind }) => kind === "item-used")).toBe(false);
    expect(exhausted.events.some(({ kind }) => kind === "shove-started")).toBe(true);
    expect(getActor(world, 1).inventory[0]?.charges).toBe(0);
  });

  it("gives an available dodge priority over active item and shove", () => {
    const world = new SimulationWorld(createItemConfig(), "dodge-item-shove-priority", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          ...PARTICIPANT_OVERRIDES[0]!,
          startingItems: ["wind-blast"],
        },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
    });
    const result = world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        dodgePressed: true,
        useItemSlot: 0,
        shovePressed: true,
      },
    ]);

    expect(result.events.some(({ kind }) => kind === "dodge-started")).toBe(true);
    expect(result.events.some(({ kind }) => kind === "item-used")).toBe(false);
    expect(result.events.some(({ kind }) => kind === "shove-started")).toBe(false);
    expect(getActor(world, 1).inventory[0]?.charges).toBe(2);
  });

  it("resolves simultaneous Wind Blasts independently of command-array order", () => {
    const run = (commandOrder: readonly number[]) => {
      const world = new SimulationWorld(createItemConfig(), "simultaneous-wind", {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 2, y: 4.5 },
            facing: { x: 1, y: 0 },
            startingItems: ["wind-blast"],
          },
          {
            actorId: 2,
            position: { x: 7, y: 4.5 },
            facing: { x: -1, y: 0 },
            startingItems: ["wind-blast"],
          },
          { actorId: 3, position: { x: 4.5, y: 4.5 } },
          { actorId: 4, position: { x: 4.5, y: 7.5 } },
        ],
      });
      const result = world.step(
        commandOrder.map((actorId) => ({
          ...createNeutralCommand(world.tick, actorId),
          useItemSlot: 0 as const,
        })),
      );
      return {
        stateHash: result.frame.stateHash,
        hits: result.events.filter(({ kind }) => kind === "wind-blast-hit"),
      };
    };

    expect(run([1, 2])).toEqual(run([2, 1]));
  });

  it("keeps stronger Wind Blast elimination credit over a weaker same-tick shove", () => {
    const world = new SimulationWorld(createItemConfig(), "wind-credit-arbitration", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 5, y: 4.5 },
          facing: { x: 0, y: -1 },
          startingItems: ["wind-blast"],
        },
        { actorId: 2, position: { x: 5, y: 2 } },
        { actorId: 3, position: { x: 4.1, y: 2 }, facing: { x: 1, y: 0 } },
        { actorId: 4, position: { x: 7.5, y: 7.5 } },
      ],
    });
    world.step([{ ...createNeutralCommand(world.tick, 3), shovePressed: true }]);

    while (world.tick < SIMULATION_TUNING.shove.windupTicks) {
      world.step();
    }

    const impact = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);
    expect(impact.events.some(({ kind }) => kind === "wind-blast-hit")).toBe(true);
    expect(impact.events.some(({ kind }) => kind === "shove-hit")).toBe(true);

    let creditEvent: SimulationEventV1 | undefined;

    for (let tick = 0; tick < 120 && creditEvent === undefined; tick += 1) {
      const result = world.step();
      creditEvent = result.events.find(({ kind }) => kind === "stat-point-earned");
    }

    expect(creditEvent).toMatchObject({
      kind: "stat-point-earned",
      actorId: 1,
      targetActorId: 2,
    });
  });

  it("places a Brick Bag wall on the faced cardinal tile and spends one charge", () => {
    const world = new SimulationWorld(createItemConfig(), "brick-placement", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 4.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["brick-bag"],
        },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
    });
    const result = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);

    expect(result.frame.brickWalls).toEqual([
      expect.objectContaining({ tileId: "5:4", ownerActorId: 1, placedTick: 0 }),
    ]);
    expect(getActor(world, 1).inventory[0]?.charges).toBe(3);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "item-used",
          actorId: 1,
          itemDefinitionId: "brick-bag",
          tileId: "5:4",
        }),
        expect.objectContaining({ kind: "brick-wall-placed", actorId: 1, tileId: "5:4" }),
      ]),
    );
  });

  it("does not spend Brick Bag charges when the target tile is invalid or occupied", () => {
    const outOfBounds = new SimulationWorld(createItemConfig(), "brick-out-of-bounds", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 0.5, y: 4.5 },
          facing: { x: -1, y: 0 },
          startingItems: ["brick-bag"],
        },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
    });
    const invalidResult = outOfBounds.step([
      {
        ...createNeutralCommand(outOfBounds.tick, 1),
        useItemSlot: 0,
        shovePressed: true,
      },
    ]);

    expect(invalidResult.frame.brickWalls).toHaveLength(0);
    expect(getActor(outOfBounds, 1).inventory[0]?.charges).toBe(4);
    expect(invalidResult.events).toContainEqual(
      expect.objectContaining({ kind: "shove-started", actorId: 1 }),
    );

    const occupied = new SimulationWorld(createItemConfig(), "brick-occupied", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 4.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["brick-bag"],
        },
        { actorId: 2, position: { x: 5.5, y: 4.5 } },
        ...PARTICIPANT_OVERRIDES.slice(2),
      ],
    });
    const occupiedResult = occupied.step([
      { ...createNeutralCommand(occupied.tick, 1), useItemSlot: 0 },
    ]);

    expect(occupiedResult.frame.brickWalls).toHaveLength(0);
    expect(getActor(occupied, 1).inventory[0]?.charges).toBe(4);
    expect(occupiedResult.events.some(({ kind }) => kind === "item-used")).toBe(false);
  });

  it("resolves competing Brick Bag placements by actor id, not command order", () => {
    const run = (actorIds: readonly number[]) => {
      const world = new SimulationWorld(createItemConfig(), "brick-placement-order", {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 4.5, y: 4.5 },
            facing: { x: 1, y: 0 },
            startingItems: ["brick-bag"],
          },
          {
            actorId: 2,
            position: { x: 6.5, y: 4.5 },
            facing: { x: -1, y: 0 },
            startingItems: ["brick-bag"],
          },
          { actorId: 3, position: { x: 7.5, y: 1.5 } },
          { actorId: 4, position: { x: 1.5, y: 7.5 } },
        ],
      });
      return world.step(
        actorIds.map((actorId) => ({
          ...createNeutralCommand(world.tick, actorId),
          useItemSlot: 0 as const,
        })),
      );
    };
    const forward = run([1, 2]);
    const reverse = run([2, 1]);

    expect(reverse.frame.stateHash).toBe(forward.frame.stateHash);
    expect(forward.frame.brickWalls).toEqual([
      expect.objectContaining({ tileId: "5:4", ownerActorId: 1 }),
    ]);
    expect(
      forward.events
        .filter(({ kind }) => kind === "brick-wall-placed")
        .map(({ actorId }) => actorId),
    ).toEqual([1]);
  });

  it("commits same-tick Brick Bag walls before every Wind Blast", () => {
    const run = (actorIds: readonly number[]) => {
      const world = new SimulationWorld(createItemConfig(), "brick-before-wind", {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 2.5, y: 4.5 },
            facing: { x: 1, y: 0 },
            startingItems: ["wind-blast"],
          },
          { actorId: 2, position: { x: 7.5, y: 4.5 } },
          {
            actorId: 3,
            position: { x: 4.5, y: 5.5 },
            facing: { x: 0, y: -1 },
            startingItems: ["brick-bag"],
          },
          { actorId: 4, position: { x: 1.5, y: 7.5 } },
        ],
      });
      const result = world.step(
        actorIds.map((actorId) => ({
          ...createNeutralCommand(world.tick, actorId),
          useItemSlot: 0 as const,
        })),
      );
      return { world, result };
    };
    const forward = run([1, 3]);
    const reverse = run([3, 1]);

    expect(reverse.result.frame.stateHash).toBe(forward.result.frame.stateHash);
    expect(forward.result.events.some(({ kind }) => kind === "wind-blast-hit")).toBe(false);
    expect(forward.result.frame.brickWalls).toEqual([
      expect.objectContaining({ tileId: "4:4", ownerActorId: 3 }),
    ]);
    expect(getActor(forward.world, 1).inventory[0]?.charges).toBe(1);
    expect(getActor(forward.world, 3).inventory[0]?.charges).toBe(3);
  });

  it("stops launched actors at a Brick Bag wall without reflecting them", () => {
    const world = new SimulationWorld(createItemConfig(), "brick-launch-stop", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 1.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["wind-blast"],
        },
        { actorId: 2, position: { x: 3.2, y: 4.5 } },
        {
          actorId: 3,
          position: { x: 4.5, y: 5.5 },
          facing: { x: 0, y: -1 },
          startingItems: ["brick-bag"],
        },
        { actorId: 4, position: { x: 7.5, y: 7.5 } },
      ],
    });
    world.step([{ ...createNeutralCommand(world.tick, 3), useItemSlot: 0 }]);
    world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);

    for (let tick = 0; tick < 20; tick += 1) {
      world.step();
    }

    const stopped = getActor(world, 2);
    expect(stopped.position.x).toBeLessThanOrEqual(4 - stopped.radius + 0.001);
    expect(stopped.velocity.x).toBeGreaterThanOrEqual(-0.000_1);
  });

  it("blocks a hand shove whose center line clips a Brick Bag wall corner", () => {
    const world = new SimulationWorld(createItemConfig(), "brick-hand-shove", {
      arenaLayout: "rectangular-fixture",
      gameplayTuning: { shoveReach: 0.5 },
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 3.65, y: 4.35 },
          facing: { x: 1, y: -1 },
        },
        { actorId: 2, position: { x: 4.35, y: 3.65 } },
        {
          actorId: 3,
          position: { x: 4.5, y: 5.5 },
          facing: { x: 0, y: -1 },
          startingItems: ["brick-bag"],
        },
        { actorId: 4, position: { x: 7.5, y: 7.5 } },
      ],
    });
    world.step([{ ...createNeutralCommand(world.tick, 3), useItemSlot: 0 }]);
    beginShove(world, 1);
    let hit = false;

    for (let tick = 0; tick < 20; tick += 1) {
      const result = world.step();
      hit ||= result.events.some(
        (event) => event.kind === "shove-hit" && event.actorId === 1 && event.targetActorId === 2,
      );
    }

    expect(hit).toBe(false);
  });

  it("removes a Brick Bag wall after its tile becomes Void", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({
        participantCount: 4,
        arenaColumns: 9,
        arenaRows: 9,
        roundLimitSeconds: 30,
        collapseSpeed: "fast",
        itemsEnabled: true,
        initialItemCount: 0,
        itemRespawnSeconds: 0,
      }),
      "brick-flood-removal",
      {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 1.5, y: 1.5 },
            facing: { x: 0, y: -1 },
            startingItems: ["brick-bag"],
          },
          { actorId: 2, position: { x: 4.5, y: 4.5 } },
          { actorId: 3, position: { x: 5.5, y: 4.5 } },
          { actorId: 4, position: { x: 4.5, y: 5.5 } },
        ],
      },
    );
    const placement = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);
    expect(placement.frame.brickWalls).toEqual([
      expect.objectContaining({ tileId: "1:0", ownerActorId: 1 }),
    ]);
    let removal: ReturnType<SimulationWorld["step"]> | undefined;

    while (world.tick < 1_500 && removal === undefined) {
      const result = world.step();

      if (result.events.some(({ kind }) => kind === "brick-wall-removed")) {
        removal = result;
      } else if (result.frame.round.status === "Completed") {
        break;
      }
    }

    expect(removal).toBeDefined();
    const voidIndex = removal?.events.findIndex(
      (event) => event.kind === "tile-void" && event.tileId === "1:0",
    );
    const removalIndex = removal?.events.findIndex(
      (event) => event.kind === "brick-wall-removed" && event.tileId === "1:0",
    );
    expect(voidIndex).toBeGreaterThanOrEqual(0);
    expect(removalIndex).toBeGreaterThan(voidIndex ?? -1);
    expect(removal?.frame.brickWalls).toHaveLength(0);
  });

  it("applies and refreshes timed mass effects within the global mass bounds", () => {
    const world = new SimulationWorld(createItemConfig(), "stacked-mass", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: PARTICIPANT_OVERRIDES,
      itemOverrides: [
        { itemId: 1, definitionId: "iron-boots", position: { x: 4, y: 4.5 } },
        { itemId: 2, definitionId: "feather", position: { x: 4, y: 4.5 } },
        { itemId: 3, definitionId: "iron-boots", position: { x: 4, y: 4.5 } },
      ],
    });
    const result = world.step();
    const actor = getActor(world, 1);

    expect(result.events.filter(({ kind }) => kind === "item-picked-up")).toHaveLength(3);
    expect(actor.effects.map(({ definitionId }) => definitionId).toSorted()).toEqual([
      "feather",
      "iron-boots",
    ]);
    expect(actor.massFactor).toBeGreaterThanOrEqual(SIMULATION_TUNING.mass.minimum);
    expect(actor.massFactor).toBeLessThanOrEqual(SIMULATION_TUNING.mass.maximum);
    expect(actor.massFactor).toBeCloseTo(1.4 * 0.8, 10);
  });

  it("expires a timed effect before movement and collision on its exact end tick", () => {
    const world = new SimulationWorld(createItemConfig(), "effect-expiry", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: PARTICIPANT_OVERRIDES,
      itemOverrides: [{ itemId: 1, definitionId: "iron-boots", position: { x: 4, y: 4.5 } }],
    });
    world.step();
    expect(getActor(world, 1).massFactor).toBeGreaterThan(1);

    while (world.tick <= 480) {
      world.step();
    }

    expect(getActor(world, 1).effects).toEqual([]);
    expect(getActor(world, 1).massFactor).toBe(1);
  });

  it("consumes a spring glove on shove start and boosts every valid target in that active window", () => {
    const world = new SimulationWorld(createItemConfig(), "spring-multi-hit", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        PARTICIPANT_OVERRIDES[0]!,
        { actorId: 2, position: { x: 4.72, y: 4.15 }, facing: { x: -1, y: 0 } },
        { actorId: 3, position: { x: 4.72, y: 4.85 }, facing: { x: -1, y: 0 } },
        PARTICIPANT_OVERRIDES[3]!,
      ],
      itemOverrides: [{ itemId: 1, definitionId: "spring-glove", position: { x: 4, y: 4.5 } }],
    });
    world.step();
    expect(getActor(world, 1).effects[0]?.definitionId).toBe("spring-glove");

    const started = beginShove(world);
    expect(started.frame.participants[0]?.springBoosted).toBe(true);
    expect(getActor(world, 1).effects).toEqual([]);
    const hit = stepUntilHit(world);

    expect(
      hit.events.filter(({ kind, actorId }) => kind === "shove-hit" && actorId === 1),
    ).toHaveLength(2);
  });

  it("produces more target velocity than the same unboosted shove", () => {
    function run(boosted: boolean): number {
      const world = new SimulationWorld(createItemConfig(), `spring-compare-${boosted}`, {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          PARTICIPANT_OVERRIDES[0]!,
          { actorId: 2, position: { x: 4.78, y: 4.5 }, facing: { x: -1, y: 0 } },
          PARTICIPANT_OVERRIDES[2]!,
          PARTICIPANT_OVERRIDES[3]!,
        ],
        itemOverrides: boosted
          ? [{ itemId: 1, definitionId: "spring-glove", position: { x: 4, y: 4.5 } }]
          : [],
      });
      world.step();
      beginShove(world);
      stepUntilHit(world);
      return vectorLength(getActor(world, 2).velocity);
    }

    expect(run(true)).toBeGreaterThan(run(false));
  });

  it("consumes spring momentum on a miss and clears timed effects on falling", () => {
    const springWorld = new SimulationWorld(createItemConfig(), "spring-miss", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: PARTICIPANT_OVERRIDES,
      itemOverrides: [{ itemId: 1, definitionId: "spring-glove", position: { x: 4, y: 4.5 } }],
    });
    springWorld.step();
    beginShove(springWorld);
    expect(getActor(springWorld, 1).effects).toEqual([]);
    expect(getActor(springWorld, 1).springBoosted).toBe(true);

    while (getActor(springWorld, 1).action !== "Stumbling") {
      springWorld.step();
    }

    expect(getActor(springWorld, 1).effects).toEqual([]);

    const fallingWorld = new SimulationWorld(createItemConfig(), "falling-clears-effects", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        { actorId: 1, position: { x: -0.5, y: 4.5 } },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
      itemOverrides: [{ itemId: 1, definitionId: "iron-boots", position: { x: -0.5, y: 4.5 } }],
    });
    fallingWorld.step();
    expect(getActor(fallingWorld, 1).effects).toHaveLength(1);

    while (getActor(fallingWorld, 1).action !== "Falling") {
      fallingWorld.step();
    }

    expect(getActor(fallingWorld, 1).effects).toEqual([]);
    expect(getActor(fallingWorld, 1).massFactor).toBe(1);
  });
});

describe("deterministic item placement", () => {
  it("keeps seeded initial items deterministic, supported, and clear of participants", () => {
    const config = normalizeGameConfig({
      participantCount: 32,
      arenaColumns: 17,
      arenaRows: 13,
      roundLimitSeconds: 30,
      collapseSpeed: "normal",
      itemsEnabled: true,
      itemRespawnSeconds: 3,
    });

    const bandCounts = { edge: 0, "near-edge": 0, interior: 0 };

    for (let seed = 0; seed < 24; seed += 1) {
      const left = new SimulationWorld(config, `placement-${seed}`).createRenderFrame();
      const right = new SimulationWorld(config, `placement-${seed}`).createRenderFrame();
      expect(left.stateHash).toBe(right.stateHash);
      expect(left.items).toHaveLength(11);

      for (const item of left.items) {
        expect(item.position.x).toBeGreaterThanOrEqual(0.5);
        expect(item.position.y).toBeGreaterThanOrEqual(0.5);
        expect(item.position.x).toBeLessThanOrEqual(16.5);
        expect(item.position.y).toBeLessThanOrEqual(12.5);
        bandCounts[getItemSpawnBand(item.position, left.tiles)] += 1;
        expect(
          left.participants.every(
            (participant) =>
              vectorLength(subtractVectors(item.position, participant.position)) >= 1.25,
          ),
        ).toBe(true);
      }
    }

    const total = bandCounts.edge + bandCounts["near-edge"] + bandCounts.interior;
    expect((bandCounts.edge + bandCounts["near-edge"]) / total).toBeGreaterThan(0.6);
    expect(bandCounts.interior).toBeGreaterThan(0);
  });

  it("never accumulates beyond the participant-derived cap", () => {
    const world = new SimulationWorld(
      createItemConfig({ initialItemCount: 2, respawnSeconds: 1 }),
      "bounded-respawn",
    );
    const initialStableTiles = world
      .createRenderFrame()
      .tiles.filter(({ state }) => state === "Stable").length;

    for (let index = 0; index < 300; index += 1) {
      const result = world.step();
      expect(result.frame.items.length).toBeLessThanOrEqual(2);
      const stableTiles = result.frame.tiles.filter(({ state }) => state === "Stable").length;
      const areaCap = Math.ceil(2 * (stableTiles / initialStableTiles));
      expect(result.frame.items.length).toBeLessThanOrEqual(areaCap);

      if (result.frame.round.status === "Completed") {
        break;
      }
    }
  });

  it("spawns due items only on currently stable tiles", () => {
    const world = new SimulationWorld(
      createItemConfig({ initialItemCount: 0, respawnSeconds: 1 }),
      "stable-spawns",
    );
    let spawnCount = 0;

    for (let index = 0; index < 600; index += 1) {
      const result = world.step();

      for (const event of result.events.filter(({ kind }) => kind === "item-spawned")) {
        const item = result.frame.items.find(({ itemId }) => itemId === event.itemId);
        expect(item).toBeDefined();
        const tileId = `${Math.floor(item!.position.x)}:${Math.floor(item!.position.y)}`;
        expect(result.frame.tiles.find((tile) => tile.tileId === tileId)?.state).toBe("Stable");
        spawnCount += 1;
      }

      if (result.frame.round.status === "Completed") {
        break;
      }
    }

    expect(spawnCount).toBeGreaterThan(0);
  });

  it("rejects active loadout items from the map-pickup override path", () => {
    expect(
      () =>
        new SimulationWorld(createItemConfig(), "active-map-override", {
          arenaLayout: "rectangular-fixture",
          participantOverrides: PARTICIPANT_OVERRIDES,
          itemOverrides: [{ itemId: 1, definitionId: "wind-blast", position: { x: 4, y: 4.5 } }],
        }),
    ).toThrow(/not map-spawn eligible/);
  });
});
