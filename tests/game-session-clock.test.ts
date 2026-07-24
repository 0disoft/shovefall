import { describe, expect, it } from "vitest";
import { accumulateSimulationTime, MAX_SIMULATION_BACKLOG_TICKS } from "../src/app/game-session";
import { FIXED_TICKS_PER_SECOND } from "../src/simulation/versions";

describe("browser simulation clock", () => {
  it("keeps ordinary elapsed time without inventing catch-up work", () => {
    expect(accumulateSimulationTime(5, 10, 1)).toBe(15);
    expect(accumulateSimulationTime(5, -10, 1)).toBe(5);
  });

  it("drops stale wall-clock debt before it can create a spiral of death", () => {
    const maximumDebtMilliseconds = (MAX_SIMULATION_BACKLOG_TICKS * 1_000) / FIXED_TICKS_PER_SECOND;

    expect(accumulateSimulationTime(0, 10_000, 1)).toBeCloseTo(maximumDebtMilliseconds);
    expect(accumulateSimulationTime(0, 10_000, 6)).toBeCloseTo(maximumDebtMilliseconds);
  });
});
