import { describe, expect, it } from "vitest";
import {
  DEFAULT_SKILL_LOADOUT,
  formatSkillDescription,
  getSkillDefinition,
  SKILL_DEFINITION_IDS,
} from "../src/content/skills";
import { createNeutralCommand, normalizeGameConfig } from "../src/simulation/contracts";
import {
  DEFAULT_STARTING_ATTRIBUTES,
  getStartingControlDurationMultiplier,
} from "../src/simulation/starting-attributes";
import { SimulationWorld } from "../src/simulation/world";

describe("mana-backed reusable skills", () => {
  it("defines eight independent combat skills and a unique default loadout", () => {
    expect(SKILL_DEFINITION_IDS).toHaveLength(8);
    expect(new Set(SKILL_DEFINITION_IDS).size).toBe(8);
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
      "force-palm":
        "사거리 1.7칸 안의 첫 적에게 전방 약 20도까지 조준 보정해 피해 18, 넉백, 2초 기절",
      "blink-step": "지정 방향으로 최대 2.4칸 이동하고 0.7초 동안 공격 회피",
      "arc-bolt": "전방 3.5칸 안의 첫 적을 조준 보정해 피해 20와 넉백 0.3",
      "chain-bind": "전방 5.5칸의 첫 적에게 전방 약 15도까지 조준 보정해 피해 12와 1.2초 이동 봉쇄",
      "meteor-mark": "5칸 앞에 표식, 2초 뒤 반경 2.15칸 피해 36와 기절",
      "frost-field": "3.5칸 앞에 5초간 피해 5와 25% 둔화 지대",
      "tidal-charge": "첫 적이나 물가에서 멈추며 최대 3.6칸 돌진, 피해 24, 넉백, 1.5초 기절",
      aegis: "5초간 피해 24 흡수, 제어 시간 30% 감소",
    } as const;

    for (const definitionId of SKILL_DEFINITION_IDS) {
      expect(formatSkillDescription(getSkillDefinition(definitionId))).toBe(expected[definitionId]);
    }

    expect(
      formatSkillDescription({ ...getSkillDefinition("arc-bolt"), range: 6.5, damage: 22 }),
    ).toContain("6.5칸 안의 첫 적을 조준 보정해 피해 22");
  });

  it("keeps the requested skill balance values in the shared definitions", () => {
    expect(getSkillDefinition("aegis")).toMatchObject({
      manaCost: 45,
      cooldownTicks: 720,
      durationTicks: 300,
      shield: 24,
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
    expect(getSkillDefinition("tidal-charge")).toMatchObject({ cooldownTicks: 300 });
    expect(getSkillDefinition("force-palm")).toMatchObject({
      range: 1.7,
      minimumAimDot: 0.94,
      damage: 18,
      stunTicks: 120,
    });
    expect(getSkillDefinition("chain-bind")).toMatchObject({
      minimumAimDot: 0.966,
      damage: 12,
    });
    expect(getSkillDefinition("frost-field")).toMatchObject({ damage: 5 });
    expect(getSkillDefinition("blink-step")).toMatchObject({ manaCost: 20 });
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
              startingSkills: ["force-palm", "force-palm", "blink-step"],
            },
          ],
        }),
    ).toThrow(/two or three unique skills/u);
    expect(
      () =>
        new SimulationWorld(config, "incomplete-skills", {
          participantOverrides: [{ actorId: 1, startingSkills: ["force-palm"] }],
        }),
    ).toThrow(/two or three unique skills/u);
    expect(
      new SimulationWorld(config, "human-two-skills", {
        participantOverrides: [{ actorId: 1, startingSkills: ["force-palm", "blink-step"] }],
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
            startingSkills: ["force-palm", "blink-step", "arc-bolt"],
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
        skillDefinitionId: "force-palm",
        skillSlotIndex: 0,
        manaAfter: 114,
      }),
    );
    expect(humanAfterFirst?.skills[0]?.readyTick).toBe(60);
    expect(humanAfterFirst?.combat.mana).toBe(114);

    const second = world.step([{ ...createNeutralCommand(world.tick, 1), useSkillSlot: 0 }]);
    expect(second.events).not.toContainEqual(
      expect.objectContaining({ kind: "skill-used", actorId: 1, skillSlotIndex: 0 }),
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
            startingSkills: ["aegis", "force-palm", "blink-step"],
          },
        ],
      },
    );
    const result = world.step([{ ...createNeutralCommand(world.tick, 1), useSkillSlot: 0 }]);
    const human = result.frame.participants.find(({ actorId }) => actorId === 1);

    expect(human?.combat).toMatchObject({ shield: 24, shieldEndsTick: 300, mana: 87 });
    expect(human?.inventory[0]).toMatchObject({ definitionId: "bomb", charges: 2 });
    expect(human?.skills[0]?.readyTick).toBe(605);
  });

  it("uses Aegis's 30% control reduction while its shield is active", () => {
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
          },
          {
            actorId: 2,
            position: { x: 5, y: 5 },
            facing: { x: -1, y: 0 },
            startingSkills: ["force-palm", "blink-step"],
          },
          { actorId: 3, position: { x: 8, y: 3 } },
          { actorId: 4, position: { x: 8, y: 7 } },
        ],
      },
    );
    const castTick = world.tick;
    const result = world.step([
      { ...createNeutralCommand(world.tick, 1), useSkillSlot: 0 },
      { ...createNeutralCommand(world.tick, 2), useSkillSlot: 0 },
    ]);
    const shielded = result.frame.participants.find(({ actorId }) => actorId === 1);
    const forcePalm = getSkillDefinition("force-palm");
    const aegis = getSkillDefinition("aegis");
    const expectedDuration = Math.round(
      forcePalm.stunTicks *
        getStartingControlDurationMultiplier(DEFAULT_STARTING_ATTRIBUTES) *
        aegis.controlDurationMultiplier,
    );

    expect(shielded?.combat.stunnedUntilTick).toBe(castTick + expectedDuration);
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
            startingSkills: ["force-palm", "chain-bind", "aegis"],
          },
          { actorId: 2, position: { x: 5, y: 5 }, facing: { x: -1, y: 0 } },
          { actorId: 3, position: { x: 8, y: 3 } },
          { actorId: 4, position: { x: 8, y: 7 } },
        ],
      },
    );

    const castTick = world.tick;
    const hit = world.step([
      { ...createNeutralCommand(world.tick, 1), move: { x: 1, y: 0 }, useSkillSlot: 0 },
    ]);
    const damaged = hit.frame.participants.find(({ actorId }) => actorId === 2);
    const expectedStunDuration = Math.round(
      getSkillDefinition("force-palm").stunTicks *
        getStartingControlDurationMultiplier(DEFAULT_STARTING_ATTRIBUTES),
    );
    expect(damaged?.combat.health).toBe(104.2);
    expect(damaged?.combat.stunnedUntilTick).toBe(castTick + expectedStunDuration);

    for (let tick = 1; tick <= 301; tick += 1) {
      world.step([]);
    }
    const regenerated = world.createRenderFrame().participants.find(({ actorId }) => actorId === 2);
    expect(regenerated?.combat.health).toBeGreaterThan(104.2);
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
            startingSkills: ["arc-bolt", "force-palm", "blink-step"],
          },
          { actorId: 2, position: { x: 5.5, y: 5 } },
          { actorId: 3, position: { x: 10, y: 1.5 } },
          { actorId: 4, position: { x: 1.5, y: 8.5 } },
        ],
      },
    );

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

  it("stops Tidal Charge on the first enemy and does not pass through to a second target", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({
        participantCount: 4,
        arenaColumns: 12,
        arenaRows: 10,
        roundLimitSeconds: 10,
        itemsEnabled: false,
      }),
      "tidal-charge-first-contact",
      {
        arenaLayout: "rectangular-fixture",
        participantOverrides: [
          {
            actorId: 1,
            position: { x: 4, y: 5 },
            facing: { x: 1, y: 0 },
            startingSkills: ["tidal-charge", "aegis"],
          },
          { actorId: 2, position: { x: 5.1, y: 5 }, facing: { x: -1, y: 0 } },
          { actorId: 3, position: { x: 6.1, y: 5 }, facing: { x: -1, y: 0 } },
          { actorId: 4, position: { x: 9, y: 8 } },
        ],
      },
    );

    const result = world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        move: { x: 1, y: 0 },
        useSkillSlot: 0,
      },
    ]);
    const attacker = result.frame.participants.find(({ actorId }) => actorId === 1);
    const firstTarget = result.frame.participants.find(({ actorId }) => actorId === 2);
    const secondTarget = result.frame.participants.find(({ actorId }) => actorId === 3);

    expect(attacker?.action).toBe("Ready");
    expect(attacker?.velocity).toEqual({ x: 0, y: 0 });
    expect(firstTarget?.combat.health).toBeLessThan(firstTarget?.combat.maximumHealth ?? 0);
    expect(secondTarget?.combat.health).toBe(secondTarget?.combat.maximumHealth);
    expect(
      result.events.filter(
        ({ kind, skillDefinitionId }) =>
          kind === "skill-hit" && skillDefinitionId === "tidal-charge",
      ),
    ).toHaveLength(1);
  });

  it("stops Tidal Charge on the final supported point before water", () => {
    const config = normalizeGameConfig({
      participantCount: 4,
      roundLimitSeconds: 10,
      itemsEnabled: false,
    });
    const seed = "tidal-charge-water-boundary";
    const probe = new SimulationWorld(config, seed, { treeOverrides: [] });
    const probeFrame = probe.createRenderFrame();
    const supportedTileIds = new Set<string>(
      probeFrame.tiles.filter(({ state }) => state !== "Void").map(({ tileId }) => tileId),
    );
    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ] as const;
    const boundary = probeFrame.tiles
      .filter(({ state }) => state !== "Void")
      .flatMap((tile) =>
        directions.map((direction) => ({
          direction,
          tile,
          waterTileId: `${tile.column + direction.x}:${tile.row + direction.y}`,
        })),
      )
      .find(({ waterTileId }) => !supportedTileIds.has(waterTileId));

    if (boundary === undefined) {
      throw new Error("Expected the procedural island to expose a water boundary");
    }

    const distantTiles = probeFrame.tiles
      .filter(
        ({ column, row, state }) =>
          state !== "Void" &&
          Math.hypot(column - boundary.tile.column, row - boundary.tile.row) > 8,
      )
      .slice(0, 3);
    expect(distantTiles).toHaveLength(3);
    const world = new SimulationWorld(config, seed, {
      treeOverrides: [],
      participantOverrides: [
        {
          actorId: 1,
          position: { x: boundary.tile.column + 0.5, y: boundary.tile.row + 0.5 },
          facing: boundary.direction,
          startingSkills: ["tidal-charge", "aegis"],
        },
        ...distantTiles.map(({ column, row }, index) => ({
          actorId: index + 2,
          position: { x: column + 0.5, y: row + 0.5 },
        })),
      ],
    });

    const result = world.step([
      {
        ...createNeutralCommand(world.tick, 1),
        move: boundary.direction,
        useSkillSlot: 0,
      },
    ]);
    const attacker = result.frame.participants.find(({ actorId }) => actorId === 1);

    expect(attacker?.action).toBe("Ready");
    expect(attacker?.velocity).toEqual({ x: 0, y: 0 });
    expect(attacker?.unsupportedTicks).toBe(0);
    expect(
      supportedTileIds.has(
        `${Math.floor(attacker?.position.x ?? -1)}:${Math.floor(attacker?.position.y ?? -1)}`,
      ),
    ).toBe(true);
  });
});
