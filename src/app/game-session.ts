import { createKeyboardInput, type KeyboardInput } from "./keyboard-input";
import { createGamepadInput, type GamepadInput } from "./gamepad-input";
import { BotDirector } from "../ai/bot-director";
import { createBotLoadoutAssignments } from "../ai/bot-loadouts";
import type {
  GameConfigV1,
  ItemDefinitionId,
  RenderFrameV1,
  SimulationEventV1,
  UpgradeStatId,
} from "../simulation/contracts";
import { getNextPlannedUpgrade, normalizeUpgradePlan } from "../simulation/progression";
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
  readonly onHumanEliminated: () => void;
  readonly onRoundCompleted: (frame: RenderFrameV1) => void;
  readonly onPauseChanged: (paused: boolean) => void;
  readonly onFatalError: (error: unknown) => void;
}

export interface GameSession {
  readonly active: boolean;
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
      readonly upgradePlan: readonly UpgradeStatId[];
    },
  ): void;
  stop(): void;
  destroy(): void;
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
  let humanUpgradePlan: readonly UpgradeStatId[] = normalizeUpgradePlan(undefined);
  const keyboard: KeyboardInput = createKeyboardInput(
    () => active && !paused && countdown === null && !humanEliminated,
  );
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
        const currentHuman = latestFrame?.participants.find(
          (participant) => participant.actorId === HUMAN_ACTOR_ID,
        );
        const automaticUpgrade =
          currentHuman === undefined
            ? null
            : getNextPlannedUpgrade(currentHuman.progression, humanUpgradePlan);
        const result = world.step([
          Object.freeze({ ...inputCommand, upgradeStat: automaticUpgrade }),
          ...(bots?.createCommands(world.tick, latestFrame ?? world.createRenderFrame()) ?? []),
        ]);
        latestFrame = result.frame;
        renderer.consumeEvents(result.events, result.frame);
        hooks.onEvents(result.events);
        accumulatorMilliseconds -= FIXED_STEP_MILLISECONDS;
        steps += 1;

        const human = result.frame.participants.find(
          (participant) => participant.actorId === HUMAN_ACTOR_ID,
        );

        if (
          !humanEliminated &&
          (human?.active === false || human?.action === "Falling" || human?.action === "Eliminated")
        ) {
          humanEliminated = true;
          keyboard.state.clear();
          gamepad.clear(keyboard.state);
          hooks.onHumanEliminated();
        }

        if (result.frame.round.status === "Completed") {
          active = false;
          keyboard.state.clear();
          gamepad.clear(keyboard.state);
          animationFrameId = undefined;
          publishFrame();
          hooks.onRoundCompleted(result.frame);
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
        readonly upgradePlan: readonly UpgradeStatId[];
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
      humanUpgradePlan = normalizeUpgradePlan(humanLoadout?.upgradePlan);
      latestFrame = world.createRenderFrame();
      accumulatorMilliseconds = 0;
      previousTimestamp = undefined;
      paused = document.visibilityState !== "visible" || !rendererAvailable;
      currentSeed = String(masterSeed);
      humanEliminated = false;
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
