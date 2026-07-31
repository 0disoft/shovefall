import { availableParallelism } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BotDirector } from "../src/ai/bot-director";
import { BOT_ACTIVE_ITEM_IDS, type BotActiveItemId } from "../src/ai/bot-loadouts";
import { BOT_PERSONALITY_KINDS, type BotPersonalityKind } from "../src/ai/personalities";
import {
  AUTOMATION_ROUND_LIMIT_SECONDS,
  getArenaSize,
  getPresetCollapseSpeed,
  getPresetItemRespawnSeconds,
  getRecommendedInitialItemCount,
} from "../src/app/settings";
import { SKILL_DEFINITIONS, SKILL_DEFINITION_IDS } from "../src/content/skills";
import {
  BALANCE_DASHBOARD_SCHEMA_VERSION,
  type BalanceAggregate,
  type BalanceCategory,
  type BalanceDashboardData,
  type BalanceDeathCause,
  type BalancePhase,
  type BalancePhaseReport,
  type BalanceRoundRecord,
} from "../src/balance/contract";
import {
  normalizeGameConfig,
  type ActorId,
  type RoundEndReason,
  type SkillDefinitionId,
  type StartingAttributeId,
  type StartingAttributes,
} from "../src/simulation/contracts";
import { RandomStreamSet, type XorShift32 } from "../src/simulation/random";
import { STARTING_ATTRIBUTE_IDS } from "../src/simulation/starting-attributes";
import { SIMULATION_TUNING } from "../src/simulation/tuning";
import {
  CONTENT_VERSION,
  FIXED_TICKS_PER_SECOND,
  PRODUCT_VERSION,
  SIMULATION_VERSION,
} from "../src/simulation/versions";
import { SimulationWorld } from "../src/simulation/world";
import type { ParticipantSpawnOverride } from "../src/simulation/world";

const TOTAL_ROUNDS = 200;
const CONTROLLED_ROUNDS = 160;
const PRODUCTION_ROUNDS = 40;
const PARTICIPANT_COUNT = 50;
const SEED_FAMILY_COUNT = 100;
const MAX_WORKERS = 8;
const OUTPUT_PATH = new URL("../balance/latest.json", import.meta.url);

const ATTRIBUTE_LABELS: Readonly<Record<StartingAttributeId, string>> = Object.freeze({
  strength: "완력 집중",
  agility: "민첩 집중",
  constitution: "체질 집중",
  spirit: "정신 집중",
  balance: "균형 집중",
  willpower: "의지 집중",
});

const ITEM_LABELS: Readonly<Record<BotActiveItemId, string>> = Object.freeze({
  soap: "비누",
  "brick-bag": "벽돌 가방",
  boat: "배",
  bomb: "시한폭탄",
});

const SKILL_PERMUTATIONS = Object.freeze([
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
] as const);

interface LoadoutAssignment {
  readonly actorId: ActorId;
  readonly attributeId: StartingAttributeId;
  readonly attributes: StartingAttributes;
  readonly item: BotActiveItemId;
  readonly skills: readonly [SkillDefinitionId, SkillDefinitionId, SkillDefinitionId];
  readonly skillCombinationId: string;
  readonly personality: BotPersonalityKind;
}

interface ActorObservation {
  activeTicks: number;
  creditedEliminations: number;
  damageDealt: number;
  damageTaken: number;
  deathCause: BalanceDeathCause | null;
  deathTick: number | null;
  rank: number | null;
  readonly skillUses: Record<SkillDefinitionId, number>;
  readonly skillHits: Record<SkillDefinitionId, number>;
  readonly skillDamage: Record<SkillDefinitionId, number>;
  readonly itemUses: Record<BotActiveItemId, number>;
  readonly itemHits: Record<BotActiveItemId, number>;
}

interface MutableAggregate {
  category: BalanceCategory;
  id: string;
  label: string;
  exposures: number;
  wins: number;
  rankTotal: number;
  top10: number;
  top5: number;
  survivalTicks: number;
  creditedEliminations: number;
  damageDealt: number;
  uses: number;
  hits: number;
}

interface MutablePhase {
  actorRounds: number;
  readonly aggregates: Record<string, MutableAggregate>;
  readonly deathCauses: Record<BalanceDeathCause, number>;
  readonly durations: number[];
  readonly reasonCounts: Record<RoundEndReason, number>;
  readonly rounds: BalanceRoundRecord[];
  winners: number;
}

interface WorkerResult {
  readonly controlled: MutablePhase;
  readonly production: MutablePhase;
}

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : roundMetric(numerator / denominator);
}

function createSkillCounts(): Record<SkillDefinitionId, number> {
  return Object.fromEntries(SKILL_DEFINITION_IDS.map((id) => [id, 0])) as Record<
    SkillDefinitionId,
    number
  >;
}

