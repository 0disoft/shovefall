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
  return stable(1 + attributes.strength * 0.025);
}

export function getStartingOutgoingMultiplier(attributes: StartingAttributes): number {
  return stable(1 + attributes.strength * 0.025);
}

export function getStartingMovementMultiplier(attributes: StartingAttributes): number {
  return stable(1 + attributes.agility * 0.04);
}

export function getStartingCooldownMultiplier(attributes: StartingAttributes): number {
  return stable(1 - attributes.agility * 0.04);
}

export function getStartingMaximumHealthBonus(attributes: StartingAttributes): number {
  return attributes.constitution * 6;
}

export function getStartingHealthRegenMultiplier(attributes: StartingAttributes): number {
  return stable(1 + attributes.constitution * 0.04);
}

export function getStartingMaximumManaBonus(attributes: StartingAttributes): number {
  return attributes.spirit * 8;
}

export function getStartingManaRegenMultiplier(attributes: StartingAttributes): number {
  return stable(1 + attributes.spirit * 0.08);
}

export function getStartingIncomingImpulseMultiplier(attributes: StartingAttributes): number {
  return stable(1 - attributes.balance * 0.035);
}

export function getStartingControlDurationMultiplier(attributes: StartingAttributes): number {
  return stable(1 - attributes.balance * 0.025);
}

export function getStartingDamageTakenMultiplier(attributes: StartingAttributes): number {
  return stable(1 - attributes.willpower * 0.02);
}

export function getStartingShieldMultiplier(attributes: StartingAttributes): number {
  return stable(1 + attributes.willpower * 0.02);
}
