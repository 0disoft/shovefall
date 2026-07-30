import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accumulateSimulationTime,
  createGameSession,
  getHumanPostStepDisposition,
  MAX_SIMULATION_BACKLOG_TICKS,
} from "../src/app/game-session";
import { moveAimTargetWithKeyboard } from "../src/app/action-targeting";
import type { ArenaAimPreview, ArenaRenderer } from "../src/presentation/arena-renderer";
import type { RenderFrameV1 } from "../src/simulation/contracts";
import { normalizeGameConfig } from "../src/simulation/contracts";
import { FIXED_TICKS_PER_SECOND } from "../src/simulation/versions";
import { SimulationWorld } from "../src/simulation/world";
import { DEFAULT_STARTING_ATTRIBUTES } from "../src/simulation/starting-attributes";

afterEach(() => {
  vi.unstubAllGlobals();
});

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
  it("rejects an unaffordable skill before targeting or drawing its range", () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal("window", {
      addEventListener: () => {},
      removeEventListener: () => {},
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      },
      cancelAnimationFrame: () => {},
    });
    vi.stubGlobal("document", {
      addEventListener: () => {},
      removeEventListener: () => {},
      hasFocus: () => true,
      visibilityState: "visible",
    });
    let preview: ArenaAimPreview | null = null;
    let rejection = "";
    const renderer: ArenaRenderer = {
      consumeEvents: () => {},
      destroy: () => {},
      panSpectatorByScreen: () => false,
      render: () => {},
      resetSpectatorCamera: () => {},
      screenToWorld: () => undefined,
      setAimPreview: (nextPreview) => {
        preview = nextPreview;
      },
    };
    const session = createGameSession(renderer, {
      onTelemetry: () => {},
      onEvents: () => {},
      onHumanUpgradeRequested: () => {},
      onHumanEliminated: () => {},
      onRoundCompleted: () => {},
      onPauseChanged: () => {},
      onTargetingChanged: () => {},
      onActionRejected: (message) => {
        rejection = message;
      },
      onFatalError: () => {},
    });
    session.start(
      normalizeGameConfig({ participantCount: 4, itemsEnabled: false }),
      "skill-mana-rejection",
      undefined,
      {
        startingAttributes: DEFAULT_STARTING_ATTRIBUTES,
        startingItems: ["bomb"],
        startingSkills: ["aegis", "arc-bolt"],
      },
    );
    for (const timestamp of [0, 500, 1_000, 1_500]) {
      animationFrames.shift()?.(timestamp);
    }

    session.queueSkillSlot(0);

    expect(session.targeting).toBe(false);
    expect(preview).toBeNull();
    expect(rejection).toBe("마나가 부족해. 38MP가 필요해.");
    session.destroy();
  });

  it("confirms built-in grapple targeting without smart-casting on the first E press", () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal("window", {
      addEventListener: () => {},
      removeEventListener: () => {},
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      },
      cancelAnimationFrame: () => {},
    });
    vi.stubGlobal("document", {
      addEventListener: () => {},
      removeEventListener: () => {},
      hasFocus: () => true,
      visibilityState: "visible",
    });
    let preview: ArenaAimPreview | null = null;
    const eventKinds: string[] = [];
    const renderer: ArenaRenderer = {
      consumeEvents: (events) => eventKinds.push(...events.map(({ kind }) => kind)),
      destroy: () => {},
      panSpectatorByScreen: () => false,
      render: () => {},
      resetSpectatorCamera: () => {},
      screenToWorld: () => preview?.target,
      setAimPreview: (nextPreview) => {
        preview = nextPreview;
      },
    };
    const session = createGameSession(renderer, {
      onTelemetry: () => {},
      onEvents: () => {},
      onHumanUpgradeRequested: () => {},
      onHumanEliminated: () => {},
      onRoundCompleted: () => {},
      onPauseChanged: () => {},
      onTargetingChanged: () => {},
      onFatalError: () => {},
    });
    session.start(normalizeGameConfig({ participantCount: 4, itemsEnabled: false }), "grapple-ui");

    for (const timestamp of [0, 500, 1_000, 1_500]) {
      animationFrames.shift()?.(timestamp);
    }
    session.queueGrapple();
    expect(session.targeting).toBe(true);
    expect(preview).toMatchObject({ targetMode: "direction", visualKind: "grappling-hook" });
    expect(eventKinds).not.toContain("grappling-hook-hit");

    session.confirmTargeting(0, 0);
    expect(session.targeting).toBe(false);
    session.destroy();
  });

  it("moves keyboard aim by direction or one ground tile without moving self casts", () => {
    const diagonalTarget = moveAimTargetWithKeyboard(
      "direction",
      { x: 5, y: 5 },
      { x: 8, y: 5 },
      4.5,
      { x: 1, y: -1 },
    );
    expect(diagonalTarget.x).toBeCloseTo(5 + Math.SQRT1_2 * 3);
    expect(diagonalTarget.y).toBeCloseTo(5 - Math.SQRT1_2 * 3);
    expect(
      moveAimTargetWithKeyboard("ground", { x: 5, y: 5 }, { x: 7.2, y: 6.8 }, 5, {
        x: -1,
        y: 1,
      }),
    ).toEqual({ x: 6.5, y: 7.5 });
    expect(
      moveAimTargetWithKeyboard("self", { x: 5, y: 5 }, { x: 8, y: 8 }, 0, { x: 1, y: 0 }),
    ).toEqual({ x: 5, y: 5 });
  });

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
      stats: Object.freeze({
        power: 0,
        stability: 0,
        mobility: 0,
        reflex: 0,
        vitality: 0,
        focus: 0,
      }),
      skillRanks: Object.freeze([0, 0, 0] as const),
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

    expect(
      getHumanPostStepDisposition(
        createDispositionFrame(
          {
            progression: Object.freeze({
              ...earnedProgression,
              statPoints: 1,
              stats: Object.freeze({
                power: 5,
                stability: 5,
                mobility: 5,
                reflex: 5,
                vitality: 5,
                focus: 5,
              }),
            }),
          },
          activeRound,
        ),
        1,
        true,
        false,
      ),
    ).toBe("continue");
  });
});
