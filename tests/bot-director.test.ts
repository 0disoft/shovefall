import { describe, expect, it } from "vitest";
import { BotDirector, getBotDifficultyProfile } from "../src/ai/bot-director";
import {
  BOT_ACTIVE_ITEM_IDS,
  BOT_PASSIVE_ITEM_IDS,
  createBotLoadoutAssignments,
} from "../src/ai/bot-loadouts";
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
  it("gives all forty-nine public bots one passive and one evenly distributed active item", () => {
    const assignments = createBotLoadoutAssignments("public-loadouts", 50, 1);
    const passiveCounts = new Map<(typeof BOT_PASSIVE_ITEM_IDS)[number], number>(
      BOT_PASSIVE_ITEM_IDS.map((item) => [item, 0]),
    );
    const activeCounts = new Map<(typeof BOT_ACTIVE_ITEM_IDS)[number], number>(
      BOT_ACTIVE_ITEM_IDS.map((item) => [item, 0]),
    );

    expect(assignments).toHaveLength(49);
    expect(assignments.some(({ actorId }) => actorId === 1)).toBe(false);
    expect(assignments).toEqual(createBotLoadoutAssignments("public-loadouts", 50, 1));

    for (const { startingItems } of assignments) {
      const [passive, active] = startingItems;
      expect(BOT_PASSIVE_ITEM_IDS).toContain(passive);
      expect(BOT_ACTIVE_ITEM_IDS).toContain(active);
      passiveCounts.set(passive, (passiveCounts.get(passive) ?? 0) + 1);
      activeCounts.set(active, (activeCounts.get(active) ?? 0) + 1);
    }

    const passiveSpread = [...passiveCounts.values()];
    const activeSpread = [...activeCounts.values()];
    expect(Math.max(...passiveSpread) - Math.min(...passiveSpread)).toBeLessThanOrEqual(1);
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
    expect(bot?.shovePressed).toBe(false);
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
    expect(bot?.shovePressed).toBe(false);
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

  it("reacts to a shove telegraph only after the configured perception delay", () => {
    const world = createBotWorld(4, [
      { actorId: 1, position: { x: 4, y: 4.5 }, facing: { x: 1, y: 0 } },
      { actorId: 2, position: { x: 5.4, y: 4.5 }, facing: { x: 0, y: 1 } },
      { actorId: 3, position: { x: 8.5, y: 1.5 } },
      { actorId: 4, position: { x: 8.5, y: 7.5 } },
    ]);
    const director = new BotDirector("delayed-reaction", 1, {
      reactionDelayTicks: 1,
      decisionIntervalTicks: 1,
    });
    const initialBots = director.createCommands(0, world.createRenderFrame());
    world.step([
      { ...createNeutralCommand(0, 1), shovePressed: true, move: { x: 1, y: 0 } },
      ...initialBots,
    ]);

    const beforeDelay = director.createCommands(1, world.createRenderFrame());
    expect(beforeDelay.find(({ actorId }) => actorId === 2)?.dodgePressed).toBe(false);
    world.step([createNeutralCommand(1, 1), ...beforeDelay]);

    const afterDelay = director.createCommands(2, world.createRenderFrame());
    expect(afterDelay.find(({ actorId }) => actorId === 2)?.dodgePressed).toBe(true);
  });

  it("uses a carried Wind Blast on a readable edge opportunity", () => {
    const world = createBotWorld(4, [
      { actorId: 1, position: { x: 10.5, y: 1.5 } },
      {
        actorId: 2,
        position: { x: 3.5, y: 4.5 },
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
    expect(command?.shovePressed).toBe(false);
  });

  it("spends several active-item families during a public-scale hard round", () => {
    const participantCount = 50;
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
  }, 20_000);
});
