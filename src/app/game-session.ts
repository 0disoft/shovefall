import { createKeyboardInput, type KeyboardInput } from "./keyboard-input";
import { BotDirector } from "../ai/bot-director";
import type {
  GameConfigV1,
  RenderFrameV1,
  RoundStateV1,
  SimulationEventV1,
} from "../simulation/contracts";
import { clamp } from "../simulation/math";
import { FIXED_TICKS_PER_SECOND } from "../simulation/versions";
import { SimulationWorld } from "../simulation/world";
import type { ArenaRenderer } from "../presentation/arena-renderer";

const FIXED_STEP_MILLISECONDS = 1_000 / FIXED_TICKS_PER_SECOND;
const MAX_STEPS_PER_RENDER = 8;
const HUMAN_ACTOR_ID = 1;
const POST_HUMAN_ELIMINATION_RATE = 6;

export interface SessionTelemetry {
  readonly frame: RenderFrameV1;
  readonly interpolationAlpha: number;
  readonly backlogTicks: number;
  readonly paused: boolean;
  readonly masterSeed: string;
  readonly simulationRate: number;
}

export interface GameSessionHooks {
  readonly onTelemetry: (telemetry: SessionTelemetry) => void;
  readonly onEvents: (events: readonly SimulationEventV1[]) => void;
  readonly onHumanEliminated: () => void;
  readonly onRoundCompleted: (round: RoundStateV1) => void;
  readonly onPauseChanged: (paused: boolean) => void;
  readonly onFatalError: (error: unknown) => void;
}

export interface GameSession {
  readonly active: boolean;
  failForDiagnostics(error: unknown): void;
  setRendererAvailable(available: boolean): void;
  start(config: GameConfigV1, masterSeed: string | number): void;
  stop(): void;
  destroy(): void;
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
  const keyboard: KeyboardInput = createKeyboardInput(() => active && !paused && !humanEliminated);

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

    if (previousTimestamp === undefined) {
      previousTimestamp = timestamp;
    } else {
      accumulatorMilliseconds +=
        Math.max(0, timestamp - previousTimestamp) *
        (humanEliminated ? POST_HUMAN_ELIMINATION_RATE : 1);
      previousTimestamp = timestamp;
    }

    try {
      let steps = 0;

      while (accumulatorMilliseconds >= FIXED_STEP_MILLISECONDS && steps < MAX_STEPS_PER_RENDER) {
        const result = world.step([
          keyboard.state.consumeCommand(world.tick, HUMAN_ACTOR_ID),
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
          hooks.onHumanEliminated();
        }

        if (result.frame.round.status === "Completed") {
          active = false;
          keyboard.state.clear();
          animationFrameId = undefined;
          publishFrame();
          hooks.onRoundCompleted(result.frame.round);
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
    start(config: GameConfigV1, masterSeed: string | number): void {
      if (animationFrameId !== undefined) {
        window.cancelAnimationFrame(animationFrameId);
      }

      world = new SimulationWorld(config, masterSeed, {
        roundId: nextRoundId,
        humanActorId: HUMAN_ACTOR_ID,
      });
      nextRoundId += 1;
      bots = new BotDirector(masterSeed, HUMAN_ACTOR_ID);
      latestFrame = world.createRenderFrame();
      accumulatorMilliseconds = 0;
      previousTimestamp = undefined;
      paused = document.visibilityState !== "visible" || !rendererAvailable;
      currentSeed = String(masterSeed);
      humanEliminated = false;
      active = true;
      keyboard.state.clear();
      publishFrame();
      hooks.onPauseChanged(paused);
      schedule();
    },
    stop(): void {
      active = false;
      world = undefined;
      bots = undefined;
      latestFrame = undefined;
      accumulatorMilliseconds = 0;
      previousTimestamp = undefined;
      humanEliminated = false;
      keyboard.state.clear();

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
