import { BotDirector, type BotAssignment } from "../src/ai/bot-director";
import { BOT_PERSONALITY_KINDS } from "../src/ai/personalities";
import { getArenaSize } from "../src/app/settings";
import { ITEM_DEFINITION_IDS } from "../src/content/items";
import {
  normalizeGameConfig,
  type ActorId,
  type ItemDefinitionId,
  type RoundEndReason,
} from "../src/simulation/contracts";
import {
  FIXED_TICKS_PER_SECOND,
  PRODUCT_VERSION,
  SIMULATION_VERSION,
} from "../src/simulation/versions";
import { SimulationWorld, type ParticipantSpawnOverride } from "../src/simulation/world";
import { getBalanceSignal, ratio, roundMetric, wilsonInterval } from "./item-balance-statistics";

const PARTICIPANT_COUNT = 8;
const MINIMUM_TREATMENT_SLOTS = 16;
const MINIMUM_SAMPLE_COUNT = 64;
const ROUND_LIMIT_SECONDS = 45;

interface LoadoutTreatment {
  readonly id: string;
  readonly kind: "control" | "single" | "pair";
  readonly items: readonly ItemDefinitionId[];
}

interface TreatmentAggregate {
  readonly treatment: LoadoutTreatment;
  actorRoundSlots: number;
  wins: number;
  activeTicks: number;
  creditedEliminations: number;
}

function createTreatments(): readonly LoadoutTreatment[] {
  const treatments: LoadoutTreatment[] = [
    Object.freeze({ id: "control", kind: "control", items: Object.freeze([]) }),
  ];

  for (const definitionId of ITEM_DEFINITION_IDS) {
    treatments.push(
      Object.freeze({
        id: definitionId,
        kind: "single",
        items: Object.freeze([definitionId]),
      }),
    );
  }

  for (let leftIndex = 0; leftIndex < ITEM_DEFINITION_IDS.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ITEM_DEFINITION_IDS.length; rightIndex += 1) {
      const left = ITEM_DEFINITION_IDS[leftIndex];
      const right = ITEM_DEFINITION_IDS[rightIndex];

      if (left === undefined || right === undefined) {
        throw new Error("item treatment generation produced an incomplete pair");
      }

      treatments.push(
        Object.freeze({
          id: `${left}+${right}`,
          kind: "pair",
          items: Object.freeze([left, right]),
        }),
      );
    }
  }

  return Object.freeze(treatments);
}

function createAssignments(sampleIndex: number): readonly BotAssignment[] {
  return Object.freeze(
    Array.from({ length: PARTICIPANT_COUNT }, (_, index) =>
      Object.freeze({
        actorId: index + 1,
        personality:
          BOT_PERSONALITY_KINDS[(index + sampleIndex * 2) % BOT_PERSONALITY_KINDS.length] ??
          "Opportunist",
      }),
    ),
  );
}

function createTreatmentByActor(
  treatments: readonly LoadoutTreatment[],
  sampleIndex: number,
): ReadonlyMap<ActorId, LoadoutTreatment> {
  return new Map(
    Array.from({ length: PARTICIPANT_COUNT }, (_, index) => {
      const treatment = treatments[(index + sampleIndex * 3) % treatments.length];

      if (treatment === undefined) {
        throw new Error(`item audit sample ${sampleIndex} is missing treatment ${index}`);
      }

      return [index + 1, treatment] as const;
    }),
  );
}

function requireTreatment(
  treatmentByActor: ReadonlyMap<ActorId, LoadoutTreatment>,
  actorId: ActorId,
): LoadoutTreatment {
  const treatment = treatmentByActor.get(actorId);

  if (treatment === undefined) {
    throw new Error(`item audit is missing treatment for actor ${actorId}`);
  }

  return treatment;
}

function summarizeDurations(completedTicks: readonly number[]) {
  const sortedTicks = completedTicks.toSorted((left, right) => left - right);
  const meanTicks = completedTicks.reduce((sum, ticks) => sum + ticks, 0) / completedTicks.length;
  return Object.freeze({
    minimumSeconds: roundMetric((sortedTicks[0] ?? 0) / FIXED_TICKS_PER_SECOND),
    meanSeconds: roundMetric(meanTicks / FIXED_TICKS_PER_SECOND),
    maximumSeconds: roundMetric((sortedTicks.at(-1) ?? 0) / FIXED_TICKS_PER_SECOND),
  });
}

