import { describe, expect, it } from "vitest";
import {
  accumulateSimulationTime,
  getHumanPostStepDisposition,
  MAX_SIMULATION_BACKLOG_TICKS,
} from "../src/app/game-session";
import type { RenderFrameV1 } from "../src/simulation/contracts";
import { normalizeGameConfig } from "../src/simulation/contracts";
import { FIXED_TICKS_PER_SECOND } from "../src/simulation/versions";
import { SimulationWorld } from "../src/simulation/world";

function createDispositionFrame(
  participant: Partial<RenderFrameV1["participants"][number]>,
  round: RenderFrameV1["round"],
): RenderFrameV1 {
  const base = new SimulationWorld(
    normalizeGameConfig({ participantCount: 4 }),
    "session-disposition",
  ).createRenderFrame();
  const human = base.participants.find(({ actorId }) => actorId === 1);

  if (human === undefined) {
    throw new Error("Expected the session fixture to contain the human actor.");
  }

  return Object.freeze({
    ...base,
    participants: Object.freeze([
      Object.freeze({ ...human, ...participant }),
      ...base.participants.filter(({ actorId }) => actorId !== 1),
    ]),
    round,
  });
}

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

  it("prioritizes terminal round and human states over a same-tick upgrade reward", () => {
    const activeRound = Object.freeze({
      status: "Active" as const,
      winnerActorId: null,
      reason: null,
      completedTick: null,
    });
    const completedRound = Object.freeze({
      status: "Completed" as const,
      winnerActorId: 2,
      reason: "last-standing" as const,
      completedTick: 301,
    });
    const earnedProgression = Object.freeze({
      statPoints: 2,
      creditedEliminations: 2,
      stats: Object.freeze({ power: 0, stability: 0, mobility: 0, reflex: 0 }),
    });

    expect(
      getHumanPostStepDisposition(
        createDispositionFrame(
          { active: false, action: "Eliminated", progression: earnedProgression },
          activeRound,
        ),
        1,
        true,
        false,
      ),
    ).toBe("human-eliminated");
    expect(
      getHumanPostStepDisposition(
        createDispositionFrame(
          { active: false, action: "Eliminated", progression: earnedProgression },
          completedRound,
        ),
        1,
        true,
        false,
      ),
    ).toBe("round-completed");
    expect(
      getHumanPostStepDisposition(
        createDispositionFrame({ progression: earnedProgression }, activeRound),
        1,
        true,
        false,
      ),
    ).toBe("upgrade-requested");
  });
});