function createItemCounts(): Record<BotActiveItemId, number> {
  return Object.fromEntries(BOT_ACTIVE_ITEM_IDS.map((id) => [id, 0])) as Record<
    BotActiveItemId,
    number
  >;
}

function createObservation(): ActorObservation {
  return {
    activeTicks: 0,
    creditedEliminations: 0,
    damageDealt: 0,
    damageTaken: 0,
    deathCause: null,
    deathTick: null,
    rank: null,
    skillUses: createSkillCounts(),
    skillHits: createSkillCounts(),
    skillDamage: createSkillCounts(),
    itemUses: createItemCounts(),
    itemHits: createItemCounts(),
  };
}

function createPhase(): MutablePhase {
  return {
    actorRounds: 0,
    aggregates: {},
    deathCauses: { fall: 0, health: 0, bomb: 0, other: 0 },
    durations: [],
    reasonCounts: { "last-standing": 0, "no-survivors": 0, "time-limit": 0 },
    rounds: [],
    winners: 0,
  };
}

function createWorkerResult(): WorkerResult {
  return { controlled: createPhase(), production: createPhase() };
}

function shuffle<T>(values: readonly T[], random: XorShift32): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = random.nextUint32() % (index + 1);
    const current = copy[index];
    const replacement = copy[swapIndex];
    if (current !== undefined && replacement !== undefined) {
      copy[index] = replacement;
      copy[swapIndex] = current;
    }
  }
  return copy;
}

function createBalancedSlots<T>(
  values: readonly T[],
  offset: number,
  stream: XorShift32,
): readonly T[] {
  return shuffle(
    Array.from(
      { length: PARTICIPANT_COUNT },
      (_, slotIndex) => values[(offset + slotIndex) % values.length]!,
    ),
    stream,
  );
}

function createSkillCombinations(): readonly (readonly [
  SkillDefinitionId,
  SkillDefinitionId,
  SkillDefinitionId,
])[] {
  const combinations: [SkillDefinitionId, SkillDefinitionId, SkillDefinitionId][] = [];
  for (let left = 0; left < SKILL_DEFINITION_IDS.length - 2; left += 1) {
    for (let middle = left + 1; middle < SKILL_DEFINITION_IDS.length - 1; middle += 1) {
      for (let right = middle + 1; right < SKILL_DEFINITION_IDS.length; right += 1) {
        combinations.push([
          SKILL_DEFINITION_IDS[left]!,
          SKILL_DEFINITION_IDS[middle]!,
          SKILL_DEFINITION_IDS[right]!,
        ]);
      }
    }
  }
  return Object.freeze(combinations.map((combination) => Object.freeze(combination)));
}

const SKILL_COMBINATIONS = createSkillCombinations();

function createSkillCombinationSchedule(
  actorRoundCount: number,
  phase: BalancePhase,
): readonly (readonly [SkillDefinitionId, SkillDefinitionId, SkillDefinitionId])[] {
  const combinationCounts = Array.from({ length: SKILL_COMBINATIONS.length }, () => 0);

  const skillCounts = Object.fromEntries(SKILL_DEFINITION_IDS.map((id) => [id, 0])) as Record<
    SkillDefinitionId,
    number
  >;
  const tieStream = new RandomStreamSet(`balance-skill-schedule-v2-${phase}`).get("ties");
  const schedule: (readonly [SkillDefinitionId, SkillDefinitionId, SkillDefinitionId])[] = [];

  for (let slot = 0; slot < actorRoundCount; slot += 1) {
    const minimumCombinationCount = Math.min(...combinationCounts);
    let selectedIndex = -1;
    let selectedSkillLoad = Number.POSITIVE_INFINITY;
    let selectedTie = Number.POSITIVE_INFINITY;

    for (let index = 0; index < SKILL_COMBINATIONS.length; index += 1) {
      if (combinationCounts[index] !== minimumCombinationCount) {
        continue;
      }
      const combination = SKILL_COMBINATIONS[index]!;
      const skillLoad = combination.reduce((sum, skill) => sum + skillCounts[skill], 0);
      const tie = tieStream.nextUint32();
      if (skillLoad < selectedSkillLoad || (skillLoad === selectedSkillLoad && tie < selectedTie)) {
        selectedIndex = index;
        selectedSkillLoad = skillLoad;
        selectedTie = tie;
      }
    }

    if (selectedIndex < 0) {
      throw new Error(`unable to assign balanced skill combination at ${phase} slot ${slot}`);
    }
    const selected = SKILL_COMBINATIONS[selectedIndex]!;
    combinationCounts[selectedIndex] = (combinationCounts[selectedIndex] ?? 0) + 1;
    for (const skill of selected) {
      skillCounts[skill] += 1;
    }
    schedule.push(selected);
  }

  return Object.freeze(schedule);
}

