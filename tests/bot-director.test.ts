import { describe, expect, it } from "vitest";
import { BotDirector, getBotDifficultyProfile } from "../src/ai/bot-director";
import { BOT_ACTIVE_ITEM_IDS, createBotLoadoutAssignments } from "../src/ai/bot-loadouts";
import { getArenaSize } from "../src/app/settings";
import { createNeutralCommand, normalizeGameConfig } from "../src/simulation/contracts";
import { SimulationWorld, type ParticipantSpawnOverride } from "../src/simulation/world";

function createBotWorld(
  participantCount = 4,
  overrides: readonly ParticipantSpawnOverride[] = [],
  seed = "bot-world",
): SimulationWorld {
  return new SimulationWorld(
    normalizeGameConfig({ participantCount, roundLimitSeconds: 10, initialItemCount: 0 }),
    seed,
    {
      humanActorId: 1,
      participantOverrides: overrides,
      arenaLayout: "rectangular-fixture",
    },
  );
}

describe("utility bot director", () => {
  it("gives all fifty-nine public bots one evenly distributed active item", () => {
    const assignments = createBotLoadoutAssignments("public-loadouts", 60, 1);
    const activeCounts = new Map<(typeof BOT_ACTIVE_ITEM_IDS)[number], number>(
      BOT_ACTIVE_ITEM_IDS.map((item) => [item, 0]),
    );

    expect(assignments).toHaveLength(59);
    expect(assignments.some(({ actorId }) => actorId === 1)).toBe(false);
    expect(assignments).toEqual(createBotLoadoutAssignments("public-loadouts", 60, 1));

    for (const { startingItems } of assignments) {
      const [active] = startingItems;
      expect(BOT_ACTIVE_ITEM_IDS).toContain(active);
      activeCounts.set(active, (activeCounts.get(active) ?? 0) + 1);
    }

    const activeSpread = [...activeCounts.values()];
    expect(Math.max(...activeSpread) - Math.min(...activeSpread)).toBeLessThanOrEqual(1);
  });

  it("changes only bounded perception and decision budgets across difficulty levels", () => {
    expect(getBotDifficultyProfile("easy")).toEqual({
      reactionDelayTicks: 24,
      decisionIntervalTicks: 20,
      nearbyCandidateLimit: 4,
    });
    expect(getBotDifficultyProfile("normal")).toEqual({
      reactionDelayTicks: 10,
      decisionIntervalTicks: 12,
      nearbyCandidateLimit: 6,
    });
    expect(getBotDifficultyProfile("hard")).toEqual({
      reactionDelayTicks: 6,
      decisionIntervalTicks: 8,
      nearbyCandidateLimit: 8,
    });
  });

  it("emits exactly one sorted command per active non-human actor", () => {
    const world = createBotWorld(8);
    const director = new BotDirector("command-shape", 1, {
      reactionDelayTicks: 0,
      decisionIntervalTicks: 1,
    });
    const commands = director.createCommands(0, world.createRenderFrame());

    expect(commands.map(({ actorId }) => actorId)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(commands.every(({ tick, commandVersion }) => tick === 0 && commandVersion === 1)).toBe(
      true,
    );
  });

  it("can explicitly control every active actor for headless audits", () => {
    const world = createBotWorld(4);
    const director = new BotDirector("all-bot-audit", null, {
      reactionDelayTicks: 0,
      decisionIntervalTicks: 1,
    });

    expect(
      director.createCommands(0, world.createRenderFrame()).map(({ actorId }) => actorId),
    ).toEqual([1, 2, 3, 4]);
  });

  it("repeats personalities, commands, and final state for the same seed", () => {
    function run() {
      const world = createBotWorld(8, [], "deterministic-bots");
      const director = new BotDirector("deterministic-bots", 1);
      const commandLog: unknown[] = [];

      for (let tick = 0; tick < 180; tick += 1) {
        const commands = director.createCommands(world.tick, world.createRenderFrame());
        commandLog.push(commands);
        world.step([createNeutralCommand(world.tick, 1), ...commands]);
      }

      return {
        assignments: director.getAssignments(),
        commandLog,
        finalHash: world.createRenderFrame().stateHash,
      };
    }

    expect(run()).toEqual(run());
  });

  it("uses immediate self-preservation when a bot reaches the arena edge", () => {
    const world = createBotWorld(4, [
      { actorId: 1, position: { x: 5.5, y: 4.5 } },
      { actorId: 2, position: { x: 0.3, y: 4.5 } },
      { actorId: 3, position: { x: 8.5, y: 1.5 } },
      { actorId: 4, position: { x: 8.5, y: 7.5 } },
    ]);
    const director = new BotDirector("edge-safety", 1, {
      reactionDelayTicks: 0,
      decisionIntervalTicks: 1,
    });
    const bot = director
      .createCommands(0, world.createRenderFrame())
      .find(({ actorId }) => actorId === 2);

    expect(bot?.move.x).toBeGreaterThan(0);
    expect(bot?.grapplePressed).toBe(true);
  });

  it("leaves a currently warning tile without reading the private collapse plan", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({
        participantCount: 4,
        arenaColumns: 9,
        arenaRows: 7,
        roundLimitSeconds: 20,
        collapseSpeed: "fast",
      }),
      "bot-tile-safety",
    );

    while (world.tick < 481) {
      world.step();
    }

    const frame = world.createRenderFrame();
    const warningTile = frame.tiles.find(({ state }) => state === "Warning");
    expect(warningTile).toBeDefined();
    const warningPosition = Object.freeze({
      x: (warningTile?.column ?? 0) + 0.5,
      y: (warningTile?.row ?? 0) + 0.5,
    });
    const adjustedFrame = Object.freeze({
      ...frame,
      participants: Object.freeze(
        frame.participants.map((participant) =>
          participant.actorId === 2
            ? Object.freeze({
                ...participant,
                position: warningPosition,
                previousPosition: warningPosition,
              })
            : participant,
        ),
      ),
    });
    const director = new BotDirector("bot-tile-safety", 1, {
      reactionDelayTicks: 0,
      decisionIntervalTicks: 1,
    });
    const bot = director
      .createCommands(adjustedFrame.tick, adjustedFrame)
      .find(({ actorId }) => actorId === 2);
    const destinationColumn = Math.floor(warningPosition.x + (bot?.move.x ?? 0) * 0.75);
    const destinationRow = Math.floor(warningPosition.y + (bot?.move.y ?? 0) * 0.75);
    const destinationTile = adjustedFrame.tiles.find(
      ({ column, row }) => column === destinationColumn && row === destinationRow,
    );

    expect(destinationTile?.state).toBe("Stable");
    expect(bot?.grapplePressed).toBe(true);
  });

  it("treats an imminent lethal rock as an immediate dodge priority", () => {
    const world = createBotWorld(4, [
      { actorId: 1, position: { x: 1.5, y: 1.5 } },
      { actorId: 2, position: { x: 4.5, y: 4.5 } },
      { actorId: 3, position: { x: 7.5, y: 1.5 } },
      { actorId: 4, position: { x: 7.5, y: 6.5 } },
    ]);
    const frame = world.createRenderFrame();
    const threatenedFrame = Object.freeze({
      ...frame,
      rockShots: Object.freeze([
        Object.freeze({
          shotId: 1,
          shipId: 1,
          targetActorId: 2,
          origin: Object.freeze({ x: 4.5, y: -2.6 }),
          target: Object.freeze({ x: 4.5, y: 4.5 }),
          launchTick: frame.tick,
          impactTick: frame.tick + 60,
          blastRadius: 0.72,
        }),
      ]),
    });
    const director = new BotDirector("rock-evasion", 1, {
      reactionDelayTicks: 24,
      decisionIntervalTicks: 20,
    });
    const bot = director
      .createCommands(threatenedFrame.tick, threatenedFrame)
      .find(({ actorId }) => actorId === 2);

    expect(bot?.dodgePressed || bot?.useSkillSlot !== null).toBe(true);
    expect(Math.hypot(bot?.move.x ?? 0, bot?.move.y ?? 0)).toBeCloseTo(1, 10);
  });

  it("prefers an equally close edge opportunity without checking human identity", () => {
    const world = createBotWorld(4, [
      { actorId: 1, position: { x: 3.5, y: 4.5 }, facing: { x: 1, y: 0 } },
      { actorId: 2, position: { x: 2.5, y: 4.5 }, facing: { x: 0, y: 1 } },
      { actorId: 3, position: { x: 1.5, y: 4.5 }, facing: { x: -1, y: 0 } },
      { actorId: 4, position: { x: 8.5, y: 7.5 } },
    ]);
    const director = new BotDirector("identity-neutral", 1, {
      reactionDelayTicks: 0,
      decisionIntervalTicks: 1,
    });
    const bot = director
      .createCommands(0, world.createRenderFrame())
      .find(({ actorId }) => actorId === 2);

    expect(bot?.move.x).toBeLessThan(0);
  });

  it("does not dodge through a stable tile into surrounding water", () => {
    const world = createBotWorld(4, [
      { actorId: 1, position: { x: 3, y: 4.5 }, facing: { x: 1, y: 0 } },
      { actorId: 2, position: { x: 4.5, y: 4.5 }, facing: { x: 0, y: 1 } },
      { actorId: 3, position: { x: 1.5, y: 1.5 } },
      { actorId: 4, position: { x: 7.5, y: 7.5 } },
    ]);
    const frame = world.createRenderFrame();
    const enclosedFrame = Object.freeze({
      ...frame,
      tiles: Object.freeze(
        frame.tiles.map((tile) =>
          Math.max(Math.abs(tile.column - 4), Math.abs(tile.row - 4)) >= 2
            ? Object.freeze({ ...tile, state: "Void" as const })
            : tile,
        ),
      ),
      participants: Object.freeze(
        frame.participants.map((participant) =>
          participant.actorId === 1
            ? Object.freeze({ ...participant, action: "ShoveWindup" as const })
            : participant,
        ),
      ),
    });
    const director = new BotDirector("dodge-water-safety", 1, {
      reactionDelayTicks: 0,
      decisionIntervalTicks: 1,
    });
    const bot = director
      .createCommands(enclosedFrame.tick, enclosedFrame)
      .find(({ actorId }) => actorId === 2);

    expect(bot?.dodgePressed).toBe(false);
  });

  it("uses a carried Wind Blast on a readable edge opportunity", () => {
    const world = createBotWorld(4, [
      { actorId: 1, position: { x: 10.5, y: 1.5 } },
      {
        actorId: 2,
        position: { x: 6.5, y: 4.5 },
        facing: { x: 1, y: 0 },
        startingItems: ["wind-blast"],
      },
      { actorId: 3, position: { x: 9.5, y: 4.5 } },
      { actorId: 4, position: { x: 10.5, y: 8.5 } },
    ]);
    const director = new BotDirector("wind-edge-opportunity", 1, {
      reactionDelayTicks: 0,
      decisionIntervalTicks: 1,
      personalityOverrides: [{ actorId: 2, personality: "Aggressor" }],
    });
    const command = director
      .createCommands(0, world.createRenderFrame())
      .find(({ actorId }) => actorId === 2);

    expect(command?.useItemSlot).toBe(0);
    expect(command?.move.x).toBeGreaterThan(0.9);
    expect(command?.grapplePressed).toBe(false);
  });

  it("uses a Brick Bag as cover during a readable edge fight", () => {
    const world = createBotWorld(4, [
      { actorId: 1, position: { x: 10.5, y: 1.5 } },
      {
        actorId: 2,
        position: { x: 2.5, y: 4.5 },
        facing: { x: 1, y: 0 },
        startingItems: ["brick-bag"],
      },
      { actorId: 3, position: { x: 4.5, y: 4.5 }, facing: { x: 0, y: 1 } },
      { actorId: 4, position: { x: 10.5, y: 8.5 } },
    ]);
    const director = new BotDirector("brick-cover-opportunity", 1, {
      reactionDelayTicks: 0,
      decisionIntervalTicks: 1,
      personalityOverrides: [{ actorId: 2, personality: "Survivor" }],
    });
    const command = director
      .createCommands(0, world.createRenderFrame())
      .find(({ actorId }) => actorId === 2);

    expect(command?.useItemSlot).toBe(0);
    expect(command?.move.x).toBeGreaterThan(0.9);
    expect(command?.dodgePressed).toBe(false);
  });

  it("walks around a tree to reach an opponent instead of grinding against the trunk", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({
        participantCount: 4,
        arenaColumns: 9,
        arenaRows: 7,
        roundLimitSeconds: 10,
        initialItemCount: 0,
        itemsEnabled: false,
      }),
      "bot-tree-detour",
      {
        humanActorId: 1,
        arenaLayout: "rectangular-fixture",
        treeOverrides: [Object.freeze({ definitionId: "tree", tileId: "4:3", column: 4, row: 3 })],
        participantOverrides: [
          { actorId: 1, position: { x: 6.5, y: 3.5 } },
          {
            actorId: 2,
            position: { x: 2.5, y: 3.5 },
            startingSkills: ["force-palm", "aegis"],
          },
          { actorId: 3, position: { x: 7.5, y: 1.5 } },
          { actorId: 4, position: { x: 7.5, y: 5.5 } },
        ],
      },
    );
    const director = new BotDirector("bot-tree-detour", 1, {
      reactionDelayTicks: 0,
      decisionIntervalTicks: 1,
      personalityOverrides: [{ actorId: 2, personality: "Aggressor" }],
    });
    let maximumVerticalDetour = 0;

    for (let tick = 0; tick < 180; tick += 1) {
      const frame = world.createRenderFrame();
      const actor = frame.participants.find(({ actorId }) => actorId === 2);
      maximumVerticalDetour = Math.max(
        maximumVerticalDetour,
        Math.abs((actor?.position.y ?? 3.5) - 3.5),
      );
      world.step([
        createNeutralCommand(world.tick, 1),
        ...director.createCommands(world.tick, frame),
      ]);
    }

    const actor = world.createRenderFrame().participants.find(({ actorId }) => actorId === 2);
    expect(maximumVerticalDetour).toBeGreaterThan(0.45);
    expect(actor?.position.x).toBeGreaterThan(4.6);
  });

  it("does not cast a line skill through a blocking tree", () => {
    const world = new SimulationWorld(
      normalizeGameConfig({
        participantCount: 4,
        arenaColumns: 9,
        arenaRows: 7,
        initialItemCount: 0,
        itemsEnabled: false,
      }),
      "bot-tree-line-of-sight",
      {
        humanActorId: 1,
        arenaLayout: "rectangular-fixture",
        treeOverrides: [Object.freeze({ definitionId: "tree", tileId: "4:3", column: 4, row: 3 })],
        participantOverrides: [
          { actorId: 1, position: { x: 5.5, y: 3.5 } },
          {
            actorId: 2,
            position: { x: 2.5, y: 3.5 },
            startingSkills: ["arc-bolt", "aegis"],
          },
          { actorId: 3, position: { x: 7.5, y: 1.5 } },
          { actorId: 4, position: { x: 7.5, y: 5.5 } },
        ],
      },
    );
    const director = new BotDirector("bot-tree-line-of-sight", 1, {
      reactionDelayTicks: 0,
      decisionIntervalTicks: 1,
      personalityOverrides: [{ actorId: 2, personality: "Aggressor" }],
    });
    const command = director
      .createCommands(0, world.createRenderFrame())
      .find(({ actorId }) => actorId === 2);

    expect(command?.useSkillSlot).toBeNull();
    expect(Math.abs(command?.move.y ?? 0)).toBeGreaterThan(0.2);
  });

  it("keeps a recently chosen target when a rival becomes only slightly more attractive", () => {
    const world = createBotWorld(4, [
      { actorId: 1, position: { x: 3.4, y: 4.5 } },
      { actorId: 2, position: { x: 4.5, y: 4.5 }, startingSkills: ["aegis", "blink-step"] },
      { actorId: 3, position: { x: 5.7, y: 4.5 } },
      { actorId: 4, position: { x: 8.5, y: 7.5 } },
    ]);
    const director = new BotDirector("target-commitment", null, {
      reactionDelayTicks: 0,
      decisionIntervalTicks: 1,
      personalityOverrides: [{ actorId: 2, personality: "Aggressor" }],
    });
    const firstFrame = world.createRenderFrame();
    const first = director.createCommands(0, firstFrame).find(({ actorId }) => actorId === 2);
    expect(first?.move.x).toBeLessThan(0);

    const adjustedFrame = Object.freeze({
      ...firstFrame,
      tick: 1,
      participants: Object.freeze(
        firstFrame.participants.map((participant) =>
          participant.actorId === 1
            ? Object.freeze({ ...participant, position: Object.freeze({ x: 3.3, y: 4.5 }) })
            : participant.actorId === 3
              ? Object.freeze({ ...participant, position: Object.freeze({ x: 5.55, y: 4.5 }) })
              : participant,
        ),
      ),
    });
    const second = director.createCommands(1, adjustedFrame).find(({ actorId }) => actorId === 2);
    expect(second?.move.x).toBeLessThan(0);
  });

  it("spends several active-item families during a public-scale hard round", () => {
    const participantCount = 60;
    const arena = getArenaSize(participantCount);
    const config = normalizeGameConfig({
      participantCount,
      arenaColumns: arena.columns,
      arenaRows: arena.rows,
      roundLimitSeconds: 30,
      difficulty: "hard",
      itemsEnabled: false,
    });
    const seed = "public-active-item-screen";
    const world = new SimulationWorld(config, seed, {
      humanActorId: 1,
      participantOverrides: createBotLoadoutAssignments(seed, participantCount, 1),
    });
    const director = new BotDirector(seed, 1, { difficulty: "hard" });
    const usedItems = new Set<string>();
    let useCount = 0;
    let frame = world.createRenderFrame();

    while (world.tick < 30 * 60 && frame.round.status === "Active") {
      const result = world.step(director.createCommands(world.tick, frame));
      frame = result.frame;

      for (const event of result.events) {
        if (
          event.kind === "item-used" &&
          event.actorId !== 1 &&
          event.itemDefinitionId !== undefined
        ) {
          usedItems.add(event.itemDefinitionId);
          useCount += 1;
        }
      }
    }

    expect(useCount).toBeGreaterThanOrEqual(12);
    expect(usedItems.size).toBeGreaterThanOrEqual(4);
    expect(usedItems).toContain("wind-blast");
  }, 45_000);
});
