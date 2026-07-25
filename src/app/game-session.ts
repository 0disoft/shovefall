import { createKeyboardInput, type KeyboardInput } from "./keyboard-input";
import { createGamepadInput, type GamepadInput } from "./gamepad-input";
import { BotDirector } from "../ai/bot-director";
import { createBotLoadoutAssignments } from "../ai/bot-loadouts";
import type {
  GameConfigV1,
  ItemDefinitionId,
  RenderFrameV1,
  RenderParticipantV1,
  SimulationEventV1,
  UpgradeStatId,
} from "../simulation/contracts";
import { MAX_UPGRADE_LEVEL } from "../simulation/progression";
import { clamp } from "../simulation/math";
import { FIXED_TICKS_PER_SECOND } from "../simulation/versions";
import { SimulationWorld } from "../simulation/world";
import type { GameplayTuningInput } from "../simulation/tuning";
import type { ArenaRenderer } from "../presentation/arena-renderer";

const FIXED_STEP_MILLISECONDS = 1_000 / FIXED_TICKS_PER_SECOND;
const MAX_STEPS_PER_RENDER = 8;
export const MAX_SIMULATION_BACKLOG_TICKS = MAX_STEPS_PER_RENDER * 2;
const MAX_SIMULATION_BACKLOG_MILLISECONDS = FIXED_STEP_MILLISECONDS * MAX_SIMULATION_BACKLOG_TICKS;
const HUMAN_ACTOR_ID = 1;
const POST_HUMAN_ELIMINATION_RATE = 6;
const COUNTDOWN_STEP_MILLISECONDS = 500;

export type RoundCountdownValue = 3 | 2 | 1 | null;

export interface SessionTelemetry {
  readonly frame: RenderFrameV1;
  readonly interpolationAlpha: number;
  readonly backlogTicks: number;
  readonly paused: boolean;
  readonly masterSeed: string;
  readonly simulationRate: number;
  readonly countdown: RoundCountdownValue;
}

export interface GameSessionHooks {
  readonly onTelemetry: (telemetry: SessionTelemetry) => void;
  readonly onEvents: (events: readonly SimulationEventV1[]) => void;
  readonly onHumanUpgradeRequested: (frame: RenderFrameV1) => void;
  readonly onHumanEliminated: () => void;
  readonly onRoundCompleted: (frame: RenderFrameV1) => void;
  readonly onPauseChanged: (paused: boolean) => void;
  readonly onFatalError: (error: unknown) => void;
}

export interface GameSession {
  readonly active: boolean;
  chooseUpgrade(stat: UpgradeStatId): boolean;
  queueDodge(): void;
  queueItemSlot(slotIndex: 0 | 1): void;
  queueShove(): void;
  failForDiagnostics(error: unknown): void;
  setPointerMovement(x: number, y: number): void;
  setRendererAvailable(available: boolean): void;
  start(
    config: GameConfigV1,
    masterSeed: string | number,
    gameplayTuning?: GameplayTuningInput,
    humanLoadout?: {
      readonly massFactor: number;
      readonly startingItems: readonly ItemDefinitionId[];
    },
  ): void;
  stop(): void;
  destroy(): void;
}

export type HumanPostStepDisposition =
  | "continue"
  | "human-eliminated"
  | "round-completed"
  | "upgrade-requested";

function canSpendHumanStatPoint(participant: RenderParticipantV1 | undefined): boolean {
  return (
    participant?.active === true &&
    participant.action !== "Falling" &&
    participant.action !== "Eliminated" &&
    participant.progression.statPoints > 0 &&
    Object.values(participant.progression.stats).some((level) => level < MAX_UPGRADE_LEVEL)
  );
}

export function getHumanPostStepDisposition(
  frame: RenderFrameV1,
  humanActorId: number,
  upgradeSignal: boolean,
  humanAlreadyEliminated: boolean,
): HumanPostStepDisposition {
  if (frame.round.status === "Completed") {
    return "round-completed";
  }

  const human = frame.participants.find(({ actorId }) => actorId === humanActorId);

  if (
    !humanAlreadyEliminated &&
    (human === undefined ||
      !human.active ||
      human.action === "Falling" ||
      human.action === "Eliminated")
  ) {
    return "human-eliminated";
  }

  if (!humanAlreadyEliminated && upgradeSignal && canSpendHumanStatPoint(human)) {
    return "upgrade-requested";
  }

  return "continue";
}

export function accumulateSimulationTime(
  currentMilliseconds: number,
  elapsedMilliseconds: number,
  simulationRate: number,
): number {
  return Math.min(
    MAX_SIMULATION_BACKLOG_MILLISECONDS,
    currentMilliseconds + Math.max(0, elapsedMilliseconds) * simulationRate,
  );
}

