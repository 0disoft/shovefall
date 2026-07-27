import { describe, expect, it } from "vitest";
import { RoundStatisticsTracker } from "../src/app/round-statistics";
import { normalizeGameConfig, type SimulationEventV1 } from "../src/simulation/contracts";
import { SimulationWorld } from "../src/simulation/world";

describe("round statistics", () => {
  it("accumulates movement, combat, shield absorption, slow time, and skill uses", () => {
    const tracker = new RoundStatisticsTracker();
    const previousFrame = new SimulationWorld(
      normalizeGameConfig({ participantCount: 4 }),
      "round-statistics",
    ).createRenderFrame();
    const human = previousFrame.participants.find(({ actorId }) => actorId === 1);

    expect(human).toBeDefined();

    if (human === undefined) {
      throw new Error("Round statistics test requires the human participant.");
    }

    const frame = Object.freeze({
      ...previousFrame,
      tick: previousFrame.tick + 1,
      participants: Object.freeze(
        previousFrame.participants.map((participant) =>
          participant.actorId === 1
            ? Object.freeze({
                ...participant,
                position: Object.freeze({
                  x: participant.position.x + 0.3,
                  y: participant.position.y + 0.4,
                }),
                combat: Object.freeze({
                  ...participant.combat,
                  slowedUntilTick: previousFrame.tick + 30,
                }),
              })
            : participant,
        ),
      ),
    });
    const events: readonly SimulationEventV1[] = Object.freeze([
      Object.freeze({
        eventVersion: 1,
        roundId: frame.roundId,
        tick: frame.tick,
        sequence: 0,
        kind: "skill-used",
        actorId: 1,
        skillDefinitionId: "force-palm",
      }),
      Object.freeze({
        eventVersion: 1,
        roundId: frame.roundId,
        tick: frame.tick,
        sequence: 1,
        kind: "damage-applied",
        actorId: 1,
        targetActorId: 2,
        amount: 18,
        absorbedAmount: 0,
      }),
      Object.freeze({
        eventVersion: 1,
        roundId: frame.roundId,
        tick: frame.tick,
        sequence: 2,
        kind: "damage-applied",
        actorId: 2,
        targetActorId: 1,
        amount: 7,
        absorbedAmount: 5,
      }),
    ]);

    tracker.recordStep(previousFrame, frame, events, 1);
    const statistics = tracker.snapshot();

    expect(statistics.distanceMoved).toBeCloseTo(0.5);
    expect(statistics).toMatchObject({
      damageDealt: 18,
      damageTaken: 7,
      damageBlocked: 5,
      slowedTicks: 1,
    });
    expect(statistics.skillUses["force-palm"]).toBe(1);
  });

  it("resets every accumulated field for a fresh round", () => {
    const tracker = new RoundStatisticsTracker();
    tracker.reset();

    expect(tracker.snapshot()).toMatchObject({
      distanceMoved: 0,
      damageDealt: 0,
      damageTaken: 0,
      damageBlocked: 0,
      slowedTicks: 0,
    });
  });
});
