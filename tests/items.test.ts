import { describe, expect, it } from "vitest";
import { getItemDefinition } from "../src/content/items";
import {
  createNeutralCommand,
  normalizeGameConfig,
  type StartingAttributes,
} from "../src/simulation/contracts";
import { getItemShoreDistance, getItemSpawnBand } from "../src/simulation/items";
import { vectorLength, subtractVectors } from "../src/simulation/math";
import { getStartingDamageTakenMultiplier } from "../src/simulation/starting-attributes";
import { SIMULATION_TUNING } from "../src/simulation/tuning";
import { SimulationWorld, type ParticipantSpawnOverride } from "../src/simulation/world";

const NEUTRAL_ATTRIBUTES: StartingAttributes = Object.freeze({
  strength: 0,
  agility: 0,
  constitution: 0,
  spirit: 0,
  balance: 0,
  willpower: 20,
});

const POWER_ATTRIBUTES: StartingAttributes = Object.freeze({
  strength: 20,
  agility: 0,
  constitution: 0,
  spirit: 0,
  balance: 0,
  willpower: 0,
});

const PARTICIPANT_OVERRIDES: readonly ParticipantSpawnOverride[] = Object.freeze([
  {
    actorId: 1,
    position: { x: 4, y: 4.5 },
    facing: { x: 1, y: 0 },
    startingAttributes: NEUTRAL_ATTRIBUTES,
  },
  {
    actorId: 2,
    position: { x: 7.5, y: 4.5 },
    facing: { x: -1, y: 0 },
    startingAttributes: NEUTRAL_ATTRIBUTES,
  },
  { actorId: 3, position: { x: 7.5, y: 1.5 }, startingAttributes: NEUTRAL_ATTRIBUTES },
  { actorId: 4, position: { x: 1.5, y: 7.5 }, startingAttributes: NEUTRAL_ATTRIBUTES },
]);

