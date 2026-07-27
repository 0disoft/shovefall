import type { ParticipantProgression, ParticipantStats, UpgradeStatId } from "./contracts";

export const UPGRADE_STAT_IDS = [
  "power",
  "stability",
  "mobility",
  "reflex",
  "vitality",
  "focus",
] as const;
export const MAX_UPGRADE_LEVEL = 5;
export const MAX_UPGRADE_PLAN_STEPS = UPGRADE_STAT_IDS.length * MAX_UPGRADE_LEVEL;
export const DEFAULT_UPGRADE_PLAN: readonly UpgradeStatId[] = Object.freeze(
  Array.from({ length: MAX_UPGRADE_LEVEL }, () => UPGRADE_STAT_IDS).flat(),
);

export const UPGRADE_EFFECTS = Object.freeze({
  powerImpulsePerLevel: 0.08,
  stabilityImpulseReductionPerLevel: 0.12,
  stabilityDamageReductionPerLevel: 0.05,
  mobilitySpeedPerLevel: 0.05,
  reflexCooldownTicksPerLevel: 5,
  vitalityHealthPerLevel: 12,
  vitalityRegenPerLevel: 0.1,
  focusManaPerLevel: 10,
  focusRegenPerLevel: 0.12,
});

const ZERO_STATS: ParticipantStats = Object.freeze({
  power: 0,
  stability: 0,
  mobility: 0,
  reflex: 0,
  vitality: 0,
  focus: 0,
});

export function createParticipantProgression(): ParticipantProgression {
  return Object.freeze({
    statPoints: 0,
    creditedEliminations: 0,
    stats: ZERO_STATS,
    skillRanks: Object.freeze([0, 0, 0] as const),
  });
}

export const MAX_SKILL_RANK = 3;

export const ROOT_UPGRADE_STAT_IDS = Object.freeze([
  "power",
  "mobility",
  "vitality",
] as const satisfies readonly UpgradeStatId[]);

export const STAT_TREE_PARENTS: Readonly<Record<UpgradeStatId, readonly UpgradeStatId[]>> =
  Object.freeze({
    power: Object.freeze([]),
    mobility: Object.freeze([]),
    vitality: Object.freeze([]),
    stability: Object.freeze(["power"] as const),
    reflex: Object.freeze(["mobility"] as const),
    focus: Object.freeze(["vitality"] as const),
  });

const SKILL_BRANCH_STATS = Object.freeze([
  Object.freeze({ root: "power", branch: "stability" } as const),
  Object.freeze({ root: "mobility", branch: "reflex" } as const),
  Object.freeze({ root: "vitality", branch: "focus" } as const),
] as const);

export function isStatTreeNodeUnlocked(
  progression: ParticipantProgression,
  stat: UpgradeStatId,
): boolean {
  const parents = STAT_TREE_PARENTS[stat];
  return parents.every((parent) => progression.stats[parent] > 0);
}

export function canSpendStatPoint(
  progression: ParticipantProgression,
  stat: UpgradeStatId,
): boolean {
  return progression.statPoints > 0 && progression.stats[stat] < MAX_UPGRADE_LEVEL;
}

export function isSkillTreeRankUnlocked(
  progression: ParticipantProgression,
  slotIndex: 0 | 1 | 2,
): boolean {
  const currentRank = progression.skillRanks[slotIndex];

  if (currentRank >= MAX_SKILL_RANK) {
    return false;
  }

  const requiredLevel = currentRank + 1;
  const { root, branch } = SKILL_BRANCH_STATS[slotIndex];
  const branchReady =
    progression.stats[root] >= requiredLevel && progression.stats[branch] >= requiredLevel;

  if (!branchReady) {
    return false;
  }

  return (
    requiredLevel < MAX_SKILL_RANK ||
    progression.skillRanks.some((rank, index) => index !== slotIndex && rank > 0)
  );
}

export function canSpendSkillPoint(
  progression: ParticipantProgression,
  slotIndex: 0 | 1 | 2,
): boolean {
  const currentRank = progression.skillRanks[slotIndex];
  return (
    progression.statPoints > 0 &&
    currentRank < MAX_SKILL_RANK &&
    isSkillTreeRankUnlocked(progression, slotIndex)
  );
}

export function spendSkillPoint(
  progression: ParticipantProgression,
  slotIndex: 0 | 1 | 2,
): ParticipantProgression | undefined {
  const currentRank = progression.skillRanks[slotIndex];
  if (!canSpendSkillPoint(progression, slotIndex)) {
    return undefined;
  }

  const skillRanks = [...progression.skillRanks] as [number, number, number];
  skillRanks[slotIndex] = currentRank + 1;
  return Object.freeze({
    ...progression,
    statPoints: progression.statPoints - 1,
    skillRanks: Object.freeze(skillRanks),
  });
}

export function getSkillCooldownMultiplier(rank: number): number {
  return Math.max(0.7, 1 - rank * 0.1);
}

export function getSkillManaMultiplier(rank: number): number {
  return Math.max(0.76, 1 - rank * 0.08);
}

export function getSkillDamageMultiplier(rank: number): number {
  return 1 + rank * 0.15;
}

export function getSkillDurationMultiplier(rank: number): number {
  return 1 + rank * 0.12;
}

export function getSkillImpulseMultiplier(rank: number): number {
  return 1 + rank * 0.08;
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
  if (!canSpendStatPoint(progression, stat)) {
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

export function getDamageTakenMultiplier(stats: ParticipantStats): number {
  return Math.max(0.75, 1 - stats.stability * UPGRADE_EFFECTS.stabilityDamageReductionPerLevel);
}

export function getMobilityMultiplier(stats: ParticipantStats): number {
  return 1 + stats.mobility * UPGRADE_EFFECTS.mobilitySpeedPerLevel;
}

export function getReflexCooldownReduction(stats: ParticipantStats): number {
  return stats.reflex * UPGRADE_EFFECTS.reflexCooldownTicksPerLevel;
}

export function getMaximumHealth(stats: ParticipantStats): number {
  return 100 + stats.vitality * UPGRADE_EFFECTS.vitalityHealthPerLevel;
}

export function getHealthRegenMultiplier(stats: ParticipantStats): number {
  return 1 + stats.vitality * UPGRADE_EFFECTS.vitalityRegenPerLevel;
}

export function getMaximumMana(stats: ParticipantStats): number {
  return 100 + stats.focus * UPGRADE_EFFECTS.focusManaPerLevel;
}

export function getManaRegenMultiplier(stats: ParticipantStats): number {
  return 1 + stats.focus * UPGRADE_EFFECTS.focusRegenPerLevel;
}