const CONTROLLED_SKILL_SCHEDULE = createSkillCombinationSchedule(
  CONTROLLED_ROUNDS * PARTICIPANT_COUNT,
  "controlled",
);
const PRODUCTION_SKILL_SCHEDULE = createSkillCombinationSchedule(
  PRODUCTION_ROUNDS * PARTICIPANT_COUNT,
  "production",
);

function createFocusedAttributes(focus: StartingAttributeId): StartingAttributes {
  return Object.freeze({
    strength: focus === "strength" ? 10 : 2,
    agility: focus === "agility" ? 10 : 2,
    constitution: focus === "constitution" ? 10 : 2,
    spirit: focus === "spirit" ? 10 : 2,
    balance: focus === "balance" ? 10 : 2,
    willpower: focus === "willpower" ? 10 : 2,
  });
}

function permuteSkills(
  combination: readonly [SkillDefinitionId, SkillDefinitionId, SkillDefinitionId],
  permutationIndex: number,
): readonly [SkillDefinitionId, SkillDefinitionId, SkillDefinitionId] {
  const permutation = SKILL_PERMUTATIONS[permutationIndex % SKILL_PERMUTATIONS.length]!;
  return Object.freeze([
    combination[permutation[0]],
    combination[permutation[1]],
    combination[permutation[2]],
  ]);
}

function createAssignments(roundIndex: number): readonly LoadoutAssignment[] {
  const streams = new RandomStreamSet(`balance-roster-v1-${roundIndex}`);
  const attributes = createBalancedSlots(
    STARTING_ATTRIBUTE_IDS,
    roundIndex * PARTICIPANT_COUNT,
    streams.get("attributes"),
  );
  const items = createBalancedSlots(
    BOT_ACTIVE_ITEM_IDS,
    roundIndex * PARTICIPANT_COUNT,
    streams.get("items"),
  );
  const personalities = createBalancedSlots(
    BOT_PERSONALITY_KINDS,
    roundIndex * PARTICIPANT_COUNT,
    streams.get("personalities"),
  );
  const phase = getPhase(roundIndex);
  const phaseRoundIndex = phase === "controlled" ? roundIndex : roundIndex - CONTROLLED_ROUNDS;
  const skillSchedule =
    phase === "controlled" ? CONTROLLED_SKILL_SCHEDULE : PRODUCTION_SKILL_SCHEDULE;
  const combinations = shuffle(
    skillSchedule.slice(
      phaseRoundIndex * PARTICIPANT_COUNT,
      (phaseRoundIndex + 1) * PARTICIPANT_COUNT,
    ),
    streams.get("skills"),
  );

  return Object.freeze(
    Array.from({ length: PARTICIPANT_COUNT }, (_, actorIndex) => {
      const actorId = actorIndex + 1;
      const attributeId = attributes[actorIndex]!;
      const item = items[actorIndex]!;
      const personality = personalities[actorIndex]!;
      const combination = combinations[actorIndex]!;
      const skills = permuteSkills(combination, roundIndex + actorId);
      return Object.freeze({
        actorId,
        attributeId,
        attributes: createFocusedAttributes(attributeId),
        item,
        skills,
        skillCombinationId: [...combination].toSorted().join("+"),
        personality,
      });
    }),
  );
}

function getPhase(roundIndex: number): BalancePhase {
  return roundIndex < CONTROLLED_ROUNDS ? "controlled" : "production";
}

function getRoundSeed(roundIndex: number): string {
  const seedFamily = Math.floor(roundIndex / 2);
  return `balance-audit-v1-${seedFamily.toString().padStart(3, "0")}`;
}

function createConfig(phase: BalancePhase) {
  const arena = getArenaSize(PARTICIPANT_COUNT);
  return normalizeGameConfig({
    participantCount: PARTICIPANT_COUNT,
    arenaColumns: arena.columns,
    arenaRows: arena.rows,
    roundLimitSeconds: AUTOMATION_ROUND_LIMIT_SECONDS,
    collapseSpeed: getPresetCollapseSpeed("massive"),
    difficulty: "hard",
    itemsEnabled: phase === "production",
    initialItemCount:
      phase === "production" ? getRecommendedInitialItemCount(PARTICIPANT_COUNT) : 0,
    itemRespawnSeconds: phase === "production" ? getPresetItemRespawnSeconds("massive") : 4,
  });
}

function isActiveParticipant(participant: {
  readonly active: boolean;
  readonly action: string;
}): boolean {
  return (
    participant.active && participant.action !== "Falling" && participant.action !== "Eliminated"
  );
}

