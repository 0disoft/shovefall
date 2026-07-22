import { describe, expect, it } from "vitest";
import { createNeutralCommand, normalizeGameConfig } from "../src/simulation/contracts";
import { vectorLength } from "../src/simulation/math";
import { getMovementProfile, SIMULATION_TUNING } from "../src/simulation/tuning";
import { SimulationWorld, type ParticipantSpawnOverride } from "../src/simulation/world";

const CONFIG = normalizeGameConfig({ participantCount: 4, roundLimitSeconds: 10 });

function getActor(world: SimulationWorld, actorId: number) {
  const actor = world
    .createRenderFrame()
    .participants.find((participant) => participant.actorId === actorId);

  if (actor === undefined) {
    throw new Error(`missing actor ${actorId}`);
  }

  return actor;
}

function createWorld(
  overrides: readonly ParticipantSpawnOverride[],
  seed = "combat-fixture",
): SimulationWorld {
  return new SimulationWorld(CONFIG, seed, { participantOverrides: overrides });
}

function createSeparatedOverrides(
  actorOne: ParticipantSpawnOverride,
  actorTwo: ParticipantSpawnOverride = { actorId: 2, position: { x: 8.5, y: 7.5 } },
): readonly ParticipantSpawnOverride[] {
  return [
    actorOne,
    actorTwo,
    { actorId: 3, position: { x: 8.5, y: 1.5 } },
    { actorId: 4, position: { x: 1.5, y: 7.5 } },
  ];
}

function stepWithMovement(world: SimulationWorld, actorId: number, x: number, y: number) {
  return world.step([
    {
      ...createNeutralCommand(world.tick, actorId),
      move: { x, y },
    },
  ]);
}

function beginShove(world: SimulationWorld, actorIds: readonly number[]) {
  return world.step(
    actorIds.map((actorId) => ({
      ...createNeutralCommand(world.tick, actorId),
      shovePressed: true,
    })),
  );
}

