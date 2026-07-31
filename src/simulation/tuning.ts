import { GRAPPLING_HOOK_DEFINITION } from "../content/built-in-actions";
import { getItemDefinition } from "../content/items";
import { clamp } from "./math";
import { MAXIMUM_LAUNCH_SPEED, STUMBLE_DRAG_PER_TICK } from "./motion-constants";

export interface GameplayTuningV1 {
  readonly tuningVersion: 1;
  readonly movementMaximumSpeed: number;
  readonly lightweightSpeedMultiplier: number;
  readonly heavyweightSpeedMultiplier: number;
  readonly dodgeActiveTicks: number;
  readonly dodgeCooldownTicks: number;
  readonly dodgeEvasionTicks: number;
  readonly dodgeSpeed: number;
  readonly healthRegenDelayTicks: number;
  readonly healthRegenPerTick: number;
  readonly manaRegenDelayTicks: number;
  readonly manaRegenPerTick: number;
  readonly bombFuseTicks: number;
  readonly bombBlastRadius: number;
  readonly grapplingHookCooldownTicks: number;
  readonly grapplingHookRange: number;
  readonly grapplingHookPullTicks: number;
}

export type GameplayTuningInput = Partial<Omit<GameplayTuningV1, "tuningVersion">>;

interface NumericTuningLimit {
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
}

export const SIMULATION_TUNING = Object.freeze({
  mass: Object.freeze({
    minimum: 0.85,
    maximum: 1.65,
    default: 1,
  }),
  body: Object.freeze({
    radius: 0.34,
    maximumSpeed: 0.26,
    maximumLaunchSpeed: MAXIMUM_LAUNCH_SPEED,
    weakContactIterations: 3,
    weakContactSlop: 0.000_1,
    weakContactVelocityDamping: 0.12,
  }),
  spatialHash: Object.freeze({
    cellSize: 1.7,
  }),
  movement: Object.freeze({
    baseMaximumSpeed: 0.04,
    lightweightSpeedMultiplier: 1.5,
    heavyweightSpeedMultiplier: 0.82,
    windupControl: 0.35,
    recoveryControl: 0.22,
    passiveDrag: 0.91,
    stumbleDrag: STUMBLE_DRAG_PER_TICK,
  }),
  shove: Object.freeze({
    windupTicks: 8,
    activeTicks: 4,
    recoveryTicks: 20,
    cooldownTicks: 84,
    reach: 0.32,
    coneCosine: 0.15,
    baseImpulse: 0.16,
    velocityImpulseScale: 0.4,
    maximumImpulse: 0.34,
    stumbleImpulseThreshold: 0.12,
    missedStumbleBaseTicks: 30,
    missedStumbleSpeedTicks: 52,
    hitStumbleTicks: 22,
    damage: 7,
    eliminationCreditTicks: 180,
  }),
  soap: Object.freeze({
    minimumSpeed: getItemDefinition("soap").slideMinimumSpeed,
    maximumSpeed: getItemDefinition("soap").slideMaximumSpeed,
    dragPerTick: getItemDefinition("soap").slideDragPerTick,
    stumbleTicks: getItemDefinition("soap").stumbleTicks,
  }),
  grapplingHook: Object.freeze({
    cooldownTicks: GRAPPLING_HOOK_DEFINITION.cooldownTicks,
    range: GRAPPLING_HOOK_DEFINITION.castRange,
    minimumAnchorDistance: GRAPPLING_HOOK_DEFINITION.minimumAnchorDistance,
    targetSpeed: GRAPPLING_HOOK_DEFINITION.targetSpeed,
    acceleration: GRAPPLING_HOOK_DEFINITION.acceleration,
    pullTicks: GRAPPLING_HOOK_DEFINITION.pullTicks,
  }),
  bomb: Object.freeze({
    fuseTicks: getItemDefinition("bomb").fuseTicks,
    blastRadius: getItemDefinition("bomb").effectRadius,
    ownerBaseImpulse: 0.42,
    ownerMaximumImpulse: 0.52,
    ownerMinimumFalloff: 0.65,
    ownerStumbleTicks: 42,
  }),
  dodge: Object.freeze({
    activeTicks: 4,
    evasionTicks: 4,
    cooldownTicks: 108,
    speed: 0.6,
  }),
  support: Object.freeze({
    graceTicks: 30,
    fallingTicks: 24,
  }),
});

export const MASS_IMPULSE_EXPONENT = 0.35;

export const GAMEPLAY_TUNING_LIMITS: Readonly<
  Record<keyof GameplayTuningInput, NumericTuningLimit>
