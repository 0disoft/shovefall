import {
  createNeutralCommand,
  createTileId,
  normalizeActorCommand,
  type ActionState,
  type ActorCommandV1,
  type ActorId,
  type GameConfigV1,
  type ItemDefinitionId,
  type ItemId,
  type ParticipantActionKind,
  type ParticipantState,
  type RenderFrameV1,
  type RoundId,
  type RoundStateV1,
  type SimulationEventKind,
  type SimulationEventV1,
  type TileId,
  type TileState,
} from "./contracts";
import { advanceCollapse, createCollapsePlan, type CollapseWave } from "./collapse";
import { hashWorldState } from "./hash";
import {
  addVectors,
  assertFiniteNumber,
  clampVectorLength,
  dotVectors,
  isZeroVector,
  moveVectorToward,
  normalizeVector,
  scaleVector,
  SimulationContractError,
  subtractVectors,
  type Vector2,
  vectorLength,
  vectorLengthSquared,
  ZERO_VECTOR,
} from "./math";
import { RandomStreamSet, type SeedInput } from "./random";
import { ParticipantSpatialHash, type ActorPair } from "./spatial-hash";
import {
  advanceItemSpawns,
  clearEffects,
  consumeSpringGlove,
  createItemSystem,
  expireEffects,
  getDodgeSpeedMultiplier,
  hasSpringGlove,
  resolveItemPickups,
  type ItemEventFact,
  type ItemSpawnOverride,
  type ItemSystemState,
} from "./items";
import { getItemDefinition } from "../content/items";
import { getMovementProfile, normalizeMassFactor, SIMULATION_TUNING } from "./tuning";
import { SYSTEM_ORDER } from "./versions";

export interface SimulationStepResult {
  readonly frame: RenderFrameV1;
  readonly events: readonly SimulationEventV1[];
  readonly diagnostics: SimulationStepDiagnostics;
}

export interface SimulationStepDiagnostics {
  readonly collidableParticipants: number;
  readonly broadPhaseCandidatePairs: number;
  readonly fullPairCount: number;
}

export interface ParticipantSpawnOverride {
  readonly actorId: ActorId;
  readonly position?: Vector2;
  readonly velocity?: Vector2;
  readonly facing?: Vector2;
  readonly massFactor?: number;
  readonly control?: "human" | "scripted";
}

export interface SimulationWorldOptions {
  readonly roundId?: RoundId;
  readonly humanActorId?: ActorId;
  readonly participantOverrides?: readonly ParticipantSpawnOverride[];
  readonly itemOverrides?: readonly ItemSpawnOverride[];
}

interface EventDetails {
  readonly actorId?: ActorId;
  readonly targetActorId?: ActorId;
  readonly tileId?: TileId;
  readonly itemId?: ItemId;
  readonly itemDefinitionId?: ItemDefinitionId;
  readonly winnerActorId?: ActorId;
  readonly vector?: Vector2;
  readonly reason?: SimulationEventV1["reason"];
}

interface SweptCircleContact {
  readonly time: number;
  readonly normal: Vector2;
  readonly leftPosition: Vector2;
  readonly rightPosition: Vector2;
}

function createTiles(config: GameConfigV1): readonly TileState[] {
  const tiles: TileState[] = [];

  for (let row = 0; row < config.arenaRows; row += 1) {
    for (let column = 0; column < config.arenaColumns; column += 1) {
      tiles.push(
        Object.freeze({
          tileId: createTileId(column, row),
          column,
          row,
          state: "Stable",
        }),
      );
    }
  }

  return Object.freeze(tiles);
}

function createReadyAction(tick: number): ActionState {
  return Object.freeze({
    kind: "Ready",
    startedTick: tick,
    endsTick: null,
    hitActorIds: Object.freeze([]),
    resolvedActorIds: Object.freeze([]),
    lockedDirection: null,
    springBoosted: false,
  });
}

function createTimedAction(
  kind: ParticipantActionKind,
  tick: number,
  durationTicks: number,
  lockedDirection: Vector2 | null,
  hitActorIds: readonly ActorId[] = [],
  resolvedActorIds: readonly ActorId[] = [],
  springBoosted = false,
): ActionState {
  return Object.freeze({
    kind,
    startedTick: tick,
    endsTick: tick + durationTicks,
    hitActorIds: Object.freeze([...hitActorIds].toSorted((left, right) => left - right)),
    resolvedActorIds: Object.freeze([...resolvedActorIds].toSorted((left, right) => left - right)),
    lockedDirection,
    springBoosted,
  });
}

function normalizeDirectionOrFallback(direction: Vector2, fallback: Vector2): Vector2 {
  const normalized = normalizeVector(direction);
  return isZeroVector(normalized) ? normalizeVector(fallback) : normalized;
}

function validateOverride(override: ParticipantSpawnOverride, participantCount: number): void {
  if (
    !Number.isSafeInteger(override.actorId) ||
    override.actorId < 1 ||
    override.actorId > participantCount
  ) {
    throw new SimulationContractError("participant override actorId is outside the round");
  }

  for (const [name, vector] of [
    ["position", override.position],
    ["velocity", override.velocity],
    ["facing", override.facing],
  ] as const) {
    if (vector !== undefined) {
      assertFiniteNumber(vector.x, `participant override ${name}.x`);
      assertFiniteNumber(vector.y, `participant override ${name}.y`);
    }
  }

  if (override.massFactor !== undefined) {
    assertFiniteNumber(override.massFactor, "participant override massFactor");
  }
}

