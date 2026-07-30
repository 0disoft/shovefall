import { DEFAULT_SKILL_LOADOUT, getSkillDefinition, isSkillDefinitionId } from "../content/skills";
import type {
  ParticipantState,
  SkillDefinitionId,
  SkillSlotIndex,
  SkillSlotState,
  StartingAttributes,
  Tick,
} from "./contracts";
import { SimulationContractError } from "./math";
import { spendMana } from "./combat";
import {
  getPowerMultiplier,
  getReflexCooldownReduction,
  getSkillCooldownMultiplier,
  getSkillDamageMultiplier,
  getSkillDurationMultiplier,
  getSkillImpulseMultiplier,
  getSkillManaMultiplier,
} from "./progression";
import {
  getStartingCooldownMultiplier,
  getStartingManaCostMultiplier,
  getStartingOutgoingMultiplier,
  getStartingSkillDamageMultiplier,
} from "./starting-attributes";

export function applyStartingSkills(
  participant: ParticipantState,
  definitionIds: readonly SkillDefinitionId[] = DEFAULT_SKILL_LOADOUT,
): ParticipantState {
  if (
    (definitionIds.length !== 2 && definitionIds.length !== 3) ||
    new Set(definitionIds).size !== definitionIds.length ||
    !definitionIds.every(isSkillDefinitionId)
  ) {
    throw new SimulationContractError("startingSkills must contain two or three unique skills");
  }

  const first = definitionIds[0];
  const second = definitionIds[1];
  const third = definitionIds[2];
  if (first === undefined || second === undefined) {
    throw new SimulationContractError("startingSkills must contain two or three unique skills");
  }

  return Object.freeze({
    ...participant,
    skills: Object.freeze([
      Object.freeze({ slotIndex: 0, definitionId: first, readyTick: 0 }),
      Object.freeze({ slotIndex: 1, definitionId: second, readyTick: 0 }),
      ...(third === undefined
        ? []
        : [Object.freeze({ slotIndex: 2 as const, definitionId: third, readyTick: 0 })]),
    ] satisfies readonly SkillSlotState[]),
  });
}

export function getSkillSlot(
  participant: ParticipantState,
  slotIndex: SkillSlotIndex,
): SkillSlotState | undefined {
  return participant.skills.find((slot) => slot.slotIndex === slotIndex);
}

export function startSkillCooldown(
  participant: ParticipantState,
  slotIndex: SkillSlotIndex,
  tick: Tick,
): ParticipantState {
  const slot = getSkillSlot(participant, slotIndex);
  if (slot === undefined) {
    return participant;
  }

  const rank = participant.progression.skillRanks[slotIndex];
  const definition = getSkillDefinition(slot.definitionId);
  const cooldownTicks = Math.max(
    24,
    Math.round(
      definition.cooldownTicks *
        getSkillCooldownMultiplier(rank) *
        getStartingCooldownMultiplier(participant.startingAttributes),
    ) - getReflexCooldownReduction(participant.progression.stats),
  );
  return Object.freeze({
    ...participant,
    skills: Object.freeze(
      participant.skills.map((candidate) =>
        candidate.slotIndex === slotIndex
          ? Object.freeze({ ...candidate, readyTick: tick + cooldownTicks })
          : candidate,
      ),
    ),
  });
}

export interface SkillCastMetrics {
  readonly rank: number;
  readonly manaCost: number;
  readonly damage: number;
  readonly impulse: number;
  readonly stumbleTicks: number;
  readonly stunTicks: number;
  readonly rootTicks: number;
  readonly durationTicks: number;
  readonly shield: number;
}

export function getSkillManaCost(
  definitionId: SkillDefinitionId,
  rank: number,
  startingAttributes: StartingAttributes,
): number {
  return Math.max(
    0,
    Math.ceil(
      getSkillDefinition(definitionId).manaCost *
        getSkillManaMultiplier(rank) *
        getStartingManaCostMultiplier(startingAttributes),
    ),
  );
}

export function getSkillCastMetrics(
  participant: ParticipantState,
  slotIndex: SkillSlotIndex,
): SkillCastMetrics | undefined {
  const slot = getSkillSlot(participant, slotIndex);
  if (slot === undefined) {
    return undefined;
  }

  const rank = participant.progression.skillRanks[slotIndex];
  const definition = getSkillDefinition(slot.definitionId);
  const durationMultiplier = getSkillDurationMultiplier(rank);
  return Object.freeze({
    rank,
    manaCost: getSkillManaCost(slot.definitionId, rank, participant.startingAttributes),
    damage:
      definition.damage *
      getSkillDamageMultiplier(rank) *
      getPowerMultiplier(participant.progression.stats) *
      getStartingOutgoingMultiplier(participant.startingAttributes) *
      getStartingSkillDamageMultiplier(participant.startingAttributes),
    impulse:
      definition.impulse *
      getSkillImpulseMultiplier(rank) *
      getPowerMultiplier(participant.progression.stats) *
      getStartingOutgoingMultiplier(participant.startingAttributes),
    stumbleTicks: Math.round(definition.stumbleTicks * durationMultiplier),
    stunTicks: Math.round(definition.stunTicks * durationMultiplier),
    rootTicks: Math.round(definition.rootTicks * durationMultiplier),
    durationTicks: Math.round(definition.durationTicks * durationMultiplier),
    shield: definition.shield * getSkillDamageMultiplier(rank),
  });
}

export function commitSkillCast(
  participant: ParticipantState,
  slotIndex: SkillSlotIndex,
  tick: Tick,
): ParticipantState | undefined {
  const slot = getSkillSlot(participant, slotIndex);
  const metrics = getSkillCastMetrics(participant, slotIndex);
  if (slot === undefined || metrics === undefined || tick < slot.readyTick) {
    return undefined;
  }

  const withManaSpent = spendMana(participant, metrics.manaCost, tick);
  return withManaSpent === undefined
    ? undefined
    : startSkillCooldown(withManaSpent, slotIndex, tick);
}
