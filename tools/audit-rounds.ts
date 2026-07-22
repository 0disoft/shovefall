import { BotDirector } from "../src/ai/bot-director";
import { getArenaSize, getRecommendedInitialItemCount } from "../src/app/settings";
import {
  normalizeGameConfig,
  type GameConfigV1,
  type RoundEndReason,
} from "../src/simulation/contracts";
import {
  FIXED_TICKS_PER_SECOND,
  PRODUCT_VERSION,
  SIMULATION_VERSION,
} from "../src/simulation/versions";
import { SimulationWorld } from "../src/simulation/world";

const PARTICIPANT_COUNTS = [4, 12, 24, 32] as const;
const SAMPLE_COUNT = 16;
const ROUND_LIMIT_SECONDS = 75;

interface RoundObservation {
  readonly seed: string;
  readonly completedTick: number;
  readonly durationSeconds: number;
  readonly reason: RoundEndReason;
  readonly winnerActorId: number | null;
  readonly finalStateHash: string;
}

function percentile(sortedValues: readonly number[], fraction: number): number {
  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * fraction) - 1);
  return sortedValues[index] ?? 0;
}

function roundSeconds(ticks: number): number {
  return Math.round((ticks / FIXED_TICKS_PER_SECOND) * 1_000) / 1_000;
}

function createAuditConfig(participantCount: number): GameConfigV1 {
  const arena = getArenaSize(participantCount);
  const mayhem = participantCount >= 25;
  return normalizeGameConfig({
    participantCount,
    arenaColumns: arena.columns,
    arenaRows: arena.rows,
    roundLimitSeconds: ROUND_LIMIT_SECONDS,
    collapseSpeed: mayhem ? "fast" : "normal",
    itemsEnabled: true,
    initialItemCount: getRecommendedInitialItemCount(participantCount),
    itemRespawnSeconds: mayhem ? 3 : 5,
  });
}

function auditRound(config: GameConfigV1, seed: string): RoundObservation {
  const world = new SimulationWorld(config, seed, { humanActorId: 1 });
  const bots = new BotDirector(seed, null);
  let frame = world.createRenderFrame();

  while (frame.round.status === "Active") {
    frame = world.step(bots.createCommands(world.tick, frame)).frame;
  }

  const { completedTick, reason, winnerActorId } = frame.round;

  if (completedTick === null || reason === null) {
    throw new Error(`round ${seed} completed without a terminal result`);
  }

  if (completedTick < 1 || completedTick > config.roundLimitTicks) {
    throw new Error(`round ${seed} completed outside its configured tick range`);
  }

  if ((reason === "last-standing") !== (winnerActorId !== null)) {
    throw new Error(`round ${seed} has an inconsistent winner and end reason`);
  }

  return Object.freeze({
    seed,
    completedTick,
    durationSeconds: roundSeconds(completedTick),
    reason,
    winnerActorId,
    finalStateHash: frame.stateHash,
  });
}

function auditParticipantCount(participantCount: number) {
  const config = createAuditConfig(participantCount);
  const rounds = Array.from({ length: SAMPLE_COUNT }, (_, index) =>
    auditRound(config, `round-audit-v1-${participantCount}-${index}`),
  );
  const sortedTicks = rounds.map(({ completedTick }) => completedTick).toSorted((a, b) => a - b);
  const reasonCounts: Record<RoundEndReason, number> = {
    "last-standing": 0,
    "no-survivors": 0,
    "time-limit": 0,
  };
  const winnerCounts = new Map<number, number>();

  for (const round of rounds) {
    reasonCounts[round.reason] += 1;

    if (round.winnerActorId !== null) {
      winnerCounts.set(round.winnerActorId, (winnerCounts.get(round.winnerActorId) ?? 0) + 1);
    }
  }

  return Object.freeze({
    participantCount,
    config: Object.freeze({
      arenaColumns: config.arenaColumns,
      arenaRows: config.arenaRows,
      collapseSpeed: config.collapseSpeed,
      initialItemCount: config.initialItemCount,
      maximumItemCount: config.maximumItemCount,
      itemSpawnIntervalTicks: config.itemSpawnIntervalTicks,
      roundLimitTicks: config.roundLimitTicks,
    }),
    durationSeconds: Object.freeze({
      minimum: roundSeconds(sortedTicks[0] ?? 0),
      p50: roundSeconds(percentile(sortedTicks, 0.5)),
      p95: roundSeconds(percentile(sortedTicks, 0.95)),
      maximum: roundSeconds(sortedTicks.at(-1) ?? 0),
    }),
    reasonCounts: Object.freeze(reasonCounts),
    winnerCoverage: Object.freeze({
      distinctActors: winnerCounts.size,
      maximumWinsByOneActor: Math.max(0, ...winnerCounts.values()),
    }),
    rounds: Object.freeze(rounds),
  });
}

const scenarios = PARTICIPANT_COUNTS.map(auditParticipantCount);
const ok = scenarios.every(
  ({ reasonCounts, rounds }) =>
    rounds.length === SAMPLE_COUNT &&
    reasonCounts["time-limit"] === 0 &&
    rounds.every(({ completedTick }) => completedTick > 0),
);

process.stdout.write(
  `${JSON.stringify(
    {
      ok,
      kind: "deterministic-all-bot-round-audit",
      auditVersion: 1,
      productVersion: PRODUCT_VERSION,
      simulationVersion: SIMULATION_VERSION,
      fixedTicksPerSecond: FIXED_TICKS_PER_SECOND,
      sampleCountPerScenario: SAMPLE_COUNT,
      seedPattern: "round-audit-v1-<participantCount>-<0..15>",
      scenarios,
      decisionRules: [
        "Every sampled round must produce a structurally valid terminal result within 75 seconds.",
        "No sampled all-bot round may rely on the time-limit draw to terminate.",
      ],
      limitations: [
        "This is deterministic rule-based bot workload evidence, not a human-play balance test.",
        "Actor 1 is bot-commanded for this audit even though the browser reserves actor 1 for the human.",
        "Winner coverage is observational and is not a fairness gate for sixteen fixed seeds.",
      ],
    },
    null,
    2,
  )}\n`,
);

if (!ok) {
  process.exitCode = 1;
}
