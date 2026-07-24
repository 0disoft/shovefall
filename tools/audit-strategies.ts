import { BotDirector } from "../src/ai/bot-director";
import { BOT_ACTIVE_ITEM_IDS, createBotLoadoutAssignments } from "../src/ai/bot-loadouts";
import { BOT_PERSONALITY_KINDS, type BotPersonalityKind } from "../src/ai/personalities";
import {
  getArenaSize,
  getPresetCollapseSpeed,
  getPresetItemRespawnSeconds,
  getRecommendedInitialItemCount,
  type PresetName,
} from "../src/app/settings";
import { ITEM_DEFINITION_IDS } from "../src/content/items";
import {
  normalizeGameConfig,
  type ActorId,
  type ItemDefinitionId,
  type RoundEndReason,
} from "../src/simulation/contracts";
import { SIMULATION_TUNING } from "../src/simulation/tuning";
import {
  FIXED_TICKS_PER_SECOND,
  PRODUCT_VERSION,
  SIMULATION_VERSION,
} from "../src/simulation/versions";
import { SimulationWorld } from "../src/simulation/world";

const PARTICIPANT_COUNTS = [50] as const;
const SAMPLE_COUNT = 8;
const ROUND_LIMIT_SECONDS = 75;
const PRESET_BY_COUNT: Readonly<Record<(typeof PARTICIPANT_COUNTS)[number], PresetName>> =
  Object.freeze({ 50: "massive" });

type MassBand = "light" | "normal" | "heavy";

interface ActorObservation {
  activeTicks: number;
  bombSelfDeaths: number;
  creditedEliminations: number;
  readonly itemUses: Record<ItemDefinitionId, number>;
  readonly pickedItems: Set<ItemDefinitionId>;
  readonly massBands: Set<MassBand>;
}

interface StrategyAggregate {
  activeItemUses: number;
  actorRounds: number;
  bombSelfDeaths: number;
  wins: number;
  creditedEliminations: number;
  activeTicks: number;
}

interface ItemUseAggregate {
  actorRounds: number;
  uses: number;
  wins: number;
}

function roundRatio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 10_000) / 10_000;
}

function getMassBand(massFactor: number): MassBand {
  return massFactor < 0.9 ? "light" : massFactor > 1.1 ? "heavy" : "normal";
}

function createItemCounts(): Record<ItemDefinitionId, number> {
  return {
    "iron-boots": 0,
    feather: 0,
    "spring-glove": 0,
    "wind-blast": 0,
    "brick-bag": 0,
    boat: 0,
    bomb: 0,
    soap: 0,
    "grappling-hook": 0,
  };
}

function createActorObservations(participantCount: number): Map<ActorId, ActorObservation> {
  return new Map(
    Array.from({ length: participantCount }, (_, index) => [
      index + 1,
      {
        activeTicks: 0,
        bombSelfDeaths: 0,
        creditedEliminations: 0,
        itemUses: createItemCounts(),
        pickedItems: new Set<ItemDefinitionId>(),
        massBands: new Set<MassBand>(),
      },
    ]),
  );
}

function createStrategyAggregates(): Record<BotPersonalityKind, StrategyAggregate> {
  return {
    Aggressor: {
      activeItemUses: 0,
      actorRounds: 0,
      bombSelfDeaths: 0,
      wins: 0,
      creditedEliminations: 0,
      activeTicks: 0,
    },
    Survivor: {
      activeItemUses: 0,
      actorRounds: 0,
      bombSelfDeaths: 0,
      wins: 0,
      creditedEliminations: 0,
      activeTicks: 0,
    },
    Opportunist: {
      activeItemUses: 0,
      actorRounds: 0,
      bombSelfDeaths: 0,
      wins: 0,
      creditedEliminations: 0,
      activeTicks: 0,
    },
    Disruptor: {
      activeItemUses: 0,
      actorRounds: 0,
      bombSelfDeaths: 0,
      wins: 0,
      creditedEliminations: 0,
      activeTicks: 0,
    },
    Collector: {
      activeItemUses: 0,
      actorRounds: 0,
      bombSelfDeaths: 0,
      wins: 0,
      creditedEliminations: 0,
      activeTicks: 0,
    },
  };
}