describe("gray-box movement and action timing", () => {
  it("keeps the maximum-speed mass curve monotonic and within a 25% spread", () => {
    const light = getMovementProfile(SIMULATION_TUNING.mass.minimum);
    const normal = getMovementProfile(SIMULATION_TUNING.mass.default);
    const heavy = getMovementProfile(SIMULATION_TUNING.mass.maximum);

    expect(light.maximumSpeed).toBeGreaterThan(normal.maximumSpeed);
    expect(normal.maximumSpeed).toBeGreaterThan(heavy.maximumSpeed);
    expect(light.acceleration).toBeGreaterThan(normal.acceleration);
    expect(normal.acceleration).toBeGreaterThan(heavy.acceleration);
    expect(light.maximumSpeed / heavy.maximumSpeed).toBeLessThan(1.25);
  });

  it("moves a light body farther than a heavy body under identical input", () => {
    const light = createWorld(
      createSeparatedOverrides({
        actorId: 1,
        position: { x: 3.5, y: 4.5 },
        massFactor: SIMULATION_TUNING.mass.minimum,
      }),
      "light-movement",
    );
    const heavy = createWorld(
      createSeparatedOverrides({
        actorId: 1,
        position: { x: 3.5, y: 4.5 },
        massFactor: SIMULATION_TUNING.mass.maximum,
      }),
      "heavy-movement",
    );

    for (let tick = 0; tick < 24; tick += 1) {
      stepWithMovement(light, 1, 1, 0);
      stepWithMovement(heavy, 1, 1, 0);
    }

    expect(getActor(light, 1).position.x).toBeGreaterThan(getActor(heavy, 1).position.x);
  });

  it("uses exact shove boundary ticks", () => {
    const world = createWorld(
      createSeparatedOverrides({ actorId: 1, position: { x: 4.5, y: 4.5 } }),
    );

    expect(beginShove(world, [1]).frame.participants[0]?.action).toBe("ShoveWindup");

    for (let tick = 1; tick < SIMULATION_TUNING.shove.windupTicks; tick += 1) {
      world.step();
      expect(getActor(world, 1).action).toBe("ShoveWindup");
    }

    world.step();
    expect(getActor(world, 1).action).toBe("ShoveActive");

    for (let tick = 1; tick < SIMULATION_TUNING.shove.activeTicks; tick += 1) {
      world.step();
      expect(getActor(world, 1).action).toBe("ShoveActive");
    }

    const result = world.step();
    expect(getActor(world, 1).action).toBe("Stumbling");
    expect(result.events.map(({ kind }) => kind)).toContain("shove-missed");
  });

  it("gives dodge priority when shove and dodge edges arrive together", () => {
    const world = createWorld(
      createSeparatedOverrides({ actorId: 1, position: { x: 4.5, y: 4.5 } }),
    );
    world.step([
      {
        ...createNeutralCommand(0, 1),
        shovePressed: true,
        dodgePressed: true,
        move: { x: 0, y: -1 },
      },
    ]);

    const actor = getActor(world, 1);
    expect(actor.action).toBe("DodgeActive");
    expect(actor.dodgeReadyTick).toBe(SIMULATION_TUNING.dodge.cooldownTicks);
    expect(actor.shoveReadyTick).toBe(0);
  });

  it("caps extreme finite velocities without producing a non-finite state", () => {
    const world = createWorld(
      createSeparatedOverrides({
        actorId: 1,
        position: { x: 4.5, y: 4.5 },
        velocity: { x: Number.MAX_VALUE, y: Number.MAX_VALUE },
      }),
      "finite-cap",
    );
    const actor = getActor(world, 1);

    expect(Number.isFinite(actor.velocity.x)).toBe(true);
    expect(Number.isFinite(actor.velocity.y)).toBe(true);
    expect(vectorLength(actor.velocity)).toBeLessThanOrEqual(SIMULATION_TUNING.body.maximumSpeed);
  });

  it("accepts a dodge again on its exact cooldown boundary", () => {
    const world = createWorld(
      createSeparatedOverrides({ actorId: 1, position: { x: 4.5, y: 4.5 } }),
      "dodge-cooldown",
    );
    world.step([
      {
        ...createNeutralCommand(0, 1),
        dodgePressed: true,
        move: { x: 1, y: 0 },
      },
    ]);

    while (world.tick < SIMULATION_TUNING.dodge.cooldownTicks - 1) {
      world.step();
    }

    world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        dodgePressed: true,
        move: { x: 0, y: 1 },
      },
    ]);
    expect(getActor(world, 1).action).toBe("Ready");

    world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        dodgePressed: true,
        move: { x: 0, y: 1 },
      },
    ]);
    expect(getActor(world, 1).action).toBe("DodgeActive");
  });
});

