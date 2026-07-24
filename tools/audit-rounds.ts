import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { BotDirector } from "../src/ai/bot-director";
import { createBotLoadoutAssignments } from "../src/ai/bot-loadouts";
import { BOT_PERSONALITY_KINDS, type BotPersonalityKind } from "../src/ai/personalities";
import { ITEM_DEFINITION_IDS, MAP_ITEM_DEFINITION_IDS } from "../src/content/items";
import {
  getArenaSize,
  getPresetCollapseSpeed,
  getPresetItemRespawnSeconds,
  getRecommendedInitialItemCount,
  type PresetName,
} from "../src/app/settings";
import {
  createNeutralCommand,
  normalizeGameConfig,
  type ActorId,
  type CollapseSpeed,
  type GameConfigV1,
  type ItemDefinitionId,
  type RenderFrameV1,
  type RoundEndReason,
} from "../src/simulation/contracts";
import {
  getItemSpawnBand,
  type ItemSpawnBand,
  type ItemSpawnOverride,
} from "../src/simulation/items";
import { SIMULATION_TUNING } from "../src/simulation/tuning";
import {
  FIXED_TICKS_PER_SECOND,
  PRODUCT_VERSION,
  SIMULATION_VERSION,
} from "../src/simulation/versions";
import { SimulationWorld, type ParticipantSpawnOverride } from "../src/simulation/world";
import { getBalanceSignal, wilsonInterval } from "./item-balance-statistics";

const PARTICIPANT_COUNTS = [50] as const;
const SAMPLE_COUNT = 16;
const PRODUCTION_SHARD_COUNT = 2;
const PRODUCTION_SAMPLES_PER_SHARD = SAMPLE_COUNT / PRODUCTION_SHARD_COUNT;
const PRODUCTION_SHARD_SCHEMA_VERSION = "shovefall.round-audit-production-shard/v1";
const CONTROLLED_MASS_SAMPLE_COUNT = 24;
const CONTROLLED_MASS_PARTICIPANT_COUNT = 16;
const CONTROLLED_ITEM_SAMPLE_COUNT = 64;
const CONTROLLED_ITEM_PARTICIPANT_COUNT = 8;
const CONTROLLED_ITEM_CHI_SQUARE_LIMIT = 5.991;
const CONTROLLED_COLLAPSE_SAMPLE_COUNT = 16;
const CONTROLLED_COLLAPSE_PARTICIPANT_COUNT = 16;
const COLLAPSE_SPEEDS = ["slow", "normal", "fast"] as const satisfies readonly CollapseSpeed[];
const ROUND_LIMIT_SECONDS = 75;
const MASS_BANDS = ["light", "normal", "heavy"] as const;
const ITEM_SPAWN_BANDS = ["edge", "near-edge", "interior"] as const;
const CONTROLLED_ITEM_GROUPS = ["control", ...MAP_ITEM_DEFINITION_IDS] as const;
const AUDIT_SECTIONS = [
  "production",
  "production-shard",
  "production-merge",
  "mass",
  "items",
  "collapse",
  "all",
] as const;

type MassBand = (typeof MASS_BANDS)[number];
type ControlledItemGroup = (typeof CONTROLLED_ITEM_GROUPS)[number];
type AuditSection = (typeof AUDIT_SECTIONS)[number];

function parseAuditSection(value: string | undefined): AuditSection {
  const section = value ?? "all";

  switch (section) {
    case "production":
    case "production-shard":
    case "production-merge":
    case "mass":
    case "items":
    case "collapse":
    case "all":
      return section;
  }

  throw new Error(
    `unknown round audit section ${JSON.stringify(section)}; expected ${AUDIT_SECTIONS.join(", ")}`,
  );
}

const PRESET_BY_PARTICIPANT_COUNT: Readonly<
  Record<(typeof PARTICIPANT_COUNTS)[number], PresetName>
> = Object.freeze({
  50: "massive",
});

const CONTROLLED_MASS_FACTORS: Readonly<Record<MassBand, number>> = Object.freeze({
  light: SIMULATION_TUNING.mass.minimum,
  normal: SIMULATION_TUNING.mass.default,
  heavy: SIMULATION_TUNING.mass.maximum,
});

interface ActorBalanceObservation {
  readonly pickups: Record<ItemDefinitionId, number>;
  readonly massTicks: Record<MassBand, number>;
  activeTicks: number;
  massFactorTotal: number;
  creditedEliminations: number;
}

interface RoundObservation {
  readonly seed: string;
  readonly completedTick: number;
  readonly durationSeconds: number;
  readonly reason: RoundEndReason;
  readonly winnerActorId: number | null;
  readonly finalStateHash: string;
}

interface RoundAuditResult {
  readonly round: RoundObservation;
  readonly actors: ReadonlyMap<ActorId, ActorBalanceObservation>;
  readonly itemSpawnBands: Readonly<Record<ItemSpawnBand, number>>;
  readonly personalities: ReadonlyMap<ActorId, BotPersonalityKind>;
}

interface SerializedRoundAuditResult {
  readonly round: RoundObservation;
  readonly actors: readonly (readonly [ActorId, ActorBalanceObservation])[];
  readonly itemSpawnBands: Readonly<Record<ItemSpawnBand, number>>;
  readonly personalities: readonly (readonly [ActorId, BotPersonalityKind])[];
}

interface ProductionShardArtifact {
  readonly schemaVersion: typeof PRODUCTION_SHARD_SCHEMA_VERSION;
  readonly auditVersion: 10;
  readonly productVersion: string;
  readonly simulationVersion: string;
  readonly participantCount: 50;
  readonly shardIndex: number;
  readonly shardCount: typeof PRODUCTION_SHARD_COUNT;
  readonly sampleStart: number;
  readonly sampleCount: typeof PRODUCTION_SAMPLES_PER_SHARD;
  readonly results: readonly SerializedRoundAuditResult[];
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }

  return Object.fromEntries(Object.entries(value));
}

function requireArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }

  return value;
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }

  return value;
}

function requireNonNegativeInteger(value: unknown, path: string): number {
  const parsed = requireFiniteNumber(value, path);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${path} must be a non-negative integer`);
  }

  return parsed;
}

function requireActorId(value: unknown, path: string): ActorId {
  const parsed = requireNonNegativeInteger(value, path);

  if (parsed < 1) {
    throw new Error(`${path} must be a positive actor id`);
  }

  return parsed;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string`);
  }

  return value;
}

function requireRoundEndReason(value: unknown, path: string): RoundEndReason {
  switch (value) {
    case "last-standing":
    case "no-survivors":
    case "time-limit":
      return value;
    default:
      throw new Error(`${path} must be a round end reason`);
  }
}

function requireBotPersonality(value: unknown, path: string): BotPersonalityKind {
  switch (value) {
    case "Aggressor":
    case "Survivor":
    case "Opportunist":
    case "Disruptor":
    case "Collector":
      return value;
    default:
      throw new Error(`${path} must be a bot personality`);
  }
}

function parseItemCounts(value: unknown, path: string): Record<ItemDefinitionId, number> {
  const record = requireRecord(value, path);
  const counts = createItemCounts();

  for (const definitionId of ITEM_DEFINITION_IDS) {
    counts[definitionId] = requireNonNegativeInteger(
      record[definitionId],
      `${path}.${definitionId}`,
    );
  }

  return counts;
}

function parseMassCounts(value: unknown, path: string): Record<MassBand, number> {
  const record = requireRecord(value, path);
  return {
    light: requireNonNegativeInteger(record.light, `${path}.light`),
    normal: requireNonNegativeInteger(record.normal, `${path}.normal`),
    heavy: requireNonNegativeInteger(record.heavy, `${path}.heavy`),
  };
}