function detectDeathCause(
  actorId: ActorId,
  previousParticipants: ReadonlyMap<
    ActorId,
    {
      readonly position: { readonly x: number; readonly y: number };
      readonly radius: number;
      readonly action: string;
    }
  >,
  fallingActors: ReadonlySet<ActorId>,
  healthDeaths: ReadonlySet<ActorId>,
  bombImpacts: readonly {
    readonly ownerActorId: ActorId;
    readonly position: { readonly x: number; readonly y: number };
  }[],
): BalanceDeathCause {
  const previous = previousParticipants.get(actorId);
  if (
    previous !== undefined &&
    bombImpacts.some(
      (impact) =>
        impact.ownerActorId !== actorId &&
        Math.hypot(
          previous.position.x - impact.position.x,
          previous.position.y - impact.position.y,
        ) -
          previous.radius <=
          SIMULATION_TUNING.bomb.blastRadius,
    )
  ) {
    return "bomb";
  }
  if (healthDeaths.has(actorId)) {
    return "health";
  }
  if (fallingActors.has(actorId) || previous?.action === "Falling") {
    return "fall";
  }
  return "other";
}

function getAggregate(
  phase: MutablePhase,
  category: BalanceCategory,
  id: string,
  label: string,
): MutableAggregate {
  const key = `${category}:${id}`;
  const current = phase.aggregates[key];
  if (current !== undefined) {
    return current;
  }
  const created: MutableAggregate = {
    category,
    id,
    label,
    exposures: 0,
    wins: 0,
    rankTotal: 0,
    top10: 0,
    top5: 0,
    survivalTicks: 0,
    creditedEliminations: 0,
    damageDealt: 0,
    uses: 0,
    hits: 0,
  };
  phase.aggregates[key] = created;
  return created;
}

function addObservation(
  aggregate: MutableAggregate,
  observation: ActorObservation,
  won: boolean,
  damageDealt: number,
  uses: number,
  hits: number,
): void {
  const rank = observation.rank ?? PARTICIPANT_COUNT;
  aggregate.exposures += 1;
  aggregate.wins += won ? 1 : 0;
  aggregate.rankTotal += rank;
  aggregate.top10 += rank <= 10 ? 1 : 0;
  aggregate.top5 += rank <= 5 ? 1 : 0;
  aggregate.survivalTicks += observation.activeTicks;
  aggregate.creditedEliminations += observation.creditedEliminations;
  aggregate.damageDealt += damageDealt;
  aggregate.uses += uses;
  aggregate.hits += hits;
}

function recordActor(
  phase: MutablePhase,
  assignment: LoadoutAssignment,
  observation: ActorObservation,
  won: boolean,
): void {
  const totalSkillUses = SKILL_DEFINITION_IDS.reduce(
    (sum, skill) => sum + observation.skillUses[skill],
    0,
  );
  const totalSkillHits = SKILL_DEFINITION_IDS.reduce(
    (sum, skill) => sum + observation.skillHits[skill],
    0,
  );
  addObservation(
    getAggregate(
      phase,
      "attribute",
      assignment.attributeId,
      ATTRIBUTE_LABELS[assignment.attributeId],
    ),
    observation,
    won,
    observation.damageDealt,
    totalSkillUses,
    totalSkillHits,
  );
  addObservation(
    getAggregate(phase, "item", assignment.item, ITEM_LABELS[assignment.item]),
    observation,
    won,
    observation.damageDealt,
    observation.itemUses[assignment.item],
    observation.itemHits[assignment.item],
  );
  addObservation(
    getAggregate(phase, "personality", assignment.personality, assignment.personality),
    observation,
    won,
    observation.damageDealt,
    totalSkillUses,
    totalSkillHits,
  );
  addObservation(
    getAggregate(
      phase,
      "skill-combination",
      assignment.skillCombinationId,
      assignment.skills.map((skill) => SKILL_DEFINITIONS[skill].label).join(" · "),
    ),
    observation,
    won,
    observation.damageDealt,
    totalSkillUses,
    totalSkillHits,
  );
  for (const skill of assignment.skills) {
    addObservation(
      getAggregate(phase, "skill", skill, SKILL_DEFINITIONS[skill].label),
      observation,
      won,
      observation.skillDamage[skill],
      observation.skillUses[skill],
      observation.skillHits[skill],
    );
  }
}

