import { BotDirector } from "../src/ai/bot-director";
import { getArenaSize } from "../src/app/settings";
import { createNeutralCommand, normalizeGameConfig } from "../src/simulation/contracts";
import { SimulationWorld } from "../src/simulation/world";

const PROFILE_TICKS = 120 * 60;
const PARTICIPANT_COUNTS = [50] as const;

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

function createProfileHumanCommand(tick: number) {
  const cardinalDirections = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ] as const;
  const direction = cardinalDirections[tick % cardinalDirections.length] ?? { x: 1, y: 0 };
  return {
    ...createNeutralCommand(tick, 1),
    move: direction,
    useItemSlot: tick === 0 ? (0 as const) : tick < 13 ? (1 as const) : null,
  };
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
  let peakBrickWalls = 0;
  let totalBrickWallSamples = 0;
  let peakBombs = 0;
  let totalBombSamples = 0;
  let maximumSimultaneousBombDetonations = 0;
  let peakSoapPatches = 0;
  let totalSoapPatchSamples = 0;
  let soapTriggers = 0;
  let maximumSimultaneousSoapTriggers = 0;
  let grapplingHookHits = 0;
  let maximumSimultaneousGrapplingHookHits = 0;
  const heapBefore = process.memoryUsage().heapUsed;
  const profileStarted = performance.now();

  while (totalTicks < PROFILE_TICKS) {
    const seed = `scale-${participantCount}-${roundIndex}`;
    const world = new SimulationWorld(config, seed, {
      humanActorId: 1,
      participantOverrides: [
        {
          actorId: 1,
          position: {
            x: Math.floor(arenaSize.columns / 2) + 0.5,
            y: Math.floor(arenaSize.rows / 2) + 0.5,
          },
          facing: { x: 1, y: 0 },
          startingItems: ["brick-bag", "soap"],
        },
        { actorId: 2, startingItems: ["bomb"] },
        { actorId: 3, startingItems: ["bomb"] },
        {
          actorId: 4,
          position: {
            x: Math.floor(arenaSize.columns / 2) + 0.5,
            y: Math.floor(arenaSize.rows / 2) + 4.5,
          },
          facing: { x: 1, y: 0 },
          startingItems: ["grappling-hook"],
        },
      ],
    });
    const bots = new BotDirector(seed, 1, { difficulty: config.difficulty });
    let frame = world.createRenderFrame();

    while (totalTicks < PROFILE_TICKS && frame.round.status === "Active") {
      const aiStarted = performance.now();
      const botCommands = bots.createCommands(world.tick, frame);
      const simulationStarted = performance.now();
      const keepBombActorsNeutral = world.tick <= 12;
      const keepGrapplingActorNeutral = world.tick <= 33;
      const result = world.step([
        createProfileHumanCommand(world.tick),
        ...botCommands.filter(
          ({ actorId }) =>
            (!keepBombActorsNeutral || (actorId !== 2 && actorId !== 3)) &&
            (!keepGrapplingActorNeutral || actorId !== 4),
        ),
        ...(keepBombActorsNeutral
          ? [2, 3].map((actorId) => ({
              ...createNeutralCommand(world.tick, actorId),
              useItemSlot: world.tick === 12 ? (0 as const) : null,
            }))
          : []),
        ...(keepGrapplingActorNeutral
          ? [
              {
                ...createNeutralCommand(world.tick, 4),
                move: { x: 1, y: 0 },
                useItemSlot: world.tick === 20 || world.tick === 33 ? (0 as const) : null,
              },
            ]
          : []),
      ]);
      const stepFinished = performance.now();
      const aiDuration = simulationStarted - aiStarted;
      const simulationDuration = stepFinished - simulationStarted;
      aiDurations.push(aiDuration);
      simulationDurations.push(simulationDuration);
      totalCandidatePairs += result.diagnostics.broadPhaseCandidatePairs;
      totalFullPairs += result.diagnostics.fullPairCount;
      longSteps += aiDuration + simulationDuration > 100 ? 1 : 0;
      frame = result.frame;
      peakBrickWalls = Math.max(peakBrickWalls, frame.brickWalls.length);
      totalBrickWallSamples += frame.brickWalls.length;
      peakBombs = Math.max(peakBombs, frame.bombs.length);
      totalBombSamples += frame.bombs.length;
      maximumSimultaneousBombDetonations = Math.max(
        maximumSimultaneousBombDetonations,
        result.events.filter(({ kind }) => kind === "bomb-detonated").length,
      );
      peakSoapPatches = Math.max(peakSoapPatches, frame.soapPatches.length);
      totalSoapPatchSamples += frame.soapPatches.length;
      const simultaneousSoapTriggers = result.events.filter(
        ({ kind }) => kind === "soap-triggered",
      ).length;
      soapTriggers += simultaneousSoapTriggers;
      maximumSimultaneousSoapTriggers = Math.max(
        maximumSimultaneousSoapTriggers,
        simultaneousSoapTriggers,
      );
      const simultaneousGrapplingHookHits = result.events.filter(
        ({ kind }) => kind === "grappling-hook-hit",
      ).length;
      grapplingHookHits += simultaneousGrapplingHookHits;
      maximumSimultaneousGrapplingHookHits = Math.max(
        maximumSimultaneousGrapplingHookHits,
        simultaneousGrapplingHookHits,
      );
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
    peakBrickWalls,
    meanBrickWallsPerTick: Math.round((totalBrickWallSamples / totalTicks) * 1_000) / 1_000,
    peakBombs,
    meanBombsPerTick: Math.round((totalBombSamples / totalTicks) * 1_000) / 1_000,
    maximumSimultaneousBombDetonations,
    peakSoapPatches,
    meanSoapPatchesPerTick: Math.round((totalSoapPatchSamples / totalTicks) * 1_000) / 1_000,
    soapTriggers,
    maximumSimultaneousSoapTriggers,
    grapplingHookHits,
    maximumSimultaneousGrapplingHookHits,
    longStepsOver100Milliseconds: longSteps,
    heapDeltaBytes: heapAfter - heapBefore,
  });
}

const profiles = PARTICIPANT_COUNTS.map(profileParticipantCount);
const thresholds = new Map([[50, 10]]);
const ok = profiles.every(
  (profile) =>
    profile.simulationMilliseconds.p95 <= (thresholds.get(profile.participantCount) ?? 0) &&
    profile.longStepsOver100Milliseconds <= 1 &&
    profile.peakBrickWalls >= 1 &&
    profile.peakBombs >= 2 &&
    profile.maximumSimultaneousBombDetonations >= 2 &&
    profile.peakSoapPatches >= 1 &&
    profile.grapplingHookHits >= 1,
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
        "Each round gives actors 2 and 3 Bomb, keeps them neutral through tick 12, and forces both placements and detonations on the same ticks while actor 1 exercises Brick Bag and Soap and actor 4 attempts both Grappling Hook charges.",
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
