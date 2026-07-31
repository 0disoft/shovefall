import { describe, expect, it } from "vitest";
import {
  assertCurrentBalanceDashboard,
  parseBalanceDashboardData,
  type BalanceDashboardData,
} from "../src/balance/contract";

function createDashboard(): BalanceDashboardData {
  return {
    schemaVersion: "shovefall.balance-dashboard/v1",
    generatedAt: "2026-07-30T00:00:00.000Z",
    source: {
      commitSha: "test",
      dirty: false,
      productVersion: "1.0.0",
      simulationVersion: "2.0.0",
      contentVersion: "3.0.0",
    },
    methodology: {
      mode: "deterministic-paired-seed-bots",
      roundCount: 0,
      participantCount: 60,
      controlledRoundCount: 0,
      productionRoundCount: 0,
      seedFamilyCount: 0,
      workerCount: 1,
      assignment: "test",
      rankTiePolicy: "test",
      limitations: [],
    },
    summary: {
      completedRounds: 0,
      actorRounds: 0,
      flaggedCount: 0,
      elapsedWallSeconds: 0,
    },
    phases: [
      {
        phase: "controlled",
        roundCount: 0,
        actorRounds: 0,
        reasonCounts: { "last-standing": 0, "no-survivors": 0, "time-limit": 0 },
        durationSeconds: { minimum: 0, mean: 0, p50: 0, p95: 0, maximum: 0 },
        deathCauses: { fall: 0, health: 0, bomb: 0, other: 0 },
        aggregates: [],
        rounds: [],
      },
      {
        phase: "production",
        roundCount: 0,
        actorRounds: 0,
        reasonCounts: { "last-standing": 0, "no-survivors": 0, "time-limit": 0 },
        durationSeconds: { minimum: 0, mean: 0, p50: 0, p95: 0, maximum: 0 },
        deathCauses: { fall: 0, health: 0, bomb: 0, other: 0 },
        aggregates: [],
        rounds: [],
      },
    ],
  };
}

describe("balance dashboard contract", () => {
  it("accepts a snapshot only when all source versions match", () => {
    const dashboard = parseBalanceDashboardData(createDashboard());

    expect(() =>
      assertCurrentBalanceDashboard(dashboard, {
        productVersion: "1.0.0",
        simulationVersion: "2.0.0",
        contentVersion: "3.0.0",
      }),
    ).not.toThrow();
  });

  it("rejects a stale snapshot before rendering its statistics", () => {
    const dashboard = parseBalanceDashboardData(createDashboard());

    expect(() =>
      assertCurrentBalanceDashboard(dashboard, {
        productVersion: "1.0.1",
        simulationVersion: "2.0.0",
        contentVersion: "3.0.0",
      }),
    ).toThrow(/다른 버전의 통계/u);
  });
});
