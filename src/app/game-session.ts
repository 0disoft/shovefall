import { createKeyboardInput, type KeyboardInput } from "./keyboard-input";
import { createGamepadInput, type GamepadInput } from "./gamepad-input";
import {
  createGrappleTargetedAction,
  createItemTargetedAction,
  createSkillTargetedAction,
  isSameTargetedAction,
  moveAimTargetWithKeyboard,
  mustApproachTarget,
  type TargetedAction,
} from "./action-targeting";
import { BotDirector } from "../ai/bot-director";
import { createBotLoadoutAssignments } from "../ai/bot-loadouts";
import type {
  GameConfigV1,
  ItemDefinitionId,
  RenderFrameV1,
  RenderParticipantV1,
  SimulationEventV1,
  UpgradeStatId,
  SkillDefinitionId,
  StartingAttributes,
} from "../simulation/contracts";
import type { InputState } from "./input-state";
import { canSpendStatPoint } from "../simulation/progression";
import { clamp } from "../simulation/math";
import { normalizeVector, subtractVectors, vectorLength, type Vector2 } from "../simulation/math";
import { FIXED_TICKS_PER_SECOND } from "../simulation/versions";
import { SimulationWorld } from "../simulation/world";
import {
  DEFAULT_GAMEPLAY_TUNING,
  normalizeGameplayTuning,
  type GameplayTuningInput,
} from "../simulation/tuning";
import type { ArenaRenderer } from "../presentation/arena-renderer";
import { RoundStatisticsTracker, type RoundStatistics } from "./round-statistics";
import { createSkillButtonViewModel } from "./action-hud";

const FIXED_STEP_MILLISECONDS = 1_000 / FIXED_TICKS_PER_SECOND;
const MAX_STEPS_PER_RENDER = 8;
export const MAX_SIMULATION_BACKLOG_TICKS = MAX_STEPS_PER_RENDER * 2;
const MAX_SIMULATION_BACKLOG_MILLISECONDS = FIXED_STEP_MILLISECONDS * MAX_SIMULATION_BACKLOG_TICKS;
const HUMAN_ACTOR_ID = 1;
const POST_HUMAN_ELIMINATION_RATE = 6;
const COUNTDOWN_STEP_MILLISECONDS = 500;
const TELEMETRY_INTERVAL_TICKS = Math.ceil(FIXED_TICKS_PER_SECOND / 10);
const MOVE_DESTINATION_MINIMUM_STOP_DISTANCE = 0.08;
const MOVE_DESTINATION_RADIUS_RATIO = 0.35;

export type RoundCountdownValue = 3 | 2 | 1 | null;

export interface SessionTelemetry {
  readonly frame: RenderFrameV1;
  readonly interpolationAlpha: number;
  readonly backlogTicks: number;
  readonly paused: boolean;
  readonly masterSeed: string;
  readonly simulationRate: number;
  readonly countdown: RoundCountdownValue;
  readonly roundStatistics: RoundStatistics;
}

export interface GameSessionHooks {
  readonly onTelemetry: (telemetry: SessionTelemetry) => void;
  readonly onEvents: (events: readonly SimulationEventV1[]) => void;
  readonly onHumanUpgradeRequested: (frame: RenderFrameV1) => void;
  readonly onHumanEliminated: (frame: RenderFrameV1) => void;
  readonly onRoundCompleted: (frame: RenderFrameV1) => void;
  readonly onPauseChanged: (paused: boolean) => void;
  readonly onTargetingChanged: (targeting: boolean, approaching: boolean) => void;
  readonly onActionRejected?: (message: string) => void;
  readonly onFatalError: (error: unknown) => void;
}

