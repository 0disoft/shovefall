import { getSkillDefinition } from "../content/skills";
import type {
  ActorId,
  CombatStatusKind,
  ParticipantCombatState,
  ParticipantState,
  ParticipantStats,
  StartingAttributes,
  Tick,
} from "./contracts";
import {
  combineLinearAttributeMultipliers,
  getDamageTakenMultiplier,
  getHealthRegenMultiplier,
  getManaRegenMultiplier,
  getMaximumHealth,
  getMaximumMana,
  getReflexShieldMultiplier,
  getStabilityControlDurationMultiplier,
} from "./progression";
import {
  getStartingControlDurationMultiplier,
  getStartingDamageTakenMultiplier,
  getStartingHealthRegenMultiplier,
  getStartingManaRegenMultiplier,
  getStartingMaximumHealthBonus,
  getStartingMaximumManaBonus,
  getStartingShieldMultiplier,
} from "./starting-attributes";
import type { GameplayTuningV1 } from "./tuning";

export const COMBAT_TUNING = Object.freeze({
  initialMana: 30,
  shieldControlDurationMultiplier: getSkillDefinition("aegis").controlDurationMultiplier,
});

function bounded(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function stable(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function getCombinedMaximumHealth(stats: ParticipantStats, attributes: StartingAttributes): number {
  return getMaximumHealth(stats) + getStartingMaximumHealthBonus(attributes);
}

function getCombinedMaximumMana(stats: ParticipantStats, attributes: StartingAttributes): number {
  return getMaximumMana(stats) + getStartingMaximumManaBonus(attributes);
}

export function createParticipantCombat(
  stats: ParticipantStats,
  attributes: StartingAttributes,
): ParticipantCombatState {
  const maximumHealth = getCombinedMaximumHealth(stats, attributes);
  const maximumMana = getCombinedMaximumMana(stats, attributes);
  return Object.freeze({
    health: maximumHealth,
    maximumHealth,
    mana: Math.min(COMBAT_TUNING.initialMana, maximumMana),
    maximumMana,
    shield: 0,
    shieldEndsTick: 0,
    lastDamageTick: null,
    lastManaSpendTick: null,
    lastDamageSourceActorId: null,
    stunnedUntilTick: 0,
    rootedUntilTick: 0,
    slowedUntilTick: 0,
    slowMultiplier: 1,
  });
}

export function synchronizeCombatCapacities(
  combat: ParticipantCombatState,
  stats: ParticipantStats,
  attributes: StartingAttributes,
): ParticipantCombatState {
  const maximumHealth = getCombinedMaximumHealth(stats, attributes);
  const maximumMana = getCombinedMaximumMana(stats, attributes);
  const healthGain = maximumHealth - combat.maximumHealth;
  const manaGain = maximumMana - combat.maximumMana;
  return Object.freeze({
    ...combat,
    maximumHealth,
    maximumMana,
    health: bounded(stable(combat.health + Math.max(0, healthGain)), 0, maximumHealth),
    mana: bounded(stable(combat.mana + Math.max(0, manaGain)), 0, maximumMana),
  });
}

export function advanceCombatResources(
  participant: ParticipantState,
  tick: Tick,
  tuning: GameplayTuningV1,
): ParticipantState {
  if (!participant.active) {
    return participant;
  }

  const synchronized = synchronizeCombatCapacities(
    participant.combat,
    participant.progression.stats,
    participant.startingAttributes,
  );
  const shieldActive = synchronized.shield > 0 && synchronized.shieldEndsTick > tick;
  const boatActive = participant.effects.some(
    ({ definitionId, endsTick }) =>
      definitionId === "boat" && (endsTick === null || endsTick > tick),
  );
  const canRegenerateHealth =
    !boatActive &&
    synchronized.health > 0 &&
    synchronized.health < synchronized.maximumHealth &&
    (synchronized.lastDamageTick === null ||
      tick - synchronized.lastDamageTick >= tuning.healthRegenDelayTicks);
  const canRegenerateMana =
    !boatActive &&
    synchronized.mana < synchronized.maximumMana &&
    (synchronized.lastManaSpendTick === null ||
      tick - synchronized.lastManaSpendTick >= tuning.manaRegenDelayTicks);
  const health = canRegenerateHealth
    ? bounded(
        stable(
          synchronized.health +
            tuning.healthRegenPerTick *
              combineLinearAttributeMultipliers(
                getStartingHealthRegenMultiplier(participant.startingAttributes),
                getHealthRegenMultiplier(participant.progression.stats),
              ),
        ),
        0,
        synchronized.maximumHealth,
      )
    : synchronized.health;
  const mana = canRegenerateMana
    ? bounded(
        stable(
          synchronized.mana +
            tuning.manaRegenPerTick *
              combineLinearAttributeMultipliers(
                getStartingManaRegenMultiplier(participant.startingAttributes),
                getManaRegenMultiplier(participant.progression.stats),
              ),
        ),
        0,
        synchronized.maximumMana,
      )
    : synchronized.mana;

  return Object.freeze({
    ...participant,
    combat: Object.freeze({
      ...synchronized,
      health,
      mana,
      shield: shieldActive ? synchronized.shield : 0,
      shieldEndsTick: shieldActive ? synchronized.shieldEndsTick : 0,
      slowMultiplier: synchronized.slowedUntilTick > tick ? synchronized.slowMultiplier : 1,
    }),
  });
}

export function spendMana(
  participant: ParticipantState,
  amount: number,
  tick: Tick,
): ParticipantState | undefined {
  if (amount < 0 || participant.combat.mana + 1e-9 < amount) {
    return undefined;
  }

  return Object.freeze({
    ...participant,
    combat: Object.freeze({
      ...participant.combat,
      mana: stable(participant.combat.mana - amount),
      lastManaSpendTick: tick,
    }),
  });
}

export interface CombatManaDrainResult {
  readonly participant: ParticipantState;
  readonly drained: number;
}

export function drainParticipantMana(
  participant: ParticipantState,
  amount: number,
): CombatManaDrainResult {
  if (!participant.active || amount <= 0 || participant.combat.mana <= 0) {
    return Object.freeze({ participant, drained: 0 });
  }

  const drained = stable(Math.min(amount, participant.combat.mana));
  return Object.freeze({
    participant: Object.freeze({
      ...participant,
      combat: Object.freeze({
        ...participant.combat,
        mana: stable(participant.combat.mana - drained),
      }),
    }),
    drained,
  });
}

export interface CombatDamageResult {
  readonly participant: ParticipantState;
  readonly damage: number;
  readonly absorbed: number;
}

export function applyCombatDamage(
  participant: ParticipantState,
  rawAmount: number,
  sourceActorId: ActorId | null,
  tick: Tick,
): CombatDamageResult {
  if (!participant.active || rawAmount <= 0 || participant.combat.health <= 0) {
    return Object.freeze({ participant, damage: 0, absorbed: 0 });
  }

  const reduced = stable(
    rawAmount *
      combineLinearAttributeMultipliers(
        getStartingDamageTakenMultiplier(participant.startingAttributes),
        getDamageTakenMultiplier(participant.progression.stats),
      ),
  );
  const activeShield = participant.combat.shieldEndsTick > tick ? participant.combat.shield : 0;
  const absorbed = Math.min(activeShield, reduced);
  const damage = stable(reduced - absorbed);
  const health = stable(Math.max(0, participant.combat.health - damage));
  const shield = stable(Math.max(0, activeShield - absorbed));
  return Object.freeze({
    participant: Object.freeze({
      ...participant,
      combat: Object.freeze({
        ...participant.combat,
        health,
        shield,
        shieldEndsTick: shield > 0 ? participant.combat.shieldEndsTick : 0,
        lastDamageTick: tick,
        lastDamageSourceActorId: sourceActorId,
      }),
    }),
    damage,
    absorbed,
  });
}

export function healParticipant(participant: ParticipantState, amount: number): ParticipantState {
  if (!participant.active || amount <= 0 || participant.combat.health <= 0) {
    return participant;
  }

  return Object.freeze({
    ...participant,
    combat: Object.freeze({
      ...participant.combat,
      health: stable(
        Math.min(participant.combat.maximumHealth, participant.combat.health + amount),
      ),
    }),
  });
}

export function restoreParticipantMana(
  participant: ParticipantState,
  amount: number,
): ParticipantState {
  if (!participant.active || amount <= 0 || participant.combat.health <= 0) {
    return participant;
  }

  return Object.freeze({
    ...participant,
    combat: Object.freeze({
      ...participant.combat,
      mana: stable(Math.min(participant.combat.maximumMana, participant.combat.mana + amount)),
    }),
  });
}

export function applyShield(
  participant: ParticipantState,
  amount: number,
  durationTicks: number,
  tick: Tick,
): ParticipantState {
  if (!participant.active || amount <= 0 || durationTicks <= 0) {
    return participant;
  }

  const adjustedAmount = stable(
    amount *
      combineLinearAttributeMultipliers(
        getStartingShieldMultiplier(participant.startingAttributes),
        getReflexShieldMultiplier(participant.progression.stats),
      ),
  );
  return Object.freeze({
    ...participant,
    combat: Object.freeze({
      ...participant.combat,
      shield: stable(Math.max(participant.combat.shield, adjustedAmount)),
      shieldEndsTick: Math.max(participant.combat.shieldEndsTick, tick + durationTicks),
    }),
  });
}

export function applyCombatStatus(
  participant: ParticipantState,
  kind: Exclude<CombatStatusKind, "shield">,
  durationTicks: number,
  tick: Tick,
  slowMultiplier = 1,
): ParticipantState {
  if (!participant.active || durationTicks <= 0) {
    return participant;
  }

  const shieldActive = participant.combat.shield > 0 && participant.combat.shieldEndsTick > tick;
  const adjustedDuration = Math.max(
    1,
    Math.round(
      durationTicks *
        (shieldActive ? COMBAT_TUNING.shieldControlDurationMultiplier : 1) *
        combineLinearAttributeMultipliers(
          getStartingControlDurationMultiplier(participant.startingAttributes),
          getStabilityControlDurationMultiplier(participant.progression.stats),
        ),
    ),
  );
  const untilTick = tick + adjustedDuration;
  const combat =
    kind === "stun"
      ? Object.freeze({
          ...participant.combat,
          stunnedUntilTick: Math.max(participant.combat.stunnedUntilTick, untilTick),
        })
      : kind === "root"
        ? Object.freeze({
            ...participant.combat,
            rootedUntilTick: Math.max(participant.combat.rootedUntilTick, untilTick),
          })
        : Object.freeze({
            ...participant.combat,
            slowedUntilTick: Math.max(participant.combat.slowedUntilTick, untilTick),
            slowMultiplier: Math.min(participant.combat.slowMultiplier, slowMultiplier),
          });
  return Object.freeze({ ...participant, combat });
}

export function isStunned(participant: ParticipantState, tick: Tick): boolean {
  return participant.combat.stunnedUntilTick > tick;
}

export function isRooted(participant: ParticipantState, tick: Tick): boolean {
  return participant.combat.rootedUntilTick > tick;
}