function createItemConfig(
  overrides: {
    arenaColumns?: number;
    arenaRows?: number;
    initialItemCount?: number;
    respawnSeconds?: number;
  } = {},
) {
  return normalizeGameConfig({
    participantCount: 4,
    arenaColumns: overrides.arenaColumns ?? 9,
    arenaRows: overrides.arenaRows ?? 9,
    roundLimitSeconds: 120,
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

function beginGrapple(world: SimulationWorld, actorId = 1) {
  return world.step([
    {
      ...createNeutralCommand(world.tick, actorId),
      grapplePressed: true,
    },
  ]);
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
    beginGrapple(passiveWorld);
    expect(getActor(passiveWorld, 1).inventory[1]?.definitionId).toBe("spring-glove");

    const activeWorld = new SimulationWorld(createItemConfig(), "charged-loadout", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        { ...PARTICIPANT_OVERRIDES[0]!, startingItems: ["soap", "brick-bag"] },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
    });

    expect(getActor(activeWorld, 1).inventory).toEqual([
      {
        slotIndex: 0,
        definitionId: "soap",
        charges: getItemDefinition("soap").startingCharges,
      },
      {
        slotIndex: 1,
        definitionId: "brick-bag",
        charges: getItemDefinition("brick-bag").startingCharges,
      },
    ]);
    expect(getActor(activeWorld, 1).effects).toEqual([]);
    expect(getActor(activeWorld, 1).massFactor).toBe(1);
  });

  it("automatically launches a charged Boat when its owner enters arena water", () => {
    const config = createItemConfig();
    const seed = "boat-void-support";
    const probe = new SimulationWorld(config, seed);
    const waterTile = probe.createRenderFrame().tiles.find(({ state }) => state === "Void");
    expect(waterTile).toBeDefined();

    const world = new SimulationWorld(config, seed, {
      participantOverrides: [
        {
          actorId: 1,
          startingAttributes: NEUTRAL_ATTRIBUTES,
          position: { x: waterTile!.column + 0.5, y: waterTile!.row + 0.5 },
          startingItems: ["boat"],
        },
        {
          actorId: 2,
          startingAttributes: NEUTRAL_ATTRIBUTES,
          position: { x: 4, y: 4.5 },
          startingItems: ["boat"],
        },
        {
          actorId: 3,
          startingAttributes: NEUTRAL_ATTRIBUTES,
          position: { x: 7.5, y: 1.5 },
          startingItems: ["boat"],
        },
        {
          actorId: 4,
          startingAttributes: NEUTRAL_ATTRIBUTES,
          position: { x: 1.5, y: 7.5 },
          startingItems: ["boat"],
        },
      ],
    });

    const activation = world.step();

    expect(activation.events).toContainEqual(
      expect.objectContaining({ kind: "item-used", actorId: 1, itemDefinitionId: "boat" }),
    );
    expect(getActor(world, 1).inventory[0]?.charges).toBe(0);
    expect(getActor(world, 1).effects).toEqual([
      expect.objectContaining({ definitionId: "boat", endsTick: expect.any(Number) }),
    ]);
    expect(getActor(world, 1).unsupportedTicks).toBe(0);

    expect(getActor(world, 1).effects.length).toBe(1);
    expect(getActor(world, 1).unsupportedTicks).toBe(0);
  });

  it("does not spend or launch a Boat while its owner remains on land", () => {
    const world = new SimulationWorld(createItemConfig(), "boat-land-rejection", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          startingAttributes: NEUTRAL_ATTRIBUTES,
          position: { x: 4.5, y: 4.5 },
          startingItems: ["boat"],
        },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
    });

    const result = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);

    expect(result.events).not.toContainEqual(
      expect.objectContaining({ kind: "item-used", actorId: 1, itemDefinitionId: "boat" }),
    );
    expect(getActor(world, 1).inventory[0]?.charges).toBe(1);
    expect(getActor(world, 1).effects).toEqual([]);
  });

  it("does not spend a Boat outside the generated arena", () => {
    const world = new SimulationWorld(createItemConfig(), "boat-outside-arena", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          startingAttributes: NEUTRAL_ATTRIBUTES,
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
      },
    ]);

    expect(result.events.some(({ kind }) => kind === "item-used")).toBe(false);
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
          startingAttributes: NEUTRAL_ATTRIBUTES,
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

  it("places a Bomb on the current tile and detonates after its shared fuse duration", () => {
    const world = new SimulationWorld(createItemConfig(), "bomb-exact-fuse", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          startingAttributes: NEUTRAL_ATTRIBUTES,
          position: { x: 4.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["bomb"],
        },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 2, position: { x: 8.5, y: 1.5 } },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 3, position: { x: 8.5, y: 7.5 } },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
    });
    const placement = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);

    expect(placement.frame.bombs).toEqual([
      {
        ownerActorId: 1,
        position: { x: 4.5, y: 4.5 },
        fallbackDirection: { x: 1, y: 0 },
        placedTick: 0,
        detonateTick: getItemDefinition("bomb").fuseTicks,
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
            startingAttributes: NEUTRAL_ATTRIBUTES,
            position: { x: 4.25, y: 4.5 },
            facing: { x: 1, y: 0 },
            startingItems: ["bomb"],
          },
          {
            actorId: 2,
            startingAttributes: NEUTRAL_ATTRIBUTES,
            position: { x: 4.75, y: 4.5 },
            facing: { x: -1, y: 0 },
            startingItems: ["bomb"],
          },
          { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 3, position: { x: 7.5, y: 1.5 } },
          { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 4, position: { x: 1.5, y: 7.5 } },
        ],
      });
      const result = world.step(
        actorIds.map((actorId) => ({
          ...createNeutralCommand(world.tick, actorId),
          useItemSlot: 0 as const,
          targetPosition: { x: 6.5, y: 4.5 },
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

  it("damages opponents through Dodge while applying one fifth damage to the Bomb owner", () => {
    const world = new SimulationWorld(createItemConfig(), "bomb-dodge", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          startingAttributes: NEUTRAL_ATTRIBUTES,
          position: { x: 4.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["bomb"],
        },
        {
          startingAttributes: NEUTRAL_ATTRIBUTES,
          actorId: 2,
          position: { x: 6.5, y: 4.5 },
          facing: { x: 0, y: -1 },
        },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 3, position: { x: 8.5, y: 1.5 } },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
    });
    world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);

    while (world.tick < SIMULATION_TUNING.bomb.fuseTicks) {
      world.step();
    }

    const ownerHealthBeforeBlast = getActor(world, 1).combat.health;
    const result = world.step([{ ...createNeutralCommand(world.tick, 2), dodgePressed: true }]);

    expect(result.events).not.toContainEqual(
      expect.objectContaining({ kind: "dodge-succeeded", actorId: 2, targetActorId: 1 }),
    );
    const owner = getActor(world, 1);
    const opponent = getActor(world, 2);

    expect(opponent.active).toBe(true);
    expect(opponent.action).toBe("Stumbling");
    expect(opponent.combat.health).toBe(
      100 - getItemDefinition("bomb").damage * getStartingDamageTakenMultiplier(NEUTRAL_ATTRIBUTES),
    );
    expect(owner.active).toBe(true);
    expect(owner.action).toBe("Stumbling");
    expect(owner.combat.health).toBe(
      ownerHealthBeforeBlast -
        getItemDefinition("bomb").damage *
          getItemDefinition("bomb").ownerDamageMultiplier *
          getStartingDamageTakenMultiplier(NEUTRAL_ATTRIBUTES),
    );
    expect(owner.velocity.x).toBeGreaterThan(0);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        kind: "damage-applied",
        actorId: 1,
        targetActorId: 1,
        itemDefinitionId: "bomb",
      }),
    );
  });

  it("keeps an armed Bomb through flooding and owner elimination", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({
        participantCount: 4,
        arenaColumns: 9,
        arenaRows: 9,
        roundLimitSeconds: 120,
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
            startingAttributes: NEUTRAL_ATTRIBUTES,
            position: { x: 0.5, y: 0.5 },
            startingItems: ["bomb"],
          },
          { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 2, position: { x: 4.5, y: 4.5 } },
          { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 3, position: { x: 5.5, y: 4.5 } },
          { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 4, position: { x: 4.5, y: 5.5 } },
        ],
      },
    );
    let bombTile = world.createRenderFrame().tiles.find(({ tileId }) => tileId === "0:0");

    while (bombTile?.state === "Stable" || bombTile?.state === "Warning") {
      world.step();
      bombTile = world.createRenderFrame().tiles.find(({ tileId }) => tileId === "0:0");
    }

    expect(bombTile?.state).toBe("Collapsing");
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

  it("places Soap on a valid target tile and spends one charge", () => {
    const world = new SimulationWorld(createItemConfig(), "soap-placement", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          startingAttributes: NEUTRAL_ATTRIBUTES,
          actorId: 1,
          position: { x: 2.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["soap"],
        },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
    });

    const result = world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        useItemSlot: 0,
        targetPosition: { x: 3.5, y: 4.5 },
      },
    ]);

    expect(result.frame.soapPatches).toEqual([
      expect.objectContaining({ ownerActorId: 1, tileId: "3:4" }),
    ]);
    expect(result.events).toContainEqual(
      expect.objectContaining({ kind: "soap-placed", actorId: 1, itemDefinitionId: "soap" }),
    );
    expect(getActor(world, 1).inventory[0]?.charges).toBe(
      (getItemDefinition("soap").startingCharges ?? 0) - 1,
    );
  });

  it("keeps the Soap owner safe and damages another actor after the slip ends", () => {
    const world = new SimulationWorld(
      createItemConfig({ arenaColumns: 17, arenaRows: 9 }),
      "soap-trigger",
      {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            startingAttributes: NEUTRAL_ATTRIBUTES,
            actorId: 1,
            position: { x: 2.5, y: 4.5 },
            facing: { x: 1, y: 0 },
            startingItems: ["soap"],
          },
          {
            startingAttributes: NEUTRAL_ATTRIBUTES,
            actorId: 2,
            position: { x: 4.5, y: 4.5 },
            facing: { x: 1, y: 0 },
          },
          {
            startingAttributes: NEUTRAL_ATTRIBUTES,
            actorId: 3,
            position: { x: 15.5, y: 1.5 },
          },
          {
            startingAttributes: NEUTRAL_ATTRIBUTES,
            actorId: 4,
            position: { x: 1.5, y: 7.5 },
          },
        ],
      },
    );
    world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        useItemSlot: 0,
        targetPosition: { x: 5.5, y: 4.5 },
      },
    ]);

    let triggerTick: number | undefined;
    let triggerPositionX: number | undefined;
    for (let index = 0; index < 90 && triggerTick === undefined; index += 1) {
      const result = world.step([{ ...createNeutralCommand(world.tick, 2), move: { x: 1, y: 0 } }]);
      if (
        result.events.some(
          ({ kind, targetActorId }) => kind === "soap-triggered" && targetActorId === 2,
        )
      ) {
        triggerTick = result.frame.tick - 1;
        triggerPositionX = getActor(world, 2).position.x;
      }
    }

    expect(triggerTick).toBeDefined();
    expect(getActor(world, 1).combat.health).toBe(100);
    expect(getActor(world, 2).action).toBe("Slipping");
    expect(getActor(world, 2).velocity.x).toBeGreaterThanOrEqual(
      getItemDefinition("soap").slideMinimumSpeed,
    );
    const healthBeforeDamage = getActor(world, 2).combat.health;
    world.step([{ ...createNeutralCommand(world.tick, 2), move: { x: -1, y: 0 } }]);
    expect(getActor(world, 2).position.x - (triggerPositionX ?? 0)).toBeGreaterThan(0.1);
    for (let index = 1; index < 60; index += 1) {
      world.step([{ ...createNeutralCommand(world.tick, 2), move: { x: -1, y: 0 } }]);
    }
    const halfwayActor = getActor(world, 2);
    expect(halfwayActor.action).toBe("Slipping");
    expect(halfwayActor.position.x - (triggerPositionX ?? 0)).toBeGreaterThan(4);
    expect(halfwayActor.position.y).toBeCloseTo(4.5, 6);

    let damageEvent;
    let stunEvent;
    for (let index = 60; index <= getItemDefinition("soap").stumbleTicks; index += 1) {
      const result = world.step();
      damageEvent = result.events.find(
        ({ kind, itemDefinitionId, targetActorId }) =>
          kind === "damage-applied" && itemDefinitionId === "soap" && targetActorId === 2,
      );
      stunEvent = result.events.find(
        ({ kind, itemDefinitionId, targetActorId }) =>
          kind === "status-applied" && itemDefinitionId === "soap" && targetActorId === 2,
      );
      if (damageEvent !== undefined) {
        break;
      }
    }

    expect(damageEvent).toMatchObject({ actorId: 1, targetActorId: 2 });
    expect(damageEvent?.amount).toBeGreaterThan(0);
    expect(getItemDefinition("soap").stunTicks).toBe(90);
    expect(getActor(world, 2).combat.stunnedUntilTick).toBeGreaterThan(world.tick);
    expect(stunEvent).toMatchObject({
      actorId: 1,
      targetActorId: 2,
      statusKind: "stun",
      durationTicks: getItemDefinition("soap").stunTicks,
    });
    expect(getActor(world, 2).combat.health).toBeCloseTo(
      healthBeforeDamage - (damageEvent?.amount ?? 0),
      6,
    );
  });

  it("does not grapple toward a body or bare ground and spends no cooldown", () => {
    const world = new SimulationWorld(createItemConfig(), "grapple-bare-ground", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          startingAttributes: NEUTRAL_ATTRIBUTES,
          position: { x: 2, y: 4.5 },
          facing: { x: 1, y: 0 },
        },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 2, position: { x: 3.2, y: 4.5 } },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 3, position: { x: 7.5, y: 1.5 } },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
    });
    const result = world.step([{ ...createNeutralCommand(world.tick, 1), grapplePressed: true }]);

    expect(result.events.some(({ kind }) => kind === "grappling-hook-hit")).toBe(false);
    expect(getActor(world, 1).grappleReadyTick).toBe(0);
    expect(getActor(world, 1).action).toBe("Ready");
    expect(getActor(world, 1).position).toEqual({ x: 2, y: 4.5 });
  });

  it("ignores bodies, catches a tree, and pulls close to the obstacle", () => {
    const world = new SimulationWorld(createItemConfig(), "grapple-tree-anchor", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          startingAttributes: NEUTRAL_ATTRIBUTES,
          position: { x: 2.5, y: 4.5 },
          facing: { x: 1, y: 0 },
        },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 2, position: { x: 3.2, y: 5.5 } },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 3, position: { x: 7.5, y: 1.5 } },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
      treeOverrides: [{ definitionId: "tree", tileId: "7:4", column: 7, row: 4 }],
    });
    const start = getActor(world, 1).position;
    const result = world.step([{ ...createNeutralCommand(world.tick, 1), grapplePressed: true }]);
    const hit = result.events.find(({ kind }) => kind === "grappling-hook-hit");

    expect(hit).toMatchObject({
      actorId: 1,
      tileId: "7:4",
      position: start,
      vector: { x: 4.5, y: 0 },
    });
    expect(getActor(world, 1).grappleReadyTick).toBe(SIMULATION_TUNING.grapplingHook.cooldownTicks);
    expect(getActor(world, 1).action).toBe("GrapplePull");

    while (getActor(world, 1).action === "GrapplePull") {
      world.step();
    }

    const travelled = getActor(world, 1).position.x - start.x;
    expect(travelled).toBeGreaterThan(3.8);
    expect(travelled).toBeLessThanOrEqual(SIMULATION_TUNING.grapplingHook.range);
    expect(getActor(world, 1).action).toBe("Ready");
  });

  it("uses a same-tick Brick as the nearer static anchor independent of command order", () => {
    const run = (actorIds: readonly number[]) => {
      const world = new SimulationWorld(createItemConfig(), "brick-before-grapple", {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            startingAttributes: NEUTRAL_ATTRIBUTES,
            position: { x: 2.5, y: 4.5 },
            facing: { x: 1, y: 0 },
          },
          { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 2, position: { x: 7.5, y: 4.5 } },
          {
            actorId: 3,
            startingAttributes: NEUTRAL_ATTRIBUTES,
            position: { x: 4.5, y: 5.5 },
            facing: { x: 0, y: -1 },
            startingItems: ["brick-bag"],
          },
          { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 4, position: { x: 1.5, y: 7.5 } },
        ],
      });
      const result = world.step(
        actorIds.map((actorId) => ({
          ...createNeutralCommand(world.tick, actorId),
          grapplePressed: actorId === 1,
          useItemSlot: actorId === 3 ? (0 as const) : null,
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

  it("does not start grapple without a minimum-distance anchor", () => {
    const world = new SimulationWorld(createItemConfig(), "grapple-no-anchor", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          startingAttributes: NEUTRAL_ATTRIBUTES,
          position: { x: 7.9, y: 4.5 },
          facing: { x: 1, y: 0 },
        },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 2, position: { x: 8.5, y: 4.5 } },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 3, position: { x: 7.5, y: 1.5 } },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
    });
    const result = world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        grapplePressed: true,
      },
    ]);

    expect(result.events.some(({ kind }) => kind === "grappling-hook-hit")).toBe(false);
    expect(getActor(world, 1).action).toBe("Ready");
    expect(getActor(world, 1).grappleReadyTick).toBe(0);
    const retry = world.step([{ ...createNeutralCommand(world.tick, 1), grapplePressed: true }]);
    expect(retry.events.some(({ kind }) => kind === "grappling-hook-hit")).toBe(false);
    expect(getActor(world, 1).grappleReadyTick).toBe(0);
  });

  it("does not start grapple when a same-tick Brick blocks the anchor inside minimum range", () => {
    const world = new SimulationWorld(createItemConfig(), "near-brick-blocks-grapple", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          startingAttributes: NEUTRAL_ATTRIBUTES,
          position: { x: 3.5, y: 4.5 },
          facing: { x: 1, y: 0 },
        },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 2, position: { x: 7.5, y: 4.5 } },
        {
          actorId: 3,
          startingAttributes: NEUTRAL_ATTRIBUTES,
          position: { x: 4.5, y: 5.5 },
          facing: { x: 0, y: -1 },
          startingItems: ["brick-bag"],
        },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
    });
    const result = world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        grapplePressed: true,
      },
      { ...createNeutralCommand(world.tick, 3), useItemSlot: 0 },
    ]);

    expect(result.frame.brickWalls).toEqual([
      expect.objectContaining({ tileId: "4:4", ownerActorId: 3 }),
    ]);
    expect(result.events.some(({ kind }) => kind === "grappling-hook-hit")).toBe(false);
    expect(getActor(world, 1).action).toBe("Ready");
    expect(getActor(world, 1).grappleReadyTick).toBe(0);
  });

  it("scales Grapple acceleration by self mass and expires after sixteen ticks", () => {
    const pullSpeed = (massFactor: number) => {
      const world = new SimulationWorld(createItemConfig(), `grapple-mass-${massFactor}`, {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            startingAttributes: NEUTRAL_ATTRIBUTES,
            position: { x: 2, y: 4.5 },
            facing: { x: 1, y: 0 },
            massFactor,
          },
          ...PARTICIPANT_OVERRIDES.slice(1),
        ],
        treeOverrides: [{ definitionId: "tree", tileId: "6:4", column: 6, row: 4 }],
      });
      world.step([{ ...createNeutralCommand(world.tick, 1), grapplePressed: true }]);
      const speed = getActor(world, 1).velocity.x;

      while (world.tick <= SIMULATION_TUNING.grapplingHook.pullTicks) {
        world.step();
      }

      expect(getActor(world, 1).action).toBe("Ready");
      return speed;
    };

    expect(pullSpeed(0.85)).toBeGreaterThan(pullSpeed(1.25));
  });

  it("places a Brick Bag wall on the faced cardinal tile and spends one charge", () => {
    const world = new SimulationWorld(createItemConfig(), "brick-placement", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          startingAttributes: NEUTRAL_ATTRIBUTES,
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
    expect(getActor(world, 1).inventory[0]?.charges).toBe(
      (getItemDefinition("brick-bag").startingCharges ?? 0) - 1,
    );
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

  it("heals exactly 7 health after a successful ranged Brick Bag placement", () => {
    const world = new SimulationWorld(createItemConfig(), "brick-placement-heal", {
      arenaLayout: "rectangular-fixture",
      treeOverrides: [],
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 4.5, y: 4.5 },
          facing: { x: 0, y: -1 },
          startingItems: ["brick-bag"],
        },
        {
          actorId: 2,
          position: { x: 5.5, y: 4.5 },
          facing: { x: -1, y: 0 },
          startingAttributes: POWER_ATTRIBUTES,
          startingSkills: ["chain-bind", "blink-step"],
        },
        { actorId: 3, position: { x: 8.5, y: 1.5 } },
        { actorId: 4, position: { x: 1.5, y: 7.5 } },
      ],
    });
    world.step([{ ...createNeutralCommand(world.tick, 2), useSkillSlot: 0 }]);
    const damaged = getActor(world, 1);

    while (
      (world.tick < damaged.combat.rootedUntilTick || getActor(world, 1).action !== "Ready") &&
      world.tick < 300
    ) {
      world.step();
    }

    const beforePlacement = getActor(world, 1);
    const targetPosition = {
      x: beforePlacement.position.x,
      y: beforePlacement.position.y - 1.5,
    };
    const result = world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        useItemSlot: 0,
        targetPosition,
      },
    ]);
    const healed = getActor(world, 1);

    expect(result.events).toContainEqual(
      expect.objectContaining({ kind: "brick-wall-placed", actorId: 1 }),
    );
    expect(healed.combat.health).toBe(
      Math.min(healed.combat.maximumHealth, beforePlacement.combat.health + 7),
    );
  });

  it("rejects Brick Bag targets beyond its two-tile cast range", () => {
    const world = new SimulationWorld(createItemConfig(), "brick-range-limit", {
      arenaLayout: "rectangular-fixture",
      treeOverrides: [],
      participantOverrides: [
        {
          actorId: 1,
          position: { x: 4.5, y: 4.5 },
          facing: { x: 0, y: -1 },
          startingItems: ["brick-bag"],
        },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
    });
    const result = world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        useItemSlot: 0,
        targetPosition: { x: 4.5, y: 2.3 },
      },
    ]);

    expect(result.frame.brickWalls).toHaveLength(0);
    expect(getActor(world, 1).inventory[0]?.charges).toBe(
      getItemDefinition("brick-bag").startingCharges,
    );
  });

  it("does not spend Brick Bag charges when the target tile is invalid or occupied", () => {
    const outOfBounds = new SimulationWorld(createItemConfig(), "brick-out-of-bounds", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          startingAttributes: NEUTRAL_ATTRIBUTES,
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
      },
    ]);

    expect(invalidResult.frame.brickWalls).toHaveLength(0);
    expect(getActor(outOfBounds, 1).inventory[0]?.charges).toBe(
      getItemDefinition("brick-bag").startingCharges,
    );

    const occupied = new SimulationWorld(createItemConfig(), "brick-occupied", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          startingAttributes: NEUTRAL_ATTRIBUTES,
          position: { x: 4.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["brick-bag"],
        },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 2, position: { x: 5.5, y: 4.5 } },
        ...PARTICIPANT_OVERRIDES.slice(2),
      ],
    });
    const occupiedResult = occupied.step([
      { ...createNeutralCommand(occupied.tick, 1), useItemSlot: 0 },
    ]);

    expect(occupiedResult.frame.brickWalls).toHaveLength(0);
    expect(getActor(occupied, 1).inventory[0]?.charges).toBe(
      getItemDefinition("brick-bag").startingCharges,
    );
    expect(occupiedResult.events.some(({ kind }) => kind === "item-used")).toBe(false);
  });

  it("resolves competing Brick Bag placements by actor id, not command order", () => {
    const run = (actorIds: readonly number[]) => {
      const world = new SimulationWorld(createItemConfig(), "brick-placement-order", {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            startingAttributes: NEUTRAL_ATTRIBUTES,
            position: { x: 4.5, y: 4.5 },
            facing: { x: 1, y: 0 },
            startingItems: ["brick-bag"],
          },
          {
            actorId: 2,
            startingAttributes: NEUTRAL_ATTRIBUTES,
            position: { x: 6.5, y: 4.5 },
            facing: { x: -1, y: 0 },
            startingItems: ["brick-bag"],
          },
          { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 3, position: { x: 7.5, y: 1.5 } },
          { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 4, position: { x: 1.5, y: 7.5 } },
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

  it("stops launched actors at a Brick Bag wall without reflecting them", () => {
    const world = new SimulationWorld(createItemConfig(), "brick-launch-stop", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          actorId: 1,
          startingAttributes: NEUTRAL_ATTRIBUTES,
          position: { x: 1.5, y: 4.5 },
          facing: { x: 1, y: 0 },
          startingItems: ["soap"],
        },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 2, position: { x: 3.2, y: 4.5 } },
        {
          actorId: 3,
          startingAttributes: NEUTRAL_ATTRIBUTES,
          position: { x: 4.5, y: 5.5 },
          facing: { x: 0, y: -1 },
          startingItems: ["brick-bag"],
        },
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 4, position: { x: 7.5, y: 7.5 } },
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

  it("removes a Brick Bag wall after its tile becomes Void", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({
        participantCount: 4,
        arenaColumns: 9,
        arenaRows: 9,
        roundLimitSeconds: 120,
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
            startingAttributes: NEUTRAL_ATTRIBUTES,
            position: { x: 1.5, y: 1.5 },
            facing: { x: 0, y: -1 },
            startingItems: ["brick-bag"],
          },
          { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 2, position: { x: 4.5, y: 4.5 } },
          { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 3, position: { x: 5.5, y: 4.5 } },
          { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 4, position: { x: 4.5, y: 5.5 } },
        ],
      },
    );
    const placement = world.step([{ ...createNeutralCommand(world.tick, 1), useItemSlot: 0 }]);
    expect(placement.frame.brickWalls).toEqual([
      expect.objectContaining({ tileId: "1:0", ownerActorId: 1 }),
    ]);
    let removal: ReturnType<SimulationWorld["step"]> | undefined;

    while (world.tick < 7_200 && removal === undefined) {
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

  it("consumes a picked-up spring glove and increases built-in grapple velocity", () => {
    function run(boosted: boolean) {
      const world = new SimulationWorld(createItemConfig(), `spring-compare-${boosted}`, {
        arenaLayout: "rectangular-fixture",
        participantOverrides: PARTICIPANT_OVERRIDES,
        itemOverrides: boosted
          ? [{ itemId: 1, definitionId: "spring-glove", position: { x: 4, y: 4.5 } }]
          : [],
        treeOverrides: [{ definitionId: "tree", tileId: "6:4", column: 6, row: 4 }],
      });
      world.step();
      const result = beginGrapple(world);
      return {
        effects: getActor(world, 1).effects,
        grappleHit: result.events.some(({ kind }) => kind === "grappling-hook-hit"),
        speed: vectorLength(getActor(world, 1).velocity),
      };
    }

    const boosted = run(true);
    const unboosted = run(false);
    expect(boosted.grappleHit).toBe(true);
    expect(unboosted.grappleHit).toBe(true);
    expect(boosted.effects).toEqual([]);
    expect(boosted.speed).toBeGreaterThan(unboosted.speed);
  });

  it("keeps spring momentum when grapple misses and clears timed effects on falling", () => {
    const springWorld = new SimulationWorld(createItemConfig(), "spring-miss", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        {
          ...PARTICIPANT_OVERRIDES[0]!,
          position: { x: 7.9, y: 4.5 },
          facing: { x: 1, y: 0 },
        },
        ...PARTICIPANT_OVERRIDES.slice(1),
      ],
      itemOverrides: [{ itemId: 1, definitionId: "spring-glove", position: { x: 7.9, y: 4.5 } }],
    });
    springWorld.step();
    const missed = beginGrapple(springWorld);
    expect(missed.events.some(({ kind }) => kind === "grappling-hook-hit")).toBe(false);
    expect(getActor(springWorld, 1).effects[0]?.definitionId).toBe("spring-glove");

    const fallingWorld = new SimulationWorld(createItemConfig(), "falling-clears-effects", {
      arenaLayout: "rectangular-fixture",
      participantOverrides: [
        { startingAttributes: NEUTRAL_ATTRIBUTES, actorId: 1, position: { x: -0.5, y: 4.5 } },
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
  it("alternates two opposite treasure ships and targets land three to seven tiles from water", () => {
    const world = new SimulationWorld(
      createItemConfig({ initialItemCount: 0, respawnSeconds: 2 }),
      "two-treasure-ships",
      { arenaLayout: "rectangular-fixture", participantOverrides: PARTICIPANT_OVERRIDES },
    );
    const initialFrame = world.createRenderFrame();
    expect(initialFrame.treasureShips).toHaveLength(2);
    expect(
      vectorLength(
        subtractVectors(
          initialFrame.treasureShips[0]!.position,
          initialFrame.treasureShips[1]!.position,
        ),
      ),
    ).toBeGreaterThan(10);

    const launchedShipIds = new Set<number>();
    const observedDeliveryIds = new Set<number>();
    let maximumConcurrentDeliveries = 0;

    for (let tick = 0; tick < 180; tick += 1) {
      const frame = world.step().frame;
      maximumConcurrentDeliveries = Math.max(
        maximumConcurrentDeliveries,
        frame.giftDeliveries.length,
      );
      for (const delivery of frame.giftDeliveries) {
        if (observedDeliveryIds.has(delivery.deliveryId)) {
          continue;
        }
        observedDeliveryIds.add(delivery.deliveryId);
        launchedShipIds.add(delivery.shipId);
        expect(getItemShoreDistance(delivery.target, frame.tiles)).toBeGreaterThanOrEqual(3);
        expect(getItemShoreDistance(delivery.target, frame.tiles)).toBeLessThanOrEqual(7);
      }
    }

    expect(launchedShipIds).toEqual(new Set([1, 2]));
    expect(maximumConcurrentDeliveries).toBe(2);
  });

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
      normalizeGameConfig({
        participantCount: 4,
        arenaColumns: 25,
        arenaRows: 25,
        roundLimitSeconds: 120,
        collapseSpeed: "slow",
        itemsEnabled: true,
        initialItemCount: 0,
        itemRespawnSeconds: 1,
      }),
      "stable-spawns",
      { arenaLayout: "rectangular-fixture", participantOverrides: PARTICIPANT_OVERRIDES },
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

  it("accepts all loadout items from the map-pickup override path", () => {
    expect(
      () =>
        new SimulationWorld(createItemConfig(), "active-map-override", {
          arenaLayout: "rectangular-fixture",
          participantOverrides: PARTICIPANT_OVERRIDES,
          itemOverrides: [{ itemId: 1, definitionId: "soap", position: { x: 4, y: 4.5 } }],
        }),
    ).not.toThrow();
  });
});