function parseSpawnBandCounts(value: unknown, path: string): Record<ItemSpawnBand, number> {
  const record = requireRecord(value, path);
  return {
    edge: requireNonNegativeInteger(record.edge, `${path}.edge`),
    "near-edge": requireNonNegativeInteger(record["near-edge"], `${path}.near-edge`),
    interior: requireNonNegativeInteger(record.interior, `${path}.interior`),
  };
}

function parseRoundObservation(value: unknown, path: string): RoundObservation {
  const record = requireRecord(value, path);
  const winnerValue = record.winnerActorId;
  return Object.freeze({
    seed: requireString(record.seed, `${path}.seed`),
    completedTick: requireNonNegativeInteger(record.completedTick, `${path}.completedTick`),
    durationSeconds: requireFiniteNumber(record.durationSeconds, `${path}.durationSeconds`),
    reason: requireRoundEndReason(record.reason, `${path}.reason`),
    winnerActorId:
      winnerValue === null ? null : requireActorId(winnerValue, `${path}.winnerActorId`),
    finalStateHash: requireString(record.finalStateHash, `${path}.finalStateHash`),
  });
}

function parseActorObservation(value: unknown, path: string): ActorBalanceObservation {
  const record = requireRecord(value, path);
  return {
    pickups: parseItemCounts(record.pickups, `${path}.pickups`),
    massTicks: parseMassCounts(record.massTicks, `${path}.massTicks`),
    activeTicks: requireNonNegativeInteger(record.activeTicks, `${path}.activeTicks`),
    massFactorTotal: requireFiniteNumber(record.massFactorTotal, `${path}.massFactorTotal`),
    creditedEliminations: requireNonNegativeInteger(
      record.creditedEliminations,
      `${path}.creditedEliminations`,
    ),
  };
}

function parseActorEntry(
  value: unknown,
  path: string,
): readonly [ActorId, ActorBalanceObservation] {
  const entry = requireArray(value, path);

  if (entry.length !== 2) {
    throw new Error(`${path} must contain actor id and observation`);
  }

  return [requireActorId(entry[0], `${path}[0]`), parseActorObservation(entry[1], `${path}[1]`)];
}

function parsePersonalityEntry(
  value: unknown,
  path: string,
): readonly [ActorId, BotPersonalityKind] {
  const entry = requireArray(value, path);

  if (entry.length !== 2) {
    throw new Error(`${path} must contain actor id and personality`);
  }

  return [requireActorId(entry[0], `${path}[0]`), requireBotPersonality(entry[1], `${path}[1]`)];
}

function parseSerializedRoundAuditResult(value: unknown, path: string): SerializedRoundAuditResult {
  const record = requireRecord(value, path);
  const actors = requireArray(record.actors, `${path}.actors`).map((entry, index) =>
    parseActorEntry(entry, `${path}.actors[${index}]`),
  );
  const personalities = requireArray(record.personalities, `${path}.personalities`).map(
    (entry, index) => parsePersonalityEntry(entry, `${path}.personalities[${index}]`),
  );

  return Object.freeze({
    round: parseRoundObservation(record.round, `${path}.round`),
    actors: Object.freeze(actors),
    itemSpawnBands: Object.freeze(
      parseSpawnBandCounts(record.itemSpawnBands, `${path}.itemSpawnBands`),
    ),
    personalities: Object.freeze(personalities),
  });
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

function createMassCounts(): Record<MassBand, number> {
  return { light: 0, normal: 0, heavy: 0 };
}

function createSpawnBandCounts(): Record<ItemSpawnBand, number> {
  return { edge: 0, "near-edge": 0, interior: 0 };
}

function createControlledItemCounts(): Record<ControlledItemGroup, number> {
  return { control: 0, "iron-boots": 0, feather: 0, "spring-glove": 0 };
}

function getMassBand(massFactor: number): MassBand {
  if (massFactor < 0.9) {
    return "light";
  }

  return massFactor > 1.1 ? "heavy" : "normal";
}

function percentile(sortedValues: readonly number[], fraction: number): number {
  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * fraction) - 1);
  return sortedValues[index] ?? 0;
}

function roundSeconds(ticks: number): number {
  return Math.round((ticks / FIXED_TICKS_PER_SECOND) * 1_000) / 1_000;
}

function roundRatio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 10_000) / 10_000;
}

function summarizeRoundDurations(rounds: readonly RoundObservation[]) {
  const sortedTicks = rounds.map(({ completedTick }) => completedTick).toSorted((a, b) => a - b);
  const meanTicks =
    rounds.length === 0
      ? 0
      : rounds.reduce((sum, { completedTick }) => sum + completedTick, 0) / rounds.length;
  return Object.freeze({
    minimum: roundSeconds(sortedTicks[0] ?? 0),
    mean: roundSeconds(meanTicks),
    p50: roundSeconds(percentile(sortedTicks, 0.5)),
    p95: roundSeconds(percentile(sortedTicks, 0.95)),
    maximum: roundSeconds(sortedTicks.at(-1) ?? 0),
  });
}