function createParticipants(
  config: GameConfigV1,
  streams: RandomStreamSet,
  humanActorId: ActorId,
  participantOverrides: readonly ParticipantSpawnOverride[],
): readonly ParticipantState[] {
  const overrides = new Map<ActorId, ParticipantSpawnOverride>();

  for (const override of participantOverrides) {
    validateOverride(override, config.participantCount);

    if (overrides.has(override.actorId)) {
      throw new SimulationContractError(
        `duplicate participant override for actor ${override.actorId}`,
      );
    }

    overrides.set(override.actorId, override);
  }

  const centerX = config.arenaColumns / 2;
  const centerY = config.arenaRows / 2;
  const spawnRadius = Math.min(config.arenaColumns, config.arenaRows) * 0.28;
  const phase = streams.get("arena").nextFloat() * Math.PI * 2;
  const participants: ParticipantState[] = [];

  for (let index = 0; index < config.participantCount; index += 1) {
    const actorId = index + 1;
    const angle = phase + (index / config.participantCount) * Math.PI * 2;
    const defaultFacing = Object.freeze({
      x: -Math.cos(angle),
      y: -Math.sin(angle),
    });
    const defaultPosition = Object.freeze({
      x: centerX + Math.cos(angle) * spawnRadius,
      y: centerY + Math.sin(angle) * spawnRadius,
    });
    const override = overrides.get(actorId);
    const position = Object.freeze({ ...(override?.position ?? defaultPosition) });
    const velocity = clampVectorLength(
      override?.velocity ?? ZERO_VECTOR,
      SIMULATION_TUNING.body.maximumSpeed,
    );
    const facing = normalizeDirectionOrFallback(override?.facing ?? defaultFacing, defaultFacing);

    participants.push(
      Object.freeze({
        actorId,
        control: override?.control ?? (actorId === humanActorId ? "human" : "scripted"),
        body: Object.freeze({
          position,
          previousPosition: position,
          velocity,
          facing,
          radius: SIMULATION_TUNING.body.radius,
          baseMassFactor: normalizeMassFactor(
            override?.massFactor ?? SIMULATION_TUNING.mass.default,
          ),
          massFactor: normalizeMassFactor(override?.massFactor ?? SIMULATION_TUNING.mass.default),
          unsupportedTicks: 0,
        }),
        action: createReadyAction(0),
        cooldowns: Object.freeze({ shoveReadyTick: 0, dodgeReadyTick: 0 }),
        effects: Object.freeze([]),
        active: true,
      }),
    );
  }

  return Object.freeze(participants);
}

function isGroundAction(kind: ParticipantActionKind): boolean {
  return kind !== "Falling" && kind !== "Eliminated";
}

function isCollidable(participant: ParticipantState): boolean {
  return participant.active && isGroundAction(participant.action.kind);
}

function findSweptCircleContact(
  left: ParticipantState,
  right: ParticipantState,
  minimumDistance: number,
): SweptCircleContact | undefined {
  const leftMotion = subtractVectors(left.body.position, left.body.previousPosition);
  const rightMotion = subtractVectors(right.body.position, right.body.previousPosition);
  const relativeStart = subtractVectors(right.body.previousPosition, left.body.previousPosition);
  const relativeMotion = subtractVectors(rightMotion, leftMotion);
  const quadraticA = vectorLengthSquared(relativeMotion);
  const quadraticB = 2 * dotVectors(relativeStart, relativeMotion);
  const quadraticC = vectorLengthSquared(relativeStart) - minimumDistance * minimumDistance;

  if (quadraticA === 0 || quadraticC < 0 || quadraticB >= 0) {
    return undefined;
  }

  const discriminant = quadraticB * quadraticB - 4 * quadraticA * quadraticC;

  if (discriminant < 0) {
    return undefined;
  }

  const time = (-quadraticB - Math.sqrt(discriminant)) / (2 * quadraticA);

  if (time < 0 || time > 1) {
    return undefined;
  }

  const leftPosition = addVectors(left.body.previousPosition, scaleVector(leftMotion, time));
  const rightPosition = addVectors(right.body.previousPosition, scaleVector(rightMotion, time));
  const delta = subtractVectors(rightPosition, leftPosition);
  const distance = vectorLength(delta);
  const normal =
    distance === 0
      ? Object.freeze({ x: left.actorId < right.actorId ? 1 : -1, y: 0 })
      : scaleVector(delta, 1 / distance);

  return Object.freeze({ time, normal, leftPosition, rightPosition });
}

function hasTileSupport(position: Vector2, tilesById: ReadonlySet<string>): boolean {
  return tilesById.has(`${Math.floor(position.x)}:${Math.floor(position.y)}`);
}

function getMissedStumbleTicks(participant: ParticipantState): number {
  const speedTicks =
    (vectorLength(participant.body.velocity) * SIMULATION_TUNING.shove.missedStumbleSpeedTicks) /
    participant.body.massFactor;
  return SIMULATION_TUNING.shove.missedStumbleBaseTicks + Math.ceil(speedTicks);
}