export function createGameSession(renderer: ArenaRenderer, hooks: GameSessionHooks): GameSession {
  let world: SimulationWorld | undefined;
  let bots: BotDirector | undefined;
  let latestFrame: RenderFrameV1 | undefined;
  let animationFrameId: number | undefined;
  let previousTimestamp: number | undefined;
  let accumulatorMilliseconds = 0;
  let active = false;
  let paused = false;
  let currentSeed = "not-started";
  let humanEliminated = false;
  let nextRoundId = 1;
  let rendererAvailable = true;
  let countdown: RoundCountdownValue = null;
  let countdownElapsedMilliseconds = 0;
  let awaitingHumanUpgrade = false;
  let pendingHumanUpgrade: UpgradeStatId | null = null;
  const keyboard: KeyboardInput = createKeyboardInput({
    isCommandActive: () => active && !paused && countdown === null && !humanEliminated,
    isMovementWarmupActive: () => active && !paused && countdown !== null && !humanEliminated,
  });
  const gamepad: GamepadInput = createGamepadInput();

  const publishFrame = (): void => {
    if (world === undefined || latestFrame === undefined) {
      return;
    }

    const interpolationAlpha = clamp(accumulatorMilliseconds / FIXED_STEP_MILLISECONDS, 0, 1);
    renderer.render(latestFrame, interpolationAlpha, HUMAN_ACTOR_ID);
    hooks.onTelemetry(
      Object.freeze({
        frame: latestFrame,
        interpolationAlpha,
        backlogTicks: Math.floor(accumulatorMilliseconds / FIXED_STEP_MILLISECONDS),
        paused,
        masterSeed: currentSeed,
        simulationRate: humanEliminated ? POST_HUMAN_ELIMINATION_RATE : 1,
        countdown,
      }),
    );
  };

  const schedule = (): void => {
    animationFrameId = window.requestAnimationFrame(runFrame);
  };

  const runFrame = (timestamp: number): void => {
    if (!active || world === undefined) {
      return;
    }

    if (paused) {
      previousTimestamp = timestamp;
      publishFrame();
      schedule();
      return;
    }

    if (countdown !== null) {
      if (previousTimestamp !== undefined) {
        countdownElapsedMilliseconds += Math.max(0, timestamp - previousTimestamp);
      }

      previousTimestamp = timestamp;
      countdown =
        countdownElapsedMilliseconds < COUNTDOWN_STEP_MILLISECONDS
          ? 3
          : countdownElapsedMilliseconds < COUNTDOWN_STEP_MILLISECONDS * 2
            ? 2
            : countdownElapsedMilliseconds < COUNTDOWN_STEP_MILLISECONDS * 3
              ? 1
              : null;
      publishFrame();
      schedule();
      return;
    }

    if (previousTimestamp === undefined) {
      previousTimestamp = timestamp;
    } else {
      accumulatorMilliseconds = accumulateSimulationTime(
        accumulatorMilliseconds,
        timestamp - previousTimestamp,
        humanEliminated ? POST_HUMAN_ELIMINATION_RATE : 1,
      );
      previousTimestamp = timestamp;
    }

    try {
      let steps = 0;

      while (accumulatorMilliseconds >= FIXED_STEP_MILLISECONDS && steps < MAX_STEPS_PER_RENDER) {
        if (humanEliminated) {
          gamepad.clear(keyboard.state);
        } else {
          gamepad.sample(keyboard.state);
        }
        const inputCommand = keyboard.state.consumeCommand(world.tick, HUMAN_ACTOR_ID);
        const requestedUpgrade = pendingHumanUpgrade;
        pendingHumanUpgrade = null;
        const result = world.step([
          Object.freeze({ ...inputCommand, upgradeStat: requestedUpgrade }),
          ...(bots?.createCommands(world.tick, latestFrame ?? world.createRenderFrame()) ?? []),
        ]);
        latestFrame = result.frame;
        renderer.consumeEvents(result.events, result.frame);
        hooks.onEvents(result.events);
        accumulatorMilliseconds -= FIXED_STEP_MILLISECONDS;
        steps += 1;

        const earnedHumanPoint = result.events.some(
          ({ kind, actorId }) => kind === "stat-point-earned" && actorId === HUMAN_ACTOR_ID,
        );
        const disposition = getHumanPostStepDisposition(
          result.frame,
          HUMAN_ACTOR_ID,
          earnedHumanPoint || requestedUpgrade !== null,
          humanEliminated,
        );

        if (disposition === "round-completed") {
          active = false;
          keyboard.state.clear();
          gamepad.clear(keyboard.state);
          animationFrameId = undefined;
          publishFrame();
          hooks.onRoundCompleted(result.frame);
          return;
        }

        if (disposition === "human-eliminated") {
          humanEliminated = true;
          awaitingHumanUpgrade = false;
          pendingHumanUpgrade = null;
          keyboard.state.clear();
          gamepad.clear(keyboard.state);
          hooks.onHumanEliminated();
        } else if (disposition === "upgrade-requested") {
          awaitingHumanUpgrade = true;
          paused = true;
          previousTimestamp = undefined;
          accumulatorMilliseconds = 0;
          keyboard.state.clear();
          gamepad.clear(keyboard.state);
          hooks.onPauseChanged(true);
          hooks.onHumanUpgradeRequested(result.frame);
          publishFrame();
          schedule();
          return;
        }
      }

      publishFrame();
      schedule();
    } catch (error: unknown) {
      fail(error);
    }
  };

  const setPaused = (nextPaused: boolean): void => {
    if (!nextPaused && awaitingHumanUpgrade) {
      return;
    }

    if (!active || paused === nextPaused) {
      return;
    }

    paused = nextPaused;
    previousTimestamp = undefined;
    keyboard.state.clear();
    gamepad.clear(keyboard.state);
    hooks.onPauseChanged(paused);
    publishFrame();
  };

  const handleWindowBlur = (): void => setPaused(true);
  const handleWindowFocus = (): void => {
    if (document.visibilityState === "visible" && rendererAvailable) {
      setPaused(false);
    }
  };
  const handleVisibilityChange = (): void =>
    setPaused(document.visibilityState !== "visible" || !rendererAvailable);

  const fail = (error: unknown): void => {
    active = false;
    keyboard.state.clear();
    gamepad.clear(keyboard.state);

    if (animationFrameId !== undefined) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = undefined;
    }

    hooks.onFatalError(error);
  };

  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("focus", handleWindowFocus);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return {
    get active(): boolean {
      return active;
    },
    chooseUpgrade(stat: UpgradeStatId): boolean {
      const human = latestFrame?.participants.find(
        (participant) => participant.actorId === HUMAN_ACTOR_ID,
      );

      if (
        !active ||
        !awaitingHumanUpgrade ||
        human === undefined ||
        !canSpendHumanStatPoint(human) ||
        human.progression.stats[stat] >= MAX_UPGRADE_LEVEL
      ) {
        return false;
      }

      pendingHumanUpgrade = stat;
      awaitingHumanUpgrade = false;
      paused = document.visibilityState !== "visible" || !rendererAvailable;
      previousTimestamp = undefined;
      keyboard.state.clear();
      gamepad.clear(keyboard.state);
      hooks.onPauseChanged(paused);
      publishFrame();
      return true;
    },
    failForDiagnostics(error: unknown): void {
      fail(error);
    },
    setRendererAvailable(available: boolean): void {
      rendererAvailable = available;
      setPaused(!rendererAvailable || document.visibilityState !== "visible");
    },
    start(
      config: GameConfigV1,
      masterSeed: string | number,
      gameplayTuning?: GameplayTuningInput,
      humanLoadout?: {
        readonly massFactor: number;
        readonly startingItems: readonly ItemDefinitionId[];
      },
    ): void {
      if (animationFrameId !== undefined) {
        window.cancelAnimationFrame(animationFrameId);
      }

      const botLoadouts = createBotLoadoutAssignments(
        masterSeed,
        config.participantCount,
        HUMAN_ACTOR_ID,
      );
      world = new SimulationWorld(config, masterSeed, {
        roundId: nextRoundId,
        humanActorId: HUMAN_ACTOR_ID,
        ...(gameplayTuning === undefined ? {} : { gameplayTuning }),
        participantOverrides: [
          ...(humanLoadout === undefined
            ? []
            : [
                {
                  actorId: HUMAN_ACTOR_ID,
                  massFactor: humanLoadout.massFactor,
                  startingItems: humanLoadout.startingItems,
                },
              ]),
          ...botLoadouts,
        ],
      });
      nextRoundId += 1;
      bots = new BotDirector(masterSeed, HUMAN_ACTOR_ID, { difficulty: config.difficulty });
      latestFrame = world.createRenderFrame();
      accumulatorMilliseconds = 0;
      previousTimestamp = undefined;
      paused = document.visibilityState !== "visible" || !rendererAvailable;
      currentSeed = String(masterSeed);
      humanEliminated = false;
      awaitingHumanUpgrade = false;
      pendingHumanUpgrade = null;
      countdown = 3;
      countdownElapsedMilliseconds = 0;
      active = true;
      keyboard.state.clear();
      gamepad.clear(keyboard.state);
      publishFrame();
      hooks.onPauseChanged(paused);
      schedule();
    },
    queueDodge(): void {
      if (active && !paused && countdown === null && !humanEliminated) {
        keyboard.state.queueDodge();
      }
    },
    queueItemSlot(slotIndex: 0 | 1): void {
      if (active && !paused && countdown === null && !humanEliminated) {
        keyboard.state.queueItemSlot(slotIndex);
      }
    },
    queueShove(): void {
      if (active && !paused && countdown === null && !humanEliminated) {
        keyboard.state.queueShove();
      }
    },
    setPointerMovement(x: number, y: number): void {
      if (active && !paused && countdown === null && !humanEliminated) {
        keyboard.state.setPointerMovement(x, y);
      } else {
        keyboard.state.setPointerMovement(0, 0);
      }
    },
    stop(): void {
      active = false;
      world = undefined;
      bots = undefined;
      latestFrame = undefined;
      accumulatorMilliseconds = 0;
      previousTimestamp = undefined;
      humanEliminated = false;
      awaitingHumanUpgrade = false;
      pendingHumanUpgrade = null;
      countdown = null;
      countdownElapsedMilliseconds = 0;
      keyboard.state.clear();
      gamepad.clear(keyboard.state);

      if (animationFrameId !== undefined) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = undefined;
      }
    },
    destroy(): void {
      this.stop();
      keyboard.destroy();
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    },
  };
}
