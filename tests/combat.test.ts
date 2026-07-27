import { describe, expect, it } from "vitest";
import {
  createNeutralCommand,
  normalizeGameConfig,
  type StartingAttributes,
} from "../src/simulation/contracts";
import { vectorLength } from "../src/simulation/math";
import {
  DEFAULT_GAMEPLAY_TUNING,
  getIncomingMassImpulseMultiplier,
  getMassDodgeSpeedMultiplier,
  getMovementProfile,
  getShoveMassImpulseMultiplier,
  normalizeGameplayTuning,
  SIMULATION_TUNING,
  type GameplayTuningInput,
} from "../src/simulation/tuning";
import { SimulationWorld, type ParticipantSpawnOverride } from "../src/simulation/world";

const CONFIG = normalizeGameConfig({ participantCount: 4, roundLimitSeconds: 10 });

const NEUTRAL_STARTING_ATTRIBUTES: StartingAttributes = Object.freeze({
  strength: 0,
  agility: 0,
  constitution: 0,
  spirit: 0,
  balance: 0,
  willpower: 20,
});

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
  return new SimulationWorld(CONFIG, seed, {
    participantOverrides: overrides,
    arenaLayout: "rectangular-fixture",
  });
}

function createSeparatedOverrides(
  actorOne: ParticipantSpawnOverride,
  actorTwo: ParticipantSpawnOverride = { actorId: 2, position: { x: 8.5, y: 7.5 } },
): readonly ParticipantSpawnOverride[] {
  return [
    { startingAttributes: NEUTRAL_STARTING_ATTRIBUTES, ...actorOne },
    { startingAttributes: NEUTRAL_STARTING_ATTRIBUTES, ...actorTwo },
    { actorId: 3, position: { x: 8.5, y: 1.5 }, startingAttributes: NEUTRAL_STARTING_ATTRIBUTES },
    { actorId: 4, position: { x: 1.5, y: 7.5 }, startingAttributes: NEUTRAL_STARTING_ATTRIBUTES },
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

describe("gameplay tuning normalization", () => {
  it("bounds every expanded lab value while preserving version 1", () => {
    const tuning = normalizeGameplayTuning({
      shoveWindupTicks: 1,
      shoveRecoveryTicks: 61,
      shoveCooldownTicks: 29,
      shoveBaseImpulse: 0.01,
      shoveMaximumImpulse: 0.81,
      shoveHitStumbleTicks: 61,
      dodgeCooldownTicks: 361,
      dodgeEvasionTicks: 0,
      healthRegenDelayTicks: 59,
      healthRegenPerTick: 0.31,
      manaRegenDelayTicks: -1,
      manaRegenPerTick: 0.51,
      shoveDamage: 31,
      windBlastRange: 1,
      windBlastBaseImpulse: 1.51,
      bombFuseTicks: 601,
      bombBlastRadius: 0.5,
      grapplingHookRange: 11,
      grapplingHookPullTicks: 3,
      soapStumbleTicks: 61,
    });

    expect(tuning).toMatchObject({
      tuningVersion: 1,
      shoveWindupTicks: 2,
      shoveRecoveryTicks: 60,
      shoveCooldownTicks: 30,
      shoveBaseImpulse: 0.05,
      shoveMaximumImpulse: 0.8,
      shoveHitStumbleTicks: 60,
      dodgeCooldownTicks: 360,
      dodgeEvasionTicks: 1,
      healthRegenDelayTicks: 60,
      healthRegenPerTick: 0.3,
      manaRegenDelayTicks: 0,
      manaRegenPerTick: 0.5,
      shoveDamage: 30,
      windBlastRange: 2,
      windBlastBaseImpulse: 1.5,
      bombFuseTicks: 600,
      bombBlastRadius: 1,
      grapplingHookRange: 10,
      grapplingHookPullTicks: 4,
      soapStumbleTicks: 60,
    });
    expect(Object.isFrozen(tuning)).toBe(true);
  });
});

describe("gray-box movement and action timing", () => {
  it("reserves the old fast pace for lightweight bodies", () => {
    const light = getMovementProfile(SIMULATION_TUNING.mass.minimum);
    const normal = getMovementProfile(SIMULATION_TUNING.mass.default);
    const heavy = getMovementProfile(SIMULATION_TUNING.mass.maximum);

    expect(light.maximumSpeed).toBeGreaterThan(normal.maximumSpeed);
    expect(normal.maximumSpeed).toBeGreaterThan(heavy.maximumSpeed);
    expect(light.maximumSpeed / normal.maximumSpeed).toBeCloseTo(
      DEFAULT_GAMEPLAY_TUNING.lightweightSpeedMultiplier,
      10,
    );
    expect(heavy.maximumSpeed / normal.maximumSpeed).toBeCloseTo(
      DEFAULT_GAMEPLAY_TUNING.heavyweightSpeedMultiplier,
      10,
    );
    expect(light.maximumSpeed * 60).toBeGreaterThan(3.5);
    expect(normal.maximumSpeed * 60).toBeCloseTo(2.4, 10);
  });

  it("keeps the default hand reach compact while dodge crosses multiple tiles", () => {
    expect(DEFAULT_GAMEPLAY_TUNING.shoveReach).toBeLessThanOrEqual(0.35);
    expect(
      DEFAULT_GAMEPLAY_TUNING.dodgeSpeed * DEFAULT_GAMEPLAY_TUNING.dodgeActiveTicks,
    ).toBeCloseTo(2.4, 10);
  });

  it("gives lightweight bodies a longer dodge and heavyweight bodies a shorter one", () => {
    const lightMultiplier = getMassDodgeSpeedMultiplier(SIMULATION_TUNING.mass.minimum);
    const normalMultiplier = getMassDodgeSpeedMultiplier(SIMULATION_TUNING.mass.default);
    const heavyMultiplier = getMassDodgeSpeedMultiplier(SIMULATION_TUNING.mass.maximum);

    expect(lightMultiplier).toBeGreaterThan(normalMultiplier);
    expect(normalMultiplier).toBeGreaterThan(heavyMultiplier);
    expect(lightMultiplier).toBeCloseTo(1.25, 10);
    expect(normalMultiplier).toBeCloseTo(1, 10);
    expect(heavyMultiplier).toBeCloseTo(0.625, 10);
    expect(
      lightMultiplier *
        DEFAULT_GAMEPLAY_TUNING.dodgeSpeed *
        DEFAULT_GAMEPLAY_TUNING.dodgeActiveTicks,
    ).toBeCloseTo(3, 10);
    expect(
      heavyMultiplier *
        DEFAULT_GAMEPLAY_TUNING.dodgeSpeed *
        DEFAULT_GAMEPLAY_TUNING.dodgeActiveTicks,
    ).toBeCloseTo(1.5, 10);
  });

  it("keeps mass meaningful without letting its impulse ratio dominate a collision", () => {
    const light = SIMULATION_TUNING.mass.minimum;
    const heavy = SIMULATION_TUNING.mass.maximum;
    const heavyAgainstLight = getShoveMassImpulseMultiplier(heavy, light);
    const lightAgainstHeavy = getShoveMassImpulseMultiplier(light, heavy);

    expect(heavyAgainstLight).toBeGreaterThan(1);
    expect(lightAgainstHeavy).toBeLessThan(1);
    expect(heavyAgainstLight).toBeLessThan(Math.sqrt(heavy / light));
    expect(getIncomingMassImpulseMultiplier(light)).toBeGreaterThan(1);
    expect(getIncomingMassImpulseMultiplier(heavy)).toBeLessThan(1);
  });

  it("starts, turns, and stops locomotion on the sampled input tick", () => {
    const world = new SimulationWorld(CONFIG, "direct-locomotion", {
      participantOverrides: createSeparatedOverrides({
        actorId: 1,
        position: { x: 4.5, y: 4.5 },
      }),
    });

    stepWithMovement(world, 1, 1, 0);
    expect(getActor(world, 1).velocity).toEqual({
      x: DEFAULT_GAMEPLAY_TUNING.movementMaximumSpeed,
      y: 0,
    });
    stepWithMovement(world, 1, 0, -1);
    expect(getActor(world, 1).velocity).toEqual({
      x: 0,
      y: -DEFAULT_GAMEPLAY_TUNING.movementMaximumSpeed,
    });
    world.step([createNeutralCommand(world.tick, 1)]);
    expect(getActor(world, 1).velocity).toEqual({ x: 0, y: 0 });
  });

  it("applies a normalized per-world dodge tuning without mutating the default", () => {
    const gameplayTuning: GameplayTuningInput = {
      dodgeActiveTicks: 3,
      dodgeSpeed: 0.07,
    };
    const world = new SimulationWorld(CONFIG, "short-dodge", {
      participantOverrides: createSeparatedOverrides({
        actorId: 1,
        position: { x: 4.5, y: 4.5 },
      }),
      gameplayTuning,
    });
    const start = getActor(world, 1).position;
    let result = world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        dodgePressed: true,
        move: { x: 1, y: 0 },
      },
    ]);
    let lastActivePosition = result.frame.participants[0]?.position;

    while (result.frame.participants[0]?.action === "DodgeActive") {
      const next = world.step();

      if (next.frame.participants[0]?.action === "DodgeActive") {
        lastActivePosition = next.frame.participants[0]?.position;
      }

      result = next;
    }

    expect(lastActivePosition).toBeDefined();
    expect((lastActivePosition?.x ?? start.x) - start.x).toBeCloseTo(0.21, 10);
    expect(DEFAULT_GAMEPLAY_TUNING.dodgeSpeed).toBe(0.6);
    expect(DEFAULT_GAMEPLAY_TUNING.dodgeActiveTicks).toBe(4);
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

  it("gives dodge priority when grapple and dodge edges arrive together", () => {
    const world = createWorld(
      createSeparatedOverrides({ actorId: 1, position: { x: 4.5, y: 4.5 } }),
    );
    world.step([
      {
        ...createNeutralCommand(0, 1),
        grapplePressed: true,
        dodgePressed: true,
        move: { x: 0, y: -1 },
      },
    ]);

    const actor = getActor(world, 1);
    expect(actor.action).toBe("DodgeActive");
    expect(actor.dodgeReadyTick).toBe(SIMULATION_TUNING.dodge.cooldownTicks);
    expect(actor.grappleReadyTick).toBe(0);
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

describe("weak-contact containment", () => {
  it("keeps the launch-speed swept-contact envelope inside adjacent spatial cells", () => {
    const maximumPostIntersectionSeparation =
      SIMULATION_TUNING.body.maximumLaunchSpeed * 2 + SIMULATION_TUNING.body.radius * 2;

    expect(SIMULATION_TUNING.body.maximumLaunchSpeed).toBeGreaterThan(
      SIMULATION_TUNING.body.maximumSpeed,
    );
    expect(maximumPostIntersectionSeparation).toBeLessThan(SIMULATION_TUNING.spatialHash.cellSize);
  });

  it("separates three equal bodies spawned at the same coordinate without non-finite state", () => {
    const world = createWorld(
      [
        { actorId: 1, position: { x: 4.5, y: 4.5 } },
        { actorId: 2, position: { x: 4.5, y: 4.5 } },
        { actorId: 3, position: { x: 4.5, y: 4.5 } },
        { actorId: 4, position: { x: 8.5, y: 7.5 } },
      ],
      "triple-overlap",
    );

    world.step();
    const actors = [getActor(world, 1), getActor(world, 2), getActor(world, 3)];
    const minimumDistance = SIMULATION_TUNING.body.radius * 2 - 0.02;

    for (let leftIndex = 0; leftIndex < actors.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < actors.length; rightIndex += 1) {
        const left = actors[leftIndex];
        const right = actors[rightIndex];

        expect(left).toBeDefined();
        expect(right).toBeDefined();

        if (left === undefined || right === undefined) {
          continue;
        }

        expect(Number.isFinite(left.position.x)).toBe(true);
        expect(Number.isFinite(left.position.y)).toBe(true);
        expect(
          Math.hypot(right.position.x - left.position.x, right.position.y - left.position.y),
        ).toBeGreaterThanOrEqual(minimumDistance);
      }
    }
  });

  it("detects direct-speed grazing crossings across a deterministic geometry matrix", () => {
    const cases = [0.22, 0.25, 0.28].flatMap((horizontalGap) =>
      Array.from({ length: 7 }, (_, index) => ({
        horizontalGap,
        verticalGap: 0.645 + index * 0.005,
      })),
    );

    for (const { horizontalGap, verticalGap } of cases) {
      const world = createWorld(
        createSeparatedOverrides(
          {
            actorId: 1,
            position: { x: 4, y: 4.5 - verticalGap / 2 },
          },
          {
            actorId: 2,
            position: { x: 4 + horizontalGap, y: 4.5 + verticalGap / 2 },
          },
        ),
        `grazing-crossing-${horizontalGap}-${verticalGap}`,
      );

      world.step([
        { ...createNeutralCommand(world.tick, 1), move: { x: 1, y: 0 } },
        { ...createNeutralCommand(world.tick, 2), move: { x: -1, y: 0 } },
      ]);
      const left = getActor(world, 1);
      const right = getActor(world, 2);
      const minimumDistance = left.radius + right.radius;

      expect(
        Math.hypot(right.position.x - left.position.x, right.position.y - left.position.y),
      ).toBeGreaterThanOrEqual(minimumDistance);
    }
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