function runRound(roundIndex: number, result: WorkerResult): void {
  const phaseId = getPhase(roundIndex);
  const phase = result[phaseId];
  const assignments = createAssignments(roundIndex);
  const assignmentByActor = new Map(
    assignments.map((assignment) => [assignment.actorId, assignment]),
  );
  const participantOverrides: readonly ParticipantSpawnOverride[] = Object.freeze(
    assignments.map((assignment) =>
      Object.freeze({
        actorId: assignment.actorId,
        control: "scripted" as const,
        startingAttributes: assignment.attributes,
        startingItems: Object.freeze([assignment.item] as const),
        startingSkills: assignment.skills,
      }),
    ),
  );
  const seed = getRoundSeed(roundIndex);
  const world = new SimulationWorld(createConfig(phaseId), seed, {
    humanActorId: 1,
    participantOverrides,
  });
  const bots = new BotDirector(seed, null, {
    difficulty: "hard",
    personalityOverrides: assignments.map(({ actorId, personality }) =>
      Object.freeze({ actorId, personality }),
    ),
  });
  const observations = new Map<ActorId, ActorObservation>(
    assignments.map(({ actorId }) => [actorId, createObservation()]),
  );
  let frame = world.createRenderFrame();

  while (frame.round.status === "Active") {
    const previousParticipants = new Map(
      frame.participants.map((participant) => [
        participant.actorId,
        {
          position: participant.position,
          radius: participant.radius,
          action: participant.action,
        },
      ]),
    );
    const step = world.step(bots.createCommands(world.tick, frame));
    frame = step.frame;
    const fallingActors = new Set<ActorId>();
    const healthDeaths = new Set<ActorId>();
    const eliminatedActors: ActorId[] = [];
    const bombImpacts: {
      ownerActorId: ActorId;
      position: { readonly x: number; readonly y: number };
    }[] = [];

    for (const event of step.events) {
      if (event.kind === "falling-started" && event.actorId !== undefined) {
        fallingActors.add(event.actorId);
      }
      if (
        event.kind === "damage-applied" &&
        event.targetActorId !== undefined &&
        event.healthAfter !== undefined &&
        event.healthAfter <= 0
      ) {
        healthDeaths.add(event.targetActorId);
      }
      if (
        event.kind === "bomb-detonated" &&
        event.actorId !== undefined &&
        event.position !== undefined
      ) {
        bombImpacts.push({ ownerActorId: event.actorId, position: event.position });
      }
      if (event.kind === "eliminated" && event.actorId !== undefined) {
        eliminatedActors.push(event.actorId);
      }

      if (event.actorId !== undefined) {
        const actor = observations.get(event.actorId);
        if (actor !== undefined) {
          if (event.kind === "stat-point-earned") {
            actor.creditedEliminations += 1;
          }
          if (event.kind === "skill-used" && event.skillDefinitionId !== undefined) {
            actor.skillUses[event.skillDefinitionId] += 1;
          }
          if (event.kind === "skill-hit" && event.skillDefinitionId !== undefined) {
            actor.skillHits[event.skillDefinitionId] += 1;
          }
          if (event.kind === "damage-applied" && event.amount !== undefined && event.amount > 0) {
            actor.damageDealt += event.amount;
            if (event.skillDefinitionId !== undefined) {
              actor.skillDamage[event.skillDefinitionId] += event.amount;
            }
          }
          if (
            event.kind === "item-used" &&
            event.itemDefinitionId !== undefined &&
            BOT_ACTIVE_ITEM_IDS.includes(event.itemDefinitionId as BotActiveItemId)
          ) {
            actor.itemUses[event.itemDefinitionId as BotActiveItemId] += 1;
          }
          if (event.kind === "soap-triggered") {
            actor.itemHits.soap += 1;
          }
        }
      }

      if (
        event.kind === "damage-applied" &&
        event.targetActorId !== undefined &&
        event.amount !== undefined
      ) {
        const target = observations.get(event.targetActorId);
        if (target !== undefined) {
          target.damageTaken += event.amount;
        }
      }
    }

    const activeAfter = frame.participants.filter(isActiveParticipant).length;
    for (const actorId of eliminatedActors) {
      const actor = observations.get(actorId);
      if (actor === undefined || actor.rank !== null) {
        continue;
      }
      actor.rank = activeAfter + 1;
      actor.deathTick = frame.tick;
      actor.deathCause = detectDeathCause(
        actorId,
        previousParticipants,
        fallingActors,
        healthDeaths,
        bombImpacts,
      );
    }

    for (const participant of frame.participants) {
      if (isActiveParticipant(participant)) {
        const actor = observations.get(participant.actorId);
        if (actor !== undefined) {
          actor.activeTicks += 1;
        }
      }
    }
  }

  if (frame.round.completedTick === null || frame.round.reason === null) {
    throw new Error(`balance round ${roundIndex} did not terminate`);
  }

  if (frame.round.winnerActorId !== null) {
    const winner = observations.get(frame.round.winnerActorId);
    if (winner !== undefined) {
      winner.rank = 1;
    }
    phase.winners += 1;
  }
  for (const observation of observations.values()) {
    if (observation.rank === null) {
      observation.rank = frame.round.winnerActorId === null ? 1 : 2;
    }
    if (observation.deathCause !== null) {
      phase.deathCauses[observation.deathCause] += 1;
    }
  }

  phase.actorRounds += PARTICIPANT_COUNT;
  phase.reasonCounts[frame.round.reason] += 1;
  const durationSeconds = frame.round.completedTick / FIXED_TICKS_PER_SECOND;
  phase.durations.push(durationSeconds);
  const winnerAssignment =
    frame.round.winnerActorId === null
      ? undefined
      : assignmentByActor.get(frame.round.winnerActorId);
  phase.rounds.push(
    Object.freeze({
      index: roundIndex,
      seedFamily: Math.floor(roundIndex / 2),
      assignmentPass: roundIndex % 2,
      seed,
      durationSeconds: roundMetric(durationSeconds),
      reason: frame.round.reason,
      winnerActorId: frame.round.winnerActorId,
      winnerPersonality: winnerAssignment?.personality ?? null,
      stateHash: frame.stateHash,
    }),
  );

  for (const assignment of assignments) {
    const observation = observations.get(assignment.actorId);
    if (observation === undefined) {
      throw new Error(`missing observation for actor ${assignment.actorId}`);
    }
    recordActor(phase, assignment, observation, frame.round.winnerActorId === assignment.actorId);
  }
}