const strategyAggregates = createStrategyAggregates();
const itemExposure: Record<ItemDefinitionId, { actorRounds: number; wins: number }> = {
  "iron-boots": { actorRounds: 0, wins: 0 },
  feather: { actorRounds: 0, wins: 0 },
  "spring-glove": { actorRounds: 0, wins: 0 },
  "wind-blast": { actorRounds: 0, wins: 0 },
  "brick-bag": { actorRounds: 0, wins: 0 },
  boat: { actorRounds: 0, wins: 0 },
  bomb: { actorRounds: 0, wins: 0 },
  soap: { actorRounds: 0, wins: 0 },
  "grappling-hook": { actorRounds: 0, wins: 0 },
};
const itemUse: Record<ItemDefinitionId, ItemUseAggregate> = {
  "iron-boots": { actorRounds: 0, uses: 0, wins: 0 },
  feather: { actorRounds: 0, uses: 0, wins: 0 },
  "spring-glove": { actorRounds: 0, uses: 0, wins: 0 },
  "wind-blast": { actorRounds: 0, uses: 0, wins: 0 },
  "brick-bag": { actorRounds: 0, uses: 0, wins: 0 },
  boat: { actorRounds: 0, uses: 0, wins: 0 },
  bomb: { actorRounds: 0, uses: 0, wins: 0 },
  soap: { actorRounds: 0, uses: 0, wins: 0 },
  "grappling-hook": { actorRounds: 0, uses: 0, wins: 0 },
};
const massExposure: Record<MassBand, { actorRounds: number; wins: number }> = {
  light: { actorRounds: 0, wins: 0 },
  normal: { actorRounds: 0, wins: 0 },
  heavy: { actorRounds: 0, wins: 0 },
};