export class SimulationWorld {
  readonly #config: GameConfigV1;
  readonly #roundId: RoundId;
  readonly #collapsePlan: readonly CollapseWave[];
  readonly #collapseTransitionTicks: ReadonlySet<number>;
  readonly #itemRandom;
  readonly #tieBreakRandom;
  #tiles: readonly TileState[];
  #participants: readonly ParticipantState[];
  #itemState: ItemSystemState;
  #round: RoundStateV1 = Object.freeze({
    status: "Active",
    winnerActorId: null,
    reason: null,
    completedTick: null,
  });
  #tick = 0;
  #eventSequence = 0;

  public readonly systemOrder = SYSTEM_ORDER;

  public constructor(
    config: GameConfigV1,
    masterSeed: SeedInput,
    options: SimulationWorldOptions = {},
  ) {
    const roundId = options.roundId ?? 1;
    const humanActorId = options.humanActorId ?? 1;

    if (!Number.isSafeInteger(roundId) || roundId < 1) {
      throw new SimulationContractError("roundId must be a positive safe integer");
    }

    if (
      !Number.isSafeInteger(humanActorId) ||
      humanActorId < 1 ||
      humanActorId > config.participantCount
    ) {
      throw new SimulationContractError("humanActorId must identify a configured participant");
    }

    const streams = new RandomStreamSet(masterSeed);
    this.#config = config;
    this.#roundId = roundId;
    this.#tiles = createTiles(config);
    this.#collapsePlan = createCollapsePlan(
      this.#tiles,
      config.arenaColumns,
      config.arenaRows,
      config.collapseSpeed,
      streams.get("collapse"),
    );
    this.#collapseTransitionTicks = new Set(
      this.#collapsePlan.flatMap(({ warningTick, collapsingTick, voidTick }) => [
        warningTick,
        collapsingTick,
        voidTick,
      ]),
    );
    this.#participants = createParticipants(
      config,
      streams,
      humanActorId,
      options.participantOverrides ?? [],
    );
    this.#itemRandom = streams.get("items");
    this.#tieBreakRandom = streams.get("tie-break");
    this.#itemState = createItemSystem(
      config,
      this.#tiles,
      this.#participants,
      this.#itemRandom,
      options.itemOverrides,
    );
  }

  public get tick(): number {
    return this.#tick;
  }

  public get config(): GameConfigV1 {
    return this.#config;
  }

  public step(commands: readonly ActorCommandV1[] = []): SimulationStepResult {
    if (this.#round.status === "Completed") {
      throw new SimulationContractError("round has already completed");
    }

    if (this.#tick >= this.#config.roundLimitTicks) {
      throw new SimulationContractError("round tick limit has been reached");
    }

    const events: SimulationEventV1[] = [];
    const commandsByActor = this.#collectCommands(commands, events);
    let participants: readonly ParticipantState[] = this.#participants.map((participant) =>
      Object.freeze({
        ...participant,
        body: Object.freeze({
          ...participant.body,
          previousPosition: participant.body.position,
        }),
      }),
    );

    participants = this.#advanceExpiredActions(participants, events);
    participants = expireEffects(participants, this.#tick);
    participants = this.#startRequestedActions(participants, commandsByActor, events);
    participants = this.#applyMovementIntent(participants, commandsByActor);
    participants = this.#integratePositions(participants);
    const collidableParticipants = participants.filter(isCollidable).map((participant) =>
      Object.freeze({
        actorId: participant.actorId,
        position: participant.body.position,
      }),
    );
    const spatialHash = new ParticipantSpatialHash(
      collidableParticipants,
      SIMULATION_TUNING.spatialHash.cellSize,
    );
    const candidatePairs = spatialHash.getCandidatePairs();
    participants = this.#resolveWeakContacts(participants, candidatePairs);
    participants = this.#resolveShoves(participants, candidatePairs, events);
    participants = this.#resolveSupport(participants, events);
    const pickupResult = resolveItemPickups(
      participants,
      this.#itemState,
      this.#tick,
      this.#tieBreakRandom,
    );
    participants = pickupResult.participants;
    this.#itemState = pickupResult.state;
    this.#emitItemFacts(pickupResult.facts, events);

    this.#participants = Object.freeze(participants);
    const arenaChanged = this.#advanceCollapse(events);
    const spawnResult = advanceItemSpawns(
      this.#config,
      this.#itemState,
      this.#tiles,
      participants,
      this.#tick,
      this.#itemRandom,
      arenaChanged,
    );
    this.#itemState = spawnResult.state;
    this.#emitItemFacts(spawnResult.facts, events);
    this.#evaluateRound(participants, events);
    this.#tick += 1;

    return Object.freeze({
      frame: this.createRenderFrame(),
      events: Object.freeze(events),
      diagnostics: Object.freeze({
        collidableParticipants: collidableParticipants.length,
        broadPhaseCandidatePairs: candidatePairs.length,
        fullPairCount: (collidableParticipants.length * (collidableParticipants.length - 1)) / 2,
      }),
    });
  }

  public createRenderFrame(): RenderFrameV1 {
    const stateHash = hashWorldState({
      roundId: this.#roundId,
      tick: this.#tick,
      participants: this.#participants,
      items: this.#itemState.items,
      nextItemId: this.#itemState.nextItemId,
      nextItemSpawnTick: this.#itemState.nextSpawnTick,
      tiles: this.#tiles,
      round: this.#round,
    });

    return Object.freeze({
      frameVersion: 1,
      roundId: this.#roundId,
      tick: this.#tick,
      stateHash,
      participants: Object.freeze(
        this.#participants
          .toSorted((left, right) => left.actorId - right.actorId)
          .map((participant) =>
            Object.freeze({
              actorId: participant.actorId,
              position: participant.body.position,
              previousPosition: participant.body.previousPosition,
              velocity: participant.body.velocity,
              facing: participant.body.facing,
              radius: participant.body.radius,
              massFactor: participant.body.massFactor,
              action: participant.action.kind,
              active: participant.active,
              unsupportedTicks: participant.body.unsupportedTicks,
              shoveReadyTick: participant.cooldowns.shoveReadyTick,
              dodgeReadyTick: participant.cooldowns.dodgeReadyTick,
              effects: participant.effects,
              springBoosted: participant.action.springBoosted,
            }),
          ),
      ),
      items: this.#itemState.items,
      tiles: this.#tiles,
      round: this.#round,
    });
  }

  #collectCommands(
    commands: readonly ActorCommandV1[],
    events: SimulationEventV1[],
  ): ReadonlyMap<ActorId, ActorCommandV1> {
    const commandsByActor = new Map<ActorId, ActorCommandV1>();
    const knownActorIds = new Set(this.#participants.map((participant) => participant.actorId));

    for (const rawCommand of commands) {
      const command = normalizeActorCommand(rawCommand);

      if (command.tick !== this.#tick) {
        throw new SimulationContractError(
          `command tick ${command.tick} does not match world tick ${this.#tick}`,
        );
      }

      if (commandsByActor.has(command.actorId)) {
        throw new SimulationContractError(
          `duplicate command for actor ${command.actorId} at tick ${this.#tick}`,
        );
      }

      commandsByActor.set(command.actorId, command);

      if (!knownActorIds.has(command.actorId)) {
        events.push(
          this.#createEvent("command-ignored", {
            actorId: command.actorId,
            reason: "unknown-actor",
          }),
        );
      }
    }

    return commandsByActor;
  }

  #advanceExpiredActions(
    participants: readonly ParticipantState[],
    events: SimulationEventV1[],
  ): readonly ParticipantState[] {
    return participants.map((participant) => {
      const { action } = participant;

      if (action.endsTick === null || this.#tick < action.endsTick) {
        return participant;
      }

      if (action.kind === "ShoveWindup") {
        return Object.freeze({
          ...participant,
          action: createTimedAction(
            "ShoveActive",
            this.#tick,
            SIMULATION_TUNING.shove.activeTicks,
            action.lockedDirection,
            action.hitActorIds,
            action.resolvedActorIds,
            action.springBoosted,
          ),
        });
      }

      if (action.kind === "ShoveActive") {
        if (action.hitActorIds.length === 0) {
          events.push(
            this.#createEvent("shove-missed", {
              actorId: participant.actorId,
              vector: participant.body.velocity,
            }),
          );
          return Object.freeze({
            ...participant,
            action: createTimedAction(
              "Stumbling",
              this.#tick,
              getMissedStumbleTicks(participant),
              action.lockedDirection,
            ),
          });
        }

        return Object.freeze({
          ...participant,
          action: createTimedAction(
            "ShoveRecovery",
            this.#tick,
            SIMULATION_TUNING.shove.recoveryTicks,
            action.lockedDirection,
            action.hitActorIds,
            action.resolvedActorIds,
          ),
        });
      }

      if (action.kind === "Falling") {
        events.push(this.#createEvent("eliminated", { actorId: participant.actorId }));
        return Object.freeze({
          ...participant,
          active: false,
          body: Object.freeze({ ...participant.body, velocity: ZERO_VECTOR }),
          action: createTimedAction("Eliminated", this.#tick, 0, null),
        });
      }

      if (
        action.kind === "DodgeActive" ||
        action.kind === "ShoveRecovery" ||
        action.kind === "Stumbling"
      ) {
        return Object.freeze({ ...participant, action: createReadyAction(this.#tick) });
      }

      return participant;
    });
  }

  #startRequestedActions(
    participants: readonly ParticipantState[],
    commandsByActor: ReadonlyMap<ActorId, ActorCommandV1>,
    events: SimulationEventV1[],
  ): readonly ParticipantState[] {
    return participants.map((participant) => {
      const command =
        commandsByActor.get(participant.actorId) ??
        createNeutralCommand(this.#tick, participant.actorId);

      if (!participant.active || !isGroundAction(participant.action.kind)) {
        if (commandsByActor.has(participant.actorId)) {
          events.push(
            this.#createEvent("command-ignored", {
              actorId: participant.actorId,
              reason: "inactive-actor",
            }),
          );
        }

        return participant;
      }

      if (participant.action.kind !== "Ready") {
        return participant;
      }

      const direction = normalizeDirectionOrFallback(command.move, participant.body.facing);

      if (command.dodgePressed && this.#tick >= participant.cooldowns.dodgeReadyTick) {
        events.push(
          this.#createEvent("dodge-started", {
            actorId: participant.actorId,
            vector: direction,
          }),
        );
        return Object.freeze({
          ...participant,
          body: Object.freeze({ ...participant.body, facing: direction }),
          action: createTimedAction(
            "DodgeActive",
            this.#tick,
            SIMULATION_TUNING.dodge.activeTicks,
            direction,
          ),
          cooldowns: Object.freeze({
            ...participant.cooldowns,
            dodgeReadyTick: this.#tick + SIMULATION_TUNING.dodge.cooldownTicks,
          }),
        });
      }

      if (command.shovePressed && this.#tick >= participant.cooldowns.shoveReadyTick) {
        const springBoosted = hasSpringGlove(participant);
        const participantWithoutSpring = springBoosted
          ? consumeSpringGlove(participant)
          : participant;
        events.push(
          this.#createEvent("shove-started", {
            actorId: participant.actorId,
            vector: direction,
          }),
        );
        return Object.freeze({
          ...participantWithoutSpring,
          body: Object.freeze({ ...participantWithoutSpring.body, facing: direction }),
          action: createTimedAction(
            "ShoveWindup",
            this.#tick,
            SIMULATION_TUNING.shove.windupTicks,
            direction,
            [],
            [],
            springBoosted,
          ),
          cooldowns: Object.freeze({
            ...participantWithoutSpring.cooldowns,
            shoveReadyTick: this.#tick + SIMULATION_TUNING.shove.cooldownTicks,
          }),
        });
      }

      return participant;
    });
  }

  #applyMovementIntent(
    participants: readonly ParticipantState[],
    commandsByActor: ReadonlyMap<ActorId, ActorCommandV1>,
  ): readonly ParticipantState[] {
    return participants.map((participant) => {
      if (!participant.active) {
        return participant;
      }

      const command =
        commandsByActor.get(participant.actorId) ??
        createNeutralCommand(this.#tick, participant.actorId);
      const profile = getMovementProfile(participant.body.massFactor);
      const inputDirection = normalizeVector(command.move);
      let velocity = participant.body.velocity;
      let facing = participant.body.facing;

      switch (participant.action.kind) {
        case "Ready": {
          const targetVelocity = scaleVector(inputDirection, profile.maximumSpeed);
          velocity = moveVectorToward(velocity, targetVelocity, profile.acceleration);
          velocity = isZeroVector(inputDirection)
            ? scaleVector(velocity, SIMULATION_TUNING.movement.passiveDrag)
            : velocity;
          facing = isZeroVector(inputDirection) ? facing : inputDirection;
          break;
        }
        case "ShoveWindup": {
          const targetVelocity = scaleVector(
            inputDirection,
            profile.maximumSpeed * SIMULATION_TUNING.movement.windupControl,
          );
          velocity = moveVectorToward(
            velocity,
            targetVelocity,
            profile.acceleration * SIMULATION_TUNING.movement.windupControl,
          );
          facing = participant.action.lockedDirection ?? facing;
          break;
        }
        case "ShoveActive": {
          const direction = participant.action.lockedDirection ?? facing;
          const forwardSpeed = dotVectors(velocity, direction);
          const lateralVelocity = subtractVectors(velocity, scaleVector(direction, forwardSpeed));
          const shoveSpeedMultiplier = participant.action.springBoosted
            ? getItemDefinition("spring-glove").shoveSpeedMultiplier
            : 1;
          velocity = addVectors(
            scaleVector(
              direction,
              Math.max(forwardSpeed, SIMULATION_TUNING.shove.activeSpeed * shoveSpeedMultiplier),
            ),
            scaleVector(lateralVelocity, 0.25),
          );
          facing = direction;
          break;
        }
        case "ShoveRecovery": {
          const targetVelocity = scaleVector(
            inputDirection,
            profile.maximumSpeed * SIMULATION_TUNING.movement.recoveryControl,
          );
          velocity = moveVectorToward(
            scaleVector(velocity, SIMULATION_TUNING.movement.passiveDrag),
            targetVelocity,
            profile.acceleration * SIMULATION_TUNING.movement.recoveryControl,
          );
          break;
        }
        case "DodgeActive": {
          const direction = participant.action.lockedDirection ?? facing;
          velocity = scaleVector(
            direction,
            SIMULATION_TUNING.dodge.speed * getDodgeSpeedMultiplier(participant),
          );
          facing = direction;
          break;
        }
        case "Stumbling": {
          velocity = scaleVector(velocity, SIMULATION_TUNING.movement.stumbleDrag);
          break;
        }
        case "Anchored": {
          velocity = ZERO_VECTOR;
          break;
        }
        case "Falling": {
          velocity = scaleVector(velocity, 0.85);
          break;
        }
        case "Eliminated": {
          velocity = ZERO_VECTOR;
          break;
        }
      }

      velocity = clampVectorLength(velocity, SIMULATION_TUNING.body.maximumSpeed);
      assertFiniteNumber(velocity.x, `actor ${participant.actorId} velocity.x`);
      assertFiniteNumber(velocity.y, `actor ${participant.actorId} velocity.y`);

      return Object.freeze({
        ...participant,
        body: Object.freeze({ ...participant.body, velocity, facing }),
      });
    });
  }

  #integratePositions(participants: readonly ParticipantState[]): readonly ParticipantState[] {
    return participants.map((participant) => {
      if (!participant.active || participant.action.kind === "Eliminated") {
        return participant;
      }

      const position = addVectors(participant.body.position, participant.body.velocity);
      assertFiniteNumber(position.x, `actor ${participant.actorId} position.x`);
      assertFiniteNumber(position.y, `actor ${participant.actorId} position.y`);

      return Object.freeze({
        ...participant,
        body: Object.freeze({ ...participant.body, position }),
      });
    });
  }

  #resolveWeakContacts(
    participants: readonly ParticipantState[],
    candidatePairs: readonly ActorPair[],
  ): readonly ParticipantState[] {
    const participantIndices = new Map(
      participants.map((participant, index) => [participant.actorId, index] as const),
    );
    const positions = participants.map((participant) => participant.body.position);
    const velocities = participants.map((participant) => participant.body.velocity);

    for (
      let iteration = 0;
      iteration < SIMULATION_TUNING.body.weakContactIterations;
      iteration += 1
    ) {
      for (const pair of candidatePairs) {
        const leftIndex = participantIndices.get(pair.leftActorId);
        const rightIndex = participantIndices.get(pair.rightActorId);

        if (leftIndex === undefined || rightIndex === undefined) {
          continue;
        }

        const left = participants[leftIndex];
        const right = participants[rightIndex];

        if (left === undefined || right === undefined) {
          continue;
        }

        const leftPosition = positions[leftIndex] ?? left.body.position;
        const rightPosition = positions[rightIndex] ?? right.body.position;
        const delta = subtractVectors(rightPosition, leftPosition);
        const minimumDistance = left.body.radius + right.body.radius;
        const distanceSquared = vectorLengthSquared(delta);
        const overlapping = distanceSquared < minimumDistance * minimumDistance;
        const sweptContact =
          iteration === 0 ? findSweptCircleContact(left, right, minimumDistance) : undefined;

        if (!overlapping && sweptContact === undefined) {
          continue;
        }

        const distance = Math.sqrt(distanceSquared);
        const normal =
          sweptContact?.normal ??
          (distance === 0
            ? Object.freeze({ x: left.actorId < right.actorId ? 1 : -1, y: 0 })
            : scaleVector(delta, 1 / distance));
        const leftInverseMass = 1 / left.body.massFactor;
        const rightInverseMass = 1 / right.body.massFactor;
        const inverseMassTotal = leftInverseMass + rightInverseMass;
        const leftVelocity = velocities[leftIndex] ?? left.body.velocity;
        const rightVelocity = velocities[rightIndex] ?? right.body.velocity;
        const relativeNormalSpeed = dotVectors(
          subtractVectors(rightVelocity, leftVelocity),
          normal,
        );

        if (sweptContact !== undefined) {
          if (relativeNormalSpeed >= 0) {
            continue;
          }

          const contactImpulse =
            (-relativeNormalSpeed * (1 + SIMULATION_TUNING.body.weakContactVelocityDamping)) /
            inverseMassTotal;
          const nextLeftVelocity = subtractVectors(
            leftVelocity,
            scaleVector(normal, contactImpulse * leftInverseMass),
          );
          const nextRightVelocity = addVectors(
            rightVelocity,
            scaleVector(normal, contactImpulse * rightInverseMass),
          );
          const remainingTime = 1 - sweptContact.time;
          positions[leftIndex] = addVectors(
            sweptContact.leftPosition,
            scaleVector(nextLeftVelocity, remainingTime),
          );
          positions[rightIndex] = addVectors(
            sweptContact.rightPosition,
            scaleVector(nextRightVelocity, remainingTime),
          );
          velocities[leftIndex] = nextLeftVelocity;
          velocities[rightIndex] = nextRightVelocity;
          continue;
        }

        const overlap = Math.max(
          0,
          minimumDistance - distance - SIMULATION_TUNING.body.weakContactSlop,
        );
        positions[leftIndex] = subtractVectors(
          leftPosition,
          scaleVector(normal, (overlap * leftInverseMass) / inverseMassTotal),
        );
        positions[rightIndex] = addVectors(
          rightPosition,
          scaleVector(normal, (overlap * rightInverseMass) / inverseMassTotal),
        );

        if (relativeNormalSpeed < 0) {
          const contactImpulse =
            (-relativeNormalSpeed * SIMULATION_TUNING.body.weakContactVelocityDamping) /
            inverseMassTotal;
          velocities[leftIndex] = subtractVectors(
            leftVelocity,
            scaleVector(normal, contactImpulse * leftInverseMass),
          );
          velocities[rightIndex] = addVectors(
            rightVelocity,
            scaleVector(normal, contactImpulse * rightInverseMass),
          );
        }
      }
    }

    return participants.map((participant, index) =>
      Object.freeze({
        ...participant,
        body: Object.freeze({
          ...participant.body,
          position: positions[index] ?? participant.body.position,
          velocity: clampVectorLength(
            velocities[index] ?? participant.body.velocity,
            SIMULATION_TUNING.body.maximumSpeed,
          ),
        }),
      }),
    );
  }

  #resolveShoves(
    participants: readonly ParticipantState[],
    candidatePairs: readonly ActorPair[],
    events: SimulationEventV1[],
  ): readonly ParticipantState[] {
    const ordered = participants.toSorted((left, right) => left.actorId - right.actorId);
    const participantsById = new Map(
      ordered.map((participant) => [participant.actorId, participant] as const),
    );
    const candidateIdsByActor = new Map<ActorId, ActorId[]>();

    for (const pair of candidatePairs) {
      const leftCandidates = candidateIdsByActor.get(pair.leftActorId) ?? [];
      leftCandidates.push(pair.rightActorId);
      candidateIdsByActor.set(pair.leftActorId, leftCandidates);
      const rightCandidates = candidateIdsByActor.get(pair.rightActorId) ?? [];
      rightCandidates.push(pair.leftActorId);
      candidateIdsByActor.set(pair.rightActorId, rightCandidates);
    }

    const impulses = new Map<ActorId, Vector2>();
    const newlyHit = new Map<ActorId, Set<ActorId>>();
    const newlyResolved = new Map<ActorId, Set<ActorId>>();

    for (const attacker of ordered) {
      if (!isCollidable(attacker) || attacker.action.kind !== "ShoveActive") {
        continue;
      }

      const direction = attacker.action.lockedDirection ?? attacker.body.facing;
      const resolved = new Set(attacker.action.resolvedActorIds);

      for (const targetActorId of candidateIdsByActor
        .get(attacker.actorId)
        ?.toSorted((left, right) => left - right) ?? []) {
        const target = participantsById.get(targetActorId);

        if (target === undefined || !isCollidable(target) || resolved.has(target.actorId)) {
          continue;
        }

        const delta = subtractVectors(target.body.position, attacker.body.position);
        const distance = vectorLength(delta);
        const normal = distance === 0 ? direction : scaleVector(delta, 1 / distance);
        const maximumContactDistance =
          attacker.body.radius + target.body.radius + SIMULATION_TUNING.shove.reach;

        if (
          distance > maximumContactDistance ||
          dotVectors(direction, normal) < SIMULATION_TUNING.shove.coneCosine
        ) {
          continue;
        }

        const resolvedTargets = newlyResolved.get(attacker.actorId) ?? new Set<ActorId>();
        resolvedTargets.add(target.actorId);
        newlyResolved.set(attacker.actorId, resolvedTargets);

        const targetIsEvading =
          target.action.kind === "DodgeActive" &&
          this.#tick - target.action.startedTick < SIMULATION_TUNING.dodge.evasionTicks;

        if (targetIsEvading) {
          events.push(
            this.#createEvent("dodge-succeeded", {
              actorId: target.actorId,
              targetActorId: attacker.actorId,
              vector: target.action.lockedDirection ?? target.body.facing,
            }),
          );
          continue;
        }

        const forwardSpeed = Math.max(0, dotVectors(attacker.body.velocity, direction));
        const rawImpulse =
          (SIMULATION_TUNING.shove.baseImpulse +
            forwardSpeed * SIMULATION_TUNING.shove.velocityImpulseScale) *
          (attacker.body.massFactor / target.body.massFactor) *
          (attacker.action.springBoosted
            ? getItemDefinition("spring-glove").shoveImpulseMultiplier
            : 1);
        const impulse = scaleVector(
          normal,
          Math.min(rawImpulse, SIMULATION_TUNING.shove.maximumImpulse),
        );
        impulses.set(
          target.actorId,
          addVectors(impulses.get(target.actorId) ?? ZERO_VECTOR, impulse),
        );
        const hitTargets = newlyHit.get(attacker.actorId) ?? new Set<ActorId>();
        hitTargets.add(target.actorId);
        newlyHit.set(attacker.actorId, hitTargets);
        events.push(
          this.#createEvent("shove-hit", {
            actorId: attacker.actorId,
            targetActorId: target.actorId,
            vector: impulse,
          }),
        );
      }
    }

    return participants.map((participant) => {
      const hitActorIds = new Set(participant.action.hitActorIds);
      const resolvedActorIds = new Set(participant.action.resolvedActorIds);

      for (const actorId of newlyHit.get(participant.actorId) ?? []) {
        hitActorIds.add(actorId);
      }

      for (const actorId of newlyResolved.get(participant.actorId) ?? []) {
        resolvedActorIds.add(actorId);
      }

      let action: ActionState =
        participant.action.kind === "ShoveActive"
          ? Object.freeze({
              ...participant.action,
              hitActorIds: Object.freeze([...hitActorIds].toSorted((left, right) => left - right)),
              resolvedActorIds: Object.freeze(
                [...resolvedActorIds].toSorted((left, right) => left - right),
              ),
            })
          : participant.action;
      const impulse = impulses.get(participant.actorId) ?? ZERO_VECTOR;
      const velocity = clampVectorLength(
        addVectors(participant.body.velocity, impulse),
        SIMULATION_TUNING.body.maximumSpeed,
      );

      if (
        vectorLength(impulse) >= SIMULATION_TUNING.shove.stumbleImpulseThreshold &&
        isGroundAction(action.kind)
      ) {
        action = createTimedAction(
          "Stumbling",
          this.#tick,
          SIMULATION_TUNING.shove.hitStumbleTicks,
          normalizeDirectionOrFallback(impulse, participant.body.facing),
        );
      }

      return Object.freeze({
        ...participant,
        action,
        body: Object.freeze({ ...participant.body, velocity }),
      });
    });
  }

  #resolveSupport(
    participants: readonly ParticipantState[],
    events: SimulationEventV1[],
  ): readonly ParticipantState[] {
    const supportedTileIds = new Set(
      this.#tiles.filter(({ state }) => state !== "Void").map(({ tileId }) => tileId),
    );

    return participants.map((participant) => {
      if (!participant.active || !isGroundAction(participant.action.kind)) {
        return participant;
      }

      if (hasTileSupport(participant.body.position, supportedTileIds)) {
        if (participant.body.unsupportedTicks === 0) {
          return participant;
        }

        return Object.freeze({
          ...participant,
          body: Object.freeze({ ...participant.body, unsupportedTicks: 0 }),
        });
      }

      const unsupportedTicks = participant.body.unsupportedTicks + 1;

      if (unsupportedTicks < SIMULATION_TUNING.support.graceTicks) {
        return Object.freeze({
          ...participant,
          body: Object.freeze({ ...participant.body, unsupportedTicks }),
        });
      }

      events.push(
        this.#createEvent("falling-started", {
          actorId: participant.actorId,
          vector: participant.body.velocity,
        }),
      );
      const participantWithoutEffects = clearEffects(participant);
      return Object.freeze({
        ...participantWithoutEffects,
        body: Object.freeze({
          ...participantWithoutEffects.body,
          velocity: ZERO_VECTOR,
          unsupportedTicks,
        }),
        action: createTimedAction(
          "Falling",
          this.#tick,
          SIMULATION_TUNING.support.fallingTicks,
          null,
        ),
      });
    });
  }

  #advanceCollapse(events: SimulationEventV1[]): boolean {
    if (!this.#collapseTransitionTicks.has(this.#tick)) {
      return false;
    }

    const result = advanceCollapse(this.#tiles, this.#collapsePlan, this.#tick);
    this.#tiles = result.tiles;

    for (const transition of result.transitions) {
      const kind: SimulationEventKind =
        transition.to === "Warning"
          ? "tile-warning"
          : transition.to === "Collapsing"
            ? "tile-collapsing"
            : "tile-void";
      events.push(this.#createEvent(kind, { tileId: transition.tileId }));
    }

    return result.transitions.length > 0;
  }

  #emitItemFacts(facts: readonly ItemEventFact[], events: SimulationEventV1[]): void {
    for (const fact of facts) {
      events.push(
        this.#createEvent(fact.kind, {
          ...(fact.actorId === undefined ? {} : { actorId: fact.actorId }),
          itemId: fact.itemId,
          itemDefinitionId: fact.itemDefinitionId,
        }),
      );
    }
  }

  #evaluateRound(participants: readonly ParticipantState[], events: SimulationEventV1[]): void {
    const standing = participants.filter(
      (participant) =>
        participant.active &&
        participant.action.kind !== "Falling" &&
        participant.action.kind !== "Eliminated",
    );
    const attritionStarted = participants.some(
      (participant) =>
        !participant.active ||
        participant.action.kind === "Falling" ||
        participant.action.kind === "Eliminated",
    );
    const reachedTimeLimit = this.#tick + 1 >= this.#config.roundLimitTicks;

    if ((!attritionStarted || standing.length > 1) && !reachedTimeLimit) {
      return;
    }

    const winnerActorId = standing.length === 1 ? (standing[0]?.actorId ?? null) : null;
    const reason =
      attritionStarted && standing.length === 1
        ? "last-standing"
        : attritionStarted && standing.length === 0
          ? "no-survivors"
          : "time-limit";
    this.#round = Object.freeze({
      status: "Completed",
      winnerActorId,
      reason,
      completedTick: this.#tick + 1,
    });
    events.push(
      this.#createEvent(
        "round-completed",
        winnerActorId === null ? { reason } : { winnerActorId, reason },
      ),
    );
  }

  #createEvent(kind: SimulationEventKind, details: EventDetails = {}): SimulationEventV1 {
    const event: SimulationEventV1 = Object.freeze({
      eventVersion: 1,
      roundId: this.#roundId,
      tick: this.#tick,
      sequence: this.#eventSequence,
      kind,
      ...(details.actorId === undefined ? {} : { actorId: details.actorId }),
      ...(details.targetActorId === undefined ? {} : { targetActorId: details.targetActorId }),
      ...(details.tileId === undefined ? {} : { tileId: details.tileId }),
      ...(details.itemId === undefined ? {} : { itemId: details.itemId }),
      ...(details.itemDefinitionId === undefined
        ? {}
        : { itemDefinitionId: details.itemDefinitionId }),
      ...(details.winnerActorId === undefined ? {} : { winnerActorId: details.winnerActorId }),
      ...(details.vector === undefined ? {} : { vector: details.vector }),
      ...(details.reason === undefined ? {} : { reason: details.reason }),
    });
    this.#eventSequence += 1;
    return event;
  }
}

export function runHeadless(
  world: SimulationWorld,
  commandsByTick: ReadonlyMap<number, readonly ActorCommandV1[]>,
  endTick: number,
): RenderFrameV1 {
  if (
    !Number.isSafeInteger(endTick) ||
    endTick < world.tick ||
    endTick > world.config.roundLimitTicks
  ) {
    throw new SimulationContractError("endTick is outside the current round range");
  }

  while (world.tick < endTick) {
    world.step(commandsByTick.get(world.tick) ?? []);
  }

  return world.createRenderFrame();
}