function mergeAggregate(target: MutableAggregate, source: MutableAggregate): void {
  target.exposures += source.exposures;
  target.wins += source.wins;
  target.rankTotal += source.rankTotal;
  target.top10 += source.top10;
  target.top5 += source.top5;
  target.survivalTicks += source.survivalTicks;
  target.creditedEliminations += source.creditedEliminations;
  target.damageDealt += source.damageDealt;
  target.uses += source.uses;
  target.hits += source.hits;
}

function mergePhase(target: MutablePhase, source: MutablePhase): void {
  target.actorRounds += source.actorRounds;
  target.winners += source.winners;
  target.durations.push(...source.durations);
  target.rounds.push(...source.rounds);
  for (const reason of ["last-standing", "no-survivors", "time-limit"] as const) {
    target.reasonCounts[reason] += source.reasonCounts[reason];
  }
  for (const cause of ["fall", "health", "bomb", "other"] as const) {
    target.deathCauses[cause] += source.deathCauses[cause];
  }
  for (const [key, aggregate] of Object.entries(source.aggregates)) {
    const current = target.aggregates[key];
    if (current === undefined) {
      target.aggregates[key] = { ...aggregate };
    } else {
      mergeAggregate(current, aggregate);
    }
  }
}

function mergeWorkerResults(results: readonly WorkerResult[]): WorkerResult {
  const merged = createWorkerResult();
  for (const result of results) {
    mergePhase(merged.controlled, result.controlled);
    mergePhase(merged.production, result.production);
  }
  return merged;
}

function wilson95(wins: number, total: number): { readonly lower: number; readonly upper: number } {
  if (total === 0) {
    return Object.freeze({ lower: 0, upper: 0 });
  }
  const z = 1.959963984540054;
  const rate = wins / total;
  const denominator = 1 + (z * z) / total;
  const center = (rate + (z * z) / (2 * total)) / denominator;
  const margin =
    (z / denominator) * Math.sqrt((rate * (1 - rate)) / total + (z * z) / (4 * total * total));
  return Object.freeze({
    lower: roundMetric(Math.max(0, center - margin)),
    upper: roundMetric(Math.min(1, center + margin)),
  });
}

function percentile(sorted: readonly number[], percentileValue: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentileValue) - 1),
  );
  return roundMetric(sorted[index] ?? 0);
}

function finalizeAggregate(aggregate: MutableAggregate, baselineWinRate: number): BalanceAggregate {
  const winRate = ratio(aggregate.wins, aggregate.exposures);
  const interval = wilson95(aggregate.wins, aggregate.exposures);
  const winIndex = baselineWinRate === 0 ? 0 : roundMetric(winRate / baselineWinRate);
  const signal =
    interval.upper < baselineWinRate * 0.75
      ? "buff-review"
      : interval.lower > baselineWinRate * 1.25
        ? "nerf-review"
        : "watch";
  return Object.freeze({
    category: aggregate.category,
    id: aggregate.id,
    label: aggregate.label,
    exposures: aggregate.exposures,
    wins: aggregate.wins,
    winRate,
    winRate95: interval,
    winIndex,
    averageRank: roundMetric(aggregate.rankTotal / aggregate.exposures),
    top10Rate: ratio(aggregate.top10, aggregate.exposures),
    top5Rate: ratio(aggregate.top5, aggregate.exposures),
    averageSurvivalSeconds: roundMetric(
      aggregate.survivalTicks / aggregate.exposures / FIXED_TICKS_PER_SECOND,
    ),
    eliminationsPerRound: ratio(aggregate.creditedEliminations, aggregate.exposures),
    damageDealtPerRound: roundMetric(aggregate.damageDealt / aggregate.exposures),
    usesPerRound: ratio(aggregate.uses, aggregate.exposures),
    hitsPerUse: aggregate.uses === 0 ? null : ratio(aggregate.hits, aggregate.uses),
    signal,
  });
}