export interface GameSession {
  readonly active: boolean;
  readonly paused: boolean;
  readonly targetApproachPending: boolean;
  readonly targeting: boolean;
  cancelTargeting(): void;
  confirmTargeting(clientX: number, clientY: number): void;
  chooseUpgrade(choice: HumanUpgradeChoice): boolean;
  queueItemSlot(slotIndex: 0): void;
  queueGrapple(): void;
  queueSkillSlot(slotIndex: 0 | 1): void;
  failForDiagnostics(error: unknown): void;
  moveTo(clientX: number, clientY: number): void;
  setPaused(paused: boolean): void;
  setPointerMovement(x: number, y: number): void;
  updateTargeting(clientX: number, clientY: number): void;
  setRendererAvailable(available: boolean): void;
  start(
    config: GameConfigV1,
    masterSeed: string | number,
    gameplayTuning?: GameplayTuningInput,
    humanLoadout?: {
      readonly startingAttributes: StartingAttributes;
      readonly startingItems: readonly ItemDefinitionId[];
      readonly startingSkills: readonly SkillDefinitionId[];
    },
  ): void;
  stop(): void;
  destroy(): void;
}

export interface HumanUpgradeChoice {
  readonly stat: UpgradeStatId;
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
    (["power", "stability", "mobility", "reflex", "vitality", "focus"] as const).some((stat) =>
      canSpendStatPoint(participant.progression, stat),
    )
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
  let supportedGroundTileIds = new Set<string>();
  let animationFrameId: number | undefined;
  let previousTimestamp: number | undefined;
  let accumulatorMilliseconds = 0;
  let active = false;
  let paused = false;
  let manualPaused = false;
  let windowFocused = true;
  let currentSeed = "not-started";
  let humanEliminated = false;
  let nextRoundId = 1;
  let rendererAvailable = true;
  let countdown: RoundCountdownValue = null;
  let countdownElapsedMilliseconds = 0;
  let awaitingHumanUpgrade = false;
  let pendingHumanUpgrade: UpgradeStatId | null = null;
  let targetingAction: TargetedAction | null = null;
  let pendingTargetedAction: TargetedAction | null = null;
  let moveDestination: Vector2 | null = null;
  let grapplingHookCastRange = DEFAULT_GAMEPLAY_TUNING.grapplingHookRange;
  let lastTelemetryTick = Number.NEGATIVE_INFINITY;
  let lastTargetingSignal = "";
  let lastAimPreviewSignal = "";
  let keyboard: KeyboardInput;
  const roundStatistics = new RoundStatisticsTracker();

  const getHuman = (): RenderParticipantV1 | undefined =>
    latestFrame?.participants.find(({ actorId }) => actorId === HUMAN_ACTOR_ID);

  const setLatestFrame = (frame: RenderFrameV1 | undefined): void => {
    latestFrame = frame;
    supportedGroundTileIds = new Set(
      frame?.tiles.filter(({ state }) => state !== "Void").map(({ tileId }) => tileId) ?? [],
    );
  };

  const isSupportedGroundTarget = (target: Vector2): boolean => {
    const tileId = `${Math.floor(target.x)}:${Math.floor(target.y)}`;
    return supportedGroundTileIds.has(tileId);
  };

  const isTargetValid = (action: TargetedAction): boolean => {
    if (!Number.isFinite(action.target.x) || !Number.isFinite(action.target.y)) {
      return false;
    }
    if (action.targetMode !== "ground") {
      return true;
    }
    return isSupportedGroundTarget(action.target);
  };

  const isTargetApproachActive = (): boolean => {
    const human = getHuman();
    if (pendingTargetedAction === null || human === undefined) {
      return false;
    }
    return mustApproachTarget(
      pendingTargetedAction,
      vectorLength(subtractVectors(pendingTargetedAction.target, human.position)),
    );
  };

  const syncAimPreview = (): void => {
    const action = targetingAction ?? pendingTargetedAction;
    const human = getHuman();
    const approaching = isTargetApproachActive();
    const targetingSignal = `${targetingAction !== null}:${approaching}`;
    if (targetingSignal !== lastTargetingSignal) {
      lastTargetingSignal = targetingSignal;
      hooks.onTargetingChanged(targetingAction !== null, approaching);
    }
    if (action === null || human === undefined || !human.active) {
      if (lastAimPreviewSignal !== "none") {
        lastAimPreviewSignal = "none";
        renderer.setAimPreview(null);
      }
      return;
    }
    const valid = isTargetValid(action);
    const previewSignal = [
      action.targetMode,
      human.position.x,
      human.position.y,
      action.target.x,
      action.target.y,
      action.castRange,
      action.effectRadius,
      valid,
      approaching,
      action.visualKind,
    ].join(":");
    if (previewSignal === lastAimPreviewSignal) {
      return;
    }
    lastAimPreviewSignal = previewSignal;
    renderer.setAimPreview(
      Object.freeze({
        targetMode: action.targetMode,
        source: human.position,
        target: action.target,
        castRange: action.castRange,
        effectRadius: action.effectRadius,
        valid,
        approaching,
        visualKind: action.visualKind,
      }),
    );
  };