const scenarios = PARTICIPANT_COUNTS.map((participantCount) => {
  const preset = PRESET_BY_COUNT[participantCount];
  const arena = getArenaSize(participantCount);
  const config = normalizeGameConfig({
    participantCount,
    arenaColumns: arena.columns,
    arenaRows: arena.rows,
    roundLimitSeconds: ROUND_LIMIT_SECONDS,
    collapseSpeed: getPresetCollapseSpeed(preset),
    difficulty: "hard",
    itemsEnabled: true,
    initialItemCount: getRecommendedInitialItemCount(participantCount),
    itemRespawnSeconds: getPresetItemRespawnSeconds(preset),
  });
  const durations: number[] = [];
  const reasonCounts: Record<RoundEndReason, number> = {
    "last-standing": 0,
    "no-survivors": 0,
    "time-limit": 0,
  };

  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const seed = `strategy-audit-v2-${participantCount}-${sample}`;
    const world = new SimulationWorld(config, seed, {
      humanActorId: 1,
      participantOverrides: createBotLoadoutAssignments(seed, participantCount, null),
    });
    const bots = new BotDirector(seed, null, { difficulty: "hard" });
    const actors = createActorObservations(participantCount);
    let frame = world.createRenderFrame();

    while (frame.round.status === "Active") {
      const previousParticipants = new Map(
        frame.participants.map((participant) => [participant.actorId, participant] as const),
      );
      const result = world.step(bots.createCommands(world.tick, frame));
      frame = result.frame;
      const detonatedBombsByOwner = new Map<ActorId, { readonly x: number; readonly y: number }>();

      for (const event of result.events) {
        if (
          event.kind === "bomb-detonated" &&
          event.actorId !== undefined &&
          event.position !== undefined
        ) {
          detonatedBombsByOwner.set(event.actorId, event.position);
        }
      }

      for (const event of result.events) {
        if (event.actorId === undefined) {
          continue;
        }

        const actor = actors.get(event.actorId);
        if (actor === undefined) {
          continue;
        }

        if (event.kind === "stat-point-earned") {
          actor.creditedEliminations += 1;
        }

        if (event.kind === "item-picked-up" && event.itemDefinitionId !== undefined) {
          actor.pickedItems.add(event.itemDefinitionId);
        }

        if (event.kind === "item-used" && event.itemDefinitionId !== undefined) {
          actor.itemUses[event.itemDefinitionId] += 1;
        }

        if (event.kind === "eliminated") {
          const bombPosition = detonatedBombsByOwner.get(event.actorId);
          const previous = previousParticipants.get(event.actorId);

          if (
            bombPosition !== undefined &&
            previous !== undefined &&
            Math.hypot(
              previous.position.x - bombPosition.x,
              previous.position.y - bombPosition.y,
            ) <= SIMULATION_TUNING.bomb.blastRadius
          ) {
            actor.bombSelfDeaths += 1;
          }
        }
      }

      for (const participant of frame.participants) {
        if (
          !participant.active ||
          participant.action === "Falling" ||
          participant.action === "Eliminated"
        ) {
          continue;
        }

        const actor = actors.get(participant.actorId);
        if (actor !== undefined) {
          actor.activeTicks += 1;
          actor.massBands.add(getMassBand(participant.massFactor));
        }
      }
    }

    if (frame.round.completedTick === null || frame.round.reason === null) {
      throw new Error(`strategy audit round ${seed} did not terminate`);
    }

    durations.push(frame.round.completedTick / FIXED_TICKS_PER_SECOND);
    reasonCounts[frame.round.reason] += 1;
    const personalities = new Map(
      bots.getAssignments().map(({ actorId, personality }) => [actorId, personality] as const),
    );

    for (const [actorId, actor] of actors) {
      const personality = personalities.get(actorId);
      if (personality === undefined) {
        throw new Error(`strategy audit round ${seed} missed actor ${actorId}`);
      }

      const won = frame.round.winnerActorId === actorId;
      const strategy = strategyAggregates[personality];
      strategy.actorRounds += 1;
      strategy.bombSelfDeaths += actor.bombSelfDeaths;
      strategy.wins += won ? 1 : 0;
      strategy.creditedEliminations += actor.creditedEliminations;
      strategy.activeTicks += actor.activeTicks;

      for (const item of BOT_ACTIVE_ITEM_IDS) {
        const uses = actor.itemUses[item];
        strategy.activeItemUses += uses;
        itemUse[item].uses += uses;

        if (uses > 0) {
          itemUse[item].actorRounds += 1;
          itemUse[item].wins += won ? 1 : 0;
        }
      }

      for (const item of actor.pickedItems) {
        itemExposure[item].actorRounds += 1;
        itemExposure[item].wins += won ? 1 : 0;
      }

      for (const band of actor.massBands) {
        massExposure[band].actorRounds += 1;
        massExposure[band].wins += won ? 1 : 0;
      }
    }
  }

  durations.sort((left, right) => left - right);
  return Object.freeze({
    participantCount,
    arena,
    reasonCounts: Object.freeze(reasonCounts),
    durationSeconds: Object.freeze({
      minimum: durations[0] ?? 0,
      mean: roundRatio(
        durations.reduce((sum, duration) => sum + duration, 0),
        durations.length,
      ),
      maximum: durations.at(-1) ?? 0,
    }),
  });
});

const strategies = Object.freeze(
  Object.fromEntries(
    BOT_PERSONALITY_KINDS.map((personality) => {
      const aggregate = strategyAggregates[personality];
      return [
        personality,
        Object.freeze({
          ...aggregate,
          winRate: roundRatio(aggregate.wins, aggregate.actorRounds),
          creditedEliminationsPerActorRound: roundRatio(
            aggregate.creditedEliminations,
            aggregate.actorRounds,
          ),
          meanSurvivalSeconds: roundRatio(
            aggregate.activeTicks,
            aggregate.actorRounds * FIXED_TICKS_PER_SECOND,
          ),
        }),
      ];
    }),
  ),
);
const aggressor = strategies.Aggressor;
const survivor = strategies.Survivor;