describe("gray-box shove resolution", () => {
  function duelOverrides(swapped = false): readonly ParticipantSpawnOverride[] {
    const left = {
      actorId: swapped ? 2 : 1,
      position: { x: 4, y: 4.5 },
      facing: { x: 1, y: 0 },
    };
    const right = {
      actorId: swapped ? 1 : 2,
      position: { x: 4.78, y: 4.5 },
      facing: { x: -1, y: 0 },
    };
    return createSeparatedOverrides(left, right);
  }

  function runMutualShove(swapped = false, commandOrder: readonly number[] = [1, 2]) {
    const world = createWorld(duelOverrides(swapped), `mutual-${swapped}`);
    const initial = beginShove(world, commandOrder);
    const events = [...initial.events];

    while (world.tick <= SIMULATION_TUNING.shove.windupTicks) {
      const result = world.step();
      events.push(...result.events);

      if (result.events.some(({ kind }) => kind === "shove-hit")) {
        return { world, result, events };
      }
    }

    throw new Error("mutual shove did not make contact");
  }

  it("applies both same-tick shove contacts before changing action state", () => {
    const { world, result } = runMutualShove();
    const actorOne = getActor(world, 1);
    const actorTwo = getActor(world, 2);

    expect(result.events.filter(({ kind }) => kind === "shove-hit")).toHaveLength(2);
    expect(actorOne.velocity.x).toBeLessThan(0);
    expect(actorTwo.velocity.x).toBeGreaterThan(0);
    expect(actorOne.action).toBe("Stumbling");
    expect(actorTwo.action).toBe("Stumbling");
  });

  it("keeps symmetric mutual-shove geometry stable when actor IDs are swapped", () => {
    const normal = runMutualShove().world;
    const swapped = runMutualShove(true).world;

    expect(getActor(normal, 1).velocity.x).toBeCloseTo(getActor(swapped, 2).velocity.x, 10);
    expect(getActor(normal, 2).velocity.x).toBeCloseTo(getActor(swapped, 1).velocity.x, 10);
  });

  it("keeps the state hash and event sequence stable when command order is reversed", () => {
    const forward = runMutualShove(false, [1, 2]);
    const reverse = runMutualShove(false, [2, 1]);

    expect(forward.world.createRenderFrame().stateHash).toBe(
      reverse.world.createRenderFrame().stateHash,
    );
    expect(forward.events).toEqual(reverse.events);
  });

  it("makes heavier targets absorb more of the same shove", () => {
    function targetSpeed(massFactor: number): number {
      const world = createWorld(
        createSeparatedOverrides(
          {
            actorId: 1,
            position: { x: 4, y: 4.5 },
            facing: { x: 1, y: 0 },
          },
          {
            actorId: 2,
            position: { x: 4.78, y: 4.5 },
            facing: { x: -1, y: 0 },
            massFactor,
          },
        ),
        `target-mass-${massFactor}`,
      );
      beginShove(world, [1]);

      while (world.tick <= SIMULATION_TUNING.shove.windupTicks) {
        const result = world.step();

        if (result.events.some(({ kind }) => kind === "shove-hit")) {
          return vectorLength(getActor(world, 2).velocity);
        }
      }

      throw new Error("shove did not hit target");
    }

    expect(targetSpeed(SIMULATION_TUNING.mass.minimum)).toBeGreaterThan(
      targetSpeed(SIMULATION_TUNING.mass.maximum),
    );
  });

  it("records a geometric dodge during the evasion window instead of a shove hit", () => {
    const world = createWorld(duelOverrides());
    beginShove(world, [1]);
    world.step();
    world.step();
    world.step();
    world.step([
      {
        ...createNeutralCommand(world.tick, 2),
        dodgePressed: true,
        move: { x: 0, y: 1 },
      },
    ]);
    world.step();
    const result = world.step();

    expect(result.events.map(({ kind }) => kind)).toContain("dodge-succeeded");
    expect(result.events.map(({ kind }) => kind)).not.toContain("shove-hit");
    expect(getActor(world, 2).action).toBe("DodgeActive");
  });
});

describe("support grace and falling", () => {
  it("allows center support to recover before the ninth unsupported tick", () => {
    const world = createWorld(
      createSeparatedOverrides({ actorId: 1, position: { x: -0.05, y: 4.5 } }),
      "support-recovery",
    );

    for (let tick = 0; tick < SIMULATION_TUNING.support.graceTicks; tick += 1) {
      stepWithMovement(world, 1, 1, 0);
    }

    expect(getActor(world, 1).action).toBe("Ready");
    expect(getActor(world, 1).unsupportedTicks).toBe(0);
  });

  it("enters irreversible falling on the ninth unsupported tick and then eliminates", () => {
    const world = createWorld(
      createSeparatedOverrides({ actorId: 1, position: { x: -0.5, y: 4.5 } }),
      "falling-boundary",
    );

    for (let tick = 1; tick < SIMULATION_TUNING.support.graceTicks; tick += 1) {
      world.step();
      expect(getActor(world, 1).action).toBe("Ready");
    }

    const fallingResult = world.step();
    expect(getActor(world, 1).action).toBe("Falling");
    expect(fallingResult.events.map(({ kind }) => kind)).toContain("falling-started");

    while (getActor(world, 1).action !== "Eliminated") {
      stepWithMovement(world, 1, 1, 0);
    }

    const eliminated = getActor(world, 1);
    expect(eliminated.active).toBe(false);
    expect(eliminated.position.x).toBeCloseTo(-0.5, 10);
  });
});