  const cancelTargeting = (): void => {
    targetingAction = null;
    pendingTargetedAction = null;
    syncAimPreview();
  };

  const cancelMoveDestination = (): void => {
    moveDestination = null;
  };

  const setMoveDestinationFromClient = (clientX: number, clientY: number): void => {
    const worldTarget = renderer.screenToWorld(clientX, clientY);
    if (worldTarget === undefined || !isSupportedGroundTarget(worldTarget)) {
      hooks.onActionRejected?.("이동할 수 있는 땅을 우클릭해 줘.");
      return;
    }
    cancelTargeting();
    keyboard.state.setPointerMovement(0, 0);
    moveDestination = Object.freeze({ ...worldTarget });
  };

  const confirmCurrentTargeting = (): void => {
    if (targetingAction === null || !isTargetValid(targetingAction)) {
      syncAimPreview();
      return;
    }
    pendingTargetedAction = targetingAction;
    targetingAction = null;
    syncAimPreview();
  };

  const moveTargetingWithKeyboard = (x: number, y: number): void => {
    const human = getHuman();
    if (targetingAction === null || human === undefined) {
      return;
    }
    targetingAction = Object.freeze({
      ...targetingAction,
      target: moveAimTargetWithKeyboard(
        targetingAction.targetMode,
        human.position,
        targetingAction.target,
        targetingAction.castRange,
        Object.freeze({ x, y }),
      ),
    });
    syncAimPreview();
  };

  const activateTargetedAction = (action: TargetedAction): void => {
    cancelMoveDestination();
    if (action.targetMode === "self") {
      targetingAction = null;
      pendingTargetedAction = action;
      syncAimPreview();
      return;
    }
    keyboard.state.clearTransientMovement();
    targetingAction = action;
    pendingTargetedAction = null;
    syncAimPreview();
  };

  const beginSkillTargeting = (slotIndex: 0 | 1): void => {
    const human = getHuman();
    const slot = human?.skills.find((candidate) => candidate.slotIndex === slotIndex);
    if (!active || paused || countdown !== null || human === undefined || slot === undefined) {
      return;
    }
    const model = createSkillButtonViewModel(human, slotIndex, {
      tick: latestFrame?.tick ?? 0,
      countdownActive: countdown !== null,
      roundActive: latestFrame?.round.status === "Active",
    });
    if (model.state !== "ready") {
      cancelTargeting();
      hooks.onTargetingChanged(false, false);
      hooks.onActionRejected?.(model.rejectionMessage ?? "지금은 이 스킬을 사용할 수 없어.");
      return;
    }
    if (isSameTargetedAction(targetingAction, "skill", slotIndex)) {
      confirmCurrentTargeting();
      return;
    }
    activateTargetedAction(
      createSkillTargetedAction(slotIndex, slot.definitionId, {
        position: human.position,
        facing: human.facing,
      }),
    );
  };

  const beginItemTargeting = (slotIndex: 0): void => {
    const human = getHuman();
    const slot = human?.inventory.find((candidate) => candidate.slotIndex === slotIndex);
    if (
      !active ||
      paused ||
      countdown !== null ||
      human === undefined ||
      slot?.definitionId === null ||
      slot === undefined ||
      slot.charges === 0
    ) {
      return;
    }
    if (isSameTargetedAction(targetingAction, "item", slotIndex)) {
      confirmCurrentTargeting();
      return;
    }
    activateTargetedAction(
      createItemTargetedAction(slotIndex, slot.definitionId, {
        position: human.position,
        facing: human.facing,
      }),
    );
  };

