import { BotDirector } from "../src/ai/bot-director";
import { getArenaSize } from "../src/app/settings";
import { createNeutralCommand, normalizeGameConfig } from "../src/simulation/contracts";
import { SimulationWorld } from "../src/simulation/world";

const PROFILE_TICKS = 120 * 60;
const PARTICIPANT_COUNTS = [16, 24, 32] as const;

interface Percentiles {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly maximum: number;
}

function percentile(sortedValues: readonly number[], fraction: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * fraction) - 1);
  return sortedValues[index] ?? 0;
}

function summarize(values: readonly number[]): Percentiles {
  const sorted = values.toSorted((left, right) => left - right);
  return Object.freeze({
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    maximum: sorted.at(-1) ?? 0,
  });
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function roundSummary(summary: Percentiles): Percentiles {
  return Object.freeze({
    p50: roundMilliseconds(summary.p50),
    p95: roundMilliseconds(summary.p95),
    p99: roundMilliseconds(summary.p99),
    maximum: roundMilliseconds(summary.maximum),
  });
}

function profileParticipantCount(participantCount: number) {
  const arenaSize = getArenaSize(participantCount);
  const config = normalizeGameConfig({
    participantCount,
    arenaColumns: arenaSize.columns,
    arenaRows: arenaSize.rows,
    roundLimitSeconds: 120,
    collapseSpeed: "slow",
    difficulty: "hard",
    itemsEnabled: true,
    itemRespawnSeconds: participantCount >= 25 ? 3 : participantCount >= 17 ? 4 : 5,
  });
  const aiDurations: number[] = [];
  const simulationDurations: number[] = [];
  let totalCandidatePairs = 0;
  let totalFullPairs = 0;
  let longSteps = 0;
  let completedRounds = 0;
  let totalTicks = 0;
  let roundIndex = 0;
  const heapBefore = process.memoryUsage().heapUsed;
  const profileStarted = performance.now();

  while (totalTicks < PROFILE_TICKS) {
    const seed = `scale-${participantCount}-${roundIndex}`;
    const world = new SimulationWorld(config, seed, { humanActorId: 1 });
    const bots = new BotDirector(seed, 1, { difficulty: config.difficulty });
    let frame = world.createRenderFrame();

    while (totalTicks < PROFILE_TICKS && frame.round.status === "Active") {
      const aiStarted = performance.now();
      const botCommands = bots.createCommands(world.tick, frame);
      const simulationStarted = performance.now();
      const result = world.step([createNeutralCommand(world.tick, 1), ...botCommands]);
      const stepFinished = performance.now();
      const aiDuration = simulationStarted - aiStarted;
      const simulationDuration = stepFinished - simulationStarted;
      aiDurations.push(aiDuration);
      simulationDurations.push(simulationDuration);
      totalCandidatePairs += result.diagnostics.broadPhaseCandidatePairs;
      totalFullPairs += result.diagnostics.fullPairCount;
      longSteps += aiDuration + simulationDuration > 100 ? 1 : 0;
      frame = result.frame;
      totalTicks += 1;
    }

    if (frame.round.status === "Completed") {
      completedRounds += 1;
    }

    roundIndex += 1;
  }

  const elapsedMilliseconds = performance.now() - profileStarted;
  const heapAfter = process.memoryUsage().heapUsed;
  return Object.freeze({
    participantCount,
    botDifficulty: config.difficulty,
    ticks: totalTicks,
    completedRounds,
    elapsedMilliseconds: roundMilliseconds(elapsedMilliseconds),
    realtimeMultiplier:
      Math.round((PROFILE_TICKS / 60 / (elapsedMilliseconds / 1_000)) * 100) / 100,
    aiMilliseconds: roundSummary(summarize(aiDurations)),
    simulationMilliseconds: roundSummary(summarize(simulationDurations)),
    broadPhaseCandidateRatio:
      totalFullPairs === 0
        ? 0
        : Math.round((totalCandidatePairs / totalFullPairs) * 10_000) / 10_000,
    longStepsOver100Milliseconds: longSteps,
    heapDeltaBytes: heapAfter - heapBefore,
  });
}

const profiles = PARTICIPANT_COUNTS.map(profileParticipantCount);
const thresholds = new Map([
  [16, 4],
  [24, 7],
  [32, 7],
]);
const ok = profiles.every(
  (profile) =>
    profile.simulationMilliseconds.p95 <= (thresholds.get(profile.participantCount) ?? 0) &&
    profile.longStepsOver100Milliseconds <= 1,
);

process.stdout.write(
  `${JSON.stringify(
    {
      ok,
      kind: "headless-local-profile",
      runtime: `Bun ${process.versions["bun"] ?? "unknown"}`,
      profileTicks: PROFILE_TICKS,
      profiles,
      limitations: [
        "This measures hard-difficulty headless AI plus simulation on the current workstation, not browser rendering.",
        "Heap deltas are observational because the harness does not force garbage collection.",
      ],
    },
    null,
    2,
  )}\n`,
);

if (!ok) {
  process.exitCode = 1;
}
