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
    expect(getActor(passiveWorld, 1).massFactor).toBeCloseTo(1.1, 10);
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

  it("keeps a Boat user supported on an arena Void tile for exactly five seconds", () => {
    const config = createItemConfig();
    const seed = "boat-void-support";
    const probe = new SimulationWorld(config, seed);
    const waterTile = probe.createRenderFrame().tiles.find(({ state }) => state === "Void");

    expect(waterTile).toBeDefined();

    const world = new SimulationWorld(config, seed, {
      participantOverrides: [
        {
          actorId: 1,
          position: { x: waterTile!.column + 0.5, y: waterTile!.row + 0.5 },
          startingItems: ["boat"],
        },
      ],
    });

    for (let index = 1; index < SIMULATION_TUNING.support.graceTicks; index += 1) {
      world.step();
    }

    expect(getActor(world, 1).unsupportedTicks).toBe(SIMULATION_TUNING.support.graceTicks - 1);
    const activation = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);

    expect(activation.events).toContainEqual(
      expect.objectContaining({ kind: "item-used", actorId: 1, itemDefinitionId: "boat" }),
    );
    expect(getActor(world, 1).inventory[0]?.charges).toBe(0);
    expect(getActor(world, 1).effects).toEqual([
      { definitionId: "boat", appliedTick: 8, endsTick: 308 },
    ]);
    expect(getActor(world, 1).unsupportedTicks).toBe(0);

    while (world.tick < 308) {
      world.step();
    }

    expect(getActor(world, 1).effects).toHaveLength(1);
    expect(getActor(world, 1).unsupportedTicks).toBe(0);

    let fallingStarted = false;

    for (let index = 0; index < SIMULATION_TUNING.support.graceTicks; index += 1) {
      const result = world.step();
      fallingStarted ||= result.events.some(
        ({ kind, actorId }) => kind === "falling-started" && actorId === 1,
      );
    }

    expect(getActor(world, 1).effects).toEqual([]);
    expect(fallingStarted).toBe(true);
    expect(getActor(world, 1).action).toBe("Falling");
  });

  it("does not spend a Boat outside the generated arena and falls through to shove", () => {
    const world = new SimulationWorld(createItemConfig(), "boat-outside-arena", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: -0.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["boat"],
        },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
    });
    const result = world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        useItemSlot: 0,
        shovePressed: true,
      },
    ]);

    expect(result.events.some(({ kind }) => kind === "item-used")).toBe(false);
    expect(result.events).toContainEqual(
      expect.objectContaining({ kind: "shove-started", actorId: 1 }),
    );
    expect(getActor(world, 1).inventory[0]?.charges).toBe(1);
    expect(getActor(world, 1).effects).toEqual([]);
  });

  it("does not extend Boat support beyond the arena after same-tick movement", () => {
    const config = createItemConfig();
    const seed = "boat-crosses-arena-boundary";
    const probe = new SimulationWorld(config, seed);
    const boundaryWater = probe
      .createRenderFrame()
      .tiles.find(({ column, state }) => column === 0 && state === "Void");

    expect(boundaryWater).toBeDefined();

    const world = new SimulationWorld(config, seed, {
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 0.01, y: boundaryWater!.row + 0.5 },
          velocity: { x: -SIMULATION_TUNING.body.maximumSpeed, y: 0 },
          startingItems: ["boat"],
        },
      ],
    });
    const result = world.step([
      { ...createNeutralCommand(world.tick, 1), move: { x: -1, y: 0 }, useItemSlot: 0 },
    ]);

    expect(result.events).toContainEqual(
      expect.objectContaining({ kind: "item-used", actorId: 1, itemDefinitionId: "boat" }),
    );
    expect(getActor(world, 1).position.x).toBeLessThan(0);
    expect(getActor(world, 1).effects[0]?.definitionId).toBe("boat");
    expect(getActor(world, 1).unsupportedTicks).toBe(1);
  });

  it("activates Boat before same-tick Wind Blast without granting combat immunity", () => {
    const world = new SimulationWorld(createItemConfig(), "boat-wind-order", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 4.5, y: 4.5 },
          facing: { x: -1, y: 0 },
          startingItems: ["boat"],
        },
        {
          actorId: 2,
          position: { x: 2, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["wind-blast"],
        },
        { actorId: 3, position: { x: 7.5, y: 1.5 } },
        { actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
    });
    const result = world.step([
      { ...createNeutralCommand(world.tick, 2), useItemSlot: 0 },
      { ...createNeutralCommand(world.tick, 1), useItemSlot: 0 },
    ]);

    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "item-used", actorId: 1, itemDefinitionId: "boat" }),
        expect.objectContaining({ kind: "wind-blast-hit", actorId: 2, targetActorId: 1 }),
      ]),
    );
    expect(getActor(world, 1).effects[0]?.definitionId).toBe("boat");
    expect(vectorLength(getActor(world, 1).velocity)).toBeGreaterThan(0);
    expect(getActor(world, 1).massFactor).toBe(1);
  });

  it("places a Bomb on the current tile and detonates after exactly five seconds", () => {
    const world = new SimulationWorld(createItemConfig(), "bomb-exact-fuse", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 4.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["bomb"],
        },
        { actorId: 2, position: { x: 8.5, y: 1.5 } },
        { actorId: 3, position: { x: 8.5, y: 7.5 } },
        { actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
    });
    const placement = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);

    expect(placement.frame.bombs).toEqual([
      {
        ownerActorId: 1,
        position: { x: 4.5, y: 4.5 },
        fallbackDirection: { x: 1, y: 0 },
        placedTick: 0,
        detonateTick: 300,
      },
    ]);
    expect(getActor(world, 1).inventory[0]?.charges).toBe(1);
    expect(placement.events).toContainEqual(
      expect.objectContaining({ kind: "item-used", actorId: 1, itemDefinitionId: "bomb" }),
    );

    while (world.tick < SIMULATION_TUNING.bomb.fuseTicks) {
      const result = world.step();
      expect(result.events.some(({ kind }) => kind === "bomb-detonated")).toBe(false);
    }

    expect(world.createRenderFrame().bombs).toHaveLength(1);
    const detonation = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);

    expect(detonation.events).toContainEqual(
      expect.objectContaining({
        kind: "bomb-detonated",
        actorId: 1,
        itemDefinitionId: "bomb",
        position: { x: 4.5, y: 4.5 },
      }),
    );
    expect(
      detonation.events
        .filter(({ kind }) => kind === "bomb-detonated" || kind === "item-used")
        .map(({ kind }) => kind),
    ).toEqual(["bomb-detonated"]);
    expect(detonation.frame.bombs).toEqual([]);
    expect(getActor(world, 1).inventory[0]?.charges).toBe(1);
    expect(getActor(world, 1).action).toBe("Stumbling");
    expect(getActor(world, 1).velocity.x).toBeGreaterThan(0);
  });

  it("resolves competing Bomb placements by actor id without spending the loser charge", () => {
    const run = (actorIds: readonly number[]) => {
      const world = new SimulationWorld(createItemConfig(), "bomb-placement-order", {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 4.25, y: 4.5 },
            facing: { x: 1, y: 0 },
            startingItems: ["bomb"],
          },
          {
            actorId: 2,
            position: { x: 4.75, y: 4.5 },
            facing: { x: -1, y: 0 },
            startingItems: ["bomb"],
          },
          { actorId: 3, position: { x: 7.5, y: 1.5 } },
          { actorId: 4, position: { x: 1.5, y: 7.5 } },
        ],
      });
      const result = world.step(
        actorIds.map((actorId) => ({
          ...createNeutralCommand(world.tick, actorId),
          useItemSlot: 0 as const,
        })),
      );
      return {
        stateHash: result.frame.stateHash,
        bombs: result.frame.bombs,
        usedBy: result.events
          .filter(
            ({ kind, itemDefinitionId }) => kind === "item-used" && itemDefinitionId === "bomb",
          )
          .map(({ actorId }) => actorId),
        charges: result.frame.participants
          .slice(0, 2)
          .map(({ inventory }) => inventory[0]?.charges),
      };
    };

    const forward = run([1, 2]);
    const reverse = run([2, 1]);

    expect(reverse).toEqual(forward);
    expect(forward.bombs).toEqual([expect.objectContaining({ ownerActorId: 1 })]);
    expect(forward.usedBy).toEqual([1]);
    expect(forward.charges).toEqual([1, 2]);
  });

  it("kills opponents through Dodge while launching and staggering the Bomb owner", () => {
    const world = new SimulationWorld(createItemConfig(), "bomb-dodge", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 4.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["bomb"],
        },
        { actorId: 2, position: { x: 6.5, y: 4.5 }, facing: { x: 0, y: -1 } },
        { actorId: 3, position: { x: 8.5, y: 1.5 } },
        { actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
    });
    world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);

    while (world.tick < SIMULATION_TUNING.bomb.fuseTicks) {
      world.step();
    }

    const result = world.step([{ ...createNeutralCommand(world.tick, 2), dodgePressed: true }]);

    expect(result.events).not.toContainEqual(
      expect.objectContaining({ kind: "dodge-succeeded", actorId: 2, targetActorId: 1 }),
    );
    expect(getActor(world, 2).action).toBe("Eliminated");
    expect(getActor(world, 1).active).toBe(true);
    expect(getActor(world, 1).action).toBe("Stumbling");
    expect(getActor(world, 1).velocity.x).toBeGreaterThan(0);
  });

  it("batches due Bomb, Boat, and Wind Blast independently of command order", () => {
    const run = (actorIds: readonly number[]) => {
      const world = new SimulationWorld(createItemConfig(), "bomb-boat-wind-order", {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 4.5, y: 4.5 },
            facing: { x: 1, y: 0 },
            startingItems: ["bomb"],
          },
          {
            actorId: 2,
            position: { x: 6.5, y: 4.5 },
            facing: { x: 0, y: -1 },
            startingItems: ["boat"],
          },
          {
            actorId: 3,
            position: { x: 8.5, y: 4.5 },
            facing: { x: -1, y: 0 },
            startingItems: ["wind-blast"],
          },
          { actorId: 4, position: { x: 1.5, y: 7.5 } },
        ],
      });
      world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);

      while (world.tick < SIMULATION_TUNING.bomb.fuseTicks) {
        world.step();
      }

      const result = world.step(
        actorIds.map((actorId) => ({
          ...createNeutralCommand(world.tick, actorId),
          useItemSlot: 0 as const,
        })),
      );
      return {
        stateHash: result.frame.stateHash,
        eventOrder: result.events
          .filter(
            ({ kind }) =>
              kind === "bomb-detonated" || kind === "item-used" || kind === "wind-blast-hit",
          )
          .map(({ kind, itemDefinitionId }) => `${kind}:${itemDefinitionId ?? "none"}`),
        target: getActor(world, 2),
      };
    };

    const forward = run([2, 3]);
    const reverse = run([3, 2]);

    expect(reverse).toEqual(forward);
    expect(forward.eventOrder).toEqual([
      "bomb-detonated:bomb",
      "item-used:wind-blast",
      "wind-blast-hit:wind-blast",
    ]);
    expect(forward.target.effects).toEqual([]);
    expect(forward.target.action).toBe("Eliminated");
  });

  it("keeps an armed Bomb through flooding and owner elimination", () => {
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
      "bomb-flood-persistence",
      {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 0.5, y: 0.5 },
            startingItems: ["bomb"],
          },
          { actorId: 2, position: { x: 4.5, y: 4.5 } },
          { actorId: 3, position: { x: 5.5, y: 4.5 } },
          { actorId: 4, position: { x: 4.5, y: 5.5 } },
        ],
      },
    );
    let bombTile = world.createRenderFrame().tiles.find(({ tileId }) => tileId === "0:0");

    while (bombTile?.state === "Stable") {
      world.step();
      bombTile = world.createRenderFrame().tiles.find(({ tileId }) => tileId === "0:0");
    }

    expect(bombTile?.state).toBe("Warning");
    const placement = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);
    const detonateTick = placement.frame.bombs[0]?.detonateTick;
    expect(detonateTick).toBeDefined();
    let ownerEliminated = false;

    while (world.tick < detonateTick!) {
      const result = world.step();
      ownerEliminated ||= result.events.some(
        ({ kind, actorId }) => kind === "eliminated" && actorId === 1,
      );
    }

    bombTile = world.createRenderFrame().tiles.find(({ tileId }) => tileId === "0:0");
    expect(ownerEliminated).toBe(true);
    expect(bombTile?.state).toBe("Void");
    expect(world.createRenderFrame().bombs).toHaveLength(1);
    const detonation = world.step();
    expect(detonation.events).toContainEqual(
      expect.objectContaining({ kind: "bomb-detonated", actorId: 1 }),
    );
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

    expect(blastStrength(0.85)).toBeGreaterThan(blastStrength(1.25));
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

  it("pulls toward the farthest static tile anchor and ignores bodies on the ray", () => {
    const world = new SimulationWorld(createItemConfig(), "grapple-static-anchor", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 2, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["grappling-hook"],
        },
        { actorId: 2, position: { x: 3.2, y: 4.5 } },
        { actorId: 3, position: { x: 7.5, y: 1.5 } },
        { actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
    });
    const result = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);
    const hit = result.events.find(({ kind }) => kind === "grappling-hook-hit");

    expect(hit).toMatchObject({
      actorId: 1,
      itemDefinitionId: "grappling-hook",
      tileId: "6:4",
      position: { x: 2, y: 4.5 },
      vector: { x: 4.5, y: 0 },
    });
    expect(getActor(world, 1).inventory[0]?.charges).toBe(1);
    expect(getActor(world, 1).action).toBe("GrapplePull");
    expect(getActor(world, 1).velocity.x).toBeCloseTo(
      SIMULATION_TUNING.grapplingHook.acceleration * SIMULATION_TUNING.movement.stumbleDrag,
      10,
    );
    expect(getActor(world, 2).velocity).toEqual({ x: 0, y: 0 });
    const blocked = world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        dodgePressed: true,
        shovePressed: true,
        useItemSlot: 0,
      },
    ]);
    expect(
      blocked.events.some(
        ({ kind }) => kind === "dodge-started" || kind === "shove-started" || kind === "item-used",
      ),
    ).toBe(false);
    expect(getActor(world, 1).inventory[0]?.charges).toBe(1);
  });

  it("uses a same-tick Brick as the nearer static anchor independent of command order", () => {
    const run = (actorIds: readonly number[]) => {
      const world = new SimulationWorld(createItemConfig(), "brick-before-grapple", {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 2.5, y: 4.5 },
            facing: { x: 1, y: 0 },
            startingItems: ["grappling-hook"],
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
      return {
        hash: result.frame.stateHash,
        hit: result.events.find(({ kind }) => kind === "grappling-hook-hit"),
      };
    };
    const forward = run([1, 3]);

    expect(run([3, 1])).toEqual(forward);
    expect(forward.hit).toMatchObject({
      actorId: 1,
      tileId: "4:4",
      vector: { x: 1.5, y: 0 },
    });
  });

  it("does not spend without a minimum-distance anchor and falls through to shove", () => {
    const world = new SimulationWorld(createItemConfig(), "grapple-no-anchor", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 7.9, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["grappling-hook"],
        },
        { actorId: 2, position: { x: 8.5, y: 4.5 } },
        { actorId: 3, position: { x: 7.5, y: 1.5 } },
        { actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
    });
    const result = world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        useItemSlot: 0,
        shovePressed: true,
      },
    ]);

    expect(result.events.some(({ kind }) => kind === "item-used")).toBe(false);
    expect(result.events.some(({ kind }) => kind === "grappling-hook-hit")).toBe(false);
    expect(result.events.some(({ kind }) => kind === "shove-started")).toBe(true);
    expect(getActor(world, 1).inventory[0]?.charges).toBe(2);
  });

  it("falls through to shove when a same-tick Brick blocks the anchor inside minimum range", () => {
    const world = new SimulationWorld(createItemConfig(), "near-brick-blocks-grapple", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 3.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["grappling-hook"],
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
    const result = world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        useItemSlot: 0,
        shovePressed: true,
      },
      { ...createNeutralCommand(world.tick, 3), useItemSlot: 0 },
    ]);

    expect(result.frame.brickWalls).toEqual([
      expect.objectContaining({ tileId: "4:4", ownerActorId: 3 }),
    ]);
    expect(result.events.some(({ kind }) => kind === "grappling-hook-hit")).toBe(false);
    expect(result.events).toContainEqual(
      expect.objectContaining({ kind: "shove-started", actorId: 1 }),
    );
    expect(getActor(world, 1).inventory[0]?.charges).toBe(2);
  });

  it("scales Grapple acceleration by self mass and expires after twelve ticks", () => {
    const pullSpeed = (massFactor: number) => {
      const world = new SimulationWorld(createItemConfig(), `grapple-mass-${massFactor}`, {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 2, y: 4.5 },
            facing: { x: 1, y: 0 },
            massFactor,
            startingItems: ["grappling-hook"],
          },
          ...PARTICIPANT_OVERRIDES.slice(1),
        ],
      });
      world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);
      const speed = getActor(world, 1).velocity.x;

      while (world.tick <= SIMULATION_TUNING.grapplingHook.pullTicks) {
        world.step();
      }

      expect(getActor(world, 1).action).toBe("Ready");
      return speed;
    };

    expect(pullSpeed(0.85)).toBeGreaterThan(pullSpeed(1.25));
  });

  it("lets an incoming same-tick Wind Blast override GrapplePull without moving the Wind user", () => {
    const world = new SimulationWorld(createItemConfig(), "wind-overrides-grapple", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 2, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["grappling-hook"],
        },
        {
          actorId: 2,
          position: { x: 5, y: 4.5 },
          facing: { x: -1, y: 0 },
          startingItems: ["wind-blast"],
        },
        { actorId: 3, position: { x: 7.5, y: 1.5 } },
        { actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
    });
    const result = world.step([
      { ...createNeutralCommand(world.tick, 1), useItemSlot: 0 },
      { ...createNeutralCommand(world.tick, 2), useItemSlot: 0 },
    ]);

    expect(result.events.some(({ kind }) => kind === "grappling-hook-hit")).toBe(true);
    expect(result.events).toContainEqual(
      expect.objectContaining({ kind: "wind-blast-hit", actorId: 2, targetActorId: 1 }),
    );
    expect(getActor(world, 1).action).toBe("Stumbling");
    expect(getActor(world, 1).velocity.x).toBeLessThan(0);
    expect(getActor(world, 2).velocity).toEqual({ x: 0, y: 0 });
  });

  it("lets a due same-tick Bomb override GrapplePull", () => {
    const world = new SimulationWorld(createItemConfig(), "bomb-overrides-grapple", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 4, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["bomb", "grappling-hook"],
        },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
    });
    world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);

    while (world.tick < SIMULATION_TUNING.bomb.fuseTicks) {
      world.step();
    }

    const result = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 1 }]);

    expect(result.events.some(({ kind }) => kind === "bomb-detonated")).toBe(true);
    expect(result.events.some(({ kind }) => kind === "grappling-hook-hit")).toBe(false);
    expect(getActor(world, 1).action).toBe("Stumbling");
    expect(getActor(world, 1).inventory[1]?.charges).toBe(2);
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

  it("places a three-charge Soap patch on the faced cardinal tile", () => {
    const world = new SimulationWorld(createItemConfig(), "soap-placement", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 4.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["soap"],
        },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
    });
    const result = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);

    expect(result.frame.soapPatches).toEqual([
      {
        ownerActorId: 1,
        tileId: "5:4",
        column: 5,
        row: 4,
        placedTick: 0,
      },
    ]);
    expect(getActor(world, 1).inventory[0]?.charges).toBe(2);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "item-used",
          actorId: 1,
          itemDefinitionId: "soap",
          tileId: "5:4",
        }),
        expect.objectContaining({
          kind: "soap-placed",
          actorId: 1,
          itemDefinitionId: "soap",
          tileId: "5:4",
        }),
      ]),
    );
  });

  it("resolves competing Soap placements by actor id without spending the loser charge", () => {
    const run = (commandOrder: readonly number[]) => {
      const world = new SimulationWorld(createItemConfig(), "soap-placement-order", {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 4.5, y: 4.5 },
            facing: { x: 1, y: 0 },
            startingItems: ["soap"],
          },
          {
            actorId: 2,
            position: { x: 6.5, y: 4.5 },
            facing: { x: -1, y: 0 },
            startingItems: ["soap"],
          },
          { actorId: 3, position: { x: 7.5, y: 1.5 } },
          { actorId: 4, position: { x: 1.5, y: 7.5 } },
        ],
      });
      world.step(
        commandOrder.map((actorId) => ({
          ...createNeutralCommand(world.tick, actorId),
          useItemSlot: 0 as const,
        })),
      );
      const retry = world.step([
        { ...createNeutralCommand(world.tick, 2), useItemSlot: 0 as const },
      ]);
      return {
        stateHash: retry.frame.stateHash,
        patches: retry.frame.soapPatches,
        charges: [
          getActor(world, 1).inventory[0]?.charges,
          getActor(world, 2).inventory[0]?.charges,
        ],
        retryUsedSoap: retry.events.some(
          ({ kind, actorId }) => kind === "item-used" && actorId === 2,
        ),
      };
    };

    const forward = run([1, 2]);
    const reverse = run([2, 1]);

    expect(reverse).toEqual(forward);
    expect(forward.patches).toEqual([
      expect.objectContaining({ ownerActorId: 1, tileId: "5:4", placedTick: 0 }),
    ]);
    expect(forward.charges).toEqual([2, 3]);
    expect(forward.retryUsedSoap).toBe(false);
  });

  it("rejects occupied Soap tiles without spending a charge", () => {
    const bodyOccupied = new SimulationWorld(createItemConfig(), "soap-body-occupied", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 4.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["soap"],
        },
        { actorId: 2, position: { x: 5.5, y: 4.5 } },
        ...PARTICIPANT_OVERRIDES.slice(2),
      ],
    });
    const bodyResult = bodyOccupied.step([
      { ...createNeutralCommand(bodyOccupied.tick, 1), useItemSlot: 0 },
    ]);

    expect(bodyResult.frame.soapPatches).toHaveLength(0);
    expect(getActor(bodyOccupied, 1).inventory[0]?.charges).toBe(3);

    const itemOccupied = new SimulationWorld(createItemConfig(), "soap-item-occupied", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 4.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["soap"],
        },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
      itemOverrides: [{ itemId: 1, definitionId: "feather", position: { x: 5.5, y: 4.5 } }],
    });
    const itemResult = itemOccupied.step([
      { ...createNeutralCommand(itemOccupied.tick, 1), useItemSlot: 0 },
    ]);

    expect(itemResult.frame.soapPatches).toHaveLength(0);
    expect(getActor(itemOccupied, 1).inventory[0]?.charges).toBe(3);

    const boundary = new SimulationWorld(createItemConfig(), "soap-boundary", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 0.5, y: 4.5 },
          facing: { x: -1, y: 0 },
          startingItems: ["soap"],
        },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
    });
    boundary.step([{ ...createNeutralCommand(boundary.tick, 1), useItemSlot: 0 }]);
    expect(boundary.createRenderFrame().soapPatches).toHaveLength(0);
    expect(getActor(boundary, 1).inventory[0]?.charges).toBe(3);
  });

  it("commits Brick and armed Bomb occupancy before Soap", () => {
    const brickWorld = new SimulationWorld(createItemConfig(), "brick-before-soap", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 4.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["soap"],
        },
        {
          actorId: 2,
          position: { x: 5.5, y: 5.5 },
          facing: { x: 0, y: -1 },
          startingItems: ["brick-bag"],
        },
        { actorId: 3, position: { x: 7.5, y: 1.5 } },
        { actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
    });
    const brickResult = brickWorld.step([
      { ...createNeutralCommand(brickWorld.tick, 1), useItemSlot: 0 },
      { ...createNeutralCommand(brickWorld.tick, 2), useItemSlot: 0 },
    ]);

    expect(brickResult.frame.brickWalls).toEqual([
      expect.objectContaining({ tileId: "5:4", ownerActorId: 2 }),
    ]);
    expect(brickResult.frame.soapPatches).toHaveLength(0);
    expect(getActor(brickWorld, 1).inventory[0]?.charges).toBe(3);

    const bombWorld = new SimulationWorld(createItemConfig(), "bomb-before-soap", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 4.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["soap"],
        },
        {
          actorId: 2,
          position: { x: 5.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["bomb"],
        },
        { actorId: 3, position: { x: 7.5, y: 1.5 } },
        { actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
    });
    bombWorld.step([{ ...createNeutralCommand(bombWorld.tick, 2), useItemSlot: 0 }]);

    for (let tick = 0; tick < 20; tick += 1) {
      bombWorld.step([{ ...createNeutralCommand(bombWorld.tick, 2), move: { x: 1, y: 0 } }]);
    }

    const bombResult = bombWorld.step([
      { ...createNeutralCommand(bombWorld.tick, 1), useItemSlot: 0 },
    ]);
    expect(bombResult.frame.bombs).toHaveLength(1);
    expect(bombResult.frame.soapPatches).toHaveLength(0);
    expect(getActor(bombWorld, 1).inventory[0]?.charges).toBe(3);
  });

  it("keeps an existing Soap patch from being covered by a later Brick wall", () => {
    const world = new SimulationWorld(createItemConfig(), "soap-before-brick", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 4.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["soap"],
        },
        {
          actorId: 2,
          position: { x: 5.5, y: 5.5 },
          facing: { x: 0, y: -1 },
          startingItems: ["brick-bag"],
        },
        { actorId: 3, position: { x: 7.5, y: 1.5 } },
        { actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
    });

    world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);
    const brickAttempt = world.step([{ ...createNeutralCommand(world.tick, 2), useItemSlot: 0 }]);

    expect(brickAttempt.frame.soapPatches).toEqual([
      expect.objectContaining({ ownerActorId: 1, tileId: "5:4" }),
    ]);
    expect(brickAttempt.frame.brickWalls).toHaveLength(0);
    expect(getActor(world, 2).inventory[0]?.charges).toBe(4);
  });

  it("triggers one Soap victim by actor id after movement and body contacts", () => {
    const world = new SimulationWorld(createItemConfig(), "soap-trigger-order", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 6.4, y: 4.1 },
          velocity: { x: -0.42, y: 0 },
        },
        {
          actorId: 2,
          position: { x: 6.4, y: 4.9 },
          velocity: { x: -0.42, y: 0 },
        },
        { actorId: 3, position: { x: 7.5, y: 1.5 } },
        {
          actorId: 4,
          position: { x: 4.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["soap"],
        },
      ],
    });
    world.step([{ ...createNeutralCommand(world.tick, 4), useItemSlot: 0 }]);
    let result: ReturnType<SimulationWorld["step"]> | undefined;

    for (let tick = 0; tick < 12 && result === undefined; tick += 1) {
      const step = world.step([
        { ...createNeutralCommand(world.tick, 1), move: { x: -1, y: 0 } },
        { ...createNeutralCommand(world.tick, 2), move: { x: -1, y: 0 } },
      ]);

      if (step.events.some(({ kind }) => kind === "soap-triggered")) {
        result = step;
      }
    }

    expect(result).toBeDefined();
    expect(result?.frame.soapPatches).toHaveLength(0);
    expect(result?.events).toContainEqual(
      expect.objectContaining({
        kind: "soap-triggered",
        actorId: 4,
        targetActorId: 1,
        itemDefinitionId: "soap",
        tileId: "5:4",
      }),
    );
    expect(getActor(world, 1).action).toBe("Stumbling");
    expect(getActor(world, 2).action).toBe("Ready");
  });

  it("lets the installer trigger Soap and preserves launch direction and offensive credit", () => {
    const world = new SimulationWorld(createItemConfig(), "soap-self-trigger", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 4.6, y: 4.5 },
          velocity: { x: 0.42, y: 0 },
          facing: { x: 1, y: 0 },
          startingItems: ["soap"],
        },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
    });
    const placement = world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        move: { x: 1, y: 0 },
        useItemSlot: 0,
      },
    ]);
    let result: ReturnType<SimulationWorld["step"]> | undefined;

    for (let tick = 0; tick < 12 && result === undefined; tick += 1) {
      const step = world.step([{ ...createNeutralCommand(world.tick, 1), move: { x: 1, y: 0 } }]);

      if (step.events.some(({ kind }) => kind === "soap-triggered")) {
        result = step;
      }
    }
    const actor = getActor(world, 1);

    expect(placement.events.some(({ kind }) => kind === "soap-placed")).toBe(true);
    expect(result?.events).toContainEqual(
      expect.objectContaining({ kind: "soap-triggered", actorId: 1, targetActorId: 1 }),
    );
    expect(actor.action).toBe("Stumbling");
    expect(actor.velocity.x).toBeGreaterThanOrEqual(SIMULATION_TUNING.soap.minimumSpeed);
    expect(actor.velocity.x).toBeLessThanOrEqual(SIMULATION_TUNING.soap.maximumSpeed);
    expect(actor.velocity.y).toBe(0);
  });

  it("does not let Dodge ignore Soap", () => {
    const world = new SimulationWorld(createItemConfig(), "soap-dodge", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        { actorId: 1, position: { x: 6.4, y: 4.5 }, facing: { x: -1, y: 0 } },
        { actorId: 2, position: { x: 7.5, y: 1.5 } },
        { actorId: 3, position: { x: 1.5, y: 7.5 } },
        {
          actorId: 4,
          position: { x: 4.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["soap"],
        },
      ],
    });
    world.step([{ ...createNeutralCommand(world.tick, 4), useItemSlot: 0 }]);
    world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        move: { x: -1, y: 0 },
        dodgePressed: true,
      },
    ]);
    let triggerResult: ReturnType<SimulationWorld["step"]> | undefined;

    for (let tick = 0; tick < 6 && triggerResult === undefined; tick += 1) {
      const result = world.step([
        { ...createNeutralCommand(world.tick, 1), move: { x: -1, y: 0 } },
      ]);

      if (result.events.some(({ kind }) => kind === "soap-triggered")) {
        triggerResult = result;
      }
    }

    expect(triggerResult).toBeDefined();
    expect(triggerResult?.events.some(({ kind }) => kind === "dodge-succeeded")).toBe(false);
    expect(getActor(world, 1).action).toBe("Stumbling");
    const triggerTick = triggerResult?.events.find(({ kind }) => kind === "soap-triggered")?.tick;
    expect(triggerTick).toBeDefined();

    if (triggerTick === undefined) {
      throw new Error("expected Soap trigger tick");
    }

    while (world.tick < triggerTick + SIMULATION_TUNING.soap.stumbleTicks) {
      world.step();
    }

    expect(getActor(world, 1).action).toBe("Stumbling");
    world.step();
    expect(getActor(world, 1).action).toBe("Ready");
  });

  it("credits the Soap owner when the victim falls within 180 ticks", () => {
    const world = new SimulationWorld(createItemConfig(), "soap-credit", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 1.5, y: 4.9 },
          facing: { x: -1, y: 0 },
          startingItems: ["soap"],
        },
        {
          actorId: 2,
          position: { x: 1.35, y: 4.1 },
          velocity: { x: -0.42, y: 0 },
        },
        { actorId: 3, position: { x: 7.5, y: 1.5 } },
        { actorId: 4, position: { x: 7.5, y: 7.5 } },
      ],
    });
    world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);
    let trigger: ReturnType<SimulationWorld["step"]> | undefined;

    for (let tick = 0; tick < 10 && trigger === undefined; tick += 1) {
      const result = world.step([
        { ...createNeutralCommand(world.tick, 2), move: { x: -1, y: 0 } },
      ]);

      if (result.events.some(({ kind }) => kind === "soap-triggered")) {
        trigger = result;
      }
    }

    expect(trigger?.events).toContainEqual(
      expect.objectContaining({ kind: "soap-triggered", actorId: 1, targetActorId: 2 }),
    );
    let credit: SimulationEventV1 | undefined;

    for (let tick = 0; tick < 180 && credit === undefined; tick += 1) {
      const result = world.step();
      credit = result.events.find(({ kind }) => kind === "stat-point-earned");
    }

    expect(credit).toMatchObject({ kind: "stat-point-earned", actorId: 1, targetActorId: 2 });
  });

  it("preserves an earlier attacker credit when the victim triggers their own Soap", () => {
    const world = new SimulationWorld(createItemConfig(), "soap-self-credit-preservation", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 1.5, y: 4.5 },
          facing: { x: -1, y: 0 },
          startingItems: ["soap"],
        },
        { actorId: 2, position: { x: 2.2, y: 4.5 }, facing: { x: -1, y: 0 } },
        { actorId: 3, position: { x: 7.5, y: 1.5 } },
        { actorId: 4, position: { x: 7.5, y: 7.5 } },
      ],
    });

    world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);
    beginShove(world, 2);
    stepUntilHit(world);
    let soapTriggered = false;
    let credit: SimulationEventV1 | undefined;

    for (let tick = 0; tick < 180 && credit === undefined; tick += 1) {
      const result = world.step();
      soapTriggered ||= result.events.some(
        ({ kind, actorId, targetActorId }) =>
          kind === "soap-triggered" && actorId === 1 && targetActorId === 1,
      );
      credit = result.events.find(
        ({ kind, actorId, targetActorId }) =>
          kind === "stat-point-earned" && actorId === 2 && targetActorId === 1,
      );
    }

    expect(soapTriggered).toBe(true);
    expect(credit).toMatchObject({ kind: "stat-point-earned", actorId: 2, targetActorId: 1 });
  });

  it("rejects Soap on Void even while Boat is active", () => {
    const config = createItemConfig();
    const seed = "soap-boat-void";
    const probe = new SimulationWorld(config, seed);
    const tiles = probe.createRenderFrame().tiles;
    const tileById = new Map(tiles.map((tile) => [tile.tileId, tile] as const));
    const placement = tiles
      .filter(({ state }) => state !== "Void")
      .flatMap((tile) =>
        [
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: -1 },
        ].map((facing) => ({ tile, facing })),
      )
      .find(
        ({ tile, facing }) =>
          tileById.get(`${tile.column + facing.x}:${tile.row + facing.y}`)?.state === "Void",
      );

    expect(placement).toBeDefined();

    if (placement === undefined) {
      throw new Error("expected a supported tile adjacent to Void");
    }

    const world = new SimulationWorld(config, seed, {
      participantOverrides: [
        {
          actorId: 1,
          position: {
            x: placement.tile.column + 0.5,
            y: placement.tile.row + 0.5,
          },
          facing: placement.facing,
          startingItems: ["boat", "soap"],
        },
      ],
    });
    world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);
    const result = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 1 }]);

    expect(getActor(world, 1).effects).toEqual([expect.objectContaining({ definitionId: "boat" })]);
    expect(getActor(world, 1).inventory[1]?.charges).toBe(3);
    expect(result.frame.soapPatches).toHaveLength(0);
  });

  it("removes a Soap patch when its tile becomes Void", () => {
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
      "soap-flood-removal",
      {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 1.5, y: 1.5 },
            facing: { x: 0, y: -1 },
            startingItems: ["soap"],
          },
          { actorId: 2, position: { x: 4.5, y: 4.5 } },
          { actorId: 3, position: { x: 5.5, y: 4.5 } },
          { actorId: 4, position: { x: 4.5, y: 5.5 } },
        ],
      },
    );
    world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);
    expect(world.createRenderFrame().soapPatches).toEqual([
      expect.objectContaining({ tileId: "1:0" }),
    ]);
    let flooded = false;

    while (world.tick < 1_500 && !flooded) {
      const result = world.step();
      flooded = result.events.some((event) => event.kind === "tile-void" && event.tileId === "1:0");

      if (result.frame.round.status === "Completed") {
        break;
      }
    }

    expect(flooded).toBe(true);
    expect(world.createRenderFrame().soapPatches).toHaveLength(0);
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
    expect(actor.massFactor).toBeCloseTo(1.1 * 0.85, 10);
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
    const edgeRatio = bandCounts.edge / total;
    const nearEdgeRatio = bandCounts["near-edge"] / total;
    const interiorRatio = bandCounts.interior / total;

    expect(edgeRatio).toBeGreaterThan(0.4);
    expect(edgeRatio).toBeLessThan(0.6);
    expect(nearEdgeRatio).toBeGreaterThan(0.25);
    expect(nearEdgeRatio).toBeLessThan(0.42);
    expect(interiorRatio).toBeGreaterThan(0.1);
    expect(interiorRatio).toBeLessThan(0.25);
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