> = Object.freeze({
  movementMaximumSpeed: Object.freeze({ minimum: 0.035, maximum: 0.09, step: 0.001 }),
  lightweightSpeedMultiplier: Object.freeze({ minimum: 1, maximum: 1.6, step: 0.05 }),
  heavyweightSpeedMultiplier: Object.freeze({ minimum: 0.6, maximum: 1, step: 0.05 }),
  dodgeActiveTicks: Object.freeze({ minimum: 3, maximum: 10, step: 1 }),
  dodgeCooldownTicks: Object.freeze({ minimum: 30, maximum: 360, step: 6 }),
  dodgeEvasionTicks: Object.freeze({ minimum: 1, maximum: 10, step: 1 }),
  dodgeSpeed: Object.freeze({ minimum: 0.07, maximum: 0.75, step: 0.025 }),
  healthRegenDelayTicks: Object.freeze({ minimum: 60, maximum: 600, step: 30 }),
  healthRegenPerTick: Object.freeze({ minimum: 0, maximum: 0.3, step: 0.01 }),
  manaRegenDelayTicks: Object.freeze({ minimum: 0, maximum: 300, step: 15 }),
  manaRegenPerTick: Object.freeze({ minimum: 0, maximum: 0.5, step: 0.025 }),
  bombFuseTicks: Object.freeze({ minimum: 60, maximum: 600, step: 30 }),
  bombBlastRadius: Object.freeze({ minimum: 1, maximum: 8, step: 0.5 }),
  grapplingHookCooldownTicks: Object.freeze({ minimum: 120, maximum: 1_200, step: 30 }),
  grapplingHookRange: Object.freeze({ minimum: 2, maximum: 10, step: 0.5 }),
  grapplingHookPullTicks: Object.freeze({ minimum: 4, maximum: 30, step: 1 }),
});

export const DEFAULT_GAMEPLAY_TUNING: GameplayTuningV1 = Object.freeze({
  tuningVersion: 1,
  movementMaximumSpeed: SIMULATION_TUNING.movement.baseMaximumSpeed,
  lightweightSpeedMultiplier: SIMULATION_TUNING.movement.lightweightSpeedMultiplier,
  heavyweightSpeedMultiplier: SIMULATION_TUNING.movement.heavyweightSpeedMultiplier,
  dodgeActiveTicks: SIMULATION_TUNING.dodge.activeTicks,
  dodgeCooldownTicks: SIMULATION_TUNING.dodge.cooldownTicks,
  dodgeEvasionTicks: SIMULATION_TUNING.dodge.evasionTicks,
  dodgeSpeed: SIMULATION_TUNING.dodge.speed,
  healthRegenDelayTicks: 300,
  healthRegenPerTick: 0.04,
  manaRegenDelayTicks: 60,
  manaRegenPerTick: 0.1,
  bombFuseTicks: SIMULATION_TUNING.bomb.fuseTicks,
  bombBlastRadius: SIMULATION_TUNING.bomb.blastRadius,
  grapplingHookCooldownTicks: SIMULATION_TUNING.grapplingHook.cooldownTicks,
  grapplingHookRange: SIMULATION_TUNING.grapplingHook.range,
  grapplingHookPullTicks: SIMULATION_TUNING.grapplingHook.pullTicks,
});

export interface MovementProfile {
  readonly maximumSpeed: number;
}

function normalizeNumber(
  value: number | undefined,
  fallback: number,
  limit: NumericTuningLimit,
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return clamp(value, limit.minimum, limit.maximum);
}

function normalizeInteger(
  value: number | undefined,
  fallback: number,
  limit: NumericTuningLimit,
): number {
  return Math.round(normalizeNumber(value, fallback, limit));
}

