import { describe, expect, it } from "vitest";
import { createNeutralCommand, normalizeGameConfig } from "../src/simulation/contracts";
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
});
