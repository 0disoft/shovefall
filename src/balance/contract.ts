export const BALANCE_DASHBOARD_SCHEMA_VERSION = "shovefall.balance-dashboard/v1";

export type BalancePhase = "controlled" | "production";
export type BalanceCategory = "attribute" | "skill" | "item" | "personality" | "skill-combination";

export type BalanceDeathCause = "fall" | "health" | "bomb" | "rock" | "other";
export type BalanceSignal = "buff-review" | "watch" | "high-variance" | "nerf-review";

export interface BalanceInterval {
  readonly lower: number;
  readonly upper: number;
}

export interface BalanceAggregate {
  readonly category: BalanceCategory;
  readonly id: string;
  readonly label: string;
  readonly exposures: number;
  readonly wins: number;
  readonly winRate: number;
  readonly winRate95: BalanceInterval;
  readonly winIndex: number;
  readonly averageRank: number;
  readonly top10Rate: number;
  readonly top5Rate: number;
  readonly averageSurvivalSeconds: number;
  readonly eliminationsPerRound: number;
  readonly damageDealtPerRound: number;
  readonly usesPerRound: number;
  readonly hitsPerUse: number | null;
  readonly signal: BalanceSignal;
}

export interface BalanceRoundRecord {
  readonly index: number;
  readonly seedFamily: number;
  readonly assignmentPass: number;
  readonly seed: string;
  readonly durationSeconds: number;
  readonly reason: "last-standing" | "no-survivors" | "time-limit";
  readonly winnerActorId: number | null;
  readonly winnerPersonality: string | null;
  readonly stateHash: string;
}

export interface BalancePhaseReport {
  readonly phase: BalancePhase;
  readonly roundCount: number;
  readonly actorRounds: number;
  readonly reasonCounts: Readonly<Record<BalanceRoundRecord["reason"], number>>;
  readonly durationSeconds: {
    readonly minimum: number;
    readonly mean: number;
    readonly p50: number;
    readonly p95: number;
    readonly maximum: number;
  };
  readonly deathCauses: Readonly<Record<BalanceDeathCause, number>>;
  readonly aggregates: readonly BalanceAggregate[];
  readonly rounds: readonly BalanceRoundRecord[];
}

export interface BalanceDashboardData {
  readonly schemaVersion: typeof BALANCE_DASHBOARD_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly source: {
    readonly commitSha: string;
    readonly dirty: boolean;
    readonly productVersion: string;
    readonly simulationVersion: string;
    readonly contentVersion: string;
  };
  readonly methodology: {
    readonly mode: "deterministic-paired-seed-bots";
    readonly roundCount: number;
    readonly participantCount: number;
    readonly controlledRoundCount: number;
    readonly productionRoundCount: number;
    readonly seedFamilyCount: number;
    readonly workerCount: number;
    readonly assignment: string;
    readonly rankTiePolicy: string;
    readonly limitations: readonly string[];
  };
  readonly summary: {
    readonly completedRounds: number;
    readonly actorRounds: number;
    readonly flaggedCount: number;
    readonly elapsedWallSeconds: number;
  };
  readonly phases: readonly BalancePhaseReport[];
}

export interface BalanceSourceVersions {
  readonly productVersion: string;
  readonly simulationVersion: string;
  readonly contentVersion: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function validateAggregate(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  requireString(value.id, `${path}.id`);
  requireString(value.label, `${path}.label`);
  requireFiniteNumber(value.exposures, `${path}.exposures`);
  requireFiniteNumber(value.averageRank, `${path}.averageRank`);
  requireFiniteNumber(value.winRate, `${path}.winRate`);
  requireFiniteNumber(value.top10Rate, `${path}.top10Rate`);
  requireFiniteNumber(value.top5Rate, `${path}.top5Rate`);
}

export function parseBalanceDashboardData(value: unknown): BalanceDashboardData {
  if (!isRecord(value)) {
    throw new Error("balance dashboard payload must be an object");
  }
  if (value.schemaVersion !== BALANCE_DASHBOARD_SCHEMA_VERSION) {
    throw new Error("balance dashboard schemaVersion is unsupported");
  }
  if (!isRecord(value.source)) {
    throw new Error("balance dashboard must contain source versions");
  }
  requireString(value.source.productVersion, "balance dashboard source.productVersion");
  requireString(value.source.simulationVersion, "balance dashboard source.simulationVersion");
  requireString(value.source.contentVersion, "balance dashboard source.contentVersion");
  if (!isRecord(value.methodology) || typeof value.methodology.roundCount !== "number") {
    throw new Error("balance dashboard must contain a valid methodology");
  }
  const workerCount = requireFiniteNumber(
    value.methodology.workerCount,
    "balance dashboard methodology.workerCount",
  );
  if (!Number.isSafeInteger(workerCount) || workerCount < 1 || workerCount > 8) {
    throw new Error("balance dashboard methodology.workerCount must be an integer from 1 to 8");
  }
  if (!isRecord(value.summary) || typeof value.summary.completedRounds !== "number") {
    throw new Error("balance dashboard must contain completed rounds");
  }
  if (!Array.isArray(value.phases) || value.phases.length !== 2) {
    throw new Error("balance dashboard must contain controlled and production phases");
  }

  for (const [phaseIndex, phase] of value.phases.entries()) {
    if (!isRecord(phase)) {
      throw new Error(`phases[${phaseIndex}] must be an object`);
    }
    if (phase.phase !== "controlled" && phase.phase !== "production") {
      throw new Error(`phases[${phaseIndex}].phase is invalid`);
    }
    if (!Array.isArray(phase.aggregates) || !Array.isArray(phase.rounds)) {
      throw new Error(`phases[${phaseIndex}] must contain aggregate and round arrays`);
    }
    phase.aggregates.forEach((aggregate, aggregateIndex) =>
      validateAggregate(aggregate, `phases[${phaseIndex}].aggregates[${aggregateIndex}]`),
    );
    const seeds = new Set<string>();
    for (const [roundIndex, round] of phase.rounds.entries()) {
      if (!isRecord(round)) {
        throw new Error(`phases[${phaseIndex}].rounds[${roundIndex}] must be an object`);
      }
      const seed = requireString(round.seed, `phases[${phaseIndex}].rounds[${roundIndex}].seed`);
      const assignmentPass = requireFiniteNumber(
        round.assignmentPass,
        `phases[${phaseIndex}].rounds[${roundIndex}].assignmentPass`,
      );
      const pairKey = `${seed}:${assignmentPass}`;
      if (seeds.has(pairKey)) {
        throw new Error(`duplicate balance round ${pairKey}`);
      }
      seeds.add(pairKey);
    }
  }

  return value as unknown as BalanceDashboardData;
}

export function assertCurrentBalanceDashboard(
  dashboard: BalanceDashboardData,
  current: BalanceSourceVersions,
): void {
  const source = dashboard.source;
  if (
    source.productVersion !== current.productVersion ||
    source.simulationVersion !== current.simulationVersion ||
    source.contentVersion !== current.contentVersion
  ) {
    throw new Error("현재 게임과 다른 버전의 통계다. 통계를 다시 실행해 줘.");
  }
}