export function normalizeGameplayTuning(input: GameplayTuningInput = {}): GameplayTuningV1 {
  return Object.freeze({
    tuningVersion: 1,
    movementMaximumSpeed: normalizeNumber(
      input.movementMaximumSpeed,
      DEFAULT_GAMEPLAY_TUNING.movementMaximumSpeed,
      GAMEPLAY_TUNING_LIMITS.movementMaximumSpeed,
    ),
    lightweightSpeedMultiplier: normalizeNumber(
      input.lightweightSpeedMultiplier,
      DEFAULT_GAMEPLAY_TUNING.lightweightSpeedMultiplier,
      GAMEPLAY_TUNING_LIMITS.lightweightSpeedMultiplier,
    ),
    heavyweightSpeedMultiplier: normalizeNumber(
      input.heavyweightSpeedMultiplier,
      DEFAULT_GAMEPLAY_TUNING.heavyweightSpeedMultiplier,
      GAMEPLAY_TUNING_LIMITS.heavyweightSpeedMultiplier,
    ),
    dodgeActiveTicks: normalizeInteger(
      input.dodgeActiveTicks,
      DEFAULT_GAMEPLAY_TUNING.dodgeActiveTicks,
      GAMEPLAY_TUNING_LIMITS.dodgeActiveTicks,
    ),
    dodgeCooldownTicks: normalizeInteger(
      input.dodgeCooldownTicks,
      DEFAULT_GAMEPLAY_TUNING.dodgeCooldownTicks,
      GAMEPLAY_TUNING_LIMITS.dodgeCooldownTicks,
    ),
    dodgeEvasionTicks: normalizeInteger(
      input.dodgeEvasionTicks,
      DEFAULT_GAMEPLAY_TUNING.dodgeEvasionTicks,
      GAMEPLAY_TUNING_LIMITS.dodgeEvasionTicks,
    ),
    dodgeSpeed: normalizeNumber(
      input.dodgeSpeed,
      DEFAULT_GAMEPLAY_TUNING.dodgeSpeed,
      GAMEPLAY_TUNING_LIMITS.dodgeSpeed,
    ),
    healthRegenDelayTicks: normalizeInteger(
      input.healthRegenDelayTicks,
      DEFAULT_GAMEPLAY_TUNING.healthRegenDelayTicks,
      GAMEPLAY_TUNING_LIMITS.healthRegenDelayTicks,
    ),
    healthRegenPerTick: normalizeNumber(
      input.healthRegenPerTick,
      DEFAULT_GAMEPLAY_TUNING.healthRegenPerTick,
      GAMEPLAY_TUNING_LIMITS.healthRegenPerTick,
    ),
    manaRegenDelayTicks: normalizeInteger(
      input.manaRegenDelayTicks,
      DEFAULT_GAMEPLAY_TUNING.manaRegenDelayTicks,
      GAMEPLAY_TUNING_LIMITS.manaRegenDelayTicks,
    ),
    manaRegenPerTick: normalizeNumber(
      input.manaRegenPerTick,
      DEFAULT_GAMEPLAY_TUNING.manaRegenPerTick,
      GAMEPLAY_TUNING_LIMITS.manaRegenPerTick,
    ),
    bombFuseTicks: normalizeInteger(
      input.bombFuseTicks,
      DEFAULT_GAMEPLAY_TUNING.bombFuseTicks,
      GAMEPLAY_TUNING_LIMITS.bombFuseTicks,
    ),
    bombBlastRadius: normalizeNumber(
      input.bombBlastRadius,
      DEFAULT_GAMEPLAY_TUNING.bombBlastRadius,
      GAMEPLAY_TUNING_LIMITS.bombBlastRadius,
    ),
    grapplingHookCooldownTicks: normalizeInteger(
      input.grapplingHookCooldownTicks,
      DEFAULT_GAMEPLAY_TUNING.grapplingHookCooldownTicks,
      GAMEPLAY_TUNING_LIMITS.grapplingHookCooldownTicks,
    ),
    grapplingHookRange: normalizeNumber(
      input.grapplingHookRange,
      DEFAULT_GAMEPLAY_TUNING.grapplingHookRange,
      GAMEPLAY_TUNING_LIMITS.grapplingHookRange,
    ),
    grapplingHookPullTicks: normalizeInteger(
      input.grapplingHookPullTicks,
      DEFAULT_GAMEPLAY_TUNING.grapplingHookPullTicks,
      GAMEPLAY_TUNING_LIMITS.grapplingHookPullTicks,
    ),
  });
}

export function normalizeMassFactor(value: number): number {
  return clamp(value, SIMULATION_TUNING.mass.minimum, SIMULATION_TUNING.mass.maximum);
}

export function getMassDodgeSpeedMultiplier(massFactor: number): number {
  const mass = normalizeMassFactor(massFactor);

  if (mass <= SIMULATION_TUNING.mass.default) {
    const progress =
      (SIMULATION_TUNING.mass.default - mass) /
      (SIMULATION_TUNING.mass.default - SIMULATION_TUNING.mass.minimum);
    return 1 + progress * 0.25;
  }

  const progress =
    (mass - SIMULATION_TUNING.mass.default) /
    (SIMULATION_TUNING.mass.maximum - SIMULATION_TUNING.mass.default);
  return 1 - progress * 0.375;
}

export function getIncomingMassImpulseMultiplier(massFactor: number): number {
  return Math.pow(
    SIMULATION_TUNING.mass.default / normalizeMassFactor(massFactor),
    MASS_IMPULSE_EXPONENT,
  );
}

export function getShoveMassImpulseMultiplier(
  attackerMassFactor: number,
  targetMassFactor: number,
): number {
  return Math.pow(
    normalizeMassFactor(attackerMassFactor) / normalizeMassFactor(targetMassFactor),
    MASS_IMPULSE_EXPONENT,
  );
}

export function getMovementProfile(
  massFactor: number,
  tuning: GameplayTuningV1 = DEFAULT_GAMEPLAY_TUNING,
): MovementProfile {
  const mass = normalizeMassFactor(massFactor);
  const isLightweight = mass < SIMULATION_TUNING.mass.default;
  const massRange = isLightweight
    ? SIMULATION_TUNING.mass.default - SIMULATION_TUNING.mass.minimum
    : SIMULATION_TUNING.mass.maximum - SIMULATION_TUNING.mass.default;
  const massProgress =
    massRange === 0 ? 0 : Math.abs(mass - SIMULATION_TUNING.mass.default) / massRange;
  const extremeMultiplier = isLightweight
    ? tuning.lightweightSpeedMultiplier
    : tuning.heavyweightSpeedMultiplier;
  const maximumSpeedScale = 1 + (extremeMultiplier - 1) * massProgress;

  return Object.freeze({
    maximumSpeed: tuning.movementMaximumSpeed * maximumSpeedScale,
  });
}
