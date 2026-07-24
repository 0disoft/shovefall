import type { ParticipantProgression, ParticipantStats, UpgradeStatId } from "./contracts";

export const UPGRADE_STAT_IDS = ["power", "stability", "mobility", "reflex"] as const;
export const MAX_UPGRADE_LEVEL = 5;
export const MAX_UPGRADE_PLAN_STEPS = UPGRADE_STAT_IDS.length * MAX_UPGRADE_LEVEL;
export const DEFAULT_UPGRADE_PLAN: readonly UpgradeStatId[] = Object.freeze(
  Array.from({ length: MAX_UPGRADE_LEVEL }, () => UPGRADE_STAT_IDS).flat(),
);

export const UPGRADE_EFFECTS = Object.freeze({
  powerImpulsePerLevel: 0.08,
  stabilityImpulseReductionPerLevel: 0.12,
  mobilitySpeedPerLevel: 0.05,
  reflexCooldownTicksPerLevel: 5,
});

const ZERO_STATS: ParticipantStats = Object.freeze({
  power: 0,
  stability: 0,
  mobility: 0,
  reflex: 0,
});

export function createParticipantProgression(): ParticipantProgression {
  return Object.freeze({
    statPoints: 0,
    creditedEliminations: 0,
    stats: ZERO_STATS,
  });
}

export function isUpgradeStatId(value: unknown): value is UpgradeStatId {
  return typeof value === "string" && UPGRADE_STAT_IDS.some((stat) => stat === value);
}

export function normalizeUpgradePlan(
  values: readonly unknown[] | undefined,
): readonly UpgradeStatId[] {
  if (values === undefined) {
    return DEFAULT_UPGRADE_PLAN;
  }

  const counts = new Map<UpgradeStatId, number>();
  const normalized: UpgradeStatId[] = [];

  for (const value of values ?? []) {
    if (!isUpgradeStatId(value) || normalized.length >= MAX_UPGRADE_PLAN_STEPS) {
      continue;
    }

    const count = counts.get(value) ?? 0;

    if (count >= MAX_UPGRADE_LEVEL) {
      continue;
    }

    counts.set(value, count + 1);
    normalized.push(value);
  }

  return Object.freeze(normalized);
}

export function getNextPlannedUpgrade(
  progression: ParticipantProgression,
  plan: readonly UpgradeStatId[],
): UpgradeStatId | null {
  if (progression.statPoints < 1) {
    return null;
  }

  const spentLevels = UPGRADE_STAT_IDS.reduce((total, stat) => total + progression.stats[stat], 0);

  for (let index = spentLevels; index < plan.length; index += 1) {
    const stat = plan[index];

    if (stat !== undefined && progression.stats[stat] < MAX_UPGRADE_LEVEL) {
      return stat;
    }
  }

  return null;
}

export function awardStatPoint(progression: ParticipantProgression): ParticipantProgression {
  return Object.freeze({
    ...progression,
    statPoints: progression.statPoints + 1,
    creditedEliminations: progression.creditedEliminations + 1,
  });
}

export function spendStatPoint(
  progression: ParticipantProgression,
  stat: UpgradeStatId,
): ParticipantProgression | undefined {
  if (progression.statPoints < 1 || progression.stats[stat] >= MAX_UPGRADE_LEVEL) {
    return undefined;
  }

  return Object.freeze({
    ...progression,
    statPoints: progression.statPoints - 1,
    stats: Object.freeze({
      ...progression.stats,
      [stat]: progression.stats[stat] + 1,
    }),
  });
}

export function getPowerMultiplier(stats: ParticipantStats): number {
  return 1 + stats.power * UPGRADE_EFFECTS.powerImpulsePerLevel;
}

export function getStabilityMultiplier(stats: ParticipantStats): number {
  return Math.max(0.5, 1 - stats.stability * UPGRADE_EFFECTS.stabilityImpulseReductionPerLevel);
}

export function getMobilityMultiplier(stats: ParticipantStats): number {
  return 1 + stats.mobility * UPGRADE_EFFECTS.mobilitySpeedPerLevel;
}

export function getReflexCooldownReduction(stats: ParticipantStats): number {
  return stats.reflex * UPGRADE_EFFECTS.reflexCooldownTicksPerLevel;
}