function finalizePhase(id: BalancePhase, phase: MutablePhase): BalancePhaseReport {
  const durations = phase.durations.toSorted((left, right) => left - right);
  const baselineWinRate = ratio(phase.winners, phase.actorRounds);
  return Object.freeze({
    phase: id,
    roundCount: phase.rounds.length,
    actorRounds: phase.actorRounds,
    reasonCounts: Object.freeze({ ...phase.reasonCounts }),
    durationSeconds: Object.freeze({
      minimum: roundMetric(durations[0] ?? 0),
      mean: roundMetric(
        durations.reduce((sum, duration) => sum + duration, 0) / Math.max(1, durations.length),
      ),
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      maximum: roundMetric(durations.at(-1) ?? 0),
    }),
    deathCauses: Object.freeze({ ...phase.deathCauses }),
    aggregates: Object.freeze(
      Object.values(phase.aggregates)
        .map((aggregate) => finalizeAggregate(aggregate, baselineWinRate))
        .toSorted(
          (left, right) =>
            left.category.localeCompare(right.category) ||
            left.averageRank - right.averageRank ||
            left.id.localeCompare(right.id),
        ),
    ),
    rounds: Object.freeze(phase.rounds.toSorted((left, right) => left.index - right.index)),
  });
}

function readGit(command: readonly string[]): string {
  const [executable, ...args] = command;
  if (executable === undefined) {
    return "unknown";
  }
  const result = spawnSync(executable, args, { encoding: "utf8" });
  if (result.status !== 0) {
    return "unknown";
  }
  return result.stdout.trim();
}

function assertCoverage(report: WorkerResult): void {
  const controlledRounds = report.controlled.rounds.length;
  const productionRounds = report.production.rounds.length;
  if (controlledRounds !== CONTROLLED_ROUNDS || productionRounds !== PRODUCTION_ROUNDS) {
    throw new Error(
      `balance audit coverage mismatch: controlled=${controlledRounds}, production=${productionRounds}`,
    );
  }
  const pairKeys = new Set(
    [...report.controlled.rounds, ...report.production.rounds].map(
      (round) => `${round.seedFamily}:${round.assignmentPass}`,
    ),
  );
  if (pairKeys.size !== TOTAL_ROUNDS) {
    throw new Error(`balance audit has duplicate or missing paired assignments: ${pairKeys.size}`);
  }
  for (const phase of [report.controlled, report.production]) {
    for (const category of ["attribute", "skill", "item", "personality"] as const) {
      const counts = Object.values(phase.aggregates)
        .filter((aggregate) => aggregate.category === category)
        .map((aggregate) => aggregate.exposures);
      if (counts.length === 0 || Math.max(...counts) - Math.min(...counts) > 1) {
        throw new Error(`${category} exposure rotation is not balanced within one actor-round`);
      }
    }
  }
}

function assertAssignmentCoverage(): void {
  for (const phase of ["controlled", "production"] as const) {
    const counts = {
      attribute: new Map<string, number>(STARTING_ATTRIBUTE_IDS.map((id) => [id, 0])),
      skill: new Map<string, number>(SKILL_DEFINITION_IDS.map((id) => [id, 0])),
      item: new Map<string, number>(BOT_ACTIVE_ITEM_IDS.map((id) => [id, 0])),
      personality: new Map<string, number>(BOT_PERSONALITY_KINDS.map((id) => [id, 0])),
      "skill-combination": new Map<string, number>(
        SKILL_COMBINATIONS.map((combination) => [[...combination].toSorted().join("+"), 0]),
      ),
    };
    const startRound = phase === "controlled" ? 0 : CONTROLLED_ROUNDS;
    const endRound = phase === "controlled" ? CONTROLLED_ROUNDS : TOTAL_ROUNDS;
    for (let roundIndex = startRound; roundIndex < endRound; roundIndex += 1) {
      for (const assignment of createAssignments(roundIndex)) {
        counts.attribute.set(
          assignment.attributeId,
          (counts.attribute.get(assignment.attributeId) ?? 0) + 1,
        );
        counts.item.set(assignment.item, (counts.item.get(assignment.item) ?? 0) + 1);
        counts.personality.set(
          assignment.personality,
          (counts.personality.get(assignment.personality) ?? 0) + 1,
        );
        counts["skill-combination"].set(
          assignment.skillCombinationId,
          (counts["skill-combination"].get(assignment.skillCombinationId) ?? 0) + 1,
        );
        for (const skill of assignment.skills) {
          counts.skill.set(skill, (counts.skill.get(skill) ?? 0) + 1);
        }
      }
    }
    for (const [category, categoryCounts] of Object.entries(counts)) {
      const values = [...categoryCounts.values()];
      if (Math.max(...values) - Math.min(...values) > 1) {
        throw new Error(
          `${phase} ${category} assignment exposure differs by more than one: ${Math.min(...values)}..${Math.max(...values)}`,
        );
      }
    }
  }
}