const treatments = createTreatments();
const sampleCount = Math.max(
  MINIMUM_SAMPLE_COUNT,
  Math.ceil((treatments.length * MINIMUM_TREATMENT_SLOTS) / PARTICIPANT_COUNT),
);
const arena = getArenaSize(PARTICIPANT_COUNT);
const config = normalizeGameConfig({
  participantCount: PARTICIPANT_COUNT,
  arenaColumns: arena.columns,
  arenaRows: arena.rows,
  roundLimitSeconds: ROUND_LIMIT_SECONDS,
  collapseSpeed: "fast",
  difficulty: "normal",
  itemsEnabled: false,
});
const aggregates = new Map<string, TreatmentAggregate>(
  treatments.map((treatment) => [
    treatment.id,
    {
      treatment,
      actorRoundSlots: 0,
      wins: 0,
      activeTicks: 0,
      creditedEliminations: 0,
    },
  ]),
);
const reasonCounts: Record<RoundEndReason, number> = {
  "last-standing": 0,
  "no-survivors": 0,
  "time-limit": 0,
};
const rounds = [];

for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
  const seed = `item-loadout-audit-v1-${sampleIndex}`;
  const treatmentByActor = createTreatmentByActor(treatments, sampleIndex);
  const participantOverrides: readonly ParticipantSpawnOverride[] = Object.freeze(
    Array.from({ length: PARTICIPANT_COUNT }, (_, index) => {
      const actorId = index + 1;
      const treatment = requireTreatment(treatmentByActor, actorId);
      const aggregate = aggregates.get(treatment.id);

      if (aggregate === undefined) {
        throw new Error(`item audit is missing aggregate ${treatment.id}`);
      }

      aggregate.actorRoundSlots += 1;
      return Object.freeze({
        actorId,
        control: "scripted" as const,
        startingItems: treatment.items,
      });
    }),
  );
  const world = new SimulationWorld(config, seed, {
    humanActorId: 1,
    participantOverrides,
  });
  const bots = new BotDirector(seed, null, {
    difficulty: "normal",
    personalityOverrides: createAssignments(sampleIndex),
  });
  let frame = world.createRenderFrame();

  while (frame.round.status === "Active") {
    const result = world.step(bots.createCommands(world.tick, frame));
    frame = result.frame;

    for (const participant of frame.participants) {
      if (
        !participant.active ||
        participant.action === "Falling" ||
        participant.action === "Eliminated"
      ) {
        continue;
      }

      const treatment = requireTreatment(treatmentByActor, participant.actorId);
      const aggregate = aggregates.get(treatment.id);

      if (aggregate === undefined) {
        throw new Error(`item audit is missing active aggregate ${treatment.id}`);
      }

      aggregate.activeTicks += 1;
    }

    for (const event of result.events) {
      if (event.kind !== "stat-point-earned" || event.actorId === undefined) {
        continue;
      }

      const treatment = requireTreatment(treatmentByActor, event.actorId);
      const aggregate = aggregates.get(treatment.id);

      if (aggregate === undefined) {
        throw new Error(`item audit is missing elimination aggregate ${treatment.id}`);
      }

      aggregate.creditedEliminations += 1;
    }
  }

  const { completedTick, reason, winnerActorId } = frame.round;

  if (completedTick === null || reason === null) {
    throw new Error(`item audit round ${seed} completed without a terminal result`);
  }

  reasonCounts[reason] += 1;
  const winnerTreatment =
    winnerActorId === null ? null : requireTreatment(treatmentByActor, winnerActorId);

  if (winnerTreatment !== null) {
    const aggregate = aggregates.get(winnerTreatment.id);

    if (aggregate === undefined) {
      throw new Error(`item audit is missing winner aggregate ${winnerTreatment.id}`);
    }

    aggregate.wins += 1;
  }

  rounds.push(
    Object.freeze({
      seed,
      completedTick,
      reason,
      winnerActorId,
      winnerTreatmentId: winnerTreatment?.id ?? null,
      finalStateHash: frame.stateHash,
    }),
  );
}

const totalWins = [...aggregates.values()].reduce((sum, aggregate) => sum + aggregate.wins, 0);
const totalSlots = sampleCount * PARTICIPANT_COUNT;
const equalSlotWinRate = ratio(totalWins, totalSlots);
const controlAggregate = aggregates.get("control");

if (controlAggregate === undefined) {
  throw new Error("item audit is missing its no-item control");
}

