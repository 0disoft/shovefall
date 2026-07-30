import type { StartingAttributeId, StartingAttributes } from "./contracts";
import { SimulationContractError } from "./math";

export const STARTING_ATTRIBUTE_IDS = Object.freeze([
  "strength",
  "agility",
  "constitution",
  "spirit",
  "balance",
  "willpower",
] as const satisfies readonly StartingAttributeId[]);
export const STARTING_ATTRIBUTE_POINT_TOTAL = 20;
export const STARTING_ATTRIBUTE_LIMITS = Object.freeze({ minimum: 0, maximum: 20 });
export const STARTING_ATTRIBUTE_EFFECTS = Object.freeze({
  strength: Object.freeze({ massPerPoint: 0.025, outgoingPerPoint: 0.0375 }),
  agility: Object.freeze({
    movementPerPoint: 0.025,
    cooldownReductionPerPoint: 0.04,
    manaCostReductionPerPoint: 0.0175,
    stumbleReductionPerPoint: 0.025,
  }),
  constitution: Object.freeze({ maximumHealthPerPoint: 1.75, healthRegenPerPoint: 0.0125 }),
  spirit: Object.freeze({
    maximumManaPerPoint: 8,
    manaRegenPerPoint: 0.1,
    skillDamagePerPoint: 0.02,
  }),
  balance: Object.freeze({
    impulseReductionPerPoint: 0.04,
    controlReductionPerPoint: 0.03,
  }),
  willpower: Object.freeze({
    damageReductionPerPoint: 0.0125,
    shieldPerPoint: 0.0125,
  }),
});
export const DEFAULT_STARTING_ATTRIBUTES: StartingAttributes = Object.freeze({
  strength: 4,
  agility: 4,
  constitution: 4,
  spirit: 4,
  balance: 4,
  willpower: 0,
});

function stable(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function getStartingAttributePointTotal(attributes: StartingAttributes): number {
  return STARTING_ATTRIBUTE_IDS.reduce((total, id) => total + attributes[id], 0);
}

export function isStartingAttributes(value: unknown): value is StartingAttributes {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const attributeValues = STARTING_ATTRIBUTE_IDS.map((id) => Reflect.get(value, id));
  return (
    attributeValues.every(
      (attributeValue) =>
        typeof attributeValue === "number" &&
        Number.isSafeInteger(attributeValue) &&
        attributeValue >= STARTING_ATTRIBUTE_LIMITS.minimum &&
        attributeValue <= STARTING_ATTRIBUTE_LIMITS.maximum,
    ) &&
    attributeValues.reduce(
      (total, attributeValue) => total + (typeof attributeValue === "number" ? attributeValue : 0),
      0,
    ) === STARTING_ATTRIBUTE_POINT_TOTAL
  );
}

export function normalizeStartingAttributes(value: unknown): StartingAttributes {
  if (!isStartingAttributes(value)) {
    return DEFAULT_STARTING_ATTRIBUTES;
  }
  return Object.freeze({
    strength: value.strength,
    agility: value.agility,
    constitution: value.constitution,
    spirit: value.spirit,
    balance: value.balance,
    willpower: value.willpower,
  });
}

export function assertStartingAttributes(value: unknown): asserts value is StartingAttributes {
  if (!isStartingAttributes(value)) {
    throw new SimulationContractError(
      `startingAttributes must allocate exactly ${STARTING_ATTRIBUTE_POINT_TOTAL} points with every attribute inside ${STARTING_ATTRIBUTE_LIMITS.minimum}..${STARTING_ATTRIBUTE_LIMITS.maximum}`,
    );
  }
}

export function getStartingMassFactor(attributes: StartingAttributes): number {
  return stable(1 + attributes.strength * STARTING_ATTRIBUTE_EFFECTS.strength.massPerPoint);
}

export function getStartingOutgoingMultiplier(attributes: StartingAttributes): number {
  return stable(1 + attributes.strength * STARTING_ATTRIBUTE_EFFECTS.strength.outgoingPerPoint);
}

export function getStartingMovementMultiplier(attributes: StartingAttributes): number {
  return stable(1 + attributes.agility * STARTING_ATTRIBUTE_EFFECTS.agility.movementPerPoint);
}

export function getStartingCooldownMultiplier(attributes: StartingAttributes): number {
  return stable(
    1 - attributes.agility * STARTING_ATTRIBUTE_EFFECTS.agility.cooldownReductionPerPoint,
  );
}

export function getStartingManaCostMultiplier(attributes: StartingAttributes): number {
  return stable(
    1 - attributes.agility * STARTING_ATTRIBUTE_EFFECTS.agility.manaCostReductionPerPoint,
  );
}

export function getStartingStumbleDurationMultiplier(attributes: StartingAttributes): number {
  return stable(
    1 - attributes.agility * STARTING_ATTRIBUTE_EFFECTS.agility.stumbleReductionPerPoint,
  );
}

export function getStartingMaximumHealthBonus(attributes: StartingAttributes): number {
  return attributes.constitution * STARTING_ATTRIBUTE_EFFECTS.constitution.maximumHealthPerPoint;
}

export function getStartingHealthRegenMultiplier(attributes: StartingAttributes): number {
  return stable(
    1 + attributes.constitution * STARTING_ATTRIBUTE_EFFECTS.constitution.healthRegenPerPoint,
  );
}

export function getStartingMaximumManaBonus(attributes: StartingAttributes): number {
  return attributes.spirit * STARTING_ATTRIBUTE_EFFECTS.spirit.maximumManaPerPoint;
}

export function getStartingManaRegenMultiplier(attributes: StartingAttributes): number {
  return stable(1 + attributes.spirit * STARTING_ATTRIBUTE_EFFECTS.spirit.manaRegenPerPoint);
}

export function getStartingSkillDamageMultiplier(attributes: StartingAttributes): number {
  return stable(1 + attributes.spirit * STARTING_ATTRIBUTE_EFFECTS.spirit.skillDamagePerPoint);
}

export function getStartingIncomingImpulseMultiplier(attributes: StartingAttributes): number {
  return stable(
    1 - attributes.balance * STARTING_ATTRIBUTE_EFFECTS.balance.impulseReductionPerPoint,
  );
}

export function getStartingControlDurationMultiplier(attributes: StartingAttributes): number {
  return stable(
    1 - attributes.balance * STARTING_ATTRIBUTE_EFFECTS.balance.controlReductionPerPoint,
  );
}

export function getStartingDamageTakenMultiplier(attributes: StartingAttributes): number {
  return stable(
    1 - attributes.willpower * STARTING_ATTRIBUTE_EFFECTS.willpower.damageReductionPerPoint,
  );
}

export function getStartingShieldMultiplier(attributes: StartingAttributes): number {
  return stable(1 + attributes.willpower * STARTING_ATTRIBUTE_EFFECTS.willpower.shieldPerPoint);
}
