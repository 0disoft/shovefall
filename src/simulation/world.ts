import {
  createTileId,
  createNeutralCommand,
  normalizeActorCommand,
  type ActionState,
  type ActorCommandV1,
  type ActorId,
  type BombState,
  type BrickWallState,
  type GameConfigV1,
  type ItemDefinitionId,
  type ItemId,
  type InventorySlotIndex,
  type ParticipantActionKind,
  type ParticipantState,
  type RenderFrameV1,
  type RoundId,
  type RoundStateV1,
  type SimulationEventKind,
  type SimulationEventV1,
  type TileId,
  type TileState,
  type UpgradeStatId,
} from "./contracts";
import { advanceCollapse, createCollapsePlan, type CollapseWave } from "./collapse";
import { hashWorldState } from "./hash";
import {
  addVectors,
  assertFiniteNumber,
  clamp,
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
  activateTimedInventoryEffect,
  applyStartingItems,
  clearEffects,
  consumeInventoryCharge,
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
import {
  awardStatPoint,
  createParticipantProgression,
  getMobilityMultiplier,
  getPowerMultiplier,
  getReflexCooldownReduction,
  getStabilityMultiplier,
  spendStatPoint,
} from "./progression";
import { getItemDefinition } from "../content/items";
import {
  getMovementProfile,
  normalizeGameplayTuning,
  normalizeMassFactor,
  SIMULATION_TUNING,
  type GameplayTuningInput,
  type GameplayTuningV1,
} from "./tuning";
import { SYSTEM_ORDER } from "./versions";
import {
  createArenaTiles,
  createParticipantSpawnPositions,
  createRectangularArenaTiles,
} from "./arena";

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
  readonly startingItems?: readonly ItemDefinitionId[];
}

export interface SimulationWorldOptions {
  readonly roundId?: RoundId;
  readonly humanActorId?: ActorId;
  readonly participantOverrides?: readonly ParticipantSpawnOverride[];
  readonly itemOverrides?: readonly ItemSpawnOverride[];
  readonly gameplayTuning?: GameplayTuningInput;
  readonly arenaLayout?: "procedural-island" | "rectangular-fixture";
}

interface EventDetails {
  readonly actorId?: ActorId;
  readonly targetActorId?: ActorId;
  readonly tileId?: TileId;
  readonly itemId?: ItemId;
  readonly itemDefinitionId?: ItemDefinitionId;
  readonly winnerActorId?: ActorId;
  readonly vector?: Vector2;
  readonly position?: Vector2;
  readonly reason?: SimulationEventV1["reason"];
  readonly upgradeStat?: UpgradeStatId;
}

interface SweptCircleContact {
  readonly time: number;
  readonly normal: Vector2;
  readonly leftPosition: Vector2;
  readonly rightPosition: Vector2;
}

interface AxisAlignedBounds {
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumY: number;
  readonly maximumY: number;
}

interface SweptWallContact {
  readonly time: number;
  readonly normal: Vector2;
  readonly position: Vector2;
  readonly wall: BrickWallState;
}

interface RequestedActionResult {
  readonly participants: readonly ParticipantState[];
  readonly activeItemSlots: ReadonlyMap<ActorId, InventorySlotIndex>;
}

const WALL_CONTACT_EPSILON = 1e-9;