const controlWinRate = ratio(controlAggregate.wins, controlAggregate.actorRoundSlots);
const treatmentResults = treatments.map((treatment) => {
  const aggregate = aggregates.get(treatment.id);

  if (aggregate === undefined) {
    throw new Error(`item audit is missing treatment result ${treatment.id}`);
  }

  const winRate = ratio(aggregate.wins, aggregate.actorRoundSlots);
  const relativeToControl =
    winRate === null || controlWinRate === null || controlWinRate === 0
      ? null
      : ratio(winRate, controlWinRate);

  return Object.freeze({
    id: treatment.id,
    kind: treatment.kind,
    items: treatment.items,
    actorRoundSlots: aggregate.actorRoundSlots,
    wins: aggregate.wins,
    winRate,
    winRate95PercentInterval: wilsonInterval(aggregate.wins, aggregate.actorRoundSlots),
    relativeToEqualSlotExpectation:
      winRate === null || equalSlotWinRate === null || equalSlotWinRate === 0
        ? null
        : ratio(winRate, equalSlotWinRate),
    relativeToControl,
    balanceSignal: treatment.kind === "control" ? "baseline" : getBalanceSignal(relativeToControl),
    creditedEliminationsPerActorRound: ratio(
      aggregate.creditedEliminations,
      aggregate.actorRoundSlots,
    ),
    meanSurvivalSeconds: ratio(
      aggregate.activeTicks,
      aggregate.actorRoundSlots * FIXED_TICKS_PER_SECOND,
    ),
  });
});
const treatmentResultsById = new Map(treatmentResults.map((result) => [result.id, result]));
const singleItemRanking = Object.freeze(
  treatmentResults
    .filter(({ kind }) => kind === "single")
    .toSorted(
      (left, right) =>
        (right.relativeToControl ?? Number.NEGATIVE_INFINITY) -
          (left.relativeToControl ?? Number.NEGATIVE_INFINITY) || left.id.localeCompare(right.id),
    ),
);
const pairRanking = Object.freeze(
  treatmentResults
    .filter(({ kind }) => kind === "pair")
    .map((result) => {
      const [leftId, rightId] = result.items;
      const left = leftId === undefined ? undefined : treatmentResultsById.get(leftId);
      const right = rightId === undefined ? undefined : treatmentResultsById.get(rightId);
      const independentExpectation =
        left?.relativeToControl === null ||
        left?.relativeToControl === undefined ||
        right?.relativeToControl === null ||
        right?.relativeToControl === undefined
          ? null
          : roundMetric(left.relativeToControl * right.relativeToControl);
      const synergyIndex =
        result.relativeToControl === null ||
        independentExpectation === null ||
        independentExpectation === 0
          ? null
          : ratio(result.relativeToControl, independentExpectation);

      return Object.freeze({ ...result, independentExpectation, synergyIndex });
    })
    .toSorted(
      (left, right) =>
        (right.relativeToControl ?? Number.NEGATIVE_INFINITY) -
          (left.relativeToControl ?? Number.NEGATIVE_INFINITY) || left.id.localeCompare(right.id),
    ),
);
const minimumObservedSlots = Math.min(
  ...treatmentResults.map(({ actorRoundSlots }) => actorRoundSlots),
);
const durationSeconds = summarizeDurations(rounds.map(({ completedTick }) => completedTick));
const timeLimitSeeds = Object.freeze(
  rounds.filter(({ reason }) => reason === "time-limit").map(({ seed }) => seed),
);
const ok =
  rounds.length === sampleCount &&
  minimumObservedSlots >= MINIMUM_TREATMENT_SLOTS &&
  rounds.every(({ completedTick }) => completedTick > 0);

process.stdout.write(
  `${JSON.stringify(
    {
      ok,
      kind: "deterministic-starting-item-balance-audit",
      auditVersion: 1,
      productVersion: PRODUCT_VERSION,
      simulationVersion: SIMULATION_VERSION,
      participantCount: PARTICIPANT_COUNT,
      sampleCount,
      minimumTreatmentSlots: MINIMUM_TREATMENT_SLOTS,
      minimumObservedSlots,
      assignment:
        "The same normal-mass scripted actors rotate through no item, every single item, and every two-item pair while bot personalities rotate independently.",
      seedPattern: "item-loadout-audit-v1-<0..sampleCount-1>",
      reasonCounts,
      durationSeconds,
      timeLimitSeeds,
      equalSlotWinRate,
      control: treatmentResultsById.get("control"),
      singleItemRanking,
      pairRanking,
      treatments: treatmentResults,
      decisionRules: [
        "Relative win index below 0.75 is a buff or AI-usage investigation signal.",
        "Relative win index from 0.75 through 1.25 is retained as the broad balanced band.",
        "Relative win index above 1.25 is a nerf investigation signal.",
        "Pair synergy compares observed pair index with the product of both single-item indices; it is descriptive and does not bypass mechanic-level review.",
      ],
      limitations: [
        "This is deterministic rule-based bot regression evidence, not human-play fairness evidence.",
        "Starting Iron Boots and Feather currently expire after eight seconds, while Spring Glove is consumed by the next shove; the audit measures that current behavior rather than the planned permanent-versus-active inventory split.",
        "All treatments use normal starting mass, eight participants, Fast collapse, a 45-second audit limit, no production item spawns, and controlled personality rotation.",
        "Wilson intervals show finite-sample uncertainty but do not make fixed-seed bot outcomes a population estimate.",
      ],
    },
    null,
    2,
  )}\n`,
);

if (!ok) {
  process.exitCode = 1;
}