if (aggressor === undefined || survivor === undefined) {
  throw new Error("strategy audit missed Aggressor or Survivor");
}

const aggressorToSurvivorWinRate =
  aggressor.winRate === null || survivor.winRate === null || survivor.winRate === 0
    ? null
    : roundRatio(aggressor.winRate, survivor.winRate);
const aggressorToSurvivorEliminationRate =
  aggressor.creditedEliminationsPerActorRound === null ||
  survivor.creditedEliminationsPerActorRound === null ||
  survivor.creditedEliminationsPerActorRound === 0
    ? null
    : roundRatio(
        aggressor.creditedEliminationsPerActorRound,
        survivor.creditedEliminationsPerActorRound,
      );
const timeLimitRounds = scenarios.reduce(
  (sum, scenario) => sum + scenario.reasonCounts["time-limit"],
  0,
);
const totalActiveItemUses = BOT_ACTIVE_ITEM_IDS.reduce((sum, item) => sum + itemUse[item].uses, 0);
const activeItemKindsUsed = BOT_ACTIVE_ITEM_IDS.filter((item) => itemUse[item].uses > 0).length;
const bombSelfDeaths = Object.values(strategyAggregates).reduce(
  (sum, strategy) => sum + strategy.bombSelfDeaths,
  0,
);
const bombSelfDeathRate = roundRatio(bombSelfDeaths, itemUse.bomb.uses);
const ok =
  aggressorToSurvivorWinRate !== null &&
  aggressorToSurvivorWinRate >= 0.75 &&
  aggressorToSurvivorEliminationRate !== null &&
  aggressorToSurvivorEliminationRate >= 1 &&
  totalActiveItemUses > 0 &&
  timeLimitRounds === 0;

process.stdout.write(
  `${JSON.stringify(
    {
      ok,
      kind: "deterministic-strategy-balance-audit",
      auditVersion: 2,
      productVersion: PRODUCT_VERSION,
      simulationVersion: SIMULATION_VERSION,
      sampleCountPerScenario: SAMPLE_COUNT,
      seedPattern: "strategy-audit-v2-<participantCount>-<0..7>",
      statEffects: {
        maximumMassRange: [SIMULATION_TUNING.mass.minimum, SIMULATION_TUNING.mass.maximum],
        eliminationCreditSeconds:
          SIMULATION_TUNING.shove.eliminationCreditTicks / FIXED_TICKS_PER_SECOND,
      },
      scenarios,
      strategies,
      comparison: {
        aggressorToSurvivorWinRate,
        aggressorToSurvivorEliminationRate,
        timeLimitRounds,
      },
      itemExposure: Object.fromEntries(
        ITEM_DEFINITION_IDS.map((item) => [
          item,
          {
            ...itemExposure[item],
            winRate: roundRatio(itemExposure[item].wins, itemExposure[item].actorRounds),
          },
        ]),
      ),
      activeItemUse: Object.fromEntries(
        BOT_ACTIVE_ITEM_IDS.map((item) => [
          item,
          {
            ...itemUse[item],
            winnerRateAmongUsers: roundRatio(itemUse[item].wins, itemUse[item].actorRounds),
          },
        ]),
      ),
      activeItemSummary: {
        totalUses: totalActiveItemUses,
        kindsUsed: activeItemKindsUsed,
        bombSelfDeaths,
        bombSelfDeathRate,
      },
      massExposure: Object.fromEntries(
        (["light", "normal", "heavy"] as const).map((band) => [
          band,
          {
            ...massExposure[band],
            winRate: roundRatio(massExposure[band].wins, massExposure[band].actorRounds),
          },
        ]),
      ),
      limitations: [
        "This fixed-seed bot screen is regression evidence, not a human-play fairness proof.",
        "Item and mass exposure overlap and are descriptive rather than causal controlled estimates.",
        "Starting human loadout choices are excluded because every actor is bot-controlled.",
        "Bomb self-death counts require the owner to be inside its own blast on the detonation tick.",
      ],
    },
    null,
    2,
  )}\n`,
);

if (!ok) {
  process.exitCode = 1;
}