  const beginGrappleTargeting = (): void => {
    const human = getHuman();
    if (
      !active ||
      paused ||
      countdown !== null ||
      human === undefined ||
      human.action !== "Ready" ||
      latestFrame === undefined ||
      latestFrame.tick < human.grappleReadyTick
    ) {
      return;
    }
    if (isSameTargetedAction(targetingAction, "grapple", 0)) {
      confirmCurrentTargeting();
      return;
    }
    activateTargetedAction(
      createGrappleTargetedAction(
        { position: human.position, facing: human.facing },
        grapplingHookCastRange,
      ),
    );
  };

  const updateTargetingFromClient = (clientX: number, clientY: number): void => {
    if (targetingAction === null) {
      return;
    }
    const human = getHuman();
    const worldTarget = renderer.screenToWorld(clientX, clientY);
    if (human === undefined || worldTarget === undefined) {
      return;
    }
    const target = targetingAction.targetMode === "self" ? human.position : worldTarget;
    targetingAction = Object.freeze({ ...targetingAction, target: Object.freeze({ ...target }) });
    syncAimPreview();
  };

  const confirmTargetingAt = (clientX: number, clientY: number): void => {
    updateTargetingFromClient(clientX, clientY);
    confirmCurrentTargeting();
  };

  const applyPendingTargetedAction = (command: ReturnType<InputState["consumeCommand"]>) => {
    if (targetingAction !== null) {
      return Object.freeze({
        ...command,
        move: Object.freeze({ x: 0, y: 0 }),
        targetPosition: null,
        useSkillSlot: null,
        useItemSlot: null,
      });
    }
    const pending = pendingTargetedAction;
    const human = getHuman();
    if (pending === null || human === undefined) {
      return command;
    }
    if (!isTargetValid(pending)) {
      cancelTargeting();
      return command;
    }
    const offset = subtractVectors(pending.target, human.position);
    const distance = vectorLength(offset);
    if (mustApproachTarget(pending, distance)) {
      return Object.freeze({
        ...command,
        move: normalizeVector(offset),
        targetPosition: pending.target,
        useSkillSlot: null,
        useItemSlot: null,
      });
    }
    pendingTargetedAction = null;
    syncAimPreview();
    return Object.freeze({
      ...command,
      move: Object.freeze({ x: 0, y: 0 }),
      targetPosition: pending.target,
      grapplePressed: pending.actionKind === "grapple",
      useSkillSlot: pending.actionKind === "skill" ? pending.slotIndex : null,
      useItemSlot: pending.actionKind === "item" ? 0 : null,
    });
  };

  const applyMoveDestination = (command: ReturnType<InputState["consumeCommand"]>) => {
    const destination = moveDestination;
    const human = getHuman();
    if (destination === null || human === undefined) {
      return command;
    }
    if (command.move.x !== 0 || command.move.y !== 0) {
      cancelMoveDestination();
      return command;
    }
    if (!human.active || !isSupportedGroundTarget(destination)) {
      cancelMoveDestination();
      return command;
    }
    const offset = subtractVectors(destination, human.position);
    const stopDistance = Math.max(
      MOVE_DESTINATION_MINIMUM_STOP_DISTANCE,
      human.radius * MOVE_DESTINATION_RADIUS_RATIO,
    );
    if (vectorLength(offset) <= stopDistance) {
      cancelMoveDestination();
      return command;
    }
    return Object.freeze({
      ...command,
      move: normalizeVector(offset),
      targetPosition: destination,
    });
  };
  keyboard = createKeyboardInput({
    isCommandActive: () => active && !paused && countdown === null && !humanEliminated,
    isMovementWarmupActive: () => active && !paused && countdown !== null && !humanEliminated,
    isTargetApproachPending: isTargetApproachActive,
    isTargeting: () => targetingAction !== null,
    onGrappleRequested: beginGrappleTargeting,
    onSkillRequested: beginSkillTargeting,
    onItemRequested: beginItemTargeting,
    onTargetingCanceled: cancelTargeting,
    onTargetingConfirmed: confirmCurrentTargeting,
    onTargetingMoved: moveTargetingWithKeyboard,
  });
  const gamepad: GamepadInput = createGamepadInput();

