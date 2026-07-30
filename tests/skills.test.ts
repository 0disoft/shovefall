import { describe, expect, it } from "vitest";
import {
  DEFAULT_SKILL_LOADOUT,
  formatSkillDescription,
  getBaseSkillKnockbackDistance,
  getSkillDefinition,
  SKILL_DEFINITION_IDS,
} from "../src/content/skills";
import { createNeutralCommand, normalizeGameConfig } from "../src/simulation/contracts";
import {
  DEFAULT_STARTING_ATTRIBUTES,
  getStartingControlDurationMultiplier,
  getStartingCooldownMultiplier,
  getStartingMaximumHealthBonus,
  getStartingOutgoingMultiplier,
  getStartingSkillDamageMultiplier,
} from "../src/simulation/starting-attributes";
import { MAXIMUM_LAUNCH_SPEED, STUMBLE_DRAG_PER_TICK } from "../src/simulation/motion-constants";
import { SIMULATION_TUNING } from "../src/simulation/tuning";
import { SimulationWorld } from "../src/simulation/world";

function getParticipantMana(world: SimulationWorld, actorId: number): number {
  return (
    world.createRenderFrame().participants.find((participant) => participant.actorId === actorId)
      ?.combat.mana ?? 0
  );
}

function waitForMana(world: SimulationWorld, actorId: number, minimumMana: number): void {
  while (getParticipantMana(world, actorId) < minimumMana && world.tick < 1_200) {
    world.step([]);
  }

  if (getParticipantMana(world, actorId) < minimumMana) {
    throw new Error(`actor ${actorId} did not regenerate ${minimumMana} mana`);
  }
}

