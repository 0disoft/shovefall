import { clamp } from "./math";

export const SIMULATION_TUNING = Object.freeze({
  mass: Object.freeze({
    minimum: 0.7,
    maximum: 1.5,
    default: 1,
    maximumSpeedSlope: 0.18,
  }),
  body: Object.freeze({
    radius: 0.34,
    maximumSpeed: 0.26,
    weakContactIterations: 3,
    weakContactSlop: 0.000_1,
    weakContactVelocityDamping: 0.12,
  }),
  spatialHash: Object.freeze({
    cellSize: 1.7,
  }),
  movement: Object.freeze({
    baseMaximumSpeed: 0.078,
    baseAcceleration: 0.012,
    windupControl: 0.35,
    recoveryControl: 0.22,
    passiveDrag: 0.91,
    stumbleDrag: 0.965,
  }),
  shove: Object.freeze({
    windupTicks: 6,
    activeTicks: 7,
    recoveryTicks: 15,
    cooldownTicks: 66,
    activeSpeed: 0.14,
    reach: 0.18,
    coneCosine: 0.15,
    baseImpulse: 0.105,
    velocityImpulseScale: 0.72,
    maximumImpulse: 0.24,
    stumbleImpulseThreshold: 0.095,
    missedStumbleBaseTicks: 12,
    missedStumbleSpeedTicks: 38,
    hitStumbleTicks: 18,
  }),
  dodge: Object.freeze({
    activeTicks: 8,
    evasionTicks: 5,
    cooldownTicks: 108,
    speed: 0.15,
  }),
  support: Object.freeze({
    graceTicks: 9,
    fallingTicks: 24,
  }),
});

export interface MovementProfile {
  readonly maximumSpeed: number;
  readonly acceleration: number;
}

export function normalizeMassFactor(value: number): number {
  return clamp(value, SIMULATION_TUNING.mass.minimum, SIMULATION_TUNING.mass.maximum);
}

export function getMovementProfile(massFactor: number): MovementProfile {
  const mass = normalizeMassFactor(massFactor);
  const maximumSpeedScale =
    1 + (SIMULATION_TUNING.mass.default - mass) * SIMULATION_TUNING.mass.maximumSpeedSlope;

  return Object.freeze({
    maximumSpeed: SIMULATION_TUNING.movement.baseMaximumSpeed * maximumSpeedScale,
    acceleration: SIMULATION_TUNING.movement.baseAcceleration / mass,
  });
}