interface OffensiveCreditCandidate {
  readonly attackerActorId: ActorId;
  readonly strength: number;
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

function chooseOffensiveCredit(
  current: ParticipantState["shoveCredit"],
  candidate: OffensiveCreditCandidate | undefined,
  tick: number,
): ParticipantState["shoveCredit"] {
  if (candidate === undefined) {
    return current;
  }

  if (
    current.hitTick === tick &&
    (current.strength > candidate.strength ||
      (current.strength === candidate.strength &&
        current.attackerActorId !== null &&
        current.attackerActorId < candidate.attackerActorId))
  ) {
    return current;
  }

  return Object.freeze({
    attackerActorId: candidate.attackerActorId,
    hitTick: tick,
    strength: candidate.strength,
  });
}

function getRayCircleEntryDistance(
  origin: Vector2,
  direction: Vector2,
  center: Vector2,
  radius: number,
  maximumDistance: number,
): number | undefined {
  const delta = subtractVectors(center, origin);
  const projection = dotVectors(delta, direction);
  const perpendicularSquared = vectorLengthSquared(delta) - projection * projection;
  const radiusSquared = radius * radius;

  if (perpendicularSquared > radiusSquared) {
    return undefined;
  }

  const halfChord = Math.sqrt(Math.max(0, radiusSquared - perpendicularSquared));
  const exitDistance = projection + halfChord;
  const entryDistance = Math.max(0, projection - halfChord);

  return exitDistance >= 0 && entryDistance <= maximumDistance ? entryDistance : undefined;
}

function getDominantCardinalOffset(direction: Vector2): Vector2 {
  if (Math.abs(direction.x) >= Math.abs(direction.y)) {
    return Object.freeze({ x: direction.x < 0 ? -1 : 1, y: 0 });
  }

  return Object.freeze({ x: 0, y: direction.y < 0 ? -1 : 1 });
}

function getTileBounds(column: number, row: number, expansion = 0): AxisAlignedBounds {
  return Object.freeze({
    minimumX: column - expansion,
    maximumX: column + 1 + expansion,
    minimumY: row - expansion,
    maximumY: row + 1 + expansion,
  });
}

function circleIntersectsTile(
  position: Vector2,
  radius: number,
  column: number,
  row: number,
): boolean {
  const closestX = Math.max(column, Math.min(column + 1, position.x));
  const closestY = Math.max(row, Math.min(row + 1, position.y));
  const deltaX = position.x - closestX;
  const deltaY = position.y - closestY;
  return deltaX * deltaX + deltaY * deltaY < radius * radius;
}

function findSweptPointBoundsContact(
  start: Vector2,
  end: Vector2,
  bounds: AxisAlignedBounds,
): { readonly time: number; readonly normal: Vector2; readonly position: Vector2 } | undefined {
  const motion = subtractVectors(end, start);
  const inside =
    start.x >= bounds.minimumX &&
    start.x <= bounds.maximumX &&
    start.y >= bounds.minimumY &&
    start.y <= bounds.maximumY;

  if (inside) {
    const candidates = [
      {
        distance: start.x - bounds.minimumX,
        normal: Object.freeze({ x: -1, y: 0 }),
        position: Object.freeze({ x: bounds.minimumX, y: start.y }),
      },
      {
        distance: bounds.maximumX - start.x,
        normal: Object.freeze({ x: 1, y: 0 }),
        position: Object.freeze({ x: bounds.maximumX, y: start.y }),
      },
      {
        distance: start.y - bounds.minimumY,
        normal: Object.freeze({ x: 0, y: -1 }),
        position: Object.freeze({ x: start.x, y: bounds.minimumY }),
      },
      {
        distance: bounds.maximumY - start.y,
        normal: Object.freeze({ x: 0, y: 1 }),
        position: Object.freeze({ x: start.x, y: bounds.maximumY }),
      },
    ].toSorted((left, right) => left.distance - right.distance);
    const candidate = candidates[0] ?? {
      normal: Object.freeze({ x: -1, y: 0 }),
      position: Object.freeze({ x: bounds.minimumX, y: start.y }),
    };
    return Object.freeze({ time: 0, normal: candidate.normal, position: candidate.position });
  }

  let entryTime = 0;
  let exitTime = 1;
  let entryNormal: Vector2 = ZERO_VECTOR;

  for (const axis of ["x", "y"] as const) {
    const startValue = start[axis];
    const motionValue = motion[axis];
    const minimum = axis === "x" ? bounds.minimumX : bounds.minimumY;
    const maximum = axis === "x" ? bounds.maximumX : bounds.maximumY;

    if (motionValue === 0) {
      if (startValue < minimum || startValue > maximum) {
        return undefined;
      }
      continue;
    }

    const first = (minimum - startValue) / motionValue;
    const second = (maximum - startValue) / motionValue;
    const near = Math.min(first, second);
    const far = Math.max(first, second);

    if (near > entryTime) {
      entryTime = near;
      entryNormal =
        axis === "x"
          ? Object.freeze({ x: motionValue > 0 ? -1 : 1, y: 0 })
          : Object.freeze({ x: 0, y: motionValue > 0 ? -1 : 1 });
    }

    exitTime = Math.min(exitTime, far);

    if (entryTime > exitTime + WALL_CONTACT_EPSILON) {
      return undefined;
    }
  }

  return entryTime >= -WALL_CONTACT_EPSILON &&
    entryTime <= 1 + WALL_CONTACT_EPSILON &&
    !isZeroVector(entryNormal)
    ? Object.freeze({
        time: clamp(entryTime, 0, 1),
        normal: entryNormal,
        position: addVectors(start, scaleVector(motion, clamp(entryTime, 0, 1))),
      })
    : undefined;
}

function getRayTileEntryDistance(
  origin: Vector2,
  direction: Vector2,
  maximumDistance: number,
  wall: BrickWallState,
): number | undefined {
  const contact = findSweptPointBoundsContact(
    origin,
    addVectors(origin, scaleVector(direction, maximumDistance)),
    getTileBounds(wall.column, wall.row),
  );
  return contact === undefined ? undefined : contact.time * maximumDistance;
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

  if (
    override.startingItems !== undefined &&
    (override.startingItems.length > 2 ||
      new Set(override.startingItems).size !== override.startingItems.length)
  ) {
    throw new SimulationContractError("startingItems must contain at most two unique items");
  }
}

function createParticipants(
  config: GameConfigV1,
  tiles: readonly TileState[],
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

  const phase = streams.get("arena").nextFloat() * Math.PI * 2;
  const spawnPositions = createParticipantSpawnPositions(tiles, config.participantCount, phase);
  const participants: ParticipantState[] = [];

  for (let index = 0; index < config.participantCount; index += 1) {
    const actorId = index + 1;
    const angle = phase + (index / config.participantCount) * Math.PI * 2;
    const defaultFacing = Object.freeze({
      x: -Math.cos(angle),
      y: -Math.sin(angle),
    });
    const defaultPosition = spawnPositions[index] ?? Object.freeze({ x: 0.5, y: 0.5 });
    const override = overrides.get(actorId);
    const position = Object.freeze({ ...(override?.position ?? defaultPosition) });
    const velocity = clampVectorLength(
      override?.velocity ?? ZERO_VECTOR,
      SIMULATION_TUNING.body.maximumSpeed,
    );
    const facing = normalizeDirectionOrFallback(override?.facing ?? defaultFacing, defaultFacing);

    const participant: ParticipantState = Object.freeze({
      actorId,
      control: override?.control ?? (actorId === humanActorId ? "human" : "scripted"),
      body: Object.freeze({
        position,
        previousPosition: position,
        velocity,
        facing,
        radius: SIMULATION_TUNING.body.radius,
        baseMassFactor: normalizeMassFactor(override?.massFactor ?? SIMULATION_TUNING.mass.default),
        massFactor: normalizeMassFactor(override?.massFactor ?? SIMULATION_TUNING.mass.default),
        unsupportedTicks: 0,
      }),
      action: createReadyAction(0),
      cooldowns: Object.freeze({ shoveReadyTick: 0, dodgeReadyTick: 0 }),
      inventory: Object.freeze([]),
      effects: Object.freeze([]),
      progression: createParticipantProgression(),
      shoveCredit: Object.freeze({ attackerActorId: null, hitTick: null, strength: 0 }),
      active: true,
    });
    participants.push(applyStartingItems(participant, override?.startingItems ?? []));
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
  readonly #gameplayTuning: GameplayTuningV1;
  readonly #itemRandom;
  readonly #tieBreakRandom;
  readonly #arenaTileIds: ReadonlySet<TileId>;
  #tiles: readonly TileState[];
  #participants: readonly ParticipantState[];
  #brickWalls: readonly BrickWallState[] = Object.freeze([]);
  #bombs: readonly BombState[] = Object.freeze([]);
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
    this.#gameplayTuning = normalizeGameplayTuning(options.gameplayTuning);
    this.#tiles =
      options.arenaLayout === "rectangular-fixture"
        ? createRectangularArenaTiles(config)
        : createArenaTiles(config, streams.get("arena"));
    this.#arenaTileIds = new Set(this.#tiles.map(({ tileId }) => tileId));
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
      this.#tiles,
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
    participants = this.#applyUpgrades(participants, commandsByActor, events);
    const requestedActions = this.#startRequestedActions(participants, commandsByActor, events);
    participants = this.#resolveActiveItems(
      requestedActions.participants,
      requestedActions.activeItemSlots,
      events,
    );
    participants = this.#applyMovementIntent(participants, commandsByActor);
    participants = this.#integratePositions(participants);
    participants = this.#resolveBrickWallContacts(participants);
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
    participants = this.#resolveBrickWallContacts(participants, false);
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
      new Set(this.#brickWalls.map(({ tileId }) => tileId)),
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
      brickWalls: this.#brickWalls,
      bombs: this.#bombs,
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
              inventory: participant.inventory,
              effects: participant.effects,
              springBoosted: participant.action.springBoosted,
              progression: participant.progression,
            }),
          ),
      ),
      items: this.#itemState.items,
      brickWalls: this.#brickWalls,
      bombs: this.#bombs,
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

  #applyUpgrades(
    participants: readonly ParticipantState[],
    commandsByActor: ReadonlyMap<ActorId, ActorCommandV1>,
    events: SimulationEventV1[],
  ): readonly ParticipantState[] {
    return participants.map((participant) => {
      const requestedStat: UpgradeStatId | null =
        commandsByActor.get(participant.actorId)?.upgradeStat ?? null;

      if (requestedStat === null || !participant.active) {
        return participant;
      }

      const progression = spendStatPoint(participant.progression, requestedStat);

      if (progression === undefined) {
        return participant;
      }

      events.push(
        this.#createEvent("stat-upgraded", {
          actorId: participant.actorId,
          upgradeStat: requestedStat,
        }),
      );
      return Object.freeze({ ...participant, progression });
    });
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
            this.#gameplayTuning.shoveActiveTicks,
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
  ): RequestedActionResult {
    const activeItemSlots = new Map<ActorId, InventorySlotIndex>();
    const nextParticipants = participants.map((participant) => {
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
            this.#gameplayTuning.dodgeActiveTicks,
            direction,
          ),
          cooldowns: Object.freeze({
            ...participant.cooldowns,
            dodgeReadyTick:
              this.#tick +
              Math.max(
                30,
                SIMULATION_TUNING.dodge.cooldownTicks -
                  getReflexCooldownReduction(participant.progression.stats),
              ),
          }),
        });
      }

      if (command.useItemSlot !== null) {
        const slot = participant.inventory.find(
          (candidate) => candidate.slotIndex === command.useItemSlot,
        );

        const canActivate =
          slot?.definitionId === "wind-blast" ||
          (slot?.definitionId === "bomb" &&
            this.#getBombPlacement(participant, [], direction) !== undefined) ||
          (slot?.definitionId === "boat" &&
            hasTileSupport(participant.body.position, this.#arenaTileIds)) ||
          (slot?.definitionId === "brick-bag" &&
            this.#getBrickPlacement(participant, participants, [], direction) !== undefined);

        if (canActivate && slot.charges !== null && slot.charges > 0) {
          activeItemSlots.set(participant.actorId, command.useItemSlot);
          return Object.freeze({
            ...participant,
            body: Object.freeze({ ...participant.body, facing: direction }),
          });
        }
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
            shoveReadyTick:
              this.#tick +
              Math.max(
                24,
                SIMULATION_TUNING.shove.cooldownTicks -
                  getReflexCooldownReduction(participant.progression.stats),
              ),
          }),
        });
      }

      return participant;
    });

    return Object.freeze({
      participants: Object.freeze(nextParticipants),
      activeItemSlots,
    });
  }

  #resolveActiveItems(
    participants: readonly ParticipantState[],
    activeItemSlots: ReadonlyMap<ActorId, InventorySlotIndex>,
    events: SimulationEventV1[],
  ): readonly ParticipantState[] {
    if (
      activeItemSlots.size === 0 &&
      !this.#bombs.some(({ detonateTick }) => detonateTick <= this.#tick)
    ) {
      return participants;
    }

    const ordered = participants.toSorted((left, right) => left.actorId - right.actorId);
    const updatedById = new Map(ordered.map((participant) => [participant.actorId, participant]));
    const impulses = new Map<ActorId, Vector2>();
    const credits = new Map<
      ActorId,
      { readonly attackerActorId: ActorId; readonly strength: number }
    >();
    const placedWalls: BrickWallState[] = [];

    const dueBombs = this.#bombs
      .filter(({ detonateTick }) => detonateTick <= this.#tick)
      .toSorted(
        (left, right) =>
          left.detonateTick - right.detonateTick || left.ownerActorId - right.ownerActorId,
      );

    if (dueBombs.length > 0) {
      const dueBombKeys = new Set(
        dueBombs.map(({ ownerActorId, placedTick }) => `${ownerActorId}:${placedTick}`),
      );
      this.#bombs = Object.freeze(
        this.#bombs.filter(
          ({ ownerActorId, placedTick }) => !dueBombKeys.has(`${ownerActorId}:${placedTick}`),
        ),
      );

      for (const bomb of dueBombs) {
        events.push(
          this.#createEvent("bomb-detonated", {
            actorId: bomb.ownerActorId,
            itemDefinitionId: "bomb",
            position: bomb.position,
          }),
        );

        const owner = ordered.find(({ actorId }) => actorId === bomb.ownerActorId);
        const ownerPower = owner?.progression.stats;

        for (const target of ordered) {
          if (!isCollidable(target)) {
            continue;
          }

          const offset = subtractVectors(target.body.position, bomb.position);
          const edgeDistance = Math.max(0, vectorLength(offset) - target.body.radius);

          if (edgeDistance > SIMULATION_TUNING.bomb.blastRadius) {
            continue;
          }

          const targetIsEvading =
            target.action.kind === "DodgeActive" &&
            this.#tick - target.action.startedTick < SIMULATION_TUNING.dodge.evasionTicks;

          if (targetIsEvading) {
            events.push(
              this.#createEvent("dodge-succeeded", {
                actorId: target.actorId,
                targetActorId: bomb.ownerActorId,
                vector: target.action.lockedDirection ?? target.body.facing,
              }),
            );
            continue;
          }

          const distanceRatio = edgeDistance / SIMULATION_TUNING.bomb.blastRadius;
          const baseImpulse =
            SIMULATION_TUNING.bomb.centerImpulse -
            (SIMULATION_TUNING.bomb.centerImpulse - SIMULATION_TUNING.bomb.edgeImpulse) *
              distanceRatio;
          const rawImpulse =
            (baseImpulse / target.body.massFactor) *
            (ownerPower === undefined ? 1 : getPowerMultiplier(ownerPower)) *
            getStabilityMultiplier(target.progression.stats);
          const direction = normalizeDirectionOrFallback(offset, bomb.fallbackDirection);
          const impulse = scaleVector(
            direction,
            Math.min(rawImpulse, SIMULATION_TUNING.bomb.maximumImpulse),
          );
          impulses.set(
            target.actorId,
            addVectors(impulses.get(target.actorId) ?? ZERO_VECTOR, impulse),
          );
          const strength = vectorLength(impulse);
          const previousCredit = credits.get(target.actorId);

          if (
            target.actorId !== bomb.ownerActorId &&
            (previousCredit === undefined ||
              strength > previousCredit.strength ||
              (strength === previousCredit.strength &&
                bomb.ownerActorId < previousCredit.attackerActorId))
          ) {
            credits.set(
              target.actorId,
              Object.freeze({ attackerActorId: bomb.ownerActorId, strength }),
            );
          }
        }
      }
    }

    for (const attacker of ordered) {
      const slotIndex = activeItemSlots.get(attacker.actorId);
      const slot =
        slotIndex === undefined
          ? undefined
          : attacker.inventory.find((candidate) => candidate.slotIndex === slotIndex);

      if (
        slotIndex === undefined ||
        slot?.definitionId !== "brick-bag" ||
        !isCollidable(attacker)
      ) {
        continue;
      }

      const wall = this.#getBrickPlacement(attacker, ordered, placedWalls);

      if (wall === undefined) {
        continue;
      }

      const consumed = consumeInventoryCharge(attacker, slotIndex);

      if (consumed === undefined) {
        continue;
      }

      updatedById.set(attacker.actorId, consumed);
      placedWalls.push(wall);
      events.push(
        this.#createEvent("item-used", {
          actorId: attacker.actorId,
          itemDefinitionId: "brick-bag",
          tileId: wall.tileId,
          vector: attacker.body.facing,
        }),
        this.#createEvent("brick-wall-placed", {
          actorId: attacker.actorId,
          itemDefinitionId: "brick-bag",
          tileId: wall.tileId,
        }),
      );
    }

    if (placedWalls.length > 0) {
      this.#brickWalls = Object.freeze(
        [...this.#brickWalls, ...placedWalls].toSorted((left, right) =>
          left.tileId.localeCompare(right.tileId),
        ),
      );
    }

    const placedBombs: BombState[] = [];

    for (const participant of ordered) {
      const slotIndex = activeItemSlots.get(participant.actorId);
      const slot =
        slotIndex === undefined
          ? undefined
          : participant.inventory.find((candidate) => candidate.slotIndex === slotIndex);

      if (slotIndex === undefined || slot?.definitionId !== "bomb" || !isCollidable(participant)) {
        continue;
      }

      const bomb = this.#getBombPlacement(participant, placedBombs);

      if (bomb === undefined) {
        continue;
      }

      const consumed = consumeInventoryCharge(participant, slotIndex);

      if (consumed === undefined) {
        continue;
      }

      updatedById.set(participant.actorId, consumed);
      placedBombs.push(bomb);
      events.push(
        this.#createEvent("item-used", {
          actorId: participant.actorId,
          itemDefinitionId: "bomb",
          position: bomb.position,
          vector: bomb.fallbackDirection,
        }),
      );
    }

    if (placedBombs.length > 0) {
      this.#bombs = Object.freeze(
        [...this.#bombs, ...placedBombs].toSorted(
          (left, right) =>
            left.detonateTick - right.detonateTick || left.ownerActorId - right.ownerActorId,
        ),
      );
    }

    for (const participant of ordered) {
      const slotIndex = activeItemSlots.get(participant.actorId);
      const slot =
        slotIndex === undefined
          ? undefined
          : participant.inventory.find((candidate) => candidate.slotIndex === slotIndex);

      if (slotIndex === undefined || slot?.definitionId !== "boat" || !isCollidable(participant)) {
        continue;
      }

      const activated = activateTimedInventoryEffect(participant, slotIndex, this.#tick);

      if (activated === undefined) {
        continue;
      }

      updatedById.set(participant.actorId, activated);
      events.push(
        this.#createEvent("item-used", {
          actorId: participant.actorId,
          itemDefinitionId: "boat",
          vector: participant.body.facing,
        }),
      );
    }

    for (const attacker of ordered) {
      const slotIndex = activeItemSlots.get(attacker.actorId);

      if (slotIndex === undefined || !isCollidable(attacker)) {
        continue;
      }

      const slot = attacker.inventory.find((candidate) => candidate.slotIndex === slotIndex);

      if (slot?.definitionId !== "wind-blast") {
        continue;
      }

      const consumed = consumeInventoryCharge(attacker, slotIndex);

      if (consumed === undefined) {
        continue;
      }

      updatedById.set(attacker.actorId, consumed);
      const direction = normalizeDirectionOrFallback(attacker.body.facing, { x: 1, y: 0 });
      events.push(
        this.#createEvent("item-used", {
          actorId: attacker.actorId,
          itemDefinitionId: "wind-blast",
          vector: direction,
        }),
      );
      const targetHit = ordered
        .filter((candidate) => candidate.actorId !== attacker.actorId && isCollidable(candidate))
        .map((candidate) =>
          Object.freeze({
            candidate,
            entryDistance: getRayCircleEntryDistance(
              attacker.body.position,
              direction,
              candidate.body.position,
              candidate.body.radius,
              SIMULATION_TUNING.windBlast.range,
            ),
          }),
        )
        .filter(
          (candidate): candidate is typeof candidate & { readonly entryDistance: number } =>
            candidate.entryDistance !== undefined,
        )
        .toSorted(
          (left, right) =>
            left.entryDistance - right.entryDistance ||
            left.candidate.actorId - right.candidate.actorId,
        )[0];
      const nearestWallDistance = this.#brickWalls
        .map((wall) =>
          getRayTileEntryDistance(
            attacker.body.position,
            direction,
            SIMULATION_TUNING.windBlast.range,
            wall,
          ),
        )
        .filter((distance): distance is number => distance !== undefined)
        .toSorted((left, right) => left - right)[0];
      const target =
        targetHit !== undefined &&
        (nearestWallDistance === undefined || targetHit.entryDistance < nearestWallDistance)
          ? targetHit.candidate
          : undefined;

      if (target === undefined) {
        continue;
      }

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

      const rawImpulse =
        (SIMULATION_TUNING.windBlast.baseImpulse / target.body.massFactor) *
        getPowerMultiplier(attacker.progression.stats) *
        getStabilityMultiplier(target.progression.stats);
      const impulse = scaleVector(
        direction,
        Math.min(rawImpulse, SIMULATION_TUNING.windBlast.maximumImpulse),
      );
      impulses.set(
        target.actorId,
        addVectors(impulses.get(target.actorId) ?? ZERO_VECTOR, impulse),
      );
      const strength = vectorLength(impulse);
      const previousCredit = credits.get(target.actorId);

      if (
        previousCredit === undefined ||
        strength > previousCredit.strength ||
        (strength === previousCredit.strength && attacker.actorId < previousCredit.attackerActorId)
      ) {
        credits.set(target.actorId, Object.freeze({ attackerActorId: attacker.actorId, strength }));
      }
      events.push(
        this.#createEvent("wind-blast-hit", {
          actorId: attacker.actorId,
          targetActorId: target.actorId,
          itemDefinitionId: "wind-blast",
          vector: impulse,
        }),
      );
    }

    return participants.map((participant) => {
      const current = updatedById.get(participant.actorId) ?? participant;
      const impulse = impulses.get(participant.actorId);

      if (impulse === undefined) {
        return current;
      }

      const credit = credits.get(participant.actorId);
      return Object.freeze({
        ...current,
        body: Object.freeze({
          ...current.body,
          velocity: addVectors(current.body.velocity, impulse),
        }),
        action: createTimedAction(
          "Stumbling",
          this.#tick,
          SIMULATION_TUNING.bomb.stumbleTicks,
          normalizeDirectionOrFallback(impulse, current.body.facing),
        ),
        shoveCredit: chooseOffensiveCredit(current.shoveCredit, credit, this.#tick),
      });
    });
  }

  #getBombPlacement(
    participant: ParticipantState,
    pendingBombs: readonly BombState[] = [],
    direction: Vector2 = participant.body.facing,
  ): BombState | undefined {
    const column = Math.floor(participant.body.position.x);
    const row = Math.floor(participant.body.position.y);
    const tileId = createTileId(column, row);
    const tile = this.#tiles.find((candidate) => candidate.tileId === tileId);

    if (
      tile === undefined ||
      tile.state === "Void" ||
      this.#brickWalls.some((wall) => wall.tileId === tileId) ||
      [...this.#bombs, ...pendingBombs].some(
        (bomb) =>
          bomb.detonateTick > this.#tick &&
          Math.floor(bomb.position.x) === column &&
          Math.floor(bomb.position.y) === row,
      )
    ) {
      return undefined;
    }

    return Object.freeze({
      ownerActorId: participant.actorId,
      position: Object.freeze({ x: column + 0.5, y: row + 0.5 }),
      fallbackDirection: normalizeDirectionOrFallback(direction, { x: 1, y: 0 }),
      placedTick: this.#tick,
      detonateTick: this.#tick + SIMULATION_TUNING.bomb.fuseTicks,
    });
  }

  #getBrickPlacement(
    participant: ParticipantState,
    participants: readonly ParticipantState[],
    pendingWalls: readonly BrickWallState[] = [],
    direction: Vector2 = participant.body.facing,
  ): BrickWallState | undefined {
    const offset = getDominantCardinalOffset(direction);
    const column = Math.floor(participant.body.position.x) + offset.x;
    const row = Math.floor(participant.body.position.y) + offset.y;
    const tileId = createTileId(column, row);
    const tile = this.#tiles.find((candidate) => candidate.tileId === tileId);

    if (
      tile === undefined ||
      tile.state === "Void" ||
      [...this.#brickWalls, ...pendingWalls].some((wall) => wall.tileId === tileId) ||
      this.#itemState.items.some(
        (item) => Math.floor(item.position.x) === column && Math.floor(item.position.y) === row,
      ) ||
      participants.some(
        (candidate) =>
          isCollidable(candidate) &&
          circleIntersectsTile(candidate.body.position, candidate.body.radius, column, row),
      )
    ) {
      return undefined;
    }

    return Object.freeze({
      definitionId: "brick-wall",
      tileId,
      column,
      row,
      ownerActorId: participant.actorId,
      placedTick: this.#tick,
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
      const profile = getMovementProfile(participant.body.massFactor, this.#gameplayTuning);
      const mobilityMultiplier = getMobilityMultiplier(participant.progression.stats);
      const inputDirection = normalizeVector(command.move);
      let velocity = participant.body.velocity;
      let facing = participant.body.facing;

      switch (participant.action.kind) {
        case "Ready": {
          const targetVelocity = scaleVector(
            inputDirection,
            profile.maximumSpeed * mobilityMultiplier,
          );
          velocity = moveVectorToward(
            velocity,
            targetVelocity,
            profile.acceleration * mobilityMultiplier,
          );
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
          const targetVelocity = scaleVector(
            inputDirection,
            profile.maximumSpeed * mobilityMultiplier * 0.18,
          );
          velocity = moveVectorToward(
            scaleVector(velocity, SIMULATION_TUNING.movement.passiveDrag),
            targetVelocity,
            profile.acceleration * 0.18,
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
            this.#gameplayTuning.dodgeSpeed * getDodgeSpeedMultiplier(participant),
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

      const maximumSpeed =
        vectorLength(participant.body.velocity) > SIMULATION_TUNING.body.maximumSpeed ||
        (participant.action.kind === "Stumbling" && participant.action.startedTick === this.#tick)
          ? SIMULATION_TUNING.body.maximumLaunchSpeed
          : SIMULATION_TUNING.body.maximumSpeed;
      velocity = clampVectorLength(velocity, maximumSpeed);
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

  #resolveBrickWallContacts(
    participants: readonly ParticipantState[],
    sweepFromPreviousPosition = true,
  ): readonly ParticipantState[] {
    if (this.#brickWalls.length === 0) {
      return participants;
    }

    return participants.map((participant) => {
      if (!isCollidable(participant)) {
        return participant;
      }

      let segmentStart = sweepFromPreviousPosition
        ? participant.body.previousPosition
        : participant.body.position;
      let segmentEnd = participant.body.position;
      let velocity = participant.body.velocity;
      let remainingTime = sweepFromPreviousPosition ? 1 : 0;

      for (let iteration = 0; iteration < this.#brickWalls.length; iteration += 1) {
        const contact = this.#brickWalls
          .map((wall): SweptWallContact | undefined => {
            const candidate = findSweptPointBoundsContact(
              segmentStart,
              segmentEnd,
              getTileBounds(wall.column, wall.row, participant.body.radius),
            );
            return candidate === undefined ? undefined : Object.freeze({ ...candidate, wall });
          })
          .filter((candidate): candidate is SweptWallContact => candidate !== undefined)
          .toSorted(
            (left, right) =>
              left.time - right.time || left.wall.tileId.localeCompare(right.wall.tileId),
          )[0];

        if (contact === undefined) {
          break;
        }

        const normalSpeed = dotVectors(velocity, contact.normal);

        if (normalSpeed < 0) {
          velocity = subtractVectors(velocity, scaleVector(contact.normal, normalSpeed));
        }

        remainingTime *= 1 - contact.time;
        segmentStart = addVectors(contact.position, scaleVector(contact.normal, 0.000_1));
        segmentEnd = addVectors(segmentStart, scaleVector(velocity, remainingTime));
      }

      return Object.freeze({
        ...participant,
        body: Object.freeze({
          ...participant.body,
          position: segmentEnd,
          velocity,
        }),
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
            SIMULATION_TUNING.body.maximumLaunchSpeed,
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
    const shoveCredits = new Map<
      ActorId,
      { readonly actorId: ActorId; readonly strength: number }
    >();

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
          attacker.body.radius +
          target.body.radius +
          this.#gameplayTuning.shoveReach *
            (attacker.action.springBoosted
              ? getItemDefinition("spring-glove").shoveReachMultiplier
              : 1);

        if (
          distance > maximumContactDistance ||
          dotVectors(direction, normal) < SIMULATION_TUNING.shove.coneCosine
        ) {
          continue;
        }

        const blockedByWall = this.#brickWalls.some((wall) => {
          const wallDistance = getRayTileEntryDistance(
            attacker.body.position,
            normal,
            distance,
            wall,
          );
          return wallDistance !== undefined && wallDistance <= distance;
        });

        if (blockedByWall) {
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
          getPowerMultiplier(attacker.progression.stats) *
          getStabilityMultiplier(target.progression.stats) *
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
        const previousCredit = shoveCredits.get(target.actorId);
        const strength = vectorLength(impulse);

        if (
          previousCredit === undefined ||
          strength > previousCredit.strength ||
          (strength === previousCredit.strength && attacker.actorId < previousCredit.actorId)
        ) {
          shoveCredits.set(target.actorId, Object.freeze({ actorId: attacker.actorId, strength }));
        }
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
      const strongestShove = shoveCredits.get(participant.actorId);
      const shoveCredit = chooseOffensiveCredit(
        participant.shoveCredit,
        strongestShove === undefined
          ? undefined
          : Object.freeze({
              attackerActorId: strongestShove.actorId,
              strength: strongestShove.strength,
            }),
        this.#tick,
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
        shoveCredit,
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

    const creditedEliminations: {
      readonly attackerActorId: ActorId;
      readonly targetActorId: ActorId;
    }[] = [];
    const resolved = participants.map((participant) => {
      if (!participant.active || !isGroundAction(participant.action.kind)) {
        return participant;
      }

      const hasBoat = participant.effects.some(({ definitionId }) => definitionId === "boat");
      const hasArenaSupport = hasTileSupport(participant.body.position, supportedTileIds);
      const hasBoatSupport =
        hasBoat && hasTileSupport(participant.body.position, this.#arenaTileIds);

      if (hasArenaSupport || hasBoatSupport) {
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
      const { attackerActorId, hitTick } = participant.shoveCredit;

      if (
        attackerActorId !== null &&
        hitTick !== null &&
        attackerActorId !== participant.actorId &&
        this.#tick - hitTick <= SIMULATION_TUNING.shove.eliminationCreditTicks
      ) {
        creditedEliminations.push(
          Object.freeze({ attackerActorId, targetActorId: participant.actorId }),
        );
      }
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

    if (creditedEliminations.length === 0) {
      return resolved;
    }

    const creditsByActor = new Map<ActorId, ActorId[]>();

    for (const credit of creditedEliminations) {
      const targets = creditsByActor.get(credit.attackerActorId) ?? [];
      targets.push(credit.targetActorId);
      creditsByActor.set(credit.attackerActorId, targets);
      events.push(
        this.#createEvent("stat-point-earned", {
          actorId: credit.attackerActorId,
          targetActorId: credit.targetActorId,
        }),
      );
    }

    return resolved.map((participant) => {
      const credits = creditsByActor.get(participant.actorId)?.length ?? 0;
      let progression = participant.progression;

      for (let index = 0; index < credits; index += 1) {
        progression = awardStatPoint(progression);
      }

      return credits === 0 ? participant : Object.freeze({ ...participant, progression });
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

    const voidTileIds = new Set(
      result.transitions.filter(({ to }) => to === "Void").map(({ tileId }) => tileId),
    );

    if (voidTileIds.size > 0) {
      const removedWalls = this.#brickWalls.filter(({ tileId }) => voidTileIds.has(tileId));
      this.#brickWalls = Object.freeze(
        this.#brickWalls.filter(({ tileId }) => !voidTileIds.has(tileId)),
      );

      for (const wall of removedWalls) {
        events.push(
          this.#createEvent("brick-wall-removed", {
            actorId: wall.ownerActorId,
            itemDefinitionId: "brick-bag",
            tileId: wall.tileId,
          }),
        );
      }
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
      ...(details.position === undefined ? {} : { position: details.position }),
      ...(details.reason === undefined ? {} : { reason: details.reason }),
      ...(details.upgradeStat === undefined ? {} : { upgradeStat: details.upgradeStat }),
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
