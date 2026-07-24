import { clamp } from "./math";

export interface GameplayTuningV1 {
  readonly tuningVersion: 1;
  readonly movementMaximumSpeed: number;
  readonly lightweightSpeedMultiplier: number;
  readonly heavyweightSpeedMultiplier: number;
  readonly shoveActiveTicks: number;
  readonly shoveReach: number;
  readonly dodgeActiveTicks: number;
  readonly dodgeSpeed: number;
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
    maximum: 1.25,
    default: 1,
  }),
  body: Object.freeze({
    radius: 0.34,
    maximumSpeed: 0.26,
    maximumLaunchSpeed: 0.42,
    weakContactIterations: 3,
    weakContactSlop: 0.000_1,
    weakContactVelocityDamping: 0.12,
  }),
  spatialHash: Object.freeze({
    cellSize: 1.7,
  }),
  movement: Object.freeze({
    baseMaximumSpeed: 0.055,
    lightweightSpeedMultiplier: 1.5,
    heavyweightSpeedMultiplier: 0.82,
    windupControl: 0.35,
    recoveryControl: 0.22,
    passiveDrag: 0.91,
    stumbleDrag: 0.965,
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
    eliminationCreditTicks: 180,
  }),
  windBlast: Object.freeze({
    range: 6.5,
    baseImpulse: 0.52,
    maximumImpulse: 0.64,
    stumbleTicks: 30,
  }),
  grapplingHook: Object.freeze({
    range: 4.5,
    minimumAnchorDistance: 1.25,
    targetSpeed: 0.3,
    acceleration: 0.24,
    pullTicks: 12,
  }),
  bomb: Object.freeze({
    fuseTicks: 300,
    blastRadius: 3,
    ownerBaseImpulse: 0.42,
    ownerMaximumImpulse: 0.52,
    ownerMinimumFalloff: 0.65,
    ownerStumbleTicks: 42,
  }),
  soap: Object.freeze({
    minimumSpeed: 0.105,
    maximumSpeed: 0.42,
    stumbleTicks: 24,
  }),
  dodge: Object.freeze({
    activeTicks: 4,
    evasionTicks: 4,
    cooldownTicks: 108,
    speed: 0.08,
  }),
  support: Object.freeze({
    graceTicks: 9,
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
  shoveActiveTicks: Object.freeze({ minimum: 3, maximum: 9, step: 1 }),
  shoveReach: Object.freeze({ minimum: 0.12, maximum: 0.5, step: 0.01 }),
  dodgeActiveTicks: Object.freeze({ minimum: 3, maximum: 10, step: 1 }),
  dodgeSpeed: Object.freeze({ minimum: 0.07, maximum: 0.17, step: 0.005 }),
});

export const DEFAULT_GAMEPLAY_TUNING: GameplayTuningV1 = Object.freeze({
  tuningVersion: 1,
  movementMaximumSpeed: SIMULATION_TUNING.movement.baseMaximumSpeed,
  lightweightSpeedMultiplier: SIMULATION_TUNING.movement.lightweightSpeedMultiplier,
  heavyweightSpeedMultiplier: SIMULATION_TUNING.movement.heavyweightSpeedMultiplier,
  shoveActiveTicks: SIMULATION_TUNING.shove.activeTicks,
  shoveReach: SIMULATION_TUNING.shove.reach,
  dodgeActiveTicks: SIMULATION_TUNING.dodge.activeTicks,
  dodgeSpeed: SIMULATION_TUNING.dodge.speed,
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
    shoveActiveTicks: normalizeInteger(
      input.shoveActiveTicks,
      DEFAULT_GAMEPLAY_TUNING.shoveActiveTicks,
      GAMEPLAY_TUNING_LIMITS.shoveActiveTicks,
    ),
    shoveReach: normalizeNumber(
      input.shoveReach,
      DEFAULT_GAMEPLAY_TUNING.shoveReach,
      GAMEPLAY_TUNING_LIMITS.shoveReach,
    ),
    dodgeActiveTicks: normalizeInteger(
      input.dodgeActiveTicks,
      DEFAULT_GAMEPLAY_TUNING.dodgeActiveTicks,
      GAMEPLAY_TUNING_LIMITS.dodgeActiveTicks,
    ),
    dodgeSpeed: normalizeNumber(
      input.dodgeSpeed,
      DEFAULT_GAMEPLAY_TUNING.dodgeSpeed,
      GAMEPLAY_TUNING_LIMITS.dodgeSpeed,
    ),
  });
}

export function normalizeMassFactor(value: number): number {
  return clamp(value, SIMULATION_TUNING.mass.minimum, SIMULATION_TUNING.mass.maximum);
}

export function getMassDodgeSpeedMultiplier(massFactor: number): number {
  return SIMULATION_TUNING.mass.default / normalizeMassFactor(massFactor);
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
