import { availableParallelism } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BotDirector } from "../src/ai/bot-director";
import { BOT_ACTIVE_ITEM_IDS, type BotActiveItemId } from "../src/ai/bot-loadouts";
import { BOT_PERSONALITY_KINDS, type BotPersonalityKind } from "../src/ai/personalities";
import {
  AUTOMATION_ROUND_LIMIT_SECONDS,
  FIXED_COLLAPSE_SPEED,
  FIXED_ITEM_RESPAWN_SECONDS,
  getArenaSize,
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
import { classifyBalanceSignal, type BalancePeerBaseline } from "../src/balance/signal";
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

const TOTAL_ROUNDS = 80;
const CONTROLLED_ROUNDS = 80;
const PRODUCTION_ROUNDS = 0;
const PARTICIPANT_COUNT = 60;
const SEED_FAMILY_COUNT = 40;
const MIN_WORKERS = 4;
const MAX_WORKERS = 8;
const WORKER_COUNT = Math.min(
  MAX_WORKERS,
  Math.max(MIN_WORKERS, availableParallelism()),
  TOTAL_ROUNDS,
);
const OUTPUT_PATH = new URL("../balance/latest.json", import.meta.url);
const RANDOMIZED_ATTRIBUTES = process.argv.includes("--random-attributes");
const BALANCED_ATTRIBUTES = process.argv.includes("--balanced-attributes");

if (RANDOMIZED_ATTRIBUTES && BALANCED_ATTRIBUTES) {
  throw new Error("attribute audit accepts only one attribute assignment mode");
}

const ITEM_LABELS: Readonly<Record<BotActiveItemId, string>> = Object.freeze({
  soap: "비누",
  "brick-bag": "벽돌 가방",
  boat: "배",
  bomb: "시한폭탄",
});

interface LoadoutAssignment {
  readonly actorId: ActorId;
  readonly attributeProfileId: string | null;
  readonly attributes: StartingAttributes;
  readonly item: BotActiveItemId;
  readonly skills: readonly [SkillDefinitionId, SkillDefinitionId];
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

const SKILL_COMBINATIONS = Object.freeze(
  SKILL_DEFINITION_IDS.flatMap((left, leftIndex) =>
    SKILL_DEFINITION_IDS.slice(leftIndex + 1).map((right) => Object.freeze([left, right] as const)),
  ),
);

const SKILL_ITEM_LOADOUTS = Object.freeze(
  SKILL_COMBINATIONS.flatMap((skills) =>
    BOT_ACTIVE_ITEM_IDS.map((item) => Object.freeze({ item, skills })),
  ),
);

interface FocusedAttributeProfile {
  readonly id: string;
  readonly label: string;
  readonly attributes: StartingAttributes;
}

const ATTRIBUTE_LABELS: Readonly<Record<StartingAttributeId, string>> = Object.freeze({
  strength: "완력",
  agility: "민첩",
  constitution: "체질",
  spirit: "정신",
  balance: "균형",
  willpower: "의지",
});

const FOCUSED_ATTRIBUTE_PROFILES: readonly FocusedAttributeProfile[] = Object.freeze(
  STARTING_ATTRIBUTE_IDS.map((focusedAttributeId) =>
    Object.freeze({
      id: focusedAttributeId,
      label: ATTRIBUTE_LABELS[focusedAttributeId],
      attributes: Object.freeze(
        Object.fromEntries(
          STARTING_ATTRIBUTE_IDS.map((attributeId) => [
            attributeId,
            attributeId === focusedAttributeId ? 20 : 0,
          ]),
        ) as unknown as StartingAttributes,
      ),
    }),
  ),
);

function createRandomAttributeBuild(random: XorShift32): StartingAttributes {
  const points = new Map<StartingAttributeId, number>(
    STARTING_ATTRIBUTE_IDS.map((attributeId) => [attributeId, 0]),
  );
  for (let point = 0; point < 20; point += 1) {
    const attributeId =
      STARTING_ATTRIBUTE_IDS[random.nextUint32() % STARTING_ATTRIBUTE_IDS.length]!;
    points.set(attributeId, (points.get(attributeId) ?? 0) + 1);
  }
  return Object.freeze(
    Object.fromEntries(
      STARTING_ATTRIBUTE_IDS.map((attributeId) => [attributeId, points.get(attributeId) ?? 0]),
    ) as unknown as StartingAttributes,
  );
}

function rotateAttributeBuild(attributes: StartingAttributes, offset: number): StartingAttributes {
  return Object.freeze(
    Object.fromEntries(
      STARTING_ATTRIBUTE_IDS.map((attributeId, index) => [
        attributeId,
        attributes[STARTING_ATTRIBUTE_IDS[(index + offset) % STARTING_ATTRIBUTE_IDS.length]!],
      ]),
    ) as unknown as StartingAttributes,
  );
}

function createRandomAttributeRoster(streams: RandomStreamSet): readonly StartingAttributes[] {
  if (PARTICIPANT_COUNT % STARTING_ATTRIBUTE_IDS.length !== 0) {
    throw new Error("random attribute roster requires complete six-actor rotation groups");
  }
  const random = streams.get("attributes");
  const roster = Array.from({ length: PARTICIPANT_COUNT / STARTING_ATTRIBUTE_IDS.length }, () => {
    const base = createRandomAttributeBuild(random);
    return STARTING_ATTRIBUTE_IDS.map((_, offset) => rotateAttributeBuild(base, offset));
  }).flat();
  return Object.freeze(shuffle(roster, streams.get("attribute-roster")));
}

function createBalancedAttributeRoster(roundIndex: number): readonly StartingAttributes[] {
  const base = Object.freeze([4, 4, 3, 3, 3, 3] as const);
  return Object.freeze(
    Array.from({ length: PARTICIPANT_COUNT }, (_, loadoutIndex) =>
      Object.freeze(
        Object.fromEntries(
          STARTING_ATTRIBUTE_IDS.map((attributeId, attributeIndex) => [
            attributeId,
            base[(attributeIndex + loadoutIndex + roundIndex) % base.length],
          ]),
        ) as unknown as StartingAttributes,
      ),
    ),
  );
}

function createAssignments(roundIndex: number): readonly LoadoutAssignment[] {
  const mode = RANDOMIZED_ATTRIBUTES
    ? "random-trait"
    : BALANCED_ATTRIBUTES
      ? "balanced-trait"
      : "focused-trait";
  const streams = new RandomStreamSet(`${mode}-loadout-roster-v1-${roundIndex}`);
  const attributeRoster = RANDOMIZED_ATTRIBUTES
    ? createRandomAttributeRoster(streams)
    : BALANCED_ATTRIBUTES
      ? createBalancedAttributeRoster(roundIndex)
      : undefined;
  const assignments = SKILL_ITEM_LOADOUTS.map((loadout, loadoutIndex) => {
    const skills = loadout.skills;
    const attributeProfile =
      FOCUSED_ATTRIBUTE_PROFILES[(loadoutIndex + roundIndex) % FOCUSED_ATTRIBUTE_PROFILES.length]!;
    const combinationIndex = Math.floor(loadoutIndex / BOT_ACTIVE_ITEM_IDS.length);
    return {
      actorId: 0,
      attributeProfileId: RANDOMIZED_ATTRIBUTES || BALANCED_ATTRIBUTES ? null : attributeProfile.id,
      attributes: attributeRoster?.[loadoutIndex] ?? attributeProfile.attributes,
      item: loadout.item,
      skills,
      skillCombinationId: [...skills].toSorted().join("+"),
      personality:
        BOT_PERSONALITY_KINDS[(combinationIndex + roundIndex) % BOT_PERSONALITY_KINDS.length]!,
    } satisfies LoadoutAssignment;
  });
  return Object.freeze(
    shuffle(assignments, streams.get("actor-seats")).map((assignment, actorIndex) =>
      Object.freeze({ ...assignment, actorId: actorIndex + 1 }),
    ),
  );
}

function getPhase(_roundIndex: number): BalancePhase {
  return "controlled";
}

function getRoundSeed(roundIndex: number): string {
  const seedFamily = Math.floor(roundIndex / 2);
  const mode = RANDOMIZED_ATTRIBUTES
    ? "random-trait"
    : BALANCED_ATTRIBUTES
      ? "balanced-trait"
      : "focused-trait";
  return `${mode}-skill-item-audit-v1-${seedFamily.toString().padStart(3, "0")}`;
}

function createConfig(_phase: BalancePhase) {
  const arena = getArenaSize(PARTICIPANT_COUNT);
  return normalizeGameConfig({
    participantCount: PARTICIPANT_COUNT,
    arenaColumns: arena.columns,
    arenaRows: arena.rows,
    roundLimitSeconds: AUTOMATION_ROUND_LIMIT_SECONDS,
    collapseSpeed: FIXED_COLLAPSE_SPEED,
    difficulty: "hard",
    itemsEnabled: false,
    initialItemCount: 0,
    itemRespawnSeconds: FIXED_ITEM_RESPAWN_SECONDS,
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
  weight = 1,
): void {
  const rank = observation.rank ?? PARTICIPANT_COUNT;
  aggregate.exposures += weight;
  aggregate.wins += won ? weight : 0;
  aggregate.rankTotal += rank * weight;
  aggregate.top10 += rank <= 10 ? weight : 0;
  aggregate.top5 += rank <= 5 ? weight : 0;
  aggregate.survivalTicks += observation.activeTicks * weight;
  aggregate.creditedEliminations += observation.creditedEliminations * weight;
  aggregate.damageDealt += damageDealt * weight;
  aggregate.uses += uses * weight;
  aggregate.hits += hits * weight;
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
  if (RANDOMIZED_ATTRIBUTES) {
    for (const attributeId of STARTING_ATTRIBUTE_IDS) {
      const investedPoints = assignment.attributes[attributeId];
      if (investedPoints === 0) {
        continue;
      }
      addObservation(
        getAggregate(
          phase,
          "attribute",
          attributeId,
          `${ATTRIBUTE_LABELS[attributeId]} 투자 포인트`,
        ),
        observation,
        won,
        observation.damageDealt,
        totalSkillUses,
        totalSkillHits,
        investedPoints,
      );
    }
  } else if (BALANCED_ATTRIBUTES) {
    addObservation(
      getAggregate(phase, "attribute", "balanced", "균등 배분"),
      observation,
      won,
      observation.damageDealt,
      totalSkillUses,
      totalSkillHits,
    );
  } else {
    const profileId = assignment.attributeProfileId;
    if (profileId === null) {
      throw new Error("focused attribute assignment is missing its profile");
    }
    addObservation(
      getAggregate(
        phase,
        "attribute",
        profileId,
        FOCUSED_ATTRIBUTE_PROFILES.find(({ id }) => id === profileId)?.label ?? profileId,
      ),
      observation,
      won,
      observation.damageDealt,
      totalSkillUses,
      totalSkillHits,
    );
  }
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
            actor.itemHits["soap"] += 1;
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
    signal: "watch",
  });
}

function median(values: readonly number[]): number {
  return percentile(
    values.toSorted((left, right) => left - right),
    0.5,
  );
}

function createPeerBaseline(
  category: BalanceCategory,
  aggregates: readonly BalanceAggregate[],
  baselineWinRate: number,
): BalancePeerBaseline {
  const peers = aggregates.filter((aggregate) => aggregate.category === category);
  return Object.freeze({
    winRate: baselineWinRate,
    averageRank: median(peers.map(({ averageRank }) => averageRank)),
    top10Rate: median(peers.map(({ top10Rate }) => top10Rate)),
    top5Rate: median(peers.map(({ top5Rate }) => top5Rate)),
    averageSurvivalSeconds: median(
      peers.map(({ averageSurvivalSeconds }) => averageSurvivalSeconds),
    ),
  });
}

function applyBalanceSignals(
  aggregates: readonly BalanceAggregate[],
  baselineWinRate: number,
): readonly BalanceAggregate[] {
  const baselines = new Map<BalanceCategory, BalancePeerBaseline>();
  return aggregates.map((aggregate) => {
    let peer = baselines.get(aggregate.category);
    if (peer === undefined) {
      peer = createPeerBaseline(aggregate.category, aggregates, baselineWinRate);
      baselines.set(aggregate.category, peer);
    }
    return Object.freeze({
      ...aggregate,
      signal: classifyBalanceSignal(aggregate, peer),
    });
  });
}

function finalizePhase(id: BalancePhase, phase: MutablePhase): BalancePhaseReport {
  const durations = phase.durations.toSorted((left, right) => left - right);
  const baselineWinRate = ratio(phase.winners, phase.actorRounds);
  const aggregates = Object.values(phase.aggregates).map((aggregate) =>
    finalizeAggregate(aggregate, baselineWinRate),
  );
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
      applyBalanceSignals(aggregates, baselineWinRate).toSorted(
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
}

function assertAssignmentCoverage(): void {
  const counts = {
    item: new Map<string, number>(BOT_ACTIVE_ITEM_IDS.map((id) => [id, 0])),
    skill: new Map<string, number>(SKILL_DEFINITION_IDS.map((id) => [id, 0])),
    combination: new Map<string, number>(
      SKILL_COMBINATIONS.map((skills) => [[...skills].toSorted().join("+"), 0]),
    ),
    personality: new Map<string, number>(BOT_PERSONALITY_KINDS.map((id) => [id, 0])),
    itemPersonality: new Map<string, number>(
      BOT_ACTIVE_ITEM_IDS.flatMap((item) =>
        BOT_PERSONALITY_KINDS.map((personality) => [`${item}:${personality}`, 0]),
      ),
    ),
    combinationItem: new Map<string, number>(
      SKILL_COMBINATIONS.flatMap((skills) =>
        BOT_ACTIVE_ITEM_IDS.map((item) => [[...skills].toSorted().join("+") + `:${item}`, 0]),
      ),
    ),
  };
  const perLoadoutProfiles = new Map(
    SKILL_COMBINATIONS.flatMap((skills) =>
      BOT_ACTIVE_ITEM_IDS.map((item) => [
        [...skills].toSorted().join("+") + `:${item}`,
        new Map<string, number>(FOCUSED_ATTRIBUTE_PROFILES.map(({ id }) => [id, 0])),
      ]),
    ),
  );
  const attributePointTotals = new Map<StartingAttributeId, number>(
    STARTING_ATTRIBUTE_IDS.map((attributeId) => [attributeId, 0]),
  );
  const randomBuilds = new Set<string>();
  let multiTraitActors = 0;
  for (let roundIndex = 0; roundIndex < TOTAL_ROUNDS; roundIndex += 1) {
    const roundAssignments = createAssignments(roundIndex);
    const roundLoadouts = new Set(
      roundAssignments.map(({ skillCombinationId, item }) => `${skillCombinationId}:${item}`),
    );
    if (
      roundAssignments.length !== PARTICIPANT_COUNT ||
      roundLoadouts.size !== SKILL_ITEM_LOADOUTS.length
    ) {
      throw new Error(`round ${roundIndex} does not expose every skill-item loadout exactly once`);
    }
    if (BALANCED_ATTRIBUTES) {
      for (const attributeId of STARTING_ATTRIBUTE_IDS) {
        const roundPoints = roundAssignments.reduce(
          (sum, assignment) => sum + assignment.attributes[attributeId],
          0,
        );
        if (roundPoints !== 200) {
          throw new Error(
            `round ${roundIndex} ${attributeId} exposure is ${roundPoints}, expected 200`,
          );
        }
      }
    }
    for (const assignment of roundAssignments) {
      const attributeValues = STARTING_ATTRIBUTE_IDS.map((id) => assignment.attributes[id]);
      if (attributeValues.reduce((sum, value) => sum + value, 0) !== 20) {
        throw new Error(`actor ${assignment.actorId} does not have a 20-point build`);
      }
      if (RANDOMIZED_ATTRIBUTES || BALANCED_ATTRIBUTES) {
        randomBuilds.add(attributeValues.join("/"));
        if (attributeValues.filter((value) => value > 0).length >= 2) {
          multiTraitActors += 1;
        }
        for (const attributeId of STARTING_ATTRIBUTE_IDS) {
          attributePointTotals.set(
            attributeId,
            (attributePointTotals.get(attributeId) ?? 0) + assignment.attributes[attributeId],
          );
        }
        if (
          BALANCED_ATTRIBUTES &&
          attributeValues.toSorted((left, right) => left - right).join("/") !== "3/3/3/3/4/4"
        ) {
          throw new Error(`actor ${assignment.actorId} does not have a balanced 20-point build`);
        }
      } else {
        if (
          attributeValues.filter((value) => value === 20).length !== 1 ||
          attributeValues.filter((value) => value === 0).length !== 5
        ) {
          throw new Error(`actor ${assignment.actorId} does not have a focused 20-point build`);
        }
        const profileId = assignment.attributeProfileId;
        if (profileId === null) {
          throw new Error(`actor ${assignment.actorId} is missing a focused attribute profile`);
        }
        const profileCounts = perLoadoutProfiles.get(
          `${assignment.skillCombinationId}:${assignment.item}`,
        )!;
        profileCounts.set(profileId, (profileCounts.get(profileId) ?? 0) + 1);
      }
      counts.item.set(assignment.item, (counts.item.get(assignment.item) ?? 0) + 1);
      counts.personality.set(
        assignment.personality,
        (counts.personality.get(assignment.personality) ?? 0) + 1,
      );
      const itemPersonalityKey = `${assignment.item}:${assignment.personality}`;
      counts.itemPersonality.set(
        itemPersonalityKey,
        (counts.itemPersonality.get(itemPersonalityKey) ?? 0) + 1,
      );
      if (
        assignment.skills[0] === assignment.skills[1] ||
        !counts.combination.has(assignment.skillCombinationId)
      ) {
        throw new Error(`invalid two-skill assignment: ${assignment.skillCombinationId}`);
      }
      counts.combination.set(
        assignment.skillCombinationId,
        (counts.combination.get(assignment.skillCombinationId) ?? 0) + 1,
      );
      const combinationItemKey = `${assignment.skillCombinationId}:${assignment.item}`;
      if (!counts.combinationItem.has(combinationItemKey)) {
        throw new Error(`invalid skill-item assignment: ${combinationItemKey}`);
      }
      counts.combinationItem.set(
        combinationItemKey,
        (counts.combinationItem.get(combinationItemKey) ?? 0) + 1,
      );
      for (const skill of assignment.skills) {
        counts.skill.set(skill, (counts.skill.get(skill) ?? 0) + 1);
      }
    }
  }
  for (const [category, categoryCounts] of Object.entries(counts)) {
    const values = [...categoryCounts.values()];
    const allowedDifference = 0;
    if (Math.max(...values) - Math.min(...values) > allowedDifference) {
      throw new Error(
        `${category} assignment exposure exceeds ${allowedDifference}: ${Math.min(...values)}..${Math.max(...values)}`,
      );
    }
  }
  if (RANDOMIZED_ATTRIBUTES || BALANCED_ATTRIBUTES) {
    const expectedPoints = (TOTAL_ROUNDS * PARTICIPANT_COUNT * 20) / STARTING_ATTRIBUTE_IDS.length;
    for (const [attributeId, points] of attributePointTotals) {
      if (points !== expectedPoints) {
        throw new Error(
          `${attributeId} random point exposure is ${points}, expected ${expectedPoints}`,
        );
      }
    }
    if (
      RANDOMIZED_ATTRIBUTES &&
      (randomBuilds.size < 100 || multiTraitActors < TOTAL_ROUNDS * PARTICIPANT_COUNT * 0.95)
    ) {
      throw new Error(
        `random attribute coverage is too narrow: builds=${randomBuilds.size}, multiTrait=${multiTraitActors}`,
      );
    }
  } else {
    for (const [loadoutId, profileCounts] of perLoadoutProfiles) {
      const exposures = [...profileCounts.values()];
      if (Math.max(...exposures) - Math.min(...exposures) > 1) {
        throw new Error(
          `focused-trait profile exposure differs for ${loadoutId}: ${Math.min(...exposures)}..${Math.max(...exposures)}`,
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
  const workerCount = WORKER_COUNT;
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
        [
          fileURLToPath(import.meta.url),
          "--worker",
          String(start),
          String(count),
          ...(RANDOMIZED_ATTRIBUTES ? ["--random-attributes"] : []),
          ...(BALANCED_ATTRIBUTES ? ["--balanced-attributes"] : []),
        ],
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
      workerCount: WORKER_COUNT,
      assignment: RANDOMIZED_ATTRIBUTES
        ? `각 참가자의 20포인트를 여섯 특성에 결정론적으로 무작위 배분한다. 여섯 회전본을 한 묶음으로 사용해 매 판 각 특성의 총투자량은 정확히 200포인트다. ${SKILL_COMBINATIONS.length}개 2스킬 조합과 ${BOT_ACTIVE_ITEM_IDS.length}개 시작 아이템의 모든 조합은 매 판 한 번씩 등장하고, 특성 조합과 좌석을 별도로 섞는다.`
        : BALANCED_ATTRIBUTES
          ? `각 참가자는 20포인트를 4·4·3·3·3·3으로 나눠 가진다. 4포인트를 받는 두 특성을 좌석과 라운드마다 회전시켜 매 판 각 특성의 총투자량을 정확히 200포인트로 맞춘다. ${SKILL_COMBINATIONS.length}개 2스킬 조합과 ${BOT_ACTIVE_ITEM_IDS.length}개 시작 아이템의 모든 조합은 매 판 한 번씩 등장한다.`
          : `매 판 여섯 특성 각각에 20포인트를 몰아준 참가자를 정확히 10명씩 배정한다. ${SKILL_COMBINATIONS.length}개 2스킬 조합과 ${BOT_ACTIVE_ITEM_IDS.length}개 시작 아이템의 모든 조합은 매 판 한 번씩 등장하고, 특성·성격·좌석을 순환해 특정 장비 조합에 한 특성이 고정되지 않게 한다.`,
      rankTiePolicy:
        "같은 틱에 탈락한 참가자는 해당 틱 종료 후 생존자 수에 1을 더한 공동 순위를 받는다.",
      limitations: Object.freeze([
        "고정 시드 어려움 AI 결과는 사람 플레이 밸런스를 증명하지 않는다.",
        RANDOMIZED_ATTRIBUTES
          ? "특성 행은 해당 특성에 투자된 포인트로 가중한 성적이다. 다른 다섯 특성과 함께 투자된 관측치이므로 한 포인트의 독립적인 인과 효과를 증명하지 않는다."
          : BALANCED_ATTRIBUTES
            ? "특성은 모든 참가자에게 거의 균등하게 배분했으므로 이 실험의 특성 행은 비교 대상이 아니라 공통 통제 조건이다."
            : "한 특성에 20포인트를 몰아준 극단 빌드 비교이므로 여러 특성에 나눠 찍는 일반 플레이의 한 포인트 효율을 직접 증명하지 않는다.",
        "시작 아이템의 효과를 분리하려고 보물선과 맵 추가 아이템을 끈 제어 실험이다.",
        "개별 스킬 결과에는 함께 선택된 다른 스킬의 영향이 섞여 있다.",
        "사망 원인은 eliminated 이벤트에 직접 원인이 없어 주변 전투 이벤트로 분류한다.",
        "2스킬 조합별 기대 우승 수가 적으므로 조합 행 하나만으로 상향·하향을 결정하면 안 된다.",
        "같은 판의 60명은 서로 경쟁하므로 actor-round Wilson 구간을 독립 표본의 확정적 신뢰구간으로 해석하면 안 된다.",
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