  const publishFrame = (forceTelemetry = false): void => {
    if (world === undefined || latestFrame === undefined) {
      return;
    }

    const interpolationAlpha = clamp(accumulatorMilliseconds / FIXED_STEP_MILLISECONDS, 0, 1);
    syncAimPreview();
    if (rendererAvailable) {
      renderer.render(latestFrame, interpolationAlpha, HUMAN_ACTOR_ID);
    }
    const simulationRate = humanEliminated ? POST_HUMAN_ELIMINATION_RATE : 1;
    if (
      forceTelemetry ||
      latestFrame.tick - lastTelemetryTick >= TELEMETRY_INTERVAL_TICKS * simulationRate
    ) {
      lastTelemetryTick = latestFrame.tick;
      hooks.onTelemetry(
        Object.freeze({
          frame: latestFrame,
          interpolationAlpha,
          backlogTicks: Math.floor(accumulatorMilliseconds / FIXED_STEP_MILLISECONDS),
          paused,
          masterSeed: currentSeed,
          simulationRate,
          countdown,
          roundStatistics: roundStatistics.snapshot(),
        }),
      );
    }
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
      schedule();
      return;
    }

    if (countdown !== null) {
      const previousCountdown = countdown;
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
      if (countdown !== previousCountdown) {
        publishFrame(true);
      }
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

      if (humanEliminated) {
        gamepad.clear(keyboard.state);
      } else {
        gamepad.sample(
          keyboard.state,
          {
            isTargeting: () => targetingAction !== null,
            onTargetingMoved: moveTargetingWithKeyboard,
            onGrappleRequested: beginGrappleTargeting,
            onSkillRequested: beginSkillTargeting,
            onItemRequested: beginItemTargeting,
          },
          timestamp,
        );
      }

      while (accumulatorMilliseconds >= FIXED_STEP_MILLISECONDS && steps < MAX_STEPS_PER_RENDER) {
        const inputCommand = applyPendingTargetedAction(
          applyMoveDestination(keyboard.state.consumeCommand(world.tick, HUMAN_ACTOR_ID)),
        );
        const previousFrame = latestFrame ?? world.createRenderFrame();
        const requestedUpgrade = pendingHumanUpgrade;
        pendingHumanUpgrade = null;
        const result = world.step([
          Object.freeze({
            ...inputCommand,
            upgradeStat: requestedUpgrade,
          }),
          ...(bots?.createCommands(world.tick, previousFrame) ?? []),
        ]);
        roundStatistics.recordStep(previousFrame, result.frame, result.events, HUMAN_ACTOR_ID);
        setLatestFrame(result.frame);
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
          publishFrame(true);
          hooks.onRoundCompleted(result.frame);
          return;
        }

        if (disposition === "human-eliminated") {
          humanEliminated = true;
          awaitingHumanUpgrade = false;
          pendingHumanUpgrade = null;
          keyboard.state.clear();
          gamepad.clear(keyboard.state);
          hooks.onHumanEliminated(result.frame);
        } else if (disposition === "upgrade-requested") {
          awaitingHumanUpgrade = true;
          accumulatorMilliseconds = 0;
          syncPausedState();
          hooks.onHumanUpgradeRequested(result.frame);
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

  const syncPausedState = (): void => {
    const nextPaused =
      manualPaused ||
      awaitingHumanUpgrade ||
      !windowFocused ||
      document.visibilityState !== "visible" ||
      !rendererAvailable;

    if (!active || paused === nextPaused) {
      return;
    }

    paused = nextPaused;
    previousTimestamp = undefined;
    cancelMoveDestination();
    keyboard.state.clear();
    gamepad.clear(keyboard.state);
    hooks.onPauseChanged(paused);
    publishFrame(true);
  };

  const handleWindowBlur = (): void => {
    windowFocused = false;
    syncPausedState();
  };
  const handleWindowFocus = (): void => {
    windowFocused = true;
    syncPausedState();
  };
  const handleVisibilityChange = (): void => syncPausedState();

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
    get paused(): boolean {
      return paused;
    },
    get targetApproachPending(): boolean {
      return isTargetApproachActive();
    },
    get targeting(): boolean {
      return targetingAction !== null;
    },
    cancelTargeting,
    confirmTargeting(clientX: number, clientY: number): void {
      confirmTargetingAt(clientX, clientY);
    },
    chooseUpgrade(choice: HumanUpgradeChoice): boolean {
      const human = latestFrame?.participants.find(
        (participant) => participant.actorId === HUMAN_ACTOR_ID,
      );

      if (
        !active ||
        !awaitingHumanUpgrade ||
        human === undefined ||
        !canSpendHumanStatPoint(human) ||
        !canSpendStatPoint(human.progression, choice.stat)
      ) {
        return false;
      }

      pendingHumanUpgrade = choice.stat;
      awaitingHumanUpgrade = false;
      syncPausedState();
      return true;
    },
    failForDiagnostics(error: unknown): void {
      fail(error);
    },
    moveTo(clientX: number, clientY: number): void {
      if (active && !paused && countdown === null && !humanEliminated) {
        setMoveDestinationFromClient(clientX, clientY);
      }
    },
    setRendererAvailable(available: boolean): void {
      rendererAvailable = available;
      syncPausedState();
    },
    setPaused(nextPaused: boolean): void {
      manualPaused = nextPaused;
      syncPausedState();
    },
    start(
      config: GameConfigV1,
      masterSeed: string | number,
      gameplayTuning?: GameplayTuningInput,
      humanLoadout?: {
        readonly startingAttributes: StartingAttributes;
        readonly startingItems: readonly ItemDefinitionId[];
        readonly startingSkills: readonly SkillDefinitionId[];
      },
    ): void {
      grapplingHookCastRange = normalizeGameplayTuning(gameplayTuning).grapplingHookRange;
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
                  startingAttributes: humanLoadout.startingAttributes,
                  startingItems: humanLoadout.startingItems,
                  startingSkills: humanLoadout.startingSkills,
                },
              ]),
          ...botLoadouts,
        ],
      });
      nextRoundId += 1;
      bots = new BotDirector(masterSeed, HUMAN_ACTOR_ID, { difficulty: config.difficulty });
      setLatestFrame(world.createRenderFrame());
      roundStatistics.reset();
      accumulatorMilliseconds = 0;
      previousTimestamp = undefined;
      manualPaused = false;
      windowFocused = document.hasFocus();
      paused = !windowFocused || document.visibilityState !== "visible" || !rendererAvailable;
      currentSeed = String(masterSeed);
      humanEliminated = false;
      awaitingHumanUpgrade = false;
      pendingHumanUpgrade = null;
      cancelMoveDestination();
      cancelTargeting();
      countdown = 3;
      countdownElapsedMilliseconds = 0;
      lastTelemetryTick = Number.NEGATIVE_INFINITY;
      lastTargetingSignal = "";
      lastAimPreviewSignal = "";
      active = true;
      keyboard.state.clear();
      gamepad.clear(keyboard.state);
      publishFrame(true);
      hooks.onPauseChanged(paused);
      schedule();
    },
    queueSkillSlot(slotIndex: 0 | 1): void {
      if (active && !paused && countdown === null && !humanEliminated) {
        beginSkillTargeting(slotIndex);
      }
    },
    queueItemSlot(slotIndex: 0): void {
      if (active && !paused && countdown === null && !humanEliminated) {
        beginItemTargeting(slotIndex);
      }
    },
    queueGrapple: beginGrappleTargeting,
    setPointerMovement(x: number, y: number): void {
      if (active && !paused && !humanEliminated) {
        keyboard.state.setPointerMovement(x, y);
      } else {
        keyboard.state.setPointerMovement(0, 0);
      }
    },
    updateTargeting(clientX: number, clientY: number): void {
      updateTargetingFromClient(clientX, clientY);
    },
    stop(): void {
      active = false;
      world = undefined;
      bots = undefined;
      setLatestFrame(undefined);
      accumulatorMilliseconds = 0;
      previousTimestamp = undefined;
      paused = false;
      manualPaused = false;
      humanEliminated = false;
      awaitingHumanUpgrade = false;
      pendingHumanUpgrade = null;
      cancelMoveDestination();
      countdown = null;
      countdownElapsedMilliseconds = 0;
      cancelTargeting();
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