async function runWorker(startRound: number, roundCount: number): Promise<WorkerResult> {
  const result = createWorkerResult();
  for (let offset = 0; offset < roundCount; offset += 1) {
    runRound(startRound + offset, result);
  }
  return result;
}

async function executeWorkers(): Promise<readonly WorkerResult[]> {
  const workerCount = Math.min(MAX_WORKERS, Math.max(1, availableParallelism()), TOTAL_ROUNDS);
  const baseCount = Math.floor(TOTAL_ROUNDS / workerCount);
  const remainder = TOTAL_ROUNDS % workerCount;
  let cursor = 0;
  const workers = Array.from({ length: workerCount }, (_, workerIndex) => {
    const count = baseCount + (workerIndex < remainder ? 1 : 0);
    const start = cursor;
    cursor += count;
    return { start, count };
  });
  return Promise.all(
    workers.map(async ({ start, count }) => {
      const child = spawn(
        process.execPath,
        [fileURLToPath(import.meta.url), "--worker", String(start), String(count)],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        collectStream(child.stdout),
        collectStream(child.stderr),
        new Promise<number>((resolve, reject) => {
          child.on("error", reject);
          child.on("close", (code) => resolve(code ?? 1));
        }),
      ]);
      if (exitCode !== 0) {
        throw new Error(`balance audit worker ${start}.. failed: ${stderr.trim()}`);
      }

      return JSON.parse(stdout) as WorkerResult;
    }),
  );
}

function collectStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      output += chunk;
    });
    stream.on("end", () => resolve(output));
    stream.on("error", reject);
  });
}
async function main(): Promise<void> {
  if (process.argv[2] === "--worker") {
    const start = Number(process.argv[3]);
    const count = Number(process.argv[4]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || start < 0 || count < 1) {
      throw new Error("balance audit worker requires valid start and count");
    }
    process.stdout.write(JSON.stringify(await runWorker(start, count)));
    return;
  }

  const startedAt = performance.now();
  assertAssignmentCoverage();
  const merged = mergeWorkerResults(await executeWorkers());
  assertCoverage(merged);
  const phases = Object.freeze([
    finalizePhase("controlled", merged.controlled),
    finalizePhase("production", merged.production),
  ]);
  const flaggedCount = phases
    .flatMap(({ aggregates }) => aggregates)
    .filter(({ signal }) => signal !== "watch").length;
  const dashboard: BalanceDashboardData = Object.freeze({
    schemaVersion: BALANCE_DASHBOARD_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: Object.freeze({
      commitSha: readGit(["git", "rev-parse", "HEAD"]),
      dirty: readGit(["git", "status", "--porcelain"]) !== "",
      productVersion: PRODUCT_VERSION,
      simulationVersion: SIMULATION_VERSION,
      contentVersion: CONTENT_VERSION,
    }),
    methodology: Object.freeze({
      mode: "deterministic-paired-seed-bots",
      roundCount: TOTAL_ROUNDS,
      participantCount: PARTICIPANT_COUNT,
      controlledRoundCount: CONTROLLED_ROUNDS,
      productionRoundCount: PRODUCTION_ROUNDS,
      seedFamilyCount: SEED_FAMILY_COUNT,
      workerCount: Math.min(MAX_WORKERS, Math.max(1, availableParallelism()), TOTAL_ROUNDS),
      assignment:
        "Each paired seed keeps the same island while independently rotating 10/2 focused attributes, all 84 three-skill combinations and Q/W/E orders, six starting active items, five personalities, and actor seats.",
      rankTiePolicy:
        "Actors eliminated on the same tick share the rank equal to survivors after that tick plus one.",
      limitations: Object.freeze([
        "Fixed-seed hard-bot regression evidence is not human-play balance proof.",
        "The 10/2 focused attribute builds compare playable archetypes, not isolated one-point marginal value.",
        "Controlled rounds disable map item spawning; production item exposure remains observational.",
        "Individual skill results include the other two skills in each rotated loadout.",
        "Death causes are event-derived classifications because eliminated events do not carry a native cause.",
        "Skill-combination rows are exploratory: roughly two expected winners per combination is too small for nerf decisions.",
      ]),
    }),
    summary: Object.freeze({
      completedRounds: TOTAL_ROUNDS,
      actorRounds: TOTAL_ROUNDS * PARTICIPANT_COUNT,
      flaggedCount,
      elapsedWallSeconds: roundMetric((performance.now() - startedAt) / 1000),
    }),
    phases,
  });

  await mkdir(new URL(".", OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(dashboard, null, 2)}\n`, "utf8");
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        output: OUTPUT_PATH.pathname,
        rounds: dashboard.summary.completedRounds,
        actorRounds: dashboard.summary.actorRounds,
        elapsedWallSeconds: dashboard.summary.elapsedWallSeconds,
        flaggedCount,
      },
      null,
      2,
    )}\n`,
  );
}

await main();