describe("mana-backed reusable skills", () => {
  it("defines six independent combat skills and a unique default loadout", () => {
    expect(SKILL_DEFINITION_IDS).toHaveLength(6);
    expect(new Set(SKILL_DEFINITION_IDS).size).toBe(6);
    expect(DEFAULT_SKILL_LOADOUT).toHaveLength(2);
    expect(new Set(DEFAULT_SKILL_LOADOUT).size).toBe(2);

    for (const definitionId of SKILL_DEFINITION_IDS) {
      const definition = getSkillDefinition(definitionId);
      expect(definition).toMatchObject({
        id: definitionId,
        label: expect.any(String),
        cooldownTicks: expect.any(Number),
        manaCost: expect.any(Number),
      });
      expect(definition.cooldownTicks).toBeGreaterThan(0);
      expect(definition.manaCost).toBeGreaterThan(0);
      expect(definition.minimumAimDot).toBeGreaterThanOrEqual(0);
      expect(definition.minimumAimDot).toBeLessThanOrEqual(1);
      expect(definition.stumbleTicks).toBeGreaterThanOrEqual(0);
      expect(formatSkillDescription(definition)).not.toHaveLength(0);
    }
  });

  it("derives every description from the skill's balance fields", () => {
    const expected = {
      "blink-step": "지정 방향으로 최대 2.4칸 이동하고 0.7초 동안 공격 회피",
      "arc-bolt": "전방 3.5칸 안의 첫 적을 조준 보정, 피해 20, 기준 넉백 약 4.8칸, 0.4초 휘청",
      "chain-bind": "전방 5.5칸의 첫 적, 전방 약 15도까지 조준 보정, 피해 20, 1초 이동 봉쇄",
      "meteor-mark":
        "5칸 앞에 표식, 1.5초 뒤 반경 3칸, 피해 36, 기준 넉백 약 2.3칸, 기본 0.8초 기절",
      "frost-field": "3.5칸 앞에 5초간 피해 5와 25% 둔화 지대, 준 피해의 25% 체력 회복",
      aegis: "5초간 피해 22 흡수, 제어 시간 30% 감소",
    } as const;

    for (const definitionId of SKILL_DEFINITION_IDS) {
      expect(formatSkillDescription(getSkillDefinition(definitionId))).toBe(expected[definitionId]);
    }

    expect(
      formatSkillDescription({ ...getSkillDefinition("arc-bolt"), range: 6.5, damage: 22 }),
    ).toContain("6.5칸 안의 첫 적을 조준 보정, 피해 22");
  });

  it("derives displayed knockback distance from the same impulse, duration, drag, and speed cap as runtime", () => {
    expect(SIMULATION_TUNING.movement.stumbleDrag).toBe(STUMBLE_DRAG_PER_TICK);
    expect(SIMULATION_TUNING.body.maximumLaunchSpeed).toBe(MAXIMUM_LAUNCH_SPEED);
    expect(getBaseSkillKnockbackDistance(getSkillDefinition("arc-bolt"))).toBeCloseTo(4.754, 3);
    expect(getBaseSkillKnockbackDistance(getSkillDefinition("meteor-mark"))).toBeCloseTo(2.35, 2);

    expect(
      formatSkillDescription({
        ...getSkillDefinition("arc-bolt"),
        impulse: 0.2,
        stumbleTicks: 60,
        stunTicks: 30,
      }),
    ).toContain("기준 넉백 약 4.9칸, 기본 0.5초 기절");
  });

  it("keeps the requested skill balance values in the shared definitions", () => {
    expect(getSkillDefinition("aegis")).toMatchObject({
      manaCost: 40,
      cooldownTicks: 720,
      durationTicks: 300,
      shield: 22,
      controlDurationMultiplier: 0.7,
    });
    expect(getSkillDefinition("arc-bolt")).toMatchObject({
      manaCost: 32,
      cooldownTicks: 360,
      range: 3.5,
      damage: 20,
      impulse: 0.3,
      stumbleTicks: 24,
    });
    expect(getSkillDefinition("chain-bind")).toMatchObject({
      minimumAimDot: 0.966,
      range: 5.5,
      damage: 20,
      rootTicks: 60,
    });
    expect(getSkillDefinition("meteor-mark")).toMatchObject({
      manaCost: 36,
      cooldownTicks: 480,
      radius: 3,
      delayTicks: 90,
    });
    expect(getSkillDefinition("frost-field")).toMatchObject({
      manaCost: 30,
      damage: 5,
      damageHealingRatio: 0.25,
    });
    expect(getSkillDefinition("blink-step")).toMatchObject({ manaCost: 20 });
  });

  it("heals the Frost Field caster for one quarter of actual health damage dealt", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({
        participantCount: 4,
        arenaColumns: 12,
        arenaRows: 10,
        roundLimitSeconds: 10,
        itemsEnabled: false,
      }),
      "frost-field-damage-healing",
      {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 4, y: 5 },
            facing: { x: 1, y: 0 },
            startingSkills: ["frost-field", "aegis"],
          },
          {
            actorId: 2,
            position: { x: 5, y: 5 },
            facing: { x: -1, y: 0 },
            startingSkills: ["arc-bolt", "aegis"],
          },
          { actorId: 3, position: { x: 9, y: 2 } },
          { actorId: 4, position: { x: 9, y: 8 } },
        ],
      },
    );

    const result = world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        useSkillSlot: 0,
        targetPosition: { x: 5, y: 5 },
      },
      {
        ...createNeutralCommand(world.tick, 2),
        useSkillSlot: 0,
        targetPosition: { x: 4, y: 5 },
      },
    ]);
    const damageTaken = result.events.find(
      ({ kind, actorId, targetActorId, skillDefinitionId }) =>
        kind === "damage-applied" &&
        actorId === 2 &&
        targetActorId === 1 &&
        skillDefinitionId === "arc-bolt",
    );
    const frostHit = result.events.find(
      ({ kind, actorId, targetActorId, skillDefinitionId }) =>
        kind === "skill-hit" &&
        actorId === 1 &&
        targetActorId === 2 &&
        skillDefinitionId === "frost-field",
    );
    const caster = result.frame.participants.find(({ actorId }) => actorId === 1);

    expect(damageTaken?.amount).toBeGreaterThan(0);
    expect(frostHit?.amount).toBeGreaterThan(0);
    expect(caster?.combat.health).toBeCloseTo(
      (caster?.combat.maximumHealth ?? 0) -
        (damageTaken?.amount ?? 0) +
        (frostHit?.amount ?? 0) * getSkillDefinition("frost-field").damageHealingRatio,
      5,
    );
  });

  it("keeps Blink Step evasion active for 0.7 seconds without extending its travel", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({
        participantCount: 4,
        arenaColumns: 12,
        arenaRows: 8,
        itemsEnabled: false,
      }),
      "blink-step-evasion",
      {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 2, y: 2 },
            facing: { x: 1, y: 0 },
            startingSkills: ["blink-step", "aegis"],
          },
          {
            actorId: 2,
            position: { x: 7, y: 2 },
            facing: { x: -1, y: 0 },
            startingSkills: ["arc-bolt", "aegis"],
          },
        ],
      },
    );

    world.step([{ ...createNeutralCommand(world.tick, 1), useSkillSlot: 0 }]);
    while (world.tick < 4) {
      world.step([]);
    }
    const positionAfterTravel = world
      .createRenderFrame()
      .participants.find(({ actorId }) => actorId === 1)?.position;

    while (world.tick < 30) {
      world.step([]);
    }
    const beforeAttack = world
      .createRenderFrame()
      .participants.find(({ actorId }) => actorId === 1);
    expect(beforeAttack?.position).toEqual(positionAfterTravel);
    expect(beforeAttack?.action).toBe("DodgeActive");

    const attack = world.step([{ ...createNeutralCommand(world.tick, 2), useSkillSlot: 0 }]);
    expect(attack.events).toContainEqual(
      expect.objectContaining({
        kind: "dodge-succeeded",
        actorId: 1,
        targetActorId: 2,
        skillDefinitionId: "arc-bolt",
      }),
    );
    expect(attack.events).not.toContainEqual(
      expect.objectContaining({ kind: "skill-hit", targetActorId: 1 }),
    );

    while (world.tick < 42) {
      world.step([]);
    }
    expect(
      world.createRenderFrame().participants.find(({ actorId }) => actorId === 1)?.action,
    ).toBe("DodgeActive");
    world.step([]);
    expect(
      world.createRenderFrame().participants.find(({ actorId }) => actorId === 1)?.action,
    ).toBe("Ready");
  });

  it("requires two or three unique selected skills", () => {
    const config = normalizeGameConfig({ participantCount: 4, itemsEnabled: false });

    expect(
      () =>
        new SimulationWorld(config, "duplicate-skills", {
          participantOverrides: [
            {
              actorId: 1,
              startingSkills: ["arc-bolt", "arc-bolt", "blink-step"],
            },
          ],
        }),
    ).toThrow(/two or three unique skills/u);
    expect(
      () =>
        new SimulationWorld(config, "incomplete-skills", {
          participantOverrides: [{ actorId: 1, startingSkills: ["arc-bolt"] }],
        }),
    ).toThrow(/two or three unique skills/u);
    expect(
      new SimulationWorld(config, "human-two-skills", {
        participantOverrides: [{ actorId: 1, startingSkills: ["arc-bolt", "blink-step"] }],
      }).createRenderFrame().participants[0]?.skills,
    ).toHaveLength(2);
  });

  it("spends mana and starts an independent cooldown", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({ participantCount: 4, itemsEnabled: false }),
      "skill-cooldown",
      {
        participantOverrides: [
          {
            actorId: 1,
            startingSkills: ["arc-bolt", "blink-step", "chain-bind"],
          },
        ],
      },
    );
    const first = world.step([{ ...createNeutralCommand(world.tick, 1), useSkillSlot: 0 }]);
    const humanAfterFirst = first.frame.participants.find(({ actorId }) => actorId === 1);

    expect(first.events).toContainEqual(
      expect.objectContaining({
        kind: "skill-used",
        actorId: 1,
        skillDefinitionId: "arc-bolt",
        skillSlotIndex: 0,
        manaAfter: 0.14,
      }),
    );
    expect(humanAfterFirst?.skills[0]?.readyTick).toBe(
      Math.round(
        getSkillDefinition("arc-bolt").cooldownTicks *
          getStartingCooldownMultiplier(DEFAULT_STARTING_ATTRIBUTES),
      ),
    );
    expect(humanAfterFirst?.combat.mana).toBe(0.14);

    const second = world.step([{ ...createNeutralCommand(world.tick, 1), useSkillSlot: 0 }]);
    expect(second.events).not.toContainEqual(
      expect.objectContaining({ kind: "skill-used", actorId: 1, skillSlotIndex: 0 }),
    );
  });

  it("applies Agility mana-cost reduction to the authoritative skill commit", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({ participantCount: 4, itemsEnabled: false }),
      "agility-skill-cost",
      {
        participantOverrides: [
          {
            actorId: 1,
            startingAttributes: {
              strength: 0,
              agility: 20,
              constitution: 0,
              spirit: 0,
              balance: 0,
              willpower: 0,
            },
            startingSkills: ["arc-bolt", "blink-step"],
          },
        ],
      },
    );

    const cast = world.step([{ ...createNeutralCommand(world.tick, 1), useSkillSlot: 0 }]);
    expect(cast.events).toContainEqual(
      expect.objectContaining({
        kind: "skill-used",
        actorId: 1,
        skillDefinitionId: "arc-bolt",
        manaAfter: 9.1,
      }),
    );
  });

  it("activates a shield skill without consuming inventory charges", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({ participantCount: 4, itemsEnabled: false }),
      "shield-skill",
      {
        participantOverrides: [
          {
            actorId: 1,
            startingItems: ["bomb"],
            startingSkills: ["aegis", "arc-bolt", "blink-step"],
          },
        ],
      },
    );
    waitForMana(world, 1, getSkillDefinition("aegis").manaCost);
    const castTick = world.tick;
    const result = world.step([{ ...createNeutralCommand(world.tick, 1), useSkillSlot: 0 }]);
    const human = result.frame.participants.find(({ actorId }) => actorId === 1);

    expect(human?.combat.shield).toBe(22);
    expect(human?.combat.shieldEndsTick).toBe(castTick + 300);
    expect(human?.combat.mana).toBeLessThan(3);
    expect(human?.inventory[0]).toMatchObject({ definitionId: "bomb", charges: 2 });
    expect(human?.skills[0]?.readyTick).toBe(castTick + 605);
  });

  it("uses Aegis's 30% control reduction while its shield is active", () => {
    const shieldAttributes = Object.freeze({
      strength: 0,
      agility: 0,
      constitution: 0,
      spirit: 0,
      balance: 4,
      willpower: 16,
    });
    const world = new SimulationWorld(
      normalizeGameConfig({ participantCount: 4, itemsEnabled: false }),
      "aegis-control-reduction",
      {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 4, y: 5 },
            facing: { x: 1, y: 0 },
            startingSkills: ["aegis", "blink-step"],
            startingAttributes: shieldAttributes,
          },
          {
            actorId: 2,
            position: { x: 5, y: 5 },
            facing: { x: -1, y: 0 },
            startingSkills: ["chain-bind", "blink-step"],
          },
          { actorId: 3, position: { x: 8, y: 3 } },
          { actorId: 4, position: { x: 8, y: 7 } },
        ],
      },
    );
    waitForMana(world, 1, getSkillDefinition("aegis").manaCost);
    const castTick = world.tick;
    const result = world.step([
      { ...createNeutralCommand(world.tick, 1), useSkillSlot: 0 },
      { ...createNeutralCommand(world.tick, 2), useSkillSlot: 0 },
    ]);
    const shielded = result.frame.participants.find(({ actorId }) => actorId === 1);
    const chainBind = getSkillDefinition("chain-bind");
    const aegis = getSkillDefinition("aegis");
    const expectedDuration = Math.round(
      chainBind.rootTicks *
        getStartingControlDurationMultiplier(shieldAttributes) *
        aegis.controlDurationMultiplier,
    );

    expect(shielded?.combat.rootedUntilTick).toBe(castTick + expectedDuration);
  });

  it("deals health damage, applies control, and regenerates after combat delay", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({
        participantCount: 4,
        arenaColumns: 12,
        arenaRows: 10,
        roundLimitSeconds: 10,
        itemsEnabled: false,
      }),
      "health-combat",
      {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 4, y: 5 },
            facing: { x: 1, y: 0 },
            startingSkills: ["arc-bolt", "chain-bind", "aegis"],
          },
          { actorId: 2, position: { x: 5, y: 5 }, facing: { x: -1, y: 0 } },
          { actorId: 3, position: { x: 8, y: 3 } },
          { actorId: 4, position: { x: 8, y: 7 } },
        ],
      },
    );

    const hit = world.step([
      { ...createNeutralCommand(world.tick, 1), move: { x: 1, y: 0 }, useSkillSlot: 0 },
    ]);
    const damaged = hit.frame.participants.find(({ actorId }) => actorId === 2);
    const expectedHealth =
      100 +
      getStartingMaximumHealthBonus(DEFAULT_STARTING_ATTRIBUTES) -
      getSkillDefinition("arc-bolt").damage *
        getStartingOutgoingMultiplier(DEFAULT_STARTING_ATTRIBUTES) *
        getStartingSkillDamageMultiplier(DEFAULT_STARTING_ATTRIBUTES);
    expect(damaged?.combat.health).toBeCloseTo(expectedHealth, 6);
    expect(damaged?.action).toBe("Stumbling");

    for (let tick = 1; tick <= 301; tick += 1) {
      world.step([]);
    }
    const regenerated = world.createRenderFrame().participants.find(({ actorId }) => actorId === 2);
    expect(regenerated?.combat.health).toBeGreaterThan(expectedHealth);
  });

  it("soft-locks Arc Bolt onto a distant target inside its forward cone", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({
        participantCount: 4,
        arenaColumns: 12,
        arenaRows: 10,
        roundLimitSeconds: 10,
        itemsEnabled: false,
      }),
      "arc-bolt-aim-assist",
      {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 2, y: 4.5 },
            facing: { x: 1, y: 0 },
            startingSkills: ["arc-bolt", "blink-step", "chain-bind"],
          },
          { actorId: 2, position: { x: 5.5, y: 5 } },
          { actorId: 3, position: { x: 10, y: 1.5 } },
          { actorId: 4, position: { x: 1.5, y: 8.5 } },
        ],
      },
    );

    waitForMana(world, 1, getSkillDefinition("arc-bolt").manaCost);
    const result = world.step([{ ...createNeutralCommand(world.tick, 1), useSkillSlot: 0 }]);
    const hit = result.events.find(
      ({ kind, skillDefinitionId }) => kind === "skill-hit" && skillDefinitionId === "arc-bolt",
    );
    const target = result.frame.participants.find(({ actorId }) => actorId === 2);

    expect(hit).toMatchObject({ actorId: 1, targetActorId: 2 });
    expect(hit?.vector?.y).toBeGreaterThan(0);
    expect(target?.combat.health).toBeLessThan(target?.combat.maximumHealth ?? 0);
    expect(target?.action).toBe("Stumbling");
    expect(target?.position.x).toBeGreaterThan(5);
  });
});
