import { BotDirector } from "../src/ai/bot-director";
import { ITEM_DEFINITION_IDS } from "../src/content/items";
import {
  getArenaSize,
  getPresetCollapseSpeed,
  getPresetItemRespawnSeconds,
  getRecommendedInitialItemCount,
  type PresetName,
} from "../src/app/settings";
import {
  normalizeGameConfig,
  type ActorId,
  type GameConfigV1,
  type ItemDefinitionId,
  type RenderFrameV1,
  type RoundEndReason,
} from "../src/simulation/contracts";
import { getItemSpawnBand, type ItemSpawnBand } from "../src/simulation/items";
import { SIMULATION_TUNING } from "../src/simulation/tuning";
import {
  FIXED_TICKS_PER_SECOND,
  PRODUCT_VERSION,
  SIMULATION_VERSION,
} from "../src/simulation/versions";
import { SimulationWorld, type ParticipantSpawnOverride } from "../src/simulation/world";

const PARTICIPANT_COUNTS = [8, 16, 24, 32] as const;
const SAMPLE_COUNT = 16;
const CONTROLLED_MASS_SAMPLE_COUNT = 24;
const CONTROLLED_MASS_PARTICIPANT_COUNT = 16;
const ROUND_LIMIT_SECONDS = 75;
const MASS_BANDS = ["light", "normal", "heavy"] as const;
const ITEM_SPAWN_BANDS = ["edge", "near-edge", "interior"] as const;

type MassBand = (typeof MASS_BANDS)[number];

const PRESET_BY_PARTICIPANT_COUNT: Readonly<
  Record<(typeof PARTICIPANT_COUNTS)[number], PresetName>
> = Object.freeze({
  8: "relaxed",
  16: "default",
  24: "crowded",
  32: "chaos",
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
}

function createItemCounts(): Record<ItemDefinitionId, number> {
  return { "iron-boots": 0, feather: 0, "spring-glove": 0 };
}

function createMassCounts(): Record<MassBand, number> {
  return { light: 0, normal: 0, heavy: 0 };
}

function createSpawnBandCounts(): Record<ItemSpawnBand, number> {
  return { edge: 0, "near-edge": 0, interior: 0 };
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

function createAuditConfig(participantCount: (typeof PARTICIPANT_COUNTS)[number]): GameConfigV1 {
  const arena = getArenaSize(participantCount);
  const preset = PRESET_BY_PARTICIPANT_COUNT[participantCount];
  return normalizeGameConfig({
    participantCount,
    arenaColumns: arena.columns,
    arenaRows: arena.rows,
    roundLimitSeconds: ROUND_LIMIT_SECONDS,
    collapseSpeed: getPresetCollapseSpeed(preset),
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

function auditRound(config: GameConfigV1, seed: string): RoundAuditResult {
  const world = new SimulationWorld(config, seed, { humanActorId: 1 });
  const bots = new BotDirector(seed, null);
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
    round: Object.freeze({
      seed,
      completedTick,
      durationSeconds: roundSeconds(completedTick),
      reason,
      winnerActorId,
      finalStateHash: frame.stateHash,
    }),
    actors,
    itemSpawnBands: Object.freeze({ ...itemSpawnBands }),
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
          return [
            definitionId,
            Object.freeze({
              ...aggregate,
              winRate,
              relativeToNoItemExposure:
                winRate === null || unexposedWinRate === null || unexposedWinRate === 0
                  ? null
                  : roundRatio(winRate, unexposedWinRate),
            }),
          ];
        }),
      ),
    ),
    noItemExposure: Object.freeze({
      actorRounds: unexposedActorRounds,
      winnerActorRounds: unexposedWinnerActorRounds,
      winRate: unexposedWinRate,
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

function auditParticipantCount(participantCount: (typeof PARTICIPANT_COUNTS)[number]) {
  const config = createAuditConfig(participantCount);
  const results = Array.from({ length: SAMPLE_COUNT }, (_, index) =>
    auditRound(config, `round-audit-v2-${participantCount}-${index}`),
  );
  const rounds = results.map(({ round }) => round);
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
    balance: aggregateBalance(results),
    rounds: Object.freeze(rounds),
  });
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

const scenarios = PARTICIPANT_COUNTS.map(auditParticipantCount);
const controlledMass = auditControlledMass();
const structuralOk = scenarios.every(
  ({ reasonCounts, rounds }) =>
    rounds.length === SAMPLE_COUNT &&
    reasonCounts["time-limit"] === 0 &&
    rounds.every(({ completedTick }) => completedTick > 0),
);
const edgePreferenceOk = scenarios.every(
  ({ balance }) => (balance.itemSpawnLocation.riskBandShare ?? 0) >= 0.6,
);
const controlledMassOk = MASS_BANDS.every((band) => {
  const ratio = controlledMass.bands[band].relativeToEqualSlotExpectation;
  return ratio !== null && ratio >= 0.4 && ratio <= 1.8;
});
const ok = structuralOk && edgePreferenceOk && controlledMassOk;

process.stdout.write(
  `${JSON.stringify(
    {
      ok,
      kind: "deterministic-round-and-balance-audit",
      auditVersion: 2,
      productVersion: PRODUCT_VERSION,
      simulationVersion: SIMULATION_VERSION,
      fixedTicksPerSecond: FIXED_TICKS_PER_SECOND,
      sampleCountPerScenario: SAMPLE_COUNT,
      seedPattern: "round-audit-v2-<participantCount>-<0..15>",
      scenarios,
      controlledMass,
      decisionRules: [
        "Every sampled production-preset round must produce a structurally valid terminal result within 75 seconds.",
        "No sampled all-bot production-preset round may rely on the time-limit draw to terminate.",
        "At least 60% of observed item spawns must land in the outer two stable tile rings.",
        "Each controlled base-mass band must remain between 0.4x and 1.8x of equal-slot expected win rate.",
      ],
      limitations: [
        "This is deterministic rule-based bot workload evidence, not a human-play balance test.",
        "Item exposure win rates are observational and overlap; survival time, bot personality, and pickup opportunity confound them.",
        "Mass exposure tick shares are descriptive because winners necessarily contribute more surviving ticks.",
        "The controlled mass audit isolates base mass with items disabled at 16 participants; it does not prove every item and participant-count interaction.",
        "Actor 1 is bot-commanded for this audit even though the browser reserves actor 1 for the human.",
      ],
    },
    null,
    2,
  )}\n`,
);

if (!ok) {
  process.exitCode = 1;
}