function createAuditConfig(participantCount: (typeof PARTICIPANT_COUNTS)[number]): GameConfigV1 {
  const arena = getArenaSize(participantCount);
  const preset = PRESET_BY_PARTICIPANT_COUNT[participantCount];
  return normalizeGameConfig({
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
}

function createActorObservations(participantCount: number): Map<ActorId, ActorBalanceObservation> {
  return new Map(
    Array.from({ length: participantCount }, (_, index) => [
      index + 1,
      {
        pickups: createItemCounts(),
        massTicks: createMassCounts(),
        activeTicks: 0,
        massFactorTotal: 0,
        creditedEliminations: 0,
      },
    ]),
  );
}

function recordItemSpawns(
  frame: RenderFrameV1,
  seenItemIds: Set<number>,
  counts: Record<ItemSpawnBand, number>,
): void {
  for (const item of frame.items) {
    if (seenItemIds.has(item.itemId)) {
      continue;
    }

    seenItemIds.add(item.itemId);
    counts[getItemSpawnBand(item.position, frame.tiles)] += 1;
  }
}

function createRoundObservation(
  frame: RenderFrameV1,
  seed: string,
  roundLimitTicks: number,
): RoundObservation {
  const { completedTick, reason, winnerActorId } = frame.round;

  if (completedTick === null || reason === null) {
    throw new Error(`round ${seed} completed without a terminal result`);
  }

  if (completedTick < 1 || completedTick > roundLimitTicks) {
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

function auditRoundCompletion(config: GameConfigV1, seed: string): RoundObservation {
  const world = new SimulationWorld(config, seed, {
    humanActorId: 1,
    participantOverrides: createBotLoadoutAssignments(seed, config.participantCount, null),
  });
  const bots = new BotDirector(seed, null, { difficulty: "hard" });
  let frame = world.createRenderFrame();

  while (frame.round.status === "Active") {
    frame = world.step(bots.createCommands(world.tick, frame)).frame;
  }

  return createRoundObservation(frame, seed, config.roundLimitTicks);
}

function auditRound(config: GameConfigV1, seed: string): RoundAuditResult {
  const world = new SimulationWorld(config, seed, {
    humanActorId: 1,
    participantOverrides: createBotLoadoutAssignments(seed, config.participantCount, null),
  });
  const bots = new BotDirector(seed, null, { difficulty: "hard" });
  const actors = createActorObservations(config.participantCount);
  const seenItemIds = new Set<number>();
  const itemSpawnBands = createSpawnBandCounts();
  let frame = world.createRenderFrame();
  recordItemSpawns(frame, seenItemIds, itemSpawnBands);

  while (frame.round.status === "Active") {
    const result = world.step(bots.createCommands(world.tick, frame));
    frame = result.frame;
    recordItemSpawns(frame, seenItemIds, itemSpawnBands);

    for (const event of result.events) {
      if (event.kind === "stat-point-earned" && event.actorId !== undefined) {
        const actor = actors.get(event.actorId);

        if (actor !== undefined) {
          actor.creditedEliminations += 1;
        }
      }

      if (
        event.kind !== "item-picked-up" ||
        event.actorId === undefined ||
        event.itemDefinitionId === undefined
      ) {
        continue;
      }

      const actor = actors.get(event.actorId);
      if (actor !== undefined) {
        actor.pickups[event.itemDefinitionId] += 1;
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
      if (actor === undefined) {
        throw new Error(`round ${seed} is missing actor observation ${participant.actorId}`);
      }

      actor.activeTicks += 1;
      actor.massFactorTotal += participant.massFactor;
      actor.massTicks[getMassBand(participant.massFactor)] += 1;
    }
  }

  const round = createRoundObservation(frame, seed, config.roundLimitTicks);

  return Object.freeze({
    round,
    actors,
    itemSpawnBands: Object.freeze({ ...itemSpawnBands }),
    personalities: new Map(
      bots.getAssignments().map(({ actorId, personality }) => [actorId, personality] as const),
    ),
  });
}

function aggregateStrategy(results: readonly RoundAuditResult[]) {
  const aggregates: Record<
    BotPersonalityKind,
    { actorRounds: number; wins: number; creditedEliminations: number; activeTicks: number }
  > = {
    Aggressor: { actorRounds: 0, wins: 0, creditedEliminations: 0, activeTicks: 0 },
    Survivor: { actorRounds: 0, wins: 0, creditedEliminations: 0, activeTicks: 0 },
    Opportunist: { actorRounds: 0, wins: 0, creditedEliminations: 0, activeTicks: 0 },
    Disruptor: { actorRounds: 0, wins: 0, creditedEliminations: 0, activeTicks: 0 },
    Collector: { actorRounds: 0, wins: 0, creditedEliminations: 0, activeTicks: 0 },
  };

  for (const result of results) {
    for (const [actorId, actor] of result.actors) {
      const personality = result.personalities.get(actorId);

      if (personality === undefined) {
        throw new Error(`round ${result.round.seed} is missing personality ${actorId}`);
      }

      const aggregate = aggregates[personality];
      aggregate.actorRounds += 1;
      aggregate.wins += actorId === result.round.winnerActorId ? 1 : 0;
      aggregate.creditedEliminations += actor.creditedEliminations;
      aggregate.activeTicks += actor.activeTicks;
    }
  }

  const strategies = Object.freeze(
    Object.fromEntries(
      BOT_PERSONALITY_KINDS.map((personality) => {
        const aggregate = aggregates[personality];
        return [
          personality,
          Object.freeze({
            ...aggregate,
            winRate: roundRatio(aggregate.wins, aggregate.actorRounds),
            winRate95PercentInterval: wilsonInterval(aggregate.wins, aggregate.actorRounds),
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
    throw new Error("strategy audit is missing Aggressor or Survivor observations");
  }

  return Object.freeze({
    strategies,
    aggressorToSurvivorWinRate:
      aggressor.winRate === null || survivor.winRate === null || survivor.winRate === 0
        ? null
        : roundRatio(aggressor.winRate, survivor.winRate),
    aggressorToSurvivorEliminationRate:
      aggressor.creditedEliminationsPerActorRound === null ||
      survivor.creditedEliminationsPerActorRound === null ||
      survivor.creditedEliminationsPerActorRound === 0
        ? null
        : roundRatio(
            aggressor.creditedEliminationsPerActorRound,
            survivor.creditedEliminationsPerActorRound,
          ),
  });
}

function aggregateBalance(results: readonly RoundAuditResult[]) {
  const itemPickups: Record<
    ItemDefinitionId,
    { pickupCount: number; exposedActorRounds: number; winnerActorRounds: number }
  > = {
    "iron-boots": { pickupCount: 0, exposedActorRounds: 0, winnerActorRounds: 0 },
    feather: { pickupCount: 0, exposedActorRounds: 0, winnerActorRounds: 0 },
    "spring-glove": { pickupCount: 0, exposedActorRounds: 0, winnerActorRounds: 0 },
    "wind-blast": { pickupCount: 0, exposedActorRounds: 0, winnerActorRounds: 0 },
    "brick-bag": { pickupCount: 0, exposedActorRounds: 0, winnerActorRounds: 0 },
    boat: { pickupCount: 0, exposedActorRounds: 0, winnerActorRounds: 0 },
    bomb: { pickupCount: 0, exposedActorRounds: 0, winnerActorRounds: 0 },
    soap: { pickupCount: 0, exposedActorRounds: 0, winnerActorRounds: 0 },
    "grappling-hook": { pickupCount: 0, exposedActorRounds: 0, winnerActorRounds: 0 },
  };
  const massExposure: Record<
    MassBand,
    { activeTicks: number; exposedActorRounds: number; winnerActorRounds: number }
  > = {
    light: { activeTicks: 0, exposedActorRounds: 0, winnerActorRounds: 0 },
    normal: { activeTicks: 0, exposedActorRounds: 0, winnerActorRounds: 0 },
    heavy: { activeTicks: 0, exposedActorRounds: 0, winnerActorRounds: 0 },
  };
  const spawnBands = createSpawnBandCounts();
  let unexposedActorRounds = 0;
  let unexposedWinnerActorRounds = 0;
  let unmodifiedMassActorRounds = 0;
  let unmodifiedMassWinnerActorRounds = 0;
  let populationActiveTicks = 0;
  let populationMassFactorTotal = 0;
  let winnerActiveTicks = 0;
  let winnerMassFactorTotal = 0;

  for (const result of results) {
    for (const band of ITEM_SPAWN_BANDS) {
      spawnBands[band] += result.itemSpawnBands[band];
    }

    for (const [actorId, actor] of result.actors) {
      const won = actorId === result.round.winnerActorId;
      const hasAnyItem = ITEM_DEFINITION_IDS.some(
        (definitionId) => actor.pickups[definitionId] > 0,
      );
      const hasModifiedMass = actor.massTicks.light > 0 || actor.massTicks.heavy > 0;

      if (!hasAnyItem) {
        unexposedActorRounds += 1;
        unexposedWinnerActorRounds += won ? 1 : 0;
      }

      if (!hasModifiedMass) {
        unmodifiedMassActorRounds += 1;
        unmodifiedMassWinnerActorRounds += won ? 1 : 0;
      }

      populationActiveTicks += actor.activeTicks;
      populationMassFactorTotal += actor.massFactorTotal;

      if (won) {
        winnerActiveTicks += actor.activeTicks;
        winnerMassFactorTotal += actor.massFactorTotal;
      }

      for (const definitionId of ITEM_DEFINITION_IDS) {
        const aggregate = itemPickups[definitionId];
        aggregate.pickupCount += actor.pickups[definitionId];

        if (actor.pickups[definitionId] > 0) {
          aggregate.exposedActorRounds += 1;
          aggregate.winnerActorRounds += won ? 1 : 0;
        }
      }

      for (const band of MASS_BANDS) {
        const aggregate = massExposure[band];
        aggregate.activeTicks += actor.massTicks[band];

        if (actor.massTicks[band] > 0) {
          aggregate.exposedActorRounds += 1;
          aggregate.winnerActorRounds += won ? 1 : 0;
        }
      }
    }
  }

  const unexposedWinRate = roundRatio(unexposedWinnerActorRounds, unexposedActorRounds);
  const unmodifiedMassWinRate = roundRatio(
    unmodifiedMassWinnerActorRounds,
    unmodifiedMassActorRounds,
  );
  const totalSpawns = Object.values(spawnBands).reduce((sum, count) => sum + count, 0);

  return Object.freeze({
    itemExposure: Object.freeze(
      Object.fromEntries(
        ITEM_DEFINITION_IDS.map((definitionId) => {
          const aggregate = itemPickups[definitionId];
          const winRate = roundRatio(aggregate.winnerActorRounds, aggregate.exposedActorRounds);
          const relativeWinIndex =
            winRate === null || unexposedWinRate === null || unexposedWinRate === 0
              ? null
              : roundRatio(winRate, unexposedWinRate);
          return [
            definitionId,
            Object.freeze({
              ...aggregate,
              winRate,
              winRate95PercentInterval: wilsonInterval(
                aggregate.winnerActorRounds,
                aggregate.exposedActorRounds,
              ),
              relativeToNoItemExposure: relativeWinIndex,
              balanceSignal: getBalanceSignal(relativeWinIndex),
            }),
          ];
        }),
      ),
    ),
    noItemExposure: Object.freeze({
      actorRounds: unexposedActorRounds,
      winnerActorRounds: unexposedWinnerActorRounds,
      winRate: unexposedWinRate,
      winRate95PercentInterval: wilsonInterval(unexposedWinnerActorRounds, unexposedActorRounds),
    }),
    massExposure: Object.freeze(
      Object.fromEntries(
        MASS_BANDS.map((band) => {
          const aggregate = massExposure[band];
          const winRate = roundRatio(aggregate.winnerActorRounds, aggregate.exposedActorRounds);
          return [
            band,
            Object.freeze({
              ...aggregate,
              activeTickShare: roundRatio(aggregate.activeTicks, populationActiveTicks),
              winRate,
              relativeToNoModifiedMass:
                winRate === null || unmodifiedMassWinRate === null || unmodifiedMassWinRate === 0
                  ? null
                  : roundRatio(winRate, unmodifiedMassWinRate),
            }),
          ];
        }),
      ),
    ),
    noModifiedMassExposure: Object.freeze({
      actorRounds: unmodifiedMassActorRounds,
      winnerActorRounds: unmodifiedMassWinnerActorRounds,
      winRate: unmodifiedMassWinRate,
    }),
    meanMassFactor: Object.freeze({
      allActiveActorTicks: roundRatio(populationMassFactorTotal, populationActiveTicks),
      winnerActiveActorTicks: roundRatio(winnerMassFactorTotal, winnerActiveTicks),
    }),
    itemSpawnLocation: Object.freeze({
      counts: Object.freeze({ ...spawnBands }),
      shares: Object.freeze(
        Object.fromEntries(
          ITEM_SPAWN_BANDS.map((band) => [band, roundRatio(spawnBands[band], totalSpawns)]),
        ),
      ),
      riskBandShare: roundRatio(spawnBands.edge + spawnBands["near-edge"], totalSpawns),
    }),
  });
}

function summarizeParticipantAudit(
  participantCount: (typeof PARTICIPANT_COUNTS)[number],
  config: GameConfigV1,
  results: readonly RoundAuditResult[],
) {
  const rounds = results.map(({ round }) => round);
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
    preset: PRESET_BY_PARTICIPANT_COUNT[participantCount],
    config: Object.freeze({
      arenaColumns: config.arenaColumns,
      arenaRows: config.arenaRows,
      collapseSpeed: config.collapseSpeed,
      initialItemCount: config.initialItemCount,
      maximumItemCount: config.maximumItemCount,
      itemSpawnIntervalTicks: config.itemSpawnIntervalTicks,
      roundLimitTicks: config.roundLimitTicks,
    }),
    durationSeconds: summarizeRoundDurations(rounds),
    reasonCounts: Object.freeze(reasonCounts),
    winnerCoverage: Object.freeze({
      distinctActors: winnerCounts.size,
      maximumWinsByOneActor: Math.max(0, ...winnerCounts.values()),
    }),
    balance: aggregateBalance(results),
    strategy: aggregateStrategy(results),
    rounds: Object.freeze(rounds),
  });
}

function auditParticipantCount(participantCount: (typeof PARTICIPANT_COUNTS)[number]) {
  const config = createAuditConfig(participantCount);
  const results = Array.from({ length: SAMPLE_COUNT }, (_, index) =>
    auditRound(config, `round-audit-v2-${participantCount}-${index}`),
  );
  return summarizeParticipantAudit(participantCount, config, results);
}

function serializeActorEntry(
  entry: readonly [ActorId, ActorBalanceObservation],
): readonly [ActorId, ActorBalanceObservation] {
  return entry;
}

function serializePersonalityEntry(
  entry: readonly [ActorId, BotPersonalityKind],
): readonly [ActorId, BotPersonalityKind] {
  return entry;
}

function serializeRoundAuditResult(result: RoundAuditResult): SerializedRoundAuditResult {
  return Object.freeze({
    round: result.round,
    actors: Object.freeze(Array.from(result.actors.entries(), serializeActorEntry)),
    itemSpawnBands: result.itemSpawnBands,
    personalities: Object.freeze(
      Array.from(result.personalities.entries(), serializePersonalityEntry),
    ),
  });
}

function deserializeRoundAuditResult(result: SerializedRoundAuditResult): RoundAuditResult {
  const actors = new Map(result.actors);
  const personalities = new Map(result.personalities);

  if (actors.size !== 50 || personalities.size !== 50) {
    throw new Error(
      `production shard ${result.round.seed} must contain fifty unique actors and personalities`,
    );
  }

  for (const actorId of actors.keys()) {
    if (!personalities.has(actorId)) {
      throw new Error(`production shard ${result.round.seed} is missing personality ${actorId}`);
    }
  }

  return Object.freeze({
    round: result.round,
    actors,
    itemSpawnBands: result.itemSpawnBands,
    personalities,
  });
}

function getProductionArtifactDirectory(): string {
  return join(
    ".cache",
    "round-audit",
    `product-${PRODUCT_VERSION}-simulation-${SIMULATION_VERSION}`,
  );
}

function getProductionShardArtifactPath(shardIndex: number): string {
  return join(getProductionArtifactDirectory(), `production-${shardIndex}.json`);
}

function parseProductionShardIndex(value: string | undefined): number {
  switch (value) {
    case "0":
      return 0;
    case "1":
      return 1;
    default:
      throw new Error("production shard index must be 0 or 1");
  }
}

function parseProductionShardArtifact(
  value: unknown,
  expectedShardIndex: number,
): ProductionShardArtifact {
  const path = `production shard ${expectedShardIndex}`;
  const record = requireRecord(value, path);

  if (record.schemaVersion !== PRODUCTION_SHARD_SCHEMA_VERSION) {
    throw new Error(`${path} has an unsupported schema version`);
  }

  if (requireNonNegativeInteger(record.auditVersion, `${path}.auditVersion`) !== 10) {
    throw new Error(`${path} has an incompatible audit version`);
  }

  if (requireString(record.productVersion, `${path}.productVersion`) !== PRODUCT_VERSION) {
    throw new Error(`${path} belongs to another product version`);
  }

  if (requireString(record.simulationVersion, `${path}.simulationVersion`) !== SIMULATION_VERSION) {
    throw new Error(`${path} belongs to another simulation version`);
  }

  if (requireNonNegativeInteger(record.participantCount, `${path}.participantCount`) !== 50) {
    throw new Error(`${path} must use fifty participants`);
  }

  const shardIndex = requireNonNegativeInteger(record.shardIndex, `${path}.shardIndex`);
  const shardCount = requireNonNegativeInteger(record.shardCount, `${path}.shardCount`);
  const sampleStart = requireNonNegativeInteger(record.sampleStart, `${path}.sampleStart`);
  const sampleCount = requireNonNegativeInteger(record.sampleCount, `${path}.sampleCount`);

  if (
    shardIndex !== expectedShardIndex ||
    shardCount !== PRODUCTION_SHARD_COUNT ||
    sampleStart !== expectedShardIndex * PRODUCTION_SAMPLES_PER_SHARD ||
    sampleCount !== PRODUCTION_SAMPLES_PER_SHARD
  ) {
    throw new Error(`${path} has incompatible shard bounds`);
  }

  const results = requireArray(record.results, `${path}.results`).map((result, index) =>
    parseSerializedRoundAuditResult(result, `${path}.results[${index}]`),
  );

  if (results.length !== PRODUCTION_SAMPLES_PER_SHARD) {
    throw new Error(
      `${path} has ${results.length} results instead of ${PRODUCTION_SAMPLES_PER_SHARD}`,
    );
  }

  for (const [localIndex, result] of results.entries()) {
    const globalIndex = sampleStart + localIndex;
    const expectedSeed = `round-audit-v2-50-${globalIndex}`;

    if (result.round.seed !== expectedSeed) {
      throw new Error(`${path} expected seed ${expectedSeed} but found ${result.round.seed}`);
    }

    if (result.round.durationSeconds !== roundSeconds(result.round.completedTick)) {
      throw new Error(`${path} seed ${expectedSeed} has inconsistent tick duration`);
    }
  }

  return Object.freeze({
    schemaVersion: PRODUCTION_SHARD_SCHEMA_VERSION,
    auditVersion: 10,
    productVersion: PRODUCT_VERSION,
    simulationVersion: SIMULATION_VERSION,
    participantCount: 50,
    shardIndex,
    shardCount: PRODUCTION_SHARD_COUNT,
    sampleStart,
    sampleCount: PRODUCTION_SAMPLES_PER_SHARD,
    results: Object.freeze(results),
  });
}

async function runProductionShard(shardIndex: number) {
  const participantCount = 50;
  const sampleStart = shardIndex * PRODUCTION_SAMPLES_PER_SHARD;
  const config = createAuditConfig(participantCount);
  const results = Array.from({ length: PRODUCTION_SAMPLES_PER_SHARD }, (_, localIndex) => {
    const sampleIndex = sampleStart + localIndex;
    return auditRound(config, `round-audit-v2-${participantCount}-${sampleIndex}`);
  });
  const artifact: ProductionShardArtifact = Object.freeze({
    schemaVersion: PRODUCTION_SHARD_SCHEMA_VERSION,
    auditVersion: 10,
    productVersion: PRODUCT_VERSION,
    simulationVersion: SIMULATION_VERSION,
    participantCount,
    shardIndex,
    shardCount: PRODUCTION_SHARD_COUNT,
    sampleStart,
    sampleCount: PRODUCTION_SAMPLES_PER_SHARD,
    results: Object.freeze(results.map(serializeRoundAuditResult)),
  });
  const artifactDirectory = getProductionArtifactDirectory();
  const artifactPath = getProductionShardArtifactPath(shardIndex);
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  const rounds = results.map(({ round }) => round);
  const reasonCounts: Record<RoundEndReason, number> = {
    "last-standing": 0,
    "no-survivors": 0,
    "time-limit": 0,
  };
  for (const round of rounds) {
    reasonCounts[round.reason] += 1;
  }

  return Object.freeze({
    ok:
      rounds.length === PRODUCTION_SAMPLES_PER_SHARD &&
      reasonCounts["time-limit"] === 0 &&
      rounds.every(({ completedTick }) => completedTick > 0),
    kind: "deterministic-round-audit-production-shard",
    section: "production-shard",
    auditVersion: 10,
    productVersion: PRODUCT_VERSION,
    simulationVersion: SIMULATION_VERSION,
    fixedTicksPerSecond: FIXED_TICKS_PER_SECOND,
    shardIndex,
    shardCount: PRODUCTION_SHARD_COUNT,
    sampleStart,
    sampleCount: PRODUCTION_SAMPLES_PER_SHARD,
    artifactPath,
    durationSeconds: summarizeRoundDurations(rounds),
    reasonCounts: Object.freeze(reasonCounts),
    rounds: Object.freeze(rounds),
    limitations: Object.freeze([
      "A production shard proves terminal structure for its eight seeds but does not independently apply the sixteen-seed strategy or item-spawn distribution gates.",
      "The production merge command must validate both version-matched shards before a production balance claim is accepted.",
    ]),
  });
}

async function mergeProductionShards(): Promise<readonly ProductionAuditResult[]> {
  const artifacts = await Promise.all(
    Array.from({ length: PRODUCTION_SHARD_COUNT }, async (_, shardIndex) => {
      const artifactPath = getProductionShardArtifactPath(shardIndex);
      const contents = await readFile(artifactPath, "utf8");
      const parsed: unknown = JSON.parse(contents);
      return parseProductionShardArtifact(parsed, shardIndex);
    }),
  );
  const results = artifacts
    .flatMap(({ results: shardResults }) => shardResults)
    .map(deserializeRoundAuditResult);

  if (results.length !== SAMPLE_COUNT) {
    throw new Error(`production merge found ${results.length} rounds instead of ${SAMPLE_COUNT}`);
  }

  const seeds = new Set(results.map(({ round }) => round.seed));
  if (seeds.size !== SAMPLE_COUNT) {
    throw new Error("production merge found duplicate seeds");
  }

  const config = createAuditConfig(50);
  return Object.freeze([summarizeParticipantAudit(50, config, results)]);
}

function createControlledMassOverrides(sampleIndex: number): readonly ParticipantSpawnOverride[] {
  return Object.freeze(
    Array.from({ length: CONTROLLED_MASS_PARTICIPANT_COUNT }, (_, index) => {
      const actorId = index + 1;
      const band = MASS_BANDS[(index + sampleIndex) % MASS_BANDS.length] ?? "normal";
      return Object.freeze({ actorId, massFactor: CONTROLLED_MASS_FACTORS[band] });
    }),
  );
}

function auditControlledMass() {
  const arena = getArenaSize(CONTROLLED_MASS_PARTICIPANT_COUNT);
  const config = normalizeGameConfig({
    participantCount: CONTROLLED_MASS_PARTICIPANT_COUNT,
    arenaColumns: arena.columns,
    arenaRows: arena.rows,
    roundLimitSeconds: ROUND_LIMIT_SECONDS,
    collapseSpeed: "normal",
    itemsEnabled: false,
  });
  const slots = createMassCounts();
  const wins = createMassCounts();
  const rounds = Array.from({ length: CONTROLLED_MASS_SAMPLE_COUNT }, (_, sampleIndex) => {
    const seed = `mass-audit-v1-${sampleIndex}`;
    const overrides = createControlledMassOverrides(sampleIndex);
    const bandByActor = new Map(
      overrides.map((override) => {
        const band = MASS_BANDS.find(
          (candidate) => CONTROLLED_MASS_FACTORS[candidate] === override.massFactor,
        );
        return [override.actorId, band ?? "normal"] as const;
      }),
    );

    for (const band of bandByActor.values()) {
      slots[band] += 1;
    }

    const world = new SimulationWorld(config, seed, {
      humanActorId: 1,
      participantOverrides: overrides,
    });
    const bots = new BotDirector(seed, null);
    let frame = world.createRenderFrame();

    while (frame.round.status === "Active") {
      frame = world.step(bots.createCommands(world.tick, frame)).frame;
    }

    if (frame.round.completedTick === null || frame.round.reason === null) {
      throw new Error(`controlled mass round ${seed} completed without a terminal result`);
    }

    const winnerBand =
      frame.round.winnerActorId === null
        ? null
        : (bandByActor.get(frame.round.winnerActorId) ?? null);
    if (winnerBand !== null) {
      wins[winnerBand] += 1;
    }

    return Object.freeze({
      seed,
      completedTick: frame.round.completedTick,
      reason: frame.round.reason,
      winnerActorId: frame.round.winnerActorId,
      winnerMassBand: winnerBand,
      finalStateHash: frame.stateHash,
    });
  });
  const totalWins = Object.values(wins).reduce((sum, count) => sum + count, 0);
  const totalSlots = Object.values(slots).reduce((sum, count) => sum + count, 0);
  const expectedSlotWinRate = roundRatio(totalWins, totalSlots);
  const createBandResult = (band: MassBand) => {
    const winRate = roundRatio(wins[band], slots[band]);
    return Object.freeze({
      massFactor: CONTROLLED_MASS_FACTORS[band],
      actorRoundSlots: slots[band],
      wins: wins[band],
      winRate,
      relativeToEqualSlotExpectation:
        winRate === null || expectedSlotWinRate === null || expectedSlotWinRate === 0
          ? null
          : roundRatio(winRate, expectedSlotWinRate),
    });
  };
  const bands = Object.freeze({
    light: createBandResult("light"),
    normal: createBandResult("normal"),
    heavy: createBandResult("heavy"),
  });

  return Object.freeze({
    participantCount: CONTROLLED_MASS_PARTICIPANT_COUNT,
    sampleCount: CONTROLLED_MASS_SAMPLE_COUNT,
    itemsEnabled: false,
    assignment:
      "Every actor rotates through light, normal, and heavy base mass across fixed seeds.",
    expectedSlotWinRate,
    bands: Object.freeze(bands),
    rounds: Object.freeze(rounds),
  });
}

function getControlledItemGroup(actorId: ActorId, sampleIndex: number): ControlledItemGroup {
  return (
    CONTROLLED_ITEM_GROUPS[(actorId - 1 + sampleIndex) % CONTROLLED_ITEM_GROUPS.length] ?? "control"
  );
}

function auditControlledItems() {
  const arena = getArenaSize(CONTROLLED_ITEM_PARTICIPANT_COUNT);
  const config = normalizeGameConfig({
    participantCount: CONTROLLED_ITEM_PARTICIPANT_COUNT,
    arenaColumns: arena.columns,
    arenaRows: arena.rows,
    roundLimitSeconds: ROUND_LIMIT_SECONDS,
    collapseSpeed: "slow",
    itemsEnabled: false,
  });
  const slots = createControlledItemCounts();
  const wins = createControlledItemCounts();
  const rounds = Array.from({ length: CONTROLLED_ITEM_SAMPLE_COUNT }, (_, sampleIndex) => {
    const seed = `item-grant-audit-v1-${sampleIndex}`;
    const groupByActor = new Map<ActorId, ControlledItemGroup>();

    for (let actorId = 1; actorId <= CONTROLLED_ITEM_PARTICIPANT_COUNT; actorId += 1) {
      const group = getControlledItemGroup(actorId, sampleIndex);
      groupByActor.set(actorId, group);
      slots[group] += 1;
    }

    const probeFrame = new SimulationWorld(config, seed, {
      humanActorId: 1,
    }).createRenderFrame();
    const itemOverrides: ItemSpawnOverride[] = [];
    let nextItemId = 1;

    for (const participant of probeFrame.participants) {
      const group = groupByActor.get(participant.actorId) ?? "control";

      if (group === "control") {
        continue;
      }

      itemOverrides.push(
        Object.freeze({
          itemId: nextItemId,
          definitionId: group,
          position: participant.position,
          spawnedTick: 0,
        }),
      );
      nextItemId += 1;
    }

    const world = new SimulationWorld(config, seed, {
      humanActorId: 1,
      itemOverrides: Object.freeze(itemOverrides),
    });
    let frame = world.createRenderFrame();
    const grantResult = world.step(
      frame.participants.map(({ actorId }) => createNeutralCommand(world.tick, actorId)),
    );
    frame = grantResult.frame;
    const pickupsByActor = new Map<ActorId, ItemDefinitionId[]>();

    for (const event of grantResult.events) {
      if (
        event.kind !== "item-picked-up" ||
        event.actorId === undefined ||
        event.itemDefinitionId === undefined
      ) {
        continue;
      }

      const pickups = pickupsByActor.get(event.actorId) ?? [];
      pickups.push(event.itemDefinitionId);
      pickupsByActor.set(event.actorId, pickups);
    }

    for (const [actorId, group] of groupByActor) {
      const pickups = pickupsByActor.get(actorId) ?? [];

      if (
        group === "control" ? pickups.length !== 0 : pickups.length !== 1 || pickups[0] !== group
      ) {
        throw new Error(
          `controlled item round ${seed} failed to grant ${group} to actor ${actorId}`,
        );
      }
    }

    const bots = new BotDirector(seed, null);

    while (frame.round.status === "Active") {
      frame = world.step(bots.createCommands(world.tick, frame)).frame;
    }

    if (frame.round.completedTick === null || frame.round.reason === null) {
      throw new Error(`controlled item round ${seed} completed without a terminal result`);
    }

    const winnerGroup =
      frame.round.winnerActorId === null
        ? null
        : (groupByActor.get(frame.round.winnerActorId) ?? null);

    if (winnerGroup !== null) {
      wins[winnerGroup] += 1;
    }

    return Object.freeze({
      seed,
      completedTick: frame.round.completedTick,
      reason: frame.round.reason,
      winnerActorId: frame.round.winnerActorId,
      winnerItemGroup: winnerGroup,
      finalStateHash: frame.stateHash,
    });
  });
  const totalWins = Object.values(wins).reduce((sum, count) => sum + count, 0);
  const totalSlots = Object.values(slots).reduce((sum, count) => sum + count, 0);
  const expectedSlotWinRate = roundRatio(totalWins, totalSlots);
  const itemWins = MAP_ITEM_DEFINITION_IDS.map((group) => wins[group]);
  const totalItemWins = itemWins.reduce((sum, count) => sum + count, 0);
  const expectedWinsPerItem = totalItemWins / MAP_ITEM_DEFINITION_IDS.length;
  const winnerDistributionChiSquare =
    expectedWinsPerItem === 0
      ? null
      : Math.round(
          (itemWins.reduce(
            (sum, count) => sum + (count - expectedWinsPerItem) ** 2 / expectedWinsPerItem,
            0,
          ) +
            Number.EPSILON) *
            10_000,
        ) / 10_000;
  const createGroupResult = (group: ControlledItemGroup) => {
    const winRate = roundRatio(wins[group], slots[group]);
    return Object.freeze({
      actorRoundSlots: slots[group],
      wins: wins[group],
      winRate,
      winRate95PercentInterval: wilsonInterval(wins[group], slots[group]),
      relativeToEqualSlotExpectation:
        winRate === null || expectedSlotWinRate === null || expectedSlotWinRate === 0
          ? null
          : roundRatio(winRate, expectedSlotWinRate),
    });
  };
  const baseGroups = Object.freeze({
    control: createGroupResult("control"),
    "iron-boots": createGroupResult("iron-boots"),
    feather: createGroupResult("feather"),
    "spring-glove": createGroupResult("spring-glove"),
  } satisfies Record<ControlledItemGroup, ReturnType<typeof createGroupResult>>);
  const controlWinRate = baseGroups.control.winRate;
  const enrichGroup = (group: ControlledItemGroup) => {
    const result = baseGroups[group];
    const relativeToControl =
      result.winRate === null || controlWinRate === null || controlWinRate === 0
        ? null
        : roundRatio(result.winRate, controlWinRate);
    return Object.freeze({
      ...result,
      relativeToControl,
      balanceSignal: group === "control" ? "baseline" : getBalanceSignal(relativeToControl),
    });
  };
  const groups = Object.freeze({
    control: enrichGroup("control"),
    "iron-boots": enrichGroup("iron-boots"),
    feather: enrichGroup("feather"),
    "spring-glove": enrichGroup("spring-glove"),
  } satisfies Record<ControlledItemGroup, ReturnType<typeof enrichGroup>>);
  const itemRanking = Object.freeze(
    MAP_ITEM_DEFINITION_IDS.map((definitionId) => ({
      definitionId,
      ...groups[definitionId],
    })).toSorted(
      (left, right) =>
        (right.relativeToControl ?? Number.NEGATIVE_INFINITY) -
          (left.relativeToControl ?? Number.NEGATIVE_INFINITY) ||
        left.definitionId.localeCompare(right.definitionId),
    ),
  );
  const terminalOk = rounds.every(
    ({ completedTick, reason, winnerItemGroup }) =>
      completedTick > 0 &&
      ((reason === "last-standing" && winnerItemGroup !== null) ||
        (reason === "no-survivors" && winnerItemGroup === null)),
  );

  return Object.freeze({
    participantCount: CONTROLLED_ITEM_PARTICIPANT_COUNT,
    sampleCount: CONTROLLED_ITEM_SAMPLE_COUNT,
    productionSpawnsEnabled: false,
    grantTick: 0,
    assignment:
      "Every actor rotates through control, Iron Boots, Feather, and Spring Glove grants across fixed seeds.",
    expectedSlotWinRate,
    winnerDistributionChiSquare,
    chiSquareDegreesOfFreedom: MAP_ITEM_DEFINITION_IDS.length - 1,
    chiSquareScreenLimit: CONTROLLED_ITEM_CHI_SQUARE_LIMIT,
    terminalOk,
    groups,
    itemRanking,
    rounds: Object.freeze(rounds),
  });
}

function auditControlledCollapse() {
  const arena = getArenaSize(CONTROLLED_COLLAPSE_PARTICIPANT_COUNT);
  const runSpeed = (collapseSpeed: CollapseSpeed) => {
    const config = normalizeGameConfig({
      participantCount: CONTROLLED_COLLAPSE_PARTICIPANT_COUNT,
      arenaColumns: arena.columns,
      arenaRows: arena.rows,
      roundLimitSeconds: ROUND_LIMIT_SECONDS,
      collapseSpeed,
      difficulty: "normal",
      itemsEnabled: true,
      initialItemCount: getRecommendedInitialItemCount(CONTROLLED_COLLAPSE_PARTICIPANT_COUNT),
      itemRespawnSeconds: getPresetItemRespawnSeconds("massive"),
    });
    const rounds = Array.from({ length: CONTROLLED_COLLAPSE_SAMPLE_COUNT }, (_, sampleIndex) =>
      auditRoundCompletion(config, `collapse-audit-v1-${sampleIndex}`),
    );

    return Object.freeze({
      collapseSpeed,
      durationSeconds: summarizeRoundDurations(rounds),
      timeLimitCount: rounds.filter(({ reason }) => reason === "time-limit").length,
      rounds: Object.freeze(rounds),
    });
  };
  const speeds = Object.freeze({
    slow: runSpeed("slow"),
    normal: runSpeed("normal"),
    fast: runSpeed("fast"),
  });
  const pairedDurations = Object.freeze(
    Array.from({ length: CONTROLLED_COLLAPSE_SAMPLE_COUNT }, (_, sampleIndex) => {
      const slow = speeds.slow.rounds[sampleIndex];
      const normal = speeds.normal.rounds[sampleIndex];
      const fast = speeds.fast.rounds[sampleIndex];

      if (slow === undefined || normal === undefined || fast === undefined) {
        throw new Error(`controlled collapse sample ${sampleIndex} is incomplete`);
      }

      return Object.freeze({
        seed: `collapse-audit-v1-${sampleIndex}`,
        slowSeconds: slow.durationSeconds,
        normalSeconds: normal.durationSeconds,
        fastSeconds: fast.durationSeconds,
        slowMinusFastSeconds: roundSeconds(slow.completedTick - fast.completedTick),
      });
    }),
  );
  const slowAtLeastFastCount = pairedDurations.filter(
    ({ slowSeconds, fastSeconds }) => slowSeconds >= fastSeconds,
  ).length;

  return Object.freeze({
    participantCount: CONTROLLED_COLLAPSE_PARTICIPANT_COUNT,
    sampleCountPerSpeed: CONTROLLED_COLLAPSE_SAMPLE_COUNT,
    assignment:
      "The same 16 fixed seeds run with identical Normal-difficulty production settings except collapse speed.",
    speeds,
    pairedSlowAtLeastFastShare: roundRatio(slowAtLeastFastCount, CONTROLLED_COLLAPSE_SAMPLE_COUNT),
    pairedDurations,
  });
}

const PRODUCTION_DECISION_RULES = Object.freeze([
  "Every sampled production-preset round must produce a structurally valid terminal result within 75 seconds.",
  "No sampled all-bot production-preset round may rely on the time-limit draw to terminate.",
  "At least 60% of observed item spawns must land in the outer two stable tile rings.",
  "Aggressor win rate must remain at least 0.75x Survivor unless their 95% Wilson intervals overlap, and its credited-elimination rate must not trail Survivor in every production preset sample.",
]);
const MASS_DECISION_RULES = Object.freeze([
  "Each controlled base-mass band must remain between 0.4x and 1.8x of equal-slot expected win rate.",
  "No controlled base-mass round may rely on the time-limit draw to terminate.",
]);
const ITEM_DECISION_RULES = Object.freeze([
  "Each controlled tick-zero item grant group must remain between 0.4x and 1.8x of equal-slot expected win rate.",
  "The three selectable controlled item groups must not exceed a winner-distribution chi-square statistic of 5.991 for two degrees of freedom; the no-item control remains a reference rather than an equal-strength choice.",
  "Controlled item rankings compare each grant against the no-item control and label ratios below 0.75 for buff investigation or above 1.25 for nerf investigation; these labels are review signals rather than failure gates.",
]);
const COLLAPSE_DECISION_RULES = Object.freeze([
  "Controlled collapse mean duration must order slow >= normal >= fast; slow and normal p50 must each remain at least fast p50; at least 60% of paired slow rounds must last at least as long as fast; and no speed may rely on time-limit draws.",
]);
const PRODUCTION_LIMITATIONS = Object.freeze([
  "This is deterministic rule-based bot workload evidence, not a human-play balance test.",
  "Item exposure win rates are observational and overlap; survival time, bot personality, and pickup opportunity confound them.",
  "Mass exposure tick shares are descriptive because winners necessarily contribute more surviving ticks.",
  "Reported 95% Wilson intervals describe uncertainty in each fixed-seed screen; they do not turn deterministic bot samples into population or human-play claims.",
  "Actor 1 is bot-commanded for this audit even though the browser reserves actor 1 for the human.",
]);
const MASS_LIMITATIONS = Object.freeze([
  "This is deterministic rule-based bot workload evidence, not a human-play balance test.",
  "The controlled mass audit isolates base mass with items disabled at 16 participants; it does not prove every item and participant-count interaction.",
]);
const ITEM_LIMITATIONS = Object.freeze([
  "This is deterministic rule-based bot workload evidence, not a human-play balance test.",
  "The controlled item audit rotates synthetic tick-zero grants at 8 participants and bypasses the production simultaneous-item cap; it isolates grant effects but does not model edge pickup cost, spawn timing, or every participant-count interaction.",
  "Reported 95% Wilson intervals describe uncertainty in each fixed-seed screen; they do not turn deterministic bot samples into population or human-play claims.",
  "Single-item rankings do not measure two-item loadout synergy; pairwise treatment groups will be added with the expanded starting inventory.",
  "The chi-square threshold is a deterministic regression screen over fixed seeds, not a population-significance claim.",
]);
const COLLAPSE_LIMITATIONS = Object.freeze([
  "This is deterministic rule-based bot workload evidence, not a human-play balance test.",
  "The controlled collapse audit isolates one 16-participant Normal-difficulty bot workload; it does not predict human duration or every participant-count interaction.",
  "Adjacent collapse tiers need not order by p50 because bot combat can end before the first collapse transition; all descriptive percentiles remain visible even when they are not gates.",
]);

type ProductionAuditResult = ReturnType<typeof auditParticipantCount>;
type ControlledMassAuditResult = ReturnType<typeof auditControlledMass>;
type ControlledItemAuditResult = ReturnType<typeof auditControlledItems>;
type ControlledCollapseAuditResult = ReturnType<typeof auditControlledCollapse>;

function productionAuditPasses(scenarios: readonly ProductionAuditResult[]): boolean {
  const structuralOk = scenarios.every(
    ({ reasonCounts, rounds }) =>
      rounds.length === SAMPLE_COUNT &&
      reasonCounts["time-limit"] === 0 &&
      rounds.every(({ completedTick }) => completedTick > 0),
  );
  const edgePreferenceOk = scenarios.every(
    ({ balance }) => (balance.itemSpawnLocation.riskBandShare ?? 0) >= 0.6,
  );
  const strategyOk = scenarios.every(({ strategy }) => {
    const winRatio = strategy.aggressorToSurvivorWinRate;
    const eliminationRatio = strategy.aggressorToSurvivorEliminationRate;
    const aggressorInterval = strategy.strategies.Aggressor?.winRate95PercentInterval;
    const survivorInterval = strategy.strategies.Survivor?.winRate95PercentInterval;
    const intervalsOverlap =
      aggressorInterval !== null &&
      aggressorInterval !== undefined &&
      survivorInterval !== null &&
      survivorInterval !== undefined &&
      aggressorInterval.lower <= survivorInterval.upper &&
      survivorInterval.lower <= aggressorInterval.upper;
    return (
      winRatio !== null &&
      (winRatio >= 0.75 || intervalsOverlap) &&
      eliminationRatio !== null &&
      eliminationRatio >= 1
    );
  });

  return structuralOk && edgePreferenceOk && strategyOk;
}

function controlledMassAuditPasses(controlledMass: ControlledMassAuditResult): boolean {
  return (
    controlledMass.rounds.every(({ reason }) => reason !== "time-limit") &&
    MASS_BANDS.every((band) => {
      const ratio = controlledMass.bands[band].relativeToEqualSlotExpectation;
      return ratio !== null && ratio >= 0.4 && ratio <= 1.8;
    })
  );
}

function controlledItemAuditPasses(controlledItems: ControlledItemAuditResult): boolean {
  return (
    controlledItems.terminalOk &&
    controlledItems.winnerDistributionChiSquare !== null &&
    controlledItems.winnerDistributionChiSquare <= CONTROLLED_ITEM_CHI_SQUARE_LIMIT &&
    CONTROLLED_ITEM_GROUPS.every((group) => {
      const ratio = controlledItems.groups[group].relativeToEqualSlotExpectation;
      return ratio !== null && ratio >= 0.4 && ratio <= 1.8;
    })
  );
}

function controlledCollapseAuditPasses(controlledCollapse: ControlledCollapseAuditResult): boolean {
  return (
    COLLAPSE_SPEEDS.every((speed) => controlledCollapse.speeds[speed].timeLimitCount === 0) &&
    controlledCollapse.speeds.slow.durationSeconds.mean >=
      controlledCollapse.speeds.normal.durationSeconds.mean &&
    controlledCollapse.speeds.normal.durationSeconds.mean >=
      controlledCollapse.speeds.fast.durationSeconds.mean &&
    controlledCollapse.speeds.normal.durationSeconds.p50 >=
      controlledCollapse.speeds.fast.durationSeconds.p50 &&
    controlledCollapse.speeds.slow.durationSeconds.p50 >=
      controlledCollapse.speeds.fast.durationSeconds.p50 &&
    (controlledCollapse.pairedSlowAtLeastFastShare ?? 0) >= 0.6
  );
}

const requestedSection = parseAuditSection(process.argv[2]);
const commonReport = Object.freeze({
  auditVersion: 10,
  productVersion: PRODUCT_VERSION,
  simulationVersion: SIMULATION_VERSION,
  fixedTicksPerSecond: FIXED_TICKS_PER_SECOND,
});
let report: Readonly<{ ok: boolean } & Record<string, unknown>>;

switch (requestedSection) {
  case "production": {
    const scenarios = PARTICIPANT_COUNTS.map(auditParticipantCount);
    report = Object.freeze({
      ok: productionAuditPasses(scenarios),
      kind: "deterministic-round-and-balance-audit-section",
      section: requestedSection,
      ...commonReport,
      sampleCountPerScenario: SAMPLE_COUNT,
      seedPattern: "round-audit-v2-<participantCount>-<0..15>",
      scenarios,
      decisionRules: PRODUCTION_DECISION_RULES,
      limitations: PRODUCTION_LIMITATIONS,
    });
    break;
  }
  case "production-shard": {
    report = await runProductionShard(parseProductionShardIndex(process.argv[3]));
    break;
  }
  case "production-merge": {
    const scenarios = await mergeProductionShards();
    report = Object.freeze({
      ok: productionAuditPasses(scenarios),
      kind: "deterministic-round-and-balance-audit-section",
      section: "production",
      ...commonReport,
      sampleCountPerScenario: SAMPLE_COUNT,
      seedPattern: "round-audit-v2-<participantCount>-<0..15>",
      sourceArtifacts: Object.freeze(
        Array.from({ length: PRODUCTION_SHARD_COUNT }, (_, shardIndex) =>
          getProductionShardArtifactPath(shardIndex),
        ),
      ),
      scenarios,
      decisionRules: PRODUCTION_DECISION_RULES,
      limitations: PRODUCTION_LIMITATIONS,
    });
    break;
  }
  case "mass": {
    const controlledMass = auditControlledMass();
    report = Object.freeze({
      ok: controlledMassAuditPasses(controlledMass),
      kind: "deterministic-round-and-balance-audit-section",
      section: requestedSection,
      ...commonReport,
      controlledMass,
      decisionRules: MASS_DECISION_RULES,
      limitations: MASS_LIMITATIONS,
    });
    break;
  }
  case "items": {
    const controlledItems = auditControlledItems();
    report = Object.freeze({
      ok: controlledItemAuditPasses(controlledItems),
      kind: "deterministic-round-and-balance-audit-section",
      section: requestedSection,
      ...commonReport,
      controlledItems,
      decisionRules: ITEM_DECISION_RULES,
      limitations: ITEM_LIMITATIONS,
    });
    break;
  }
  case "collapse": {
    const controlledCollapse = auditControlledCollapse();
    report = Object.freeze({
      ok: controlledCollapseAuditPasses(controlledCollapse),
      kind: "deterministic-round-and-balance-audit-section",
      section: requestedSection,
      ...commonReport,
      controlledCollapse,
      decisionRules: COLLAPSE_DECISION_RULES,
      limitations: COLLAPSE_LIMITATIONS,
    });
    break;
  }
  case "all": {
    const scenarios = await mergeProductionShards();
    const controlledMass = auditControlledMass();
    const controlledItems = auditControlledItems();
    const controlledCollapse = auditControlledCollapse();
    report = Object.freeze({
      ok:
        productionAuditPasses(scenarios) &&
        controlledMassAuditPasses(controlledMass) &&
        controlledItemAuditPasses(controlledItems) &&
        controlledCollapseAuditPasses(controlledCollapse),
      kind: "deterministic-round-and-balance-audit",
      ...commonReport,
      sampleCountPerScenario: SAMPLE_COUNT,
      seedPattern: "round-audit-v2-<participantCount>-<0..15>",
      scenarios,
      controlledMass,
      controlledItems,
      controlledCollapse,
      decisionRules: Object.freeze([
        ...PRODUCTION_DECISION_RULES,
        ...MASS_DECISION_RULES,
        ...ITEM_DECISION_RULES,
        ...COLLAPSE_DECISION_RULES,
      ]),
      limitations: Object.freeze([
        ...PRODUCTION_LIMITATIONS,
        ...MASS_LIMITATIONS.slice(1),
        ...ITEM_LIMITATIONS.slice(1),
        ...COLLAPSE_LIMITATIONS.slice(1),
      ]),
    });
    break;
  }
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (!report.ok) {
  process.exitCode = 1;
}
