import {
  createTileId,
  createNeutralCommand,
  normalizeActorCommand,
  type ActionState,
  type ActorCommandV1,
  type ActorId,
  type BombState,
  type BlockingObstacleState,
  type BrickWallState,
  type GameConfigV1,
  type ItemDefinitionId,
  type ItemId,
  type InventorySlotIndex,
  type ParticipantActionKind,
  type PendingSoapDamageState,
  type ParticipantState,
  type RenderFrameV1,
  type RoundId,
  type RoundStateV1,
  type SimulationEventKind,
  type SimulationEventV1,
  type SkillDefinitionId,
  type SkillZoneState,
  type SoapPatchState,
  type SkillSlotIndex,
  type StartingAttributes,
  type TileId,
  type TileState,
  type Tick,
  type TreeObstacleState,
  type UpgradeStatId,
} from "./contracts";
import { advanceCollapse, createCollapsePlan, type CollapseWave } from "./collapse";
import { hashWorldState } from "./hash";
import {
  assertFiniteNumber,
  clamp,
  clampVectorLength,
  moveVectorToward,
  SimulationContractError,
  type Vector2,
  ZERO_VECTOR,
} from "./math";
import { RandomStreamSet, type SeedInput } from "./random";
import {
  createArtilleryPlan,
  getActiveCannonShots,
  getPirateShipStates,
  type ArtilleryPlan,
} from "./artillery";
import { ParticipantSpatialHash, type ActorPair } from "./spatial-hash";
import {
  advanceItemSpawns,
  activateTimedInventoryEffect,
  applyTimedDefinitionEffect,
  applyStartingItems,
  clearEffects,
  consumeInventoryCharge,
  consumeSpringGlove,
  createItemSystem,
  getTreasureShipStates,
  expireEffects,
  hasSpringGlove,
  resolveItemPickups,
  type ItemEventFact,
  type ItemSpawnOverride,
  type ItemSystemState,
} from "./items";
import {
  awardStatPoint,
  combineLinearAttributeMultipliers,
  createParticipantProgression,
  getMobilityMultiplier,
  getMobilityCooldownMultiplier,
  getMobilityStumbleDurationMultiplier,
  getFocusSkillDamageMultiplier,
  getPowerMassMultiplier,
  getPowerMultiplier,
  getSkillDamageMultiplier,
  getSkillImpulseMultiplier,
  getStabilityMultiplier,
  spendSkillPoint,
  spendStatPoint,
} from "./progression";
import { getItemDefinition } from "../content/items";
import { DEFAULT_SKILL_LOADOUT, getSkillDefinition, isSkillDefinitionId } from "../content/skills";
import {
  applyStartingSkills,
  commitSkillCast,
  getSkillCastMetrics,
  getSkillSlot,
  type SkillCastMetrics,
} from "./skills";
import {
  advanceCombatResources,
  applyCombatDamage,
  applyCombatStatus,
  applyShield,
  createParticipantCombat,
  drainParticipantMana,
  healParticipant,
  isRooted,
  isStunned,
  restoreParticipantMana,
  synchronizeCombatCapacities,
} from "./combat";
import {
  getMovementProfile,
  getMassDodgeSpeedMultiplier,
  getIncomingMassImpulseMultiplier,
  getShoveMassImpulseMultiplier,
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
import { createTreeObstacles } from "./trees";
import {
  assertStartingAttributes,
  DEFAULT_STARTING_ATTRIBUTES,
  getStartingCooldownMultiplier,
  getStartingIncomingImpulseMultiplier,
  getStartingMassFactor,
  getStartingMovementMultiplier,
  getStartingOutgoingMultiplier,
  getStartingSkillDamageMultiplier,
  getStartingStumbleDurationMultiplier,
} from "./starting-attributes";

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
  readonly initialHealth?: number;
  readonly startingAttributes?: StartingAttributes;
  readonly control?: "human" | "scripted";
  readonly startingItems?: readonly ItemDefinitionId[];
  readonly startingSkills?: readonly SkillDefinitionId[];
}

export interface SimulationWorldOptions {
  readonly roundId?: RoundId;
  readonly humanActorId?: ActorId;
  readonly participantOverrides?: readonly ParticipantSpawnOverride[];
  readonly itemOverrides?: readonly ItemSpawnOverride[];
  readonly gameplayTuning?: GameplayTuningInput;
  readonly arenaLayout?: "procedural-island" | "rectangular-fixture";
  readonly treeOverrides?: readonly TreeObstacleState[];
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
  readonly upgradeSkillSlot?: SkillSlotIndex;
  readonly skillDefinitionId?: SkillDefinitionId;
  readonly skillSlotIndex?: SkillSlotIndex;
  readonly shipId?: number;
  readonly projectileId?: number;
  readonly zoneId?: number;
  readonly amount?: number;
  readonly absorbedAmount?: number;
  readonly healthAfter?: number;
  readonly manaAfter?: number;
  readonly durationTicks?: number;
  readonly statusKind?: SimulationEventV1["statusKind"];
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
  readonly wall: BlockingObstacleState;
}

interface GrapplingAnchor {
  readonly tileId: TileId;
  readonly position: Vector2;
  readonly distance: number;
}

interface RequestedActionResult {
  readonly participants: readonly ParticipantState[];
  readonly activeAbilities: ReadonlyMap<ActorId, ActiveAbilityRequest>;
  readonly skillCasts: readonly SkillCastRequest[];
}

interface ActiveAbilityRequest {
  readonly definitionId: ItemDefinitionId;
  readonly itemSlot: InventorySlotIndex | null;
  readonly targetPosition: Vector2 | null;
}

interface SkillCastRequest {
  readonly actorId: ActorId;
  readonly slotIndex: SkillSlotIndex;
  readonly definitionId: SkillDefinitionId;
  readonly direction: Vector2;
  readonly targetPosition: Vector2 | null;
  readonly metrics: SkillCastMetrics;
}

interface ForwardTargetHit {
  readonly target: ParticipantState;
  readonly direction: Vector2;
  readonly entryDistance: number;
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
    skillDefinitionId: null,
  });
}

function consumeAbility(
  participant: ParticipantState,
  ability: ActiveAbilityRequest,
): ParticipantState | undefined {
  return ability.itemSlot === null
    ? participant
    : consumeInventoryCharge(participant, ability.itemSlot);
}

function createAnchoredAction(tick: number, direction: Vector2): ActionState {
  return Object.freeze({
    kind: "Anchored",
    startedTick: tick,
    endsTick: null,
    hitActorIds: Object.freeze([]),
    resolvedActorIds: Object.freeze([]),
    lockedDirection: direction,
    springBoosted: false,
    skillDefinitionId: null,
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
  skillDefinitionId: SkillDefinitionId | null = null,
): ActionState {
  return Object.freeze({
    kind,
    startedTick: tick,
    endsTick: tick + durationTicks,
    hitActorIds: Object.freeze([...hitActorIds].toSorted((left, right) => left - right)),
    resolvedActorIds: Object.freeze([...resolvedActorIds].toSorted((left, right) => left - right)),
    lockedDirection,
    springBoosted,
    skillDefinitionId,
  });
}

function normalizeDirectionOrFallback(direction: Vector2, fallback: Vector2): Vector2 {
  const directionLength = Math.hypot(direction.x, direction.y);
  if (directionLength > 1) {
    const directionInverse = 1 / directionLength;
    return Object.freeze({ x: direction.x * directionInverse, y: direction.y * directionInverse });
  }
  if (direction.x === 0 && direction.y === 0) {
    const fallbackLength = Math.hypot(fallback.x, fallback.y);
    if (fallbackLength <= 1) {
      return Object.freeze({ x: fallback.x, y: fallback.y });
    }
    const fallbackInverse = 1 / fallbackLength;
    return Object.freeze({ x: fallback.x * fallbackInverse, y: fallback.y * fallbackInverse });
  }
  return Object.freeze({ x: direction.x, y: direction.y });
}

function normalizeUnitDirectionOrFallback(direction: Vector2, fallback: Vector2): Vector2 {
  const directionLength = Math.hypot(direction.x, direction.y);

  if (directionLength > Number.EPSILON) {
    const directionInverse = 1 / directionLength;
    return Object.freeze({ x: direction.x * directionInverse, y: direction.y * directionInverse });
  }

  const fallbackLength = Math.hypot(fallback.x, fallback.y);
  return fallbackLength > Number.EPSILON
    ? Object.freeze({
        x: fallback.x * (1 / fallbackLength),
        y: fallback.y * (1 / fallbackLength),
      })
    : Object.freeze({ x: 1, y: 0 });
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
  const deltaX = center.x - origin.x;
  const deltaY = center.y - origin.y;
  const projection = deltaX * direction.x + deltaY * direction.y;
  const perpendicularSquared = deltaX * deltaX + deltaY * deltaY - projection * projection;
  const radiusSquared = radius * radius;

  if (perpendicularSquared > radiusSquared) {
    return undefined;
  }

  const halfChord = Math.sqrt(Math.max(0, radiusSquared - perpendicularSquared));
  const exitDistance = projection + halfChord;
  const entryDistance = Math.max(0, projection - halfChord);

  return exitDistance >= 0 && entryDistance <= maximumDistance ? entryDistance : undefined;
}

function getAimAssistedCircleHit(
  origin: Vector2,
  direction: Vector2,
  center: Vector2,
  radius: number,
  maximumDistance: number,
  minimumAimDot: number,
): Omit<ForwardTargetHit, "target"> | undefined {
  const directEntryDistance = getRayCircleEntryDistance(
    origin,
    direction,
    center,
    radius,
    maximumDistance,
  );
  if (directEntryDistance !== undefined) {
    return Object.freeze({ direction, entryDistance: directEntryDistance });
  }

  const offsetX = center.x - origin.x;
  const offsetY = center.y - origin.y;
  const centerDistance = Math.hypot(offsetX, offsetY);
  if (centerDistance <= 0) {
    return undefined;
  }

  const assistedInverse = 1 / centerDistance;
  const assistedDirection = Object.freeze({
    x: offsetX * assistedInverse,
    y: offsetY * assistedInverse,
  });
  const entryDistance = Math.max(0, centerDistance - radius);
  return entryDistance <= maximumDistance &&
    direction.x * assistedDirection.x + direction.y * assistedDirection.y >= minimumAimDot
    ? Object.freeze({ direction: assistedDirection, entryDistance })
    : undefined;
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
  const motionX = end.x - start.x;
  const motionY = end.y - start.y;
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
    const motionValue = axis === "x" ? motionX : motionY;
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
    !(entryNormal.x === 0 && entryNormal.y === 0)
    ? Object.freeze({
        time: clamp(entryTime, 0, 1),
        normal: entryNormal,
        position: Object.freeze({
          x: start.x + motionX * clamp(entryTime, 0, 1),
          y: start.y + motionY * clamp(entryTime, 0, 1),
        }),
      })
    : undefined;
}

function getRayTileEntryDistance(
  origin: Vector2,
  direction: Vector2,
  maximumDistance: number,
  wall: BlockingObstacleState,
): number | undefined {
  const contact = findSweptPointBoundsContact(
    origin,
    Object.freeze({
      x: origin.x + direction.x * maximumDistance,
      y: origin.y + direction.y * maximumDistance,
    }),
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

  if (override.initialHealth !== undefined) {
    assertFiniteNumber(override.initialHealth, "participant override initialHealth");
    if (override.initialHealth < 0) {
      throw new SimulationContractError("participant override initialHealth cannot be negative");
    }
  }

  if (override.startingAttributes !== undefined) {
    assertStartingAttributes(override.startingAttributes);
  }

  if (
    override.startingItems !== undefined &&
    (override.startingItems.length > 2 ||
      new Set(override.startingItems).size !== override.startingItems.length)
  ) {
    throw new SimulationContractError("startingItems must contain at most two unique items");
  }

  if (
    override.startingSkills !== undefined &&
    ((override.startingSkills.length !== 2 && override.startingSkills.length !== 3) ||
      new Set(override.startingSkills).size !== override.startingSkills.length ||
      !override.startingSkills.every(isSkillDefinitionId))
  ) {
    throw new SimulationContractError("startingSkills must contain two or three unique skills");
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

  const arenaRandom = streams.get("arena");
  const spawnPositions = createParticipantSpawnPositions(
    tiles,
    config.participantCount,
    arenaRandom,
  );
  const participants: ParticipantState[] = [];

  for (let index = 0; index < config.participantCount; index += 1) {
    const actorId = index + 1;
    const angle = arenaRandom.nextFloat() * Math.PI * 2;
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
    const progression = createParticipantProgression();
    const startingAttributes = Object.freeze({
      ...(override?.startingAttributes ?? DEFAULT_STARTING_ATTRIBUTES),
    });
    const baseMassFactor = normalizeMassFactor(
      override?.massFactor ?? getStartingMassFactor(startingAttributes),
    );
    const baseCombat = createParticipantCombat(progression.stats, startingAttributes);
    const combat = Object.freeze({
      ...baseCombat,
      health: Math.min(baseCombat.maximumHealth, override?.initialHealth ?? baseCombat.health),
    });

    const participant: ParticipantState = Object.freeze({
      actorId,
      control: override?.control ?? (actorId === humanActorId ? "human" : "scripted"),
      body: Object.freeze({
        position,
        previousPosition: position,
        velocity,
        facing,
        radius: SIMULATION_TUNING.body.radius,
        baseMassFactor,
        massFactor: baseMassFactor,
        unsupportedTicks: 0,
      }),
      action: createReadyAction(0),
      cooldowns: Object.freeze({ grappleReadyTick: 0, dodgeReadyTick: 0 }),
      inventory: Object.freeze([]),
      skills: Object.freeze([]),
      combat,
      effects: Object.freeze([]),
      progression,
      startingAttributes,
      shoveCredit: Object.freeze({ attackerActorId: null, hitTick: null, strength: 0 }),
      active: true,
    });
    participants.push(
      applyStartingSkills(
        applyStartingItems(participant, override?.startingItems ?? []),
        override?.startingSkills ?? DEFAULT_SKILL_LOADOUT,
      ),
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

function isParticipantEvading(
  participant: ParticipantState,
  tick: Tick,
  fallbackEvasionTicks: number,
): boolean {
  if (participant.action.kind !== "DodgeActive") {
    return false;
  }

  const evasionTicks =
    participant.action.skillDefinitionId === "blink-step"
      ? getSkillDefinition("blink-step").durationTicks
      : fallbackEvasionTicks;
  return tick - participant.action.startedTick < evasionTicks;
}

function findSweptCircleContact(
  left: ParticipantState,
  right: ParticipantState,
  minimumDistance: number,
): SweptCircleContact | undefined {
  const leftMotionX = left.body.position.x - left.body.previousPosition.x;
  const leftMotionY = left.body.position.y - left.body.previousPosition.y;
  const rightMotionX = right.body.position.x - right.body.previousPosition.x;
  const rightMotionY = right.body.position.y - right.body.previousPosition.y;
  const relativeStartX = right.body.previousPosition.x - left.body.previousPosition.x;
  const relativeStartY = right.body.previousPosition.y - left.body.previousPosition.y;
  const relativeMotionX = rightMotionX - leftMotionX;
  const relativeMotionY = rightMotionY - leftMotionY;
  const quadraticA = relativeMotionX * relativeMotionX + relativeMotionY * relativeMotionY;
  const quadraticB = 2 * (relativeStartX * relativeMotionX + relativeStartY * relativeMotionY);
  const quadraticC =
    relativeStartX * relativeStartX +
    relativeStartY * relativeStartY -
    minimumDistance * minimumDistance;

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

  const leftPosition = Object.freeze({
    x: left.body.previousPosition.x + leftMotionX * time,
    y: left.body.previousPosition.y + leftMotionY * time,
  });
  const rightPosition = Object.freeze({
    x: right.body.previousPosition.x + rightMotionX * time,
    y: right.body.previousPosition.y + rightMotionY * time,
  });
  const deltaX = rightPosition.x - leftPosition.x;
  const deltaY = rightPosition.y - leftPosition.y;
  const distance = Math.hypot(deltaX, deltaY);
  const normal =
    distance === 0
      ? Object.freeze({ x: left.actorId < right.actorId ? 1 : -1, y: 0 })
      : Object.freeze({ x: deltaX / distance, y: deltaY / distance });

  return Object.freeze({ time, normal, leftPosition, rightPosition });
}

function hasTileSupport(position: Vector2, tilesById: ReadonlySet<string>): boolean {
  return tilesById.has(`${Math.floor(position.x)}:${Math.floor(position.y)}`);
}

function getMissedStumbleTicks(participant: ParticipantState): number {
  const speedTicks =
    (Math.hypot(participant.body.velocity.x, participant.body.velocity.y) *
      SIMULATION_TUNING.shove.missedStumbleSpeedTicks) /
    participant.body.massFactor;
  return getStumbleTicks(
    participant,
    SIMULATION_TUNING.shove.missedStumbleBaseTicks + Math.ceil(speedTicks),
  );
}

function getStumbleTicks(participant: ParticipantState, baseTicks: number): number {
  return Math.max(
    1,
    Math.round(
      baseTicks *
        combineLinearAttributeMultipliers(
          getStartingStumbleDurationMultiplier(participant.startingAttributes),
          getMobilityStumbleDurationMultiplier(participant.progression.stats),
        ),
    ),
  );
}

export class SimulationWorld {
  readonly #config: GameConfigV1;
  readonly #roundId: RoundId;
  readonly #collapsePlan: readonly CollapseWave[];
  readonly #collapseTransitionTicks: ReadonlySet<number>;
  readonly #artilleryPlan: ArtilleryPlan;
  readonly #gameplayTuning: GameplayTuningV1;
  readonly #itemRandom;
  readonly #tieBreakRandom;
  readonly #arenaTileIds: ReadonlySet<TileId>;
  #tiles: readonly TileState[];
  #participants: readonly ParticipantState[];
  #brickWalls: readonly BrickWallState[] = Object.freeze([]);
  #trees: readonly TreeObstacleState[] = Object.freeze([]);
  #bombs: readonly BombState[] = Object.freeze([]);
  #soapPatches: readonly SoapPatchState[] = Object.freeze([]);
  #pendingSoapDamage: readonly PendingSoapDamageState[] = Object.freeze([]);
  #skillZones: readonly SkillZoneState[] = Object.freeze([]);
  #nextSkillZoneId = 1;
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
    const proposedCollapsePlan = createCollapsePlan(
      this.#tiles,
      config.arenaColumns,
      config.arenaRows,
      config.collapseSpeed,
      streams.get("collapse"),
    );
    this.#artilleryPlan = createArtilleryPlan(
      this.#tiles,
      proposedCollapsePlan,
      config.arenaColumns,
      config.arenaRows,
      streams.get("artillery-plan"),
    );
    this.#collapsePlan = this.#artilleryPlan.collapseWaves;
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
    this.#trees =
      options.treeOverrides === undefined
        ? options.arenaLayout === "rectangular-fixture"
          ? Object.freeze([])
          : createTreeObstacles(this.#tiles, this.#participants, streams.get("trees"))
        : Object.freeze(
            options.treeOverrides
              .map((tree) => Object.freeze({ ...tree }))
              .toSorted((left, right) => left.row - right.row || left.column - right.column),
          );
    this.#itemRandom = streams.get("items");
    this.#tieBreakRandom = streams.get("tie-break");
    this.#itemState = createItemSystem(
      config,
      this.#tiles,
      this.#participants,
      this.#itemRandom,
      options.itemOverrides,
      new Set(this.#trees.map(({ tileId }) => tileId)),
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

    if (this.#config.roundLimitTicks !== null && this.#tick >= this.#config.roundLimitTicks) {
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

    participants = participants.map((participant) =>
      advanceCombatResources(participant, this.#tick, this.#gameplayTuning),
    );
    participants = this.#advanceExpiredActions(participants, events);
    participants = this.#resolvePendingSoapDamage(participants, events);
    participants = expireEffects(participants, this.#tick);
    participants = this.#applyUpgrades(participants, commandsByActor, events);
    const requestedActions = this.#startRequestedActions(participants, commandsByActor, events);
    participants = this.#resolveSkills(
      requestedActions.participants,
      requestedActions.skillCasts,
      events,
    );
    participants = this.#resolveActiveItems(
      participants,
      requestedActions.activeAbilities,
      commandsByActor,
      events,
    );
    participants = this.#applyMovementIntent(participants, commandsByActor);
    participants = this.#integratePositions(participants);
    participants = this.#resolveObstacleContacts(participants);
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
    participants = this.#resolveObstacleContacts(participants, false);
    participants = this.#resolveSkillZones(participants, events);
    participants = this.#resolveSoapPatches(participants, events);
    participants = this.#resolveShoves(participants, candidatePairs, events);
    participants = this.#resolveHealthEliminations(participants, events);
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
      (() => {
        const blockedTileIds = new Set<string>();
        for (const wall of this.#brickWalls) {
          blockedTileIds.add(wall.tileId);
        }
        for (const tree of this.#trees) {
          blockedTileIds.add(tree.tileId);
        }
        for (const patch of this.#soapPatches) {
          blockedTileIds.add(patch.tileId);
        }
        return blockedTileIds;
      })(),
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
      giftDeliveries: this.#itemState.giftDeliveries,
      brickWalls: this.#brickWalls,
      trees: this.#trees,
      bombs: this.#bombs,
      soapPatches: this.#soapPatches,
      pendingSoapDamage: this.#pendingSoapDamage,
      skillZones: this.#skillZones,
      nextSkillZoneId: this.#nextSkillZoneId,
      nextItemId: this.#itemState.nextItemId,
      nextDeliveryId: this.#itemState.nextDeliveryId,
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
              grappleReadyTick: participant.cooldowns.grappleReadyTick,
              dodgeReadyTick: participant.cooldowns.dodgeReadyTick,
              inventory: participant.inventory,
              skills: participant.skills,
              combat: participant.combat,
              effects: participant.effects,
              springBoosted: participant.action.springBoosted,
              progression: participant.progression,
              startingAttributes: participant.startingAttributes,
            }),
          ),
      ),
      items: this.#itemState.items,
      brickWalls: this.#brickWalls,
      trees: this.#trees,
      bombs: this.#bombs,
      soapPatches: this.#soapPatches,
      skillZones: this.#skillZones,
      pirateShips: getPirateShipStates(this.#artilleryPlan),
      cannonShots: getActiveCannonShots(this.#artilleryPlan, this.#tick),
      treasureShips: getTreasureShipStates(this.#itemState, this.#tick),
      giftDeliveries: this.#itemState.giftDeliveries,
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
      const requestedSkillSlot = commandsByActor.get(participant.actorId)?.upgradeSkillSlot ?? null;

      if ((requestedStat === null && requestedSkillSlot === null) || !participant.active) {
        return participant;
      }

      const progression =
        requestedSkillSlot === null
          ? requestedStat === null
            ? undefined
            : spendStatPoint(participant.progression, requestedStat)
          : spendSkillPoint(participant.progression, requestedSkillSlot);

      if (progression === undefined) {
        return participant;
      }

      events.push(
        requestedSkillSlot === null && requestedStat !== null
          ? this.#createEvent("stat-upgraded", {
              actorId: participant.actorId,
              upgradeStat: requestedStat,
            })
          : this.#createEvent("stat-upgraded", {
              actorId: participant.actorId,
              upgradeSkillSlot: requestedSkillSlot!,
            }),
      );
      const previousPowerMassMultiplier = getPowerMassMultiplier(participant.progression.stats);
      const nextPowerMassMultiplier = getPowerMassMultiplier(progression.stats);
      const baseMassFactor = normalizeMassFactor(
        participant.body.baseMassFactor + (nextPowerMassMultiplier - previousPowerMassMultiplier),
      );
      const itemMassMultiplier =
        participant.body.baseMassFactor === 0
          ? 1
          : participant.body.massFactor / participant.body.baseMassFactor;
      return Object.freeze({
        ...participant,
        progression,
        body: Object.freeze({
          ...participant.body,
          baseMassFactor,
          massFactor: normalizeMassFactor(baseMassFactor * itemMassMultiplier),
        }),
        combat: synchronizeCombatCapacities(
          participant.combat,
          progression.stats,
          participant.startingAttributes,
        ),
      });
    });
  }

  #advanceExpiredActions(
    participants: readonly ParticipantState[],
    events: SimulationEventV1[],
  ): readonly ParticipantState[] {
    return participants.map((participant) => {
      const { action } = participant;

      if (
        action.kind === "Anchored" &&
        !this.#brickWalls.some(
          ({ tileId }) =>
            tileId ===
            createTileId(
              Math.floor(participant.body.position.x),
              Math.floor(participant.body.position.y),
            ),
        )
      ) {
        return Object.freeze({ ...participant, action: createReadyAction(this.#tick) });
      }

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
        action.kind === "GrapplePull" ||
        action.kind === "ShoveRecovery" ||
        action.kind === "Stumbling" ||
        action.kind === "Slipping"
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
    const activeAbilities = new Map<ActorId, ActiveAbilityRequest>();
    const skillCasts: SkillCastRequest[] = [];
    const supportedTileIds = new Set(
      this.#tiles.filter(({ state }) => state !== "Void").map(({ tileId }) => tileId),
    );
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

      if (participant.action.kind === "Anchored") {
        const moveLength = Math.hypot(command.move.x, command.move.y);
        const direction =
          moveLength <= 1
            ? Object.freeze({ x: command.move.x, y: command.move.y })
            : Object.freeze({
                x: command.move.x / moveLength,
                y: command.move.y / moveLength,
              });

        if (direction.x === 0 && direction.y === 0) {
          return participant;
        }

        const dismountPosition = this.#getBrickDismountPosition(participant, direction);

        if (dismountPosition === undefined) {
          return participant;
        }

        return Object.freeze({
          ...participant,
          body: Object.freeze({
            ...participant.body,
            position: dismountPosition,
            previousPosition: dismountPosition,
            velocity: ZERO_VECTOR,
            facing: direction,
          }),
          action: createReadyAction(this.#tick),
        });
      }

      if (participant.action.kind !== "Ready") {
        return participant;
      }

      const direction = normalizeDirectionOrFallback(
        command.targetPosition === null
          ? command.move
          : Object.freeze({
              x: command.targetPosition.x - participant.body.position.x,
              y: command.targetPosition.y - participant.body.position.y,
            }),
        participant.body.facing,
      );
      const boatActive = participant.effects.some(({ definitionId }) => definitionId === "boat");

      if (!boatActive && command.useSkillSlot !== null) {
        const skill = getSkillSlot(participant, command.useSkillSlot);
        const metrics = getSkillCastMetrics(participant, command.useSkillSlot);

        if (
          skill !== undefined &&
          metrics !== undefined &&
          this.#tick >= skill.readyTick &&
          !isStunned(participant, this.#tick)
        ) {
          const definition = getSkillDefinition(skill.definitionId);
          const movementSkill = definition.castKind === "dash";

          if (movementSkill && isRooted(participant, this.#tick)) {
            return participant;
          }

          const committed = commitSkillCast(participant, command.useSkillSlot, this.#tick);
          if (committed === undefined) {
            return participant;
          }

          events.push(
            this.#createEvent("skill-used", {
              actorId: participant.actorId,
              skillDefinitionId: skill.definitionId,
              skillSlotIndex: command.useSkillSlot,
              vector: direction,
              manaAfter: committed.combat.mana,
            }),
          );

          if (skill.definitionId === "blink-step") {
            const landingWall = this.#getDodgeLandingWall(committed, direction, participants);
            events.push(
              this.#createEvent("dodge-started", {
                actorId: participant.actorId,
                vector: direction,
              }),
            );

            if (landingWall !== undefined) {
              const landingPosition = Object.freeze({
                x: landingWall.column + 0.5,
                y: landingWall.row + 0.5,
              });
              return Object.freeze({
                ...committed,
                body: Object.freeze({
                  ...committed.body,
                  position: landingPosition,
                  previousPosition: landingPosition,
                  velocity: ZERO_VECTOR,
                  facing: direction,
                }),
                action: createAnchoredAction(this.#tick, direction),
              });
            }

            return Object.freeze({
              ...committed,
              body: Object.freeze({ ...committed.body, facing: direction }),
              action: createTimedAction(
                "DodgeActive",
                this.#tick,
                Math.max(this.#gameplayTuning.dodgeActiveTicks, definition.durationTicks),
                direction,
                [],
                [],
                false,
                skill.definitionId,
              ),
            });
          }

          if (skill.definitionId === "aegis") {
            const shielded = applyShield(
              committed,
              metrics.shield,
              metrics.durationTicks,
              this.#tick,
            );
            events.push(
              this.#createEvent("shield-applied", {
                actorId: participant.actorId,
                skillDefinitionId: skill.definitionId,
                amount: metrics.shield,
                durationTicks: metrics.durationTicks,
                statusKind: "shield",
              }),
            );
            return Object.freeze({
              ...shielded,
              body: Object.freeze({ ...shielded.body, facing: direction }),
            });
          }

          skillCasts.push(
            Object.freeze({
              actorId: participant.actorId,
              slotIndex: command.useSkillSlot,
              definitionId: skill.definitionId,
              direction,
              targetPosition: command.targetPosition,
              metrics,
            }),
          );
          return Object.freeze({
            ...committed,
            body: Object.freeze({ ...committed.body, facing: direction }),
          });
        }
      }

      if (command.dodgePressed && this.#tick >= participant.cooldowns.dodgeReadyTick) {
        const landingWall = this.#getDodgeLandingWall(participant, direction, participants);
        events.push(
          this.#createEvent("dodge-started", {
            actorId: participant.actorId,
            vector: direction,
          }),
        );
        const dodgeReadyTick =
          this.#tick +
          Math.max(
            30,
            Math.round(
              this.#gameplayTuning.dodgeCooldownTicks *
                combineLinearAttributeMultipliers(
                  getStartingCooldownMultiplier(participant.startingAttributes),
                  getMobilityCooldownMultiplier(participant.progression.stats),
                ),
            ),
          );

        if (landingWall !== undefined) {
          const landingPosition = Object.freeze({
            x: landingWall.column + 0.5,
            y: landingWall.row + 0.5,
          });
          return Object.freeze({
            ...participant,
            body: Object.freeze({
              ...participant.body,
              position: landingPosition,
              previousPosition: landingPosition,
              velocity: ZERO_VECTOR,
              facing: direction,
            }),
            action: createAnchoredAction(this.#tick, direction),
            cooldowns: Object.freeze({ ...participant.cooldowns, dodgeReadyTick }),
          });
        }

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
            dodgeReadyTick,
          }),
        });
      }

      if (!boatActive && command.useItemSlot !== null) {
        const slot = participant.inventory.find(
          (candidate) => candidate.slotIndex === command.useItemSlot,
        );

        const canActivate =
          (slot?.definitionId === "bomb" &&
            this.#getBombPlacement(participant, [], direction, command.targetPosition) !==
              undefined) ||
          (slot?.definitionId === "boat" &&
            hasTileSupport(participant.body.position, this.#arenaTileIds) &&
            !hasTileSupport(participant.body.position, supportedTileIds)) ||
          (slot?.definitionId === "brick-bag" &&
            this.#getBrickPlacement(
              participant,
              participants,
              [],
              direction,
              command.targetPosition,
            ) !== undefined) ||
          (slot?.definitionId === "soap" &&
            this.#getSoapPlacement(
              participant,
              participants,
              [],
              direction,
              command.targetPosition,
            ) !== undefined);

        if (canActivate && slot.charges !== null && slot.charges > 0) {
          activeAbilities.set(
            participant.actorId,
            Object.freeze({
              definitionId: slot.definitionId,
              itemSlot: command.useItemSlot,
              targetPosition: command.targetPosition,
            }),
          );
          return Object.freeze({
            ...participant,
            body: Object.freeze({ ...participant.body, facing: direction }),
          });
        }
      }

      if (command.grapplePressed && this.#tick >= participant.cooldowns.grappleReadyTick) {
        return Object.freeze({
          ...participant,
          body: Object.freeze({ ...participant.body, facing: direction }),
        });
      }

      return participant;
    });

    return Object.freeze({
      participants: Object.freeze(nextParticipants),
      activeAbilities,
      skillCasts: Object.freeze(skillCasts),
    });
  }

  #findForwardTarget(
    attacker: ParticipantState,
    direction: Vector2,
    range: number,
    participants: Iterable<ParticipantState>,
    minimumAimDot: number,
  ): ForwardTargetHit | undefined {
    let nearestTarget: ForwardTargetHit | undefined;
    for (const target of participants) {
      if (target.actorId === attacker.actorId || !isCollidable(target)) {
        continue;
      }
      const hit = getAimAssistedCircleHit(
        attacker.body.position,
        direction,
        target.body.position,
        target.body.radius,
        range,
        minimumAimDot,
      );
      if (hit === undefined) {
        continue;
      }
      let nearestObstacleDistance = Number.POSITIVE_INFINITY;
      for (const obstacle of this.#brickWalls) {
        const distance = getRayTileEntryDistance(
          attacker.body.position,
          hit.direction,
          range,
          obstacle,
        );
        if (distance !== undefined && distance < nearestObstacleDistance) {
          nearestObstacleDistance = distance;
        }
      }
      for (const obstacle of this.#trees) {
        const distance = getRayTileEntryDistance(
          attacker.body.position,
          hit.direction,
          range,
          obstacle,
        );
        if (distance !== undefined && distance < nearestObstacleDistance) {
          nearestObstacleDistance = distance;
        }
      }
      if (hit.entryDistance >= nearestObstacleDistance) {
        continue;
      }
      if (
        nearestTarget === undefined ||
        hit.entryDistance < nearestTarget.entryDistance ||
        (hit.entryDistance === nearestTarget.entryDistance &&
          target.actorId < nearestTarget.target.actorId)
      ) {
        nearestTarget = Object.freeze({ target, ...hit });
      }
    }
    return nearestTarget;
  }

  #getSkillZonePosition(
    attacker: ParticipantState,
    direction: Vector2,
    range: number,
    targetPosition: Vector2 | null,
  ): Vector2 {
    const offset =
      targetPosition === null
        ? Object.freeze({ x: direction.x * range, y: direction.y * range })
        : clampVectorLength(
            Object.freeze({
              x: targetPosition.x - attacker.body.position.x,
              y: targetPosition.y - attacker.body.position.y,
            }),
            range,
          );
    const proposed = Object.freeze({
      x: clamp(attacker.body.position.x + offset.x, 0.5, this.#config.arenaColumns - 0.5),
      y: clamp(attacker.body.position.y + offset.y, 0.5, this.#config.arenaRows - 0.5),
    });
    const proposedTileId = createTileId(Math.floor(proposed.x), Math.floor(proposed.y));
    const supported = this.#tiles.some(
      ({ tileId, state }) => tileId === proposedTileId && state !== "Void",
    );
    return supported ? proposed : attacker.body.position;
  }

  #resolveSkills(
    participants: readonly ParticipantState[],
    casts: readonly SkillCastRequest[],
    events: SimulationEventV1[],
  ): readonly ParticipantState[] {
    if (casts.length === 0) {
      return participants;
    }

    const participantsById = new Map(
      participants.map((participant) => [participant.actorId, participant] as const),
    );
    const createdZones: SkillZoneState[] = [];

    for (const cast of casts.toSorted((left, right) => left.actorId - right.actorId)) {
      const attacker = participantsById.get(cast.actorId);
      if (attacker === undefined || !isCollidable(attacker)) {
        continue;
      }

      const definition = getSkillDefinition(cast.definitionId);
      if (definition.castKind === "zone" && definition.zoneKind !== null) {
        const position = this.#getSkillZonePosition(
          attacker,
          cast.direction,
          definition.range,
          cast.targetPosition,
        );
        const activateTick = this.#tick + definition.delayTicks;
        const zone = Object.freeze({
          zoneId: this.#nextSkillZoneId,
          ownerActorId: attacker.actorId,
          skillDefinitionId: definition.id,
          kind: definition.zoneKind,
          position,
          radius: definition.radius,
          placedTick: this.#tick,
          activateTick,
          endsTick: activateTick + Math.max(1, cast.metrics.durationTicks),
          rank: cast.metrics.rank,
        } satisfies SkillZoneState);
        this.#nextSkillZoneId += 1;
        createdZones.push(zone);
        events.push(
          this.#createEvent("skill-zone-created", {
            actorId: attacker.actorId,
            skillDefinitionId: definition.id,
            zoneId: zone.zoneId,
            position,
            durationTicks: zone.endsTick - zone.activateTick,
          }),
        );
        continue;
      }

      const targetHit = this.#findForwardTarget(
        attacker,
        cast.direction,
        definition.range,
        participantsById.values(),
        definition.minimumAimDot,
      );
      if (targetHit === undefined) {
        continue;
      }
      const target = targetHit.target;

      const targetIsEvading =
        target.action.skillDefinitionId === "blink-step" &&
        isParticipantEvading(target, this.#tick, this.#gameplayTuning.dodgeEvasionTicks);
      if (targetIsEvading) {
        events.push(
          this.#createEvent("dodge-succeeded", {
            actorId: target.actorId,
            targetActorId: attacker.actorId,
            skillDefinitionId: definition.id,
            vector: target.action.lockedDirection ?? target.body.facing,
          }),
        );
        continue;
      }

      let updatedTarget = target;
      const damageResult = applyCombatDamage(
        updatedTarget,
        cast.metrics.damage,
        attacker.actorId,
        this.#tick,
      );
      updatedTarget = damageResult.participant;
      if (cast.metrics.impulse > 0) {
        const rawImpulse =
          cast.metrics.impulse *
          getIncomingMassImpulseMultiplier(updatedTarget.body.massFactor) *
          combineLinearAttributeMultipliers(
            getStartingIncomingImpulseMultiplier(updatedTarget.startingAttributes),
            getStabilityMultiplier(updatedTarget.progression.stats),
          );
        const impulseX = targetHit.direction.x * rawImpulse;
        const impulseY = targetHit.direction.y * rawImpulse;
        if (updatedTarget.action.kind !== "Anchored") {
          updatedTarget = Object.freeze({
            ...updatedTarget,
            body: Object.freeze({
              ...updatedTarget.body,
              velocity: Object.freeze({
                x: updatedTarget.body.velocity.x + impulseX,
                y: updatedTarget.body.velocity.y + impulseY,
              }),
            }),
            action: createTimedAction(
              "Stumbling",
              this.#tick,
              getStumbleTicks(updatedTarget, cast.metrics.stumbleTicks),
              targetHit.direction,
            ),
            shoveCredit: chooseOffensiveCredit(
              updatedTarget.shoveCredit,
              Object.freeze({
                attackerActorId: attacker.actorId,
                strength: Math.hypot(impulseX, impulseY),
              }),
              this.#tick,
            ),
          });
        }
      }
      if (cast.metrics.stunTicks > 0) {
        updatedTarget = applyCombatStatus(
          updatedTarget,
          "stun",
          cast.metrics.stunTicks,
          this.#tick,
        );
        events.push(
          this.#createEvent("status-applied", {
            actorId: attacker.actorId,
            targetActorId: target.actorId,
            skillDefinitionId: definition.id,
            statusKind: "stun",
            durationTicks: cast.metrics.stunTicks,
          }),
        );
      }
      if (cast.metrics.rootTicks > 0) {
        updatedTarget = applyCombatStatus(
          updatedTarget,
          "root",
          cast.metrics.rootTicks,
          this.#tick,
        );
        events.push(
          this.#createEvent("status-applied", {
            actorId: attacker.actorId,
            targetActorId: target.actorId,
            skillDefinitionId: definition.id,
            statusKind: "root",
            durationTicks: cast.metrics.rootTicks,
          }),
        );
      }
      if (definition.manaSteal > 0) {
        const currentAttacker = participantsById.get(attacker.actorId) ?? attacker;
        if (currentAttacker.active && currentAttacker.combat.health > 0) {
          const manaDrain = drainParticipantMana(updatedTarget, definition.manaSteal);
          updatedTarget = manaDrain.participant;
          if (manaDrain.drained > 0) {
            participantsById.set(
              attacker.actorId,
              restoreParticipantMana(currentAttacker, manaDrain.drained),
            );
          }
        }
      }
      participantsById.set(target.actorId, updatedTarget);
      events.push(
        this.#createEvent("skill-hit", {
          actorId: attacker.actorId,
          targetActorId: target.actorId,
          skillDefinitionId: definition.id,
          amount: damageResult.damage,
          absorbedAmount: damageResult.absorbed,
          healthAfter: updatedTarget.combat.health,
          vector: targetHit.direction,
        }),
        this.#createEvent("damage-applied", {
          actorId: attacker.actorId,
          targetActorId: target.actorId,
          skillDefinitionId: definition.id,
          amount: damageResult.damage,
          healthAfter: updatedTarget.combat.health,
        }),
      );
    }

    if (createdZones.length > 0) {
      this.#skillZones = Object.freeze([...this.#skillZones, ...createdZones]);
    }

    return Object.freeze(
      participants.map((participant) => participantsById.get(participant.actorId) ?? participant),
    );
  }

  #getDodgeLandingWall(
    participant: ParticipantState,
    direction: Vector2,
    participants: readonly ParticipantState[],
  ): BrickWallState | undefined {
    const distance =
      this.#gameplayTuning.dodgeSpeed *
      getMassDodgeSpeedMultiplier(participant.body.massFactor) *
      this.#gameplayTuning.dodgeActiveTicks;
    const destination = Object.freeze({
      x: participant.body.position.x + direction.x * distance,
      y: participant.body.position.y + direction.y * distance,
    });
    const wall = this.#brickWalls
      .map((candidate) => ({
        candidate,
        contact: findSweptPointBoundsContact(
          participant.body.position,
          destination,
          getTileBounds(candidate.column, candidate.row, participant.body.radius),
        ),
      }))
      .filter(
        (entry): entry is { candidate: BrickWallState; contact: SweptWallContact } =>
          entry.contact !== undefined,
      )
      .toSorted(
        (left, right) =>
          left.contact.time - right.contact.time ||
          left.candidate.tileId.localeCompare(right.candidate.tileId),
      )[0]?.candidate;

    if (wall === undefined) {
      return undefined;
    }

    const wallCenter = Object.freeze({ x: wall.column + 0.5, y: wall.row + 0.5 });
    const occupied = participants.some(
      (candidate) =>
        candidate.actorId !== participant.actorId &&
        isCollidable(candidate) &&
        Math.hypot(
          candidate.body.position.x - wallCenter.x,
          candidate.body.position.y - wallCenter.y,
        ) <
          candidate.body.radius + participant.body.radius,
    );
    return occupied ? undefined : wall;
  }

  #getBrickDismountPosition(
    participant: ParticipantState,
    direction: Vector2,
  ): Vector2 | undefined {
    const wall = this.#brickWalls.find(
      ({ tileId }) =>
        tileId ===
        createTileId(
          Math.floor(participant.body.position.x),
          Math.floor(participant.body.position.y),
        ),
    );

    if (wall === undefined) {
      return participant.body.position;
    }

    const distance = 0.5 + participant.body.radius + 0.02;
    const position = Object.freeze({
      x: wall.column + 0.5 + direction.x * distance,
      y: wall.row + 0.5 + direction.y * distance,
    });
    const supportedTileIds = new Set(
      this.#tiles.filter(({ state }) => state !== "Void").map(({ tileId }) => tileId),
    );
    const destinationTileId = createTileId(Math.floor(position.x), Math.floor(position.y));

    if (
      !hasTileSupport(position, supportedTileIds) ||
      [...this.#brickWalls, ...this.#trees].some(({ tileId }) => tileId === destinationTileId)
    ) {
      return undefined;
    }

    return position;
  }

  #resolveActiveItems(
    participants: readonly ParticipantState[],
    activeAbilities: ReadonlyMap<ActorId, ActiveAbilityRequest>,
    commandsByActor: ReadonlyMap<ActorId, ActorCommandV1>,
    events: SimulationEventV1[],
  ): readonly ParticipantState[] {
    if (
      activeAbilities.size === 0 &&
      ![...commandsByActor.values()].some(({ grapplePressed }) => grapplePressed) &&
      !this.#bombs.some(({ detonateTick }) => detonateTick <= this.#tick)
    ) {
      return participants;
    }

    let ordered = participants.toSorted((left, right) => left.actorId - right.actorId);
    let updatedById = new Map(ordered.map((participant) => [participant.actorId, participant]));
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

      const bombImpulses = new Map<ActorId, Vector2>();

      for (const bomb of dueBombs) {
        events.push(
          this.#createEvent("bomb-detonated", {
            actorId: bomb.ownerActorId,
            itemDefinitionId: "bomb",
            position: bomb.position,
          }),
        );

        for (const target of ordered) {
          if (!isCollidable(target)) {
            continue;
          }

          const offsetX = target.body.position.x - bomb.position.x;
          const offsetY = target.body.position.y - bomb.position.y;
          const offset = Object.freeze({ x: offsetX, y: offsetY });
          const edgeDistance = Math.max(0, Math.hypot(offsetX, offsetY) - target.body.radius);

          if (edgeDistance > this.#gameplayTuning.bombBlastRadius) {
            continue;
          }

          const falloff = Math.max(
            SIMULATION_TUNING.bomb.ownerMinimumFalloff,
            1 - edgeDistance / this.#gameplayTuning.bombBlastRadius,
          );
          const direction = normalizeDirectionOrFallback(offset, bomb.fallbackDirection);
          const rawImpulse =
            SIMULATION_TUNING.bomb.ownerBaseImpulse *
            falloff *
            getIncomingMassImpulseMultiplier(target.body.massFactor) *
            combineLinearAttributeMultipliers(
              getStartingIncomingImpulseMultiplier(target.startingAttributes),
              getStabilityMultiplier(target.progression.stats),
            );
          const impulseMagnitude = Math.min(rawImpulse, SIMULATION_TUNING.bomb.ownerMaximumImpulse);
          const impulseX = direction.x * impulseMagnitude;
          const impulseY = direction.y * impulseMagnitude;
          bombImpulses.set(
            target.actorId,
            Object.freeze({
              x: (bombImpulses.get(target.actorId)?.x ?? 0) + impulseX,
              y: (bombImpulses.get(target.actorId)?.y ?? 0) + impulseY,
            }),
          );

          const bombDefinition = getItemDefinition("bomb");
          const damage =
            target.actorId === bomb.ownerActorId
              ? bombDefinition.damage * bombDefinition.ownerDamageMultiplier
              : bombDefinition.damage;

          const damageResult = applyCombatDamage(target, damage, bomb.ownerActorId, this.#tick);
          ordered = ordered.map((participant) =>
            participant.actorId === target.actorId ? damageResult.participant : participant,
          );

          if (damageResult.damage > 0 || damageResult.absorbed > 0) {
            events.push(
              this.#createEvent("damage-applied", {
                actorId: bomb.ownerActorId,
                targetActorId: target.actorId,
                amount: damageResult.damage,
                absorbedAmount: damageResult.absorbed,
                healthAfter: damageResult.participant.combat.health,
                itemDefinitionId: "bomb",
              }),
            );
          }
        }
      }

      ordered = ordered.map((participant) => {
        const impulse = bombImpulses.get(participant.actorId);

        if (impulse === undefined || !isCollidable(participant)) {
          return participant;
        }

        return Object.freeze({
          ...participant,
          body: Object.freeze({
            ...participant.body,
            velocity: Object.freeze({
              x: participant.body.velocity.x + impulse.x,
              y: participant.body.velocity.y + impulse.y,
            }),
          }),
          action: createTimedAction(
            "Stumbling",
            this.#tick,
            getStumbleTicks(participant, SIMULATION_TUNING.bomb.ownerStumbleTicks),
            normalizeDirectionOrFallback(impulse, participant.body.facing),
          ),
        });
      });
      updatedById = new Map(ordered.map((participant) => [participant.actorId, participant]));
    }

    for (const attacker of ordered) {
      const ability = activeAbilities.get(attacker.actorId);

      if (
        ability?.definitionId !== "brick-bag" ||
        !isCollidable(attacker) ||
        attacker.action.kind !== "Ready"
      ) {
        continue;
      }

      const wall = this.#getBrickPlacement(
        attacker,
        ordered,
        placedWalls,
        attacker.body.facing,
        ability.targetPosition,
      );

      if (wall === undefined) {
        continue;
      }

      const consumed = consumeAbility(attacker, ability);

      if (consumed === undefined) {
        continue;
      }

      updatedById.set(
        attacker.actorId,
        healParticipant(consumed, getItemDefinition("brick-bag").healing),
      );
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
      const ability = activeAbilities.get(participant.actorId);

      if (
        ability?.definitionId !== "bomb" ||
        !isCollidable(participant) ||
        participant.action.kind !== "Ready"
      ) {
        continue;
      }

      const bomb = this.#getBombPlacement(
        participant,
        placedBombs,
        participant.body.facing,
        ability.targetPosition,
      );

      if (bomb === undefined) {
        continue;
      }

      const consumed = consumeAbility(participant, ability);

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

    const placedSoapPatches: SoapPatchState[] = [];

    for (const participant of ordered) {
      const ability = activeAbilities.get(participant.actorId);

      if (
        ability?.definitionId !== "soap" ||
        !isCollidable(participant) ||
        participant.action.kind !== "Ready"
      ) {
        continue;
      }

      const patch = this.#getSoapPlacement(
        participant,
        ordered,
        placedSoapPatches,
        participant.body.facing,
        ability.targetPosition,
      );

      if (patch === undefined) {
        continue;
      }

      const consumed = consumeAbility(participant, ability);

      if (consumed === undefined) {
        continue;
      }

      updatedById.set(participant.actorId, consumed);
      placedSoapPatches.push(patch);
      events.push(
        this.#createEvent("item-used", {
          actorId: participant.actorId,
          itemDefinitionId: "soap",
          tileId: patch.tileId,
          vector: participant.body.facing,
        }),
        this.#createEvent("soap-placed", {
          actorId: participant.actorId,
          itemDefinitionId: "soap",
          tileId: patch.tileId,
        }),
      );
    }

    if (placedSoapPatches.length > 0) {
      this.#soapPatches = Object.freeze(
        [...this.#soapPatches, ...placedSoapPatches].toSorted((left, right) =>
          left.tileId.localeCompare(right.tileId),
        ),
      );
    }

    for (const participant of ordered) {
      const ability = activeAbilities.get(participant.actorId);

      if (
        ability?.definitionId !== "boat" ||
        !isCollidable(participant) ||
        participant.action.kind !== "Ready"
      ) {
        continue;
      }

      const activated =
        ability.itemSlot === null
          ? applyTimedDefinitionEffect(participant, "boat", this.#tick)
          : activateTimedInventoryEffect(participant, ability.itemSlot, this.#tick);

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

    for (const participant of ordered) {
      const ability = activeAbilities.get(participant.actorId);

      if (
        ability?.definitionId !== "iron-boots" ||
        !isCollidable(participant) ||
        participant.action.kind !== "Ready"
      ) {
        continue;
      }

      updatedById.set(
        participant.actorId,
        applyTimedDefinitionEffect(participant, "iron-boots", this.#tick, 480),
      );
      events.push(
        this.#createEvent("item-used", {
          actorId: participant.actorId,
          itemDefinitionId: "iron-boots",
          vector: participant.body.facing,
        }),
      );
    }

    for (const participant of ordered) {
      const command = commandsByActor.get(participant.actorId);
      const current = updatedById.get(participant.actorId) ?? participant;
      if (
        command?.grapplePressed !== true ||
        activeAbilities.has(participant.actorId) ||
        !isCollidable(current) ||
        current.action.kind !== "Ready" ||
        this.#tick < current.cooldowns.grappleReadyTick
      ) {
        continue;
      }

      const springBoosted = hasSpringGlove(current);
      const springDefinition = getItemDefinition("spring-glove");
      const anchor = this.#getGrapplingAnchor(
        current,
        command.targetPosition === null
          ? current.body.facing
          : Object.freeze({
              x: command.targetPosition.x - current.body.position.x,
              y: command.targetPosition.y - current.body.position.y,
            }),
        springBoosted ? springDefinition.shoveReachMultiplier : 1,
      );
      if (anchor === undefined) {
        continue;
      }

      const anchorOffsetX = anchor.position.x - current.body.position.x;
      const anchorOffsetY = anchor.position.y - current.body.position.y;
      const anchorInverse = 1 / anchor.distance;
      const direction = Object.freeze({
        x: anchorOffsetX * anchorInverse,
        y: anchorOffsetY * anchorInverse,
      });
      const grappleSpeed =
        SIMULATION_TUNING.grapplingHook.targetSpeed *
        (springBoosted ? springDefinition.shoveImpulseMultiplier : 1);
      const grappleAcceleration =
        SIMULATION_TUNING.grapplingHook.acceleration *
        (springBoosted ? springDefinition.shoveImpulseMultiplier : 1);
      const targetVelocity = Object.freeze({
        x: direction.x * grappleSpeed,
        y: direction.y * grappleSpeed,
      });
      const velocity = clampVectorLength(
        moveVectorToward(
          current.body.velocity,
          targetVelocity,
          grappleAcceleration / current.body.massFactor,
        ),
        grappleSpeed,
      );
      const withoutSpring = springBoosted ? consumeSpringGlove(current) : current;
      updatedById.set(
        current.actorId,
        Object.freeze({
          ...withoutSpring,
          body: Object.freeze({ ...withoutSpring.body, facing: direction, velocity }),
          action: createTimedAction(
            "GrapplePull",
            this.#tick,
            this.#gameplayTuning.grapplingHookPullTicks,
            direction,
            [],
            [],
            springBoosted,
          ),
          cooldowns: Object.freeze({
            ...withoutSpring.cooldowns,
            grappleReadyTick:
              this.#tick +
              Math.max(
                60,
                Math.round(
                  this.#gameplayTuning.grapplingHookCooldownTicks *
                    combineLinearAttributeMultipliers(
                      getStartingCooldownMultiplier(current.startingAttributes),
                      getMobilityCooldownMultiplier(current.progression.stats),
                    ),
                ),
              ),
          }),
        }),
      );
      events.push(
        this.#createEvent("grappling-hook-hit", {
          actorId: current.actorId,
          tileId: anchor.tileId,
          position: current.body.position,
          vector: Object.freeze({
            x: anchor.position.x - current.body.position.x,
            y: anchor.position.y - current.body.position.y,
          }),
        }),
      );
    }

    return participants.map((participant) => updatedById.get(participant.actorId) ?? participant);
  }

  #getBombPlacement(
    participant: ParticipantState,
    pendingBombs: readonly BombState[] = [],
    direction: Vector2 = participant.body.facing,
    targetPosition: Vector2 | null = null,
  ): BombState | undefined {
    const position = targetPosition ?? participant.body.position;
    const column = Math.floor(position.x);
    const row = Math.floor(position.y);
    const tileId = createTileId(column, row);
    const tile = this.#tiles.find((candidate) => candidate.tileId === tileId);

    if (
      tile === undefined ||
      tile.state === "Void" ||
      [...this.#brickWalls, ...this.#trees].some((wall) => wall.tileId === tileId) ||
      this.#soapPatches.some((patch) => patch.tileId === tileId) ||
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
      detonateTick: this.#tick + this.#gameplayTuning.bombFuseTicks,
    });
  }

  #getGrapplingAnchor(
    participant: ParticipantState,
    direction: Vector2 = participant.body.facing,
    rangeMultiplier = 1,
  ): GrapplingAnchor | undefined {
    const origin = participant.body.position;
    const normalizedDirection = normalizeDirectionOrFallback(direction, participant.body.facing);
    const range = this.#gameplayTuning.grapplingHookRange * Math.max(1, rangeMultiplier);
    const minimumDistance = SIMULATION_TUNING.grapplingHook.minimumAnchorDistance;
    const nearestWall = [...this.#brickWalls, ...this.#trees]
      .map((wall) => {
        const distance = getRayTileEntryDistance(origin, normalizedDirection, range, wall);
        return distance === undefined ? undefined : Object.freeze({ wall, distance });
      })
      .filter(
        (
          candidate,
        ): candidate is {
          readonly wall: BlockingObstacleState;
          readonly distance: number;
        } => candidate !== undefined,
      )
      .toSorted(
        (left, right) =>
          left.distance - right.distance || left.wall.tileId.localeCompare(right.wall.tileId),
      )[0];

    if (nearestWall === undefined || nearestWall.distance < minimumDistance) {
      return undefined;
    }

    return Object.freeze({
      tileId: nearestWall.wall.tileId,
      position: Object.freeze({
        x: origin.x + normalizedDirection.x * nearestWall.distance,
        y: origin.y + normalizedDirection.y * nearestWall.distance,
      }),
      distance: nearestWall.distance,
    });
  }

  #getBrickPlacement(
    participant: ParticipantState,
    participants: readonly ParticipantState[],
    pendingWalls: readonly BrickWallState[] = [],
    direction: Vector2 = participant.body.facing,
    targetPosition: Vector2 | null = null,
  ): BrickWallState | undefined {
    const definition = getItemDefinition("brick-bag");
    if (
      targetPosition !== null &&
      Math.hypot(
        targetPosition.x - participant.body.position.x,
        targetPosition.y - participant.body.position.y,
      ) >
        definition.castRange + 0.08
    ) {
      return undefined;
    }

    const offset = getDominantCardinalOffset(direction);
    const column =
      targetPosition === null
        ? Math.floor(participant.body.position.x) + offset.x
        : Math.floor(targetPosition.x);
    const row =
      targetPosition === null
        ? Math.floor(participant.body.position.y) + offset.y
        : Math.floor(targetPosition.y);
    const tileId = createTileId(column, row);
    const tile = this.#tiles.find((candidate) => candidate.tileId === tileId);

    if (
      tile === undefined ||
      tile.state === "Void" ||
      [...this.#brickWalls, ...pendingWalls].some((wall) => wall.tileId === tileId) ||
      this.#trees.some((tree) => tree.tileId === tileId) ||
      this.#soapPatches.some((patch) => patch.tileId === tileId) ||
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

  #getSoapPlacement(
    participant: ParticipantState,
    participants: readonly ParticipantState[],
    pendingPatches: readonly SoapPatchState[] = [],
    direction: Vector2 = participant.body.facing,
    targetPosition: Vector2 | null = null,
  ): SoapPatchState | undefined {
    const definition = getItemDefinition("soap");
    if (
      targetPosition !== null &&
      Math.hypot(
        targetPosition.x - participant.body.position.x,
        targetPosition.y - participant.body.position.y,
      ) >
        definition.castRange + 0.08
    ) {
      return undefined;
    }

    const offset = getDominantCardinalOffset(direction);
    const column =
      targetPosition === null
        ? Math.floor(participant.body.position.x) + offset.x
        : Math.floor(targetPosition.x);
    const row =
      targetPosition === null
        ? Math.floor(participant.body.position.y) + offset.y
        : Math.floor(targetPosition.y);
    const tileId = createTileId(column, row);
    const tile = this.#tiles.find((candidate) => candidate.tileId === tileId);

    if (
      tile === undefined ||
      tile.state === "Void" ||
      [...this.#brickWalls, ...this.#trees].some((obstacle) => obstacle.tileId === tileId) ||
      this.#bombs.some(
        (bomb) =>
          bomb.detonateTick > this.#tick &&
          Math.floor(bomb.position.x) === column &&
          Math.floor(bomb.position.y) === row,
      ) ||
      [...this.#soapPatches, ...pendingPatches].some((patch) => patch.tileId === tileId) ||
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
      ownerActorId: participant.actorId,
      tileId,
      column,
      row,
      placedTick: this.#tick,
    });
  }

  #resolveSoapPatches(
    participants: readonly ParticipantState[],
    events: SimulationEventV1[],
  ): readonly ParticipantState[] {
    if (this.#soapPatches.length === 0) {
      return participants;
    }

    const orderedParticipants = participants.toSorted(
      (left, right) => left.actorId - right.actorId,
    );
    const triggeredByActor = new Map<ActorId, SoapPatchState>();
    const triggeredTileIds = new Set<TileId>();

    for (const patch of this.#soapPatches.toSorted((left, right) =>
      left.tileId.localeCompare(right.tileId),
    )) {
      const target = orderedParticipants.find(
        (participant) =>
          isCollidable(participant) &&
          participant.actorId !== patch.ownerActorId &&
          !triggeredByActor.has(participant.actorId) &&
          ((Math.floor(participant.body.position.x) === patch.column &&
            Math.floor(participant.body.position.y) === patch.row) ||
            findSweptPointBoundsContact(
              participant.body.previousPosition,
              participant.body.position,
              getTileBounds(patch.column, patch.row, participant.body.radius),
            ) !== undefined),
      );

      if (target === undefined) {
        continue;
      }

      triggeredByActor.set(target.actorId, patch);
      triggeredTileIds.add(patch.tileId);
      events.push(
        this.#createEvent("soap-triggered", {
          actorId: patch.ownerActorId,
          targetActorId: target.actorId,
          itemDefinitionId: "soap",
          tileId: patch.tileId,
        }),
      );
    }

    if (triggeredTileIds.size === 0) {
      return participants;
    }

    this.#soapPatches = Object.freeze(
      this.#soapPatches.filter((patch) => !triggeredTileIds.has(patch.tileId)),
    );
    const definition = getItemDefinition("soap");
    const pendingDamage: PendingSoapDamageState[] = [];

    const nextParticipants = participants.map((participant) => {
      const patch = triggeredByActor.get(participant.actorId);

      if (patch === undefined) {
        return participant;
      }

      const direction = normalizeUnitDirectionOrFallback(
        participant.body.velocity,
        participant.body.facing,
      );
      const speed = clamp(
        Math.hypot(participant.body.velocity.x, participant.body.velocity.y),
        SIMULATION_TUNING.soap.minimumSpeed,
        SIMULATION_TUNING.soap.maximumSpeed,
      );
      const stumbleTicks = getStumbleTicks(participant, definition.stumbleTicks);
      pendingDamage.push(
        Object.freeze({
          ownerActorId: patch.ownerActorId,
          targetActorId: participant.actorId,
          applyTick: this.#tick + stumbleTicks,
          damage: definition.damage,
        }),
      );

      return Object.freeze({
        ...participant,
        body: Object.freeze({
          ...participant.body,
          velocity: Object.freeze({ x: direction.x * speed, y: direction.y * speed }),
        }),
        action: createTimedAction("Slipping", this.#tick, stumbleTicks, direction),
      });
    });

    this.#pendingSoapDamage = Object.freeze(
      [...this.#pendingSoapDamage, ...pendingDamage].toSorted(
        (left, right) =>
          left.applyTick - right.applyTick || left.targetActorId - right.targetActorId,
      ),
    );
    return nextParticipants;
  }

  #resolvePendingSoapDamage(
    participants: readonly ParticipantState[],
    events: SimulationEventV1[],
  ): readonly ParticipantState[] {
    const due = this.#pendingSoapDamage.filter(({ applyTick }) => applyTick <= this.#tick);
    if (due.length === 0) {
      return participants;
    }

    this.#pendingSoapDamage = Object.freeze(
      this.#pendingSoapDamage.filter(({ applyTick }) => applyTick > this.#tick),
    );
    const byId = new Map(participants.map((participant) => [participant.actorId, participant]));

    for (const pending of due.toSorted(
      (left, right) =>
        left.targetActorId - right.targetActorId || left.ownerActorId - right.ownerActorId,
    )) {
      const target = byId.get(pending.targetActorId);
      if (target === undefined || !isCollidable(target)) {
        continue;
      }

      const definition = getItemDefinition("soap");
      const result = applyCombatDamage(target, pending.damage, pending.ownerActorId, this.#tick);
      const updatedParticipant =
        result.participant.combat.health > 0 && definition.stunTicks > 0
          ? applyCombatStatus(result.participant, "stun", definition.stunTicks, this.#tick)
          : result.participant;
      byId.set(target.actorId, updatedParticipant);
      if (result.damage > 0 || result.absorbed > 0) {
        events.push(
          this.#createEvent("damage-applied", {
            actorId: pending.ownerActorId,
            targetActorId: target.actorId,
            itemDefinitionId: "soap",
            amount: result.damage,
            absorbedAmount: result.absorbed,
            healthAfter: updatedParticipant.combat.health,
          }),
        );
      }
      if (updatedParticipant.combat.stunnedUntilTick > result.participant.combat.stunnedUntilTick) {
        events.push(
          this.#createEvent("status-applied", {
            actorId: pending.ownerActorId,
            targetActorId: target.actorId,
            itemDefinitionId: "soap",
            statusKind: "stun",
            durationTicks: definition.stunTicks,
          }),
        );
      }
    }

    return participants.map((participant) => byId.get(participant.actorId) ?? participant);
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
      const startingMovementMultiplier = getStartingMovementMultiplier(
        participant.startingAttributes,
      );
      const movementDisabled =
        isStunned(participant, this.#tick) || isRooted(participant, this.#tick);
      const inputDirection = movementDisabled
        ? ZERO_VECTOR
        : (() => {
            const moveLength = Math.hypot(command.move.x, command.move.y);
            return moveLength <= 1
              ? Object.freeze({ x: command.move.x, y: command.move.y })
              : Object.freeze({ x: command.move.x / moveLength, y: command.move.y / moveLength });
          })();
      const slowMultiplier =
        participant.combat.slowedUntilTick > this.#tick ? participant.combat.slowMultiplier : 1;
      let velocity = participant.body.velocity;
      let facing = participant.body.facing;

      switch (participant.action.kind) {
        case "Ready": {
          velocity = Object.freeze({
            x:
              inputDirection.x *
              profile.maximumSpeed *
              mobilityMultiplier *
              startingMovementMultiplier *
              slowMultiplier,
            y:
              inputDirection.y *
              profile.maximumSpeed *
              mobilityMultiplier *
              startingMovementMultiplier *
              slowMultiplier,
          });
          facing = inputDirection.x === 0 && inputDirection.y === 0 ? facing : inputDirection;
          break;
        }
        case "ShoveWindup": {
          const windupScale =
            profile.maximumSpeed *
            SIMULATION_TUNING.movement.windupControl *
            startingMovementMultiplier *
            slowMultiplier;
          velocity = Object.freeze({
            x: inputDirection.x * windupScale,
            y: inputDirection.y * windupScale,
          });
          facing = participant.action.lockedDirection ?? facing;
          break;
        }
        case "ShoveActive": {
          const direction = participant.action.lockedDirection ?? facing;
          const shoveActiveScale =
            profile.maximumSpeed *
            mobilityMultiplier *
            startingMovementMultiplier *
            slowMultiplier *
            0.18;
          velocity = Object.freeze({
            x: inputDirection.x * shoveActiveScale,
            y: inputDirection.y * shoveActiveScale,
          });
          facing = direction;
          break;
        }
        case "ShoveRecovery": {
          const recoveryScale =
            profile.maximumSpeed *
            SIMULATION_TUNING.movement.recoveryControl *
            startingMovementMultiplier *
            slowMultiplier;
          velocity = Object.freeze({
            x: inputDirection.x * recoveryScale,
            y: inputDirection.y * recoveryScale,
          });
          break;
        }
        case "DodgeActive": {
          const direction = participant.action.lockedDirection ?? facing;
          const blinkMovementComplete =
            participant.action.skillDefinitionId === "blink-step" &&
            this.#tick - participant.action.startedTick >= this.#gameplayTuning.dodgeActiveTicks;
          velocity = blinkMovementComplete
            ? ZERO_VECTOR
            : (() => {
                const dodgeScale =
                  this.#gameplayTuning.dodgeSpeed *
                  getMassDodgeSpeedMultiplier(participant.body.massFactor) *
                  startingMovementMultiplier;
                return Object.freeze({ x: direction.x * dodgeScale, y: direction.y * dodgeScale });
              })();
          facing = direction;
          break;
        }
        case "GrapplePull": {
          const direction = participant.action.lockedDirection ?? facing;
          const springDefinition = getItemDefinition("spring-glove");
          const speedMultiplier = participant.action.springBoosted
            ? springDefinition.shoveImpulseMultiplier
            : 1;
          const targetSpeed = SIMULATION_TUNING.grapplingHook.targetSpeed * speedMultiplier;
          const acceleration =
            (SIMULATION_TUNING.grapplingHook.acceleration * speedMultiplier) /
            participant.body.massFactor;
          velocity =
            participant.action.startedTick === this.#tick
              ? clampVectorLength(velocity, targetSpeed)
              : clampVectorLength(
                  moveVectorToward(
                    velocity,
                    Object.freeze({ x: direction.x * targetSpeed, y: direction.y * targetSpeed }),
                    acceleration,
                  ),
                  targetSpeed,
                );
          facing = direction;
          break;
        }
        case "Stumbling": {
          velocity = Object.freeze({
            x: velocity.x * SIMULATION_TUNING.movement.stumbleDrag,
            y: velocity.y * SIMULATION_TUNING.movement.stumbleDrag,
          });
          break;
        }
        case "Slipping": {
          const direction = participant.action.lockedDirection ?? facing;
          const slipSpeed = Math.hypot(velocity.x, velocity.y) * SIMULATION_TUNING.soap.dragPerTick;
          velocity = Object.freeze({ x: direction.x * slipSpeed, y: direction.y * slipSpeed });
          facing = direction;
          break;
        }
        case "Anchored": {
          velocity = ZERO_VECTOR;
          break;
        }
        case "Falling": {
          velocity = Object.freeze({ x: velocity.x * 0.85, y: velocity.y * 0.85 });
          break;
        }
        case "Eliminated": {
          velocity = ZERO_VECTOR;
          break;
        }
      }

      const maximumSpeed =
        participant.action.kind === "DodgeActive"
          ? Math.max(SIMULATION_TUNING.body.maximumLaunchSpeed, Math.hypot(velocity.x, velocity.y))
          : participant.action.kind === "GrapplePull" ||
              participant.action.kind === "Slipping" ||
              Math.hypot(participant.body.velocity.x, participant.body.velocity.y) >
                SIMULATION_TUNING.body.maximumSpeed ||
              (participant.action.kind === "Stumbling" &&
                participant.action.startedTick === this.#tick)
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

      const position = Object.freeze({
        x: participant.body.position.x + participant.body.velocity.x,
        y: participant.body.position.y + participant.body.velocity.y,
      });
      assertFiniteNumber(position.x, `actor ${participant.actorId} position.x`);
      assertFiniteNumber(position.y, `actor ${participant.actorId} position.y`);

      return Object.freeze({
        ...participant,
        body: Object.freeze({ ...participant.body, position }),
      });
    });
  }

  #resolveObstacleContacts(
    participants: readonly ParticipantState[],
    sweepFromPreviousPosition = true,
  ): readonly ParticipantState[] {
    const obstacles: readonly BlockingObstacleState[] = [...this.#brickWalls, ...this.#trees];

    if (obstacles.length === 0) {
      return participants;
    }

    return participants.map((participant) => {
      if (!isCollidable(participant) || participant.action.kind === "Anchored") {
        return participant;
      }

      let segmentStart = sweepFromPreviousPosition
        ? participant.body.previousPosition
        : participant.body.position;
      let segmentEnd = participant.body.position;
      let velocity = participant.body.velocity;
      let remainingTime = sweepFromPreviousPosition ? 1 : 0;

      for (let iteration = 0; iteration < obstacles.length; iteration += 1) {
        const contact = obstacles
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

        const normalSpeed = velocity.x * contact.normal.x + velocity.y * contact.normal.y;

        if (normalSpeed < 0) {
          velocity = Object.freeze({
            x: velocity.x - contact.normal.x * normalSpeed,
            y: velocity.y - contact.normal.y * normalSpeed,
          });
        }

        remainingTime *= 1 - contact.time;
        segmentStart = Object.freeze({
          x: contact.position.x + contact.normal.x * 0.000_1,
          y: contact.position.y + contact.normal.y * 0.000_1,
        });
        segmentEnd = Object.freeze({
          x: segmentStart.x + velocity.x * remainingTime,
          y: segmentStart.y + velocity.y * remainingTime,
        });
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

  #resolveSkillZones(
    participants: readonly ParticipantState[],
    events: SimulationEventV1[],
  ): readonly ParticipantState[] {
    const expiredZones = this.#skillZones.filter(({ endsTick }) => endsTick <= this.#tick);
    if (expiredZones.length > 0) {
      for (const zone of expiredZones.toSorted((left, right) => left.zoneId - right.zoneId)) {
        events.push(
          this.#createEvent("skill-zone-expired", {
            actorId: zone.ownerActorId,
            skillDefinitionId: zone.skillDefinitionId,
            zoneId: zone.zoneId,
            position: zone.position,
          }),
        );
      }
      this.#skillZones = Object.freeze(
        this.#skillZones.filter(({ endsTick }) => endsTick > this.#tick),
      );
    }

    const activeZones = this.#skillZones
      .filter(({ activateTick, endsTick }) => activateTick <= this.#tick && endsTick > this.#tick)
      .toSorted((left, right) => left.zoneId - right.zoneId);
    const byId = new Map(participants.map((participant) => [participant.actorId, participant]));
    const participantsByActorId = participants.toSorted(
      (left, right) => left.actorId - right.actorId,
    );

    for (const zone of activeZones) {
      const owner = byId.get(zone.ownerActorId);
      const definition = getSkillDefinition(zone.skillDefinitionId);
      const damage =
        definition.damage *
        getSkillDamageMultiplier(zone.rank) *
        combineLinearAttributeMultipliers(
          owner === undefined ? 1 : getStartingOutgoingMultiplier(owner.startingAttributes),
          getPowerMultiplier(owner?.progression.stats ?? createParticipantProgression().stats),
        ) *
        combineLinearAttributeMultipliers(
          owner === undefined ? 1 : getStartingSkillDamageMultiplier(owner.startingAttributes),
          getFocusSkillDamageMultiplier(
            owner?.progression.stats ?? createParticipantProgression().stats,
          ),
        );
      const impulseStrength = definition.impulse * getSkillImpulseMultiplier(zone.rank);
      const pulseDamage =
        zone.kind === "delayed-blast"
          ? this.#tick === zone.activateTick
          : zone.kind === "frost" && (this.#tick - zone.activateTick) % 60 === 0;

      for (const original of participantsByActorId) {
        let participant = byId.get(original.actorId) ?? original;
        if (!isCollidable(participant)) {
          continue;
        }

        const offsetX = participant.body.position.x - zone.position.x;
        const offsetY = participant.body.position.y - zone.position.y;
        const offset = Object.freeze({ x: offsetX, y: offsetY });
        const distance = Math.hypot(offsetX, offsetY);
        const contactRadius = zone.radius + participant.body.radius;
        if (distance > contactRadius) {
          continue;
        }

        if (zone.kind === "frost") {
          participant = applyCombatStatus(
            participant,
            "slow",
            65,
            this.#tick,
            definition.slowMultiplier,
          );
        }

        if (!pulseDamage || participant.actorId === zone.ownerActorId) {
          byId.set(participant.actorId, participant);
          continue;
        }

        const damageResult = applyCombatDamage(participant, damage, zone.ownerActorId, this.#tick);
        participant = damageResult.participant;
        if (zone.kind === "delayed-blast") {
          participant = applyCombatStatus(
            participant,
            "stun",
            Math.round(definition.stunTicks * (1 + zone.rank * 0.12)),
            this.#tick,
          );
          const direction = normalizeDirectionOrFallback(offset, { x: 1, y: 0 });
          const impulseMagnitude =
            impulseStrength *
            getIncomingMassImpulseMultiplier(participant.body.massFactor) *
            combineLinearAttributeMultipliers(
              getStartingIncomingImpulseMultiplier(participant.startingAttributes),
              getStabilityMultiplier(participant.progression.stats),
            );
          const impulseX = direction.x * impulseMagnitude;
          const impulseY = direction.y * impulseMagnitude;
          if (participant.action.kind !== "Anchored") {
            participant = Object.freeze({
              ...participant,
              body: Object.freeze({
                ...participant.body,
                velocity: Object.freeze({
                  x: participant.body.velocity.x + impulseX,
                  y: participant.body.velocity.y + impulseY,
                }),
              }),
              action: createTimedAction(
                "Stumbling",
                this.#tick,
                getStumbleTicks(
                  participant,
                  Math.round(definition.stumbleTicks * (1 + zone.rank * 0.12)),
                ),
                direction,
              ),
              shoveCredit: chooseOffensiveCredit(
                participant.shoveCredit,
                Object.freeze({
                  attackerActorId: zone.ownerActorId,
                  strength: Math.hypot(impulseX, impulseY),
                }),
                this.#tick,
              ),
            });
          }
        }
        byId.set(participant.actorId, participant);
        if (damageResult.damage > 0 && definition.damageHealingRatio > 0) {
          const currentOwner = byId.get(zone.ownerActorId);
          if (currentOwner !== undefined) {
            byId.set(
              zone.ownerActorId,
              healParticipant(currentOwner, damageResult.damage * definition.damageHealingRatio),
            );
          }
        }
        events.push(
          this.#createEvent("skill-hit", {
            actorId: zone.ownerActorId,
            targetActorId: participant.actorId,
            skillDefinitionId: zone.skillDefinitionId,
            zoneId: zone.zoneId,
            amount: damageResult.damage,
            healthAfter: participant.combat.health,
            position: zone.position,
          }),
          this.#createEvent("damage-applied", {
            actorId: zone.ownerActorId,
            targetActorId: participant.actorId,
            skillDefinitionId: zone.skillDefinitionId,
            amount: damageResult.damage,
            absorbedAmount: damageResult.absorbed,
            healthAfter: participant.combat.health,
          }),
        );
      }
    }

    return Object.freeze(
      participants.map((participant) => byId.get(participant.actorId) ?? participant),
    );
  }

  #resolveHealthEliminations(
    participants: readonly ParticipantState[],
    events: SimulationEventV1[],
  ): readonly ParticipantState[] {
    const victims = new Map<ActorId, ActorId | null>();
    for (const participant of participants) {
      if (isCollidable(participant) && participant.combat.health <= 0) {
        const source = participant.combat.lastDamageSourceActorId;
        victims.set(
          participant.actorId,
          source !== null && source !== participant.actorId ? source : null,
        );
      }
    }
    return this.#applyDirectEliminations(participants, victims, events);
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
        const deltaX = rightPosition.x - leftPosition.x;
        const deltaY = rightPosition.y - leftPosition.y;
        const minimumDistance = left.body.radius + right.body.radius;
        const distanceSquared = deltaX * deltaX + deltaY * deltaY;
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
            : Object.freeze({ x: deltaX / distance, y: deltaY / distance }));
        const leftInverseMass = left.action.kind === "Anchored" ? 0 : 1 / left.body.massFactor;
        const rightInverseMass = right.action.kind === "Anchored" ? 0 : 1 / right.body.massFactor;
        const inverseMassTotal = leftInverseMass + rightInverseMass;

        if (inverseMassTotal === 0) {
          continue;
        }
        const leftVelocity = velocities[leftIndex] ?? left.body.velocity;
        const rightVelocity = velocities[rightIndex] ?? right.body.velocity;
        const relativeVelocityX = rightVelocity.x - leftVelocity.x;
        const relativeVelocityY = rightVelocity.y - leftVelocity.y;
        const relativeNormalSpeed = relativeVelocityX * normal.x + relativeVelocityY * normal.y;

        if (sweptContact !== undefined) {
          if (relativeNormalSpeed >= 0) {
            continue;
          }

          const contactImpulse =
            (-relativeNormalSpeed * (1 + SIMULATION_TUNING.body.weakContactVelocityDamping)) /
            inverseMassTotal;
          const leftImpulseScale = contactImpulse * leftInverseMass;
          const rightImpulseScale = contactImpulse * rightInverseMass;
          const nextLeftVelocity = Object.freeze({
            x: leftVelocity.x - normal.x * leftImpulseScale,
            y: leftVelocity.y - normal.y * leftImpulseScale,
          });
          const nextRightVelocity = Object.freeze({
            x: rightVelocity.x + normal.x * rightImpulseScale,
            y: rightVelocity.y + normal.y * rightImpulseScale,
          });
          const remainingTime = 1 - sweptContact.time;
          positions[leftIndex] = Object.freeze({
            x: sweptContact.leftPosition.x + nextLeftVelocity.x * remainingTime,
            y: sweptContact.leftPosition.y + nextLeftVelocity.y * remainingTime,
          });
          positions[rightIndex] = Object.freeze({
            x: sweptContact.rightPosition.x + nextRightVelocity.x * remainingTime,
            y: sweptContact.rightPosition.y + nextRightVelocity.y * remainingTime,
          });
          velocities[leftIndex] = nextLeftVelocity;
          velocities[rightIndex] = nextRightVelocity;
          continue;
        }

        const overlap = Math.max(
          0,
          minimumDistance - distance - SIMULATION_TUNING.body.weakContactSlop,
        );
        const leftOverlapScale = (overlap * leftInverseMass) / inverseMassTotal;
        const rightOverlapScale = (overlap * rightInverseMass) / inverseMassTotal;
        positions[leftIndex] = Object.freeze({
          x: leftPosition.x - normal.x * leftOverlapScale,
          y: leftPosition.y - normal.y * leftOverlapScale,
        });
        positions[rightIndex] = Object.freeze({
          x: rightPosition.x + normal.x * rightOverlapScale,
          y: rightPosition.y + normal.y * rightOverlapScale,
        });

        if (relativeNormalSpeed < 0) {
          const contactImpulse =
            (-relativeNormalSpeed * SIMULATION_TUNING.body.weakContactVelocityDamping) /
            inverseMassTotal;
          const leftContactScale = contactImpulse * leftInverseMass;
          const rightContactScale = contactImpulse * rightInverseMass;
          velocities[leftIndex] = Object.freeze({
            x: leftVelocity.x - normal.x * leftContactScale,
            y: leftVelocity.y - normal.y * leftContactScale,
          });
          velocities[rightIndex] = Object.freeze({
            x: rightVelocity.x + normal.x * rightContactScale,
            y: rightVelocity.y + normal.y * rightContactScale,
          });
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

        const deltaX = target.body.position.x - attacker.body.position.x;
        const deltaY = target.body.position.y - attacker.body.position.y;
        const distance = Math.hypot(deltaX, deltaY);
        const normal =
          distance === 0
            ? direction
            : Object.freeze({ x: deltaX / distance, y: deltaY / distance });
        const maximumContactDistance =
          attacker.body.radius +
          target.body.radius +
          SIMULATION_TUNING.shove.reach *
            (attacker.action.springBoosted
              ? getItemDefinition("spring-glove").shoveReachMultiplier
              : 1);

        if (
          distance > maximumContactDistance ||
          direction.x * normal.x + direction.y * normal.y < SIMULATION_TUNING.shove.coneCosine
        ) {
          continue;
        }

        const blockedByWall = [...this.#brickWalls, ...this.#trees].some((wall) => {
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

        const targetIsEvading = isParticipantEvading(
          target,
          this.#tick,
          this.#gameplayTuning.dodgeEvasionTicks,
        );

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

        const forwardSpeed = Math.max(
          0,
          attacker.body.velocity.x * direction.x + attacker.body.velocity.y * direction.y,
        );
        const rawImpulse =
          (SIMULATION_TUNING.shove.baseImpulse +
            forwardSpeed * SIMULATION_TUNING.shove.velocityImpulseScale) *
          getShoveMassImpulseMultiplier(attacker.body.massFactor, target.body.massFactor) *
          combineLinearAttributeMultipliers(
            getStartingOutgoingMultiplier(attacker.startingAttributes),
            getPowerMultiplier(attacker.progression.stats),
          ) *
          combineLinearAttributeMultipliers(
            getStartingIncomingImpulseMultiplier(target.startingAttributes),
            getStabilityMultiplier(target.progression.stats),
          ) *
          (attacker.action.springBoosted
            ? getItemDefinition("spring-glove").shoveImpulseMultiplier
            : 1);
        const impulseMagnitude = Math.min(rawImpulse, SIMULATION_TUNING.shove.maximumImpulse);
        const impulseX = normal.x * impulseMagnitude;
        const impulseY = normal.y * impulseMagnitude;
        impulses.set(
          target.actorId,
          Object.freeze({
            x: (impulses.get(target.actorId)?.x ?? 0) + impulseX,
            y: (impulses.get(target.actorId)?.y ?? 0) + impulseY,
          }),
        );
        const hitTargets = newlyHit.get(attacker.actorId) ?? new Set<ActorId>();
        hitTargets.add(target.actorId);
        newlyHit.set(attacker.actorId, hitTargets);
        const previousCredit = shoveCredits.get(target.actorId);
        const strength = Math.hypot(impulseX, impulseY);

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
            vector: Object.freeze({ x: impulseX, y: impulseY }),
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
        Object.freeze({
          x: participant.body.velocity.x + impulse.x,
          y: participant.body.velocity.y + impulse.y,
        }),
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
        Math.hypot(impulse.x, impulse.y) >= SIMULATION_TUNING.shove.stumbleImpulseThreshold &&
        isGroundAction(action.kind)
      ) {
        action = createTimedAction(
          "Stumbling",
          this.#tick,
          getStumbleTicks(participant, SIMULATION_TUNING.shove.hitStumbleTicks),
          normalizeDirectionOrFallback(impulse, participant.body.facing),
        );
      }

      const movedParticipant = Object.freeze({
        ...participant,
        action,
        body: Object.freeze({ ...participant.body, velocity }),
        shoveCredit,
      });
      if (strongestShove === undefined) {
        return movedParticipant;
      }

      const damageResult = applyCombatDamage(
        movedParticipant,
        SIMULATION_TUNING.shove.damage,
        strongestShove.actorId,
        this.#tick,
      );
      if (damageResult.damage > 0 || damageResult.absorbed > 0) {
        events.push(
          this.#createEvent("damage-applied", {
            actorId: strongestShove.actorId,
            targetActorId: participant.actorId,
            amount: damageResult.damage,
            absorbedAmount: damageResult.absorbed,
            healthAfter: damageResult.participant.combat.health,
          }),
        );
      }
      return damageResult.participant;
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

      let current = participant;
      let hasBoat = current.effects.some(({ definitionId }) => definitionId === "boat");
      const hasArenaSupport = hasTileSupport(current.body.position, supportedTileIds);
      const isInsideArena = hasTileSupport(current.body.position, this.#arenaTileIds);

      if (!hasArenaSupport && isInsideArena && !hasBoat) {
        const boatSlot = current.inventory.find(
          ({ definitionId, charges }) => definitionId === "boat" && charges !== null && charges > 0,
        );
        const activated =
          boatSlot === undefined
            ? undefined
            : activateTimedInventoryEffect(current, boatSlot.slotIndex, this.#tick);

        if (activated !== undefined) {
          current = activated;
          hasBoat = true;
          events.push(
            this.#createEvent("item-used", {
              actorId: current.actorId,
              itemDefinitionId: "boat",
              vector: current.body.facing,
            }),
          );
        }
      }

      const hasBoatSupport = hasBoat && hasTileSupport(current.body.position, this.#arenaTileIds);

      if (hasArenaSupport || hasBoatSupport) {
        if (current.body.unsupportedTicks === 0) {
          return current;
        }

        return Object.freeze({
          ...current,
          body: Object.freeze({ ...current.body, unsupportedTicks: 0 }),
        });
      }

      const unsupportedTicks = current.body.unsupportedTicks + 1;

      if (unsupportedTicks < SIMULATION_TUNING.support.graceTicks) {
        return Object.freeze({
          ...current,
          body: Object.freeze({ ...current.body, unsupportedTicks }),
        });
      }

      events.push(
        this.#createEvent("falling-started", {
          actorId: current.actorId,
          vector: current.body.velocity,
        }),
      );
      const { attackerActorId, hitTick } = current.shoveCredit;

      if (
        attackerActorId !== null &&
        hitTick !== null &&
        attackerActorId !== current.actorId &&
        this.#tick - hitTick <= SIMULATION_TUNING.shove.eliminationCreditTicks
      ) {
        creditedEliminations.push(
          Object.freeze({ attackerActorId, targetActorId: current.actorId }),
        );
      }
      const participantWithoutEffects = clearEffects(current);
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

  #applyDirectEliminations(
    participants: readonly ParticipantState[],
    victims: ReadonlyMap<ActorId, ActorId | null>,
    events: SimulationEventV1[],
  ): readonly ParticipantState[] {
    if (victims.size === 0) {
      return participants;
    }

    const creditsByActor = new Map<ActorId, ActorId[]>();

    for (const [targetActorId, attackerActorId] of [...victims].toSorted(
      ([left], [right]) => left - right,
    )) {
      events.push(this.#createEvent("eliminated", { actorId: targetActorId }));

      if (attackerActorId === null || attackerActorId === targetActorId) {
        continue;
      }

      const targets = creditsByActor.get(attackerActorId) ?? [];
      targets.push(targetActorId);
      creditsByActor.set(attackerActorId, targets);
      events.push(
        this.#createEvent("stat-point-earned", {
          actorId: attackerActorId,
          targetActorId,
        }),
      );
    }

    return participants.map((participant) => {
      const isVictim = victims.has(participant.actorId);
      const credits = creditsByActor.get(participant.actorId)?.length ?? 0;
      let progression = participant.progression;

      for (let index = 0; index < credits; index += 1) {
        progression = awardStatPoint(progression);
      }

      if (!isVictim) {
        return credits === 0 ? participant : Object.freeze({ ...participant, progression });
      }

      const eliminated = clearEffects(participant);
      return Object.freeze({
        ...eliminated,
        active: false,
        progression,
        combat: Object.freeze({
          ...eliminated.combat,
          health: 0,
          shield: 0,
          shieldEndsTick: 0,
        }),
        body: Object.freeze({
          ...eliminated.body,
          velocity: ZERO_VECTOR,
          unsupportedTicks: 0,
        }),
        action: createTimedAction("Eliminated", this.#tick, 0, null),
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

    const voidTileIds = new Set(
      result.transitions.filter(({ to }) => to === "Void").map(({ tileId }) => tileId),
    );

    if (voidTileIds.size > 0) {
      const removedWalls = this.#brickWalls.filter(({ tileId }) => voidTileIds.has(tileId));
      this.#brickWalls = Object.freeze(
        this.#brickWalls.filter(({ tileId }) => !voidTileIds.has(tileId)),
      );
      this.#trees = Object.freeze(this.#trees.filter(({ tileId }) => !voidTileIds.has(tileId)));
      this.#soapPatches = Object.freeze(
        this.#soapPatches.filter(({ tileId }) => !voidTileIds.has(tileId)),
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
    const reachedTimeLimit =
      this.#config.roundLimitTicks !== null && this.#tick + 1 >= this.#config.roundLimitTicks;

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
      ...(details.upgradeSkillSlot === undefined
        ? {}
        : { upgradeSkillSlot: details.upgradeSkillSlot }),
      ...(details.skillDefinitionId === undefined
        ? {}
        : { skillDefinitionId: details.skillDefinitionId }),
      ...(details.skillSlotIndex === undefined ? {} : { skillSlotIndex: details.skillSlotIndex }),
      ...(details.shipId === undefined ? {} : { shipId: details.shipId }),
      ...(details.projectileId === undefined ? {} : { projectileId: details.projectileId }),
      ...(details.zoneId === undefined ? {} : { zoneId: details.zoneId }),
      ...(details.amount === undefined ? {} : { amount: details.amount }),
      ...(details.absorbedAmount === undefined ? {} : { absorbedAmount: details.absorbedAmount }),
      ...(details.healthAfter === undefined ? {} : { healthAfter: details.healthAfter }),
      ...(details.manaAfter === undefined ? {} : { manaAfter: details.manaAfter }),
      ...(details.durationTicks === undefined ? {} : { durationTicks: details.durationTicks }),
      ...(details.statusKind === undefined ? {} : { statusKind: details.statusKind }),
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
    (world.config.roundLimitTicks !== null && endTick > world.config.roundLimitTicks)
  ) {
    throw new SimulationContractError("endTick is outside the current round range");
  }

  while (world.tick < endTick) {
    world.step(commandsByTick.get(world.tick) ?? []);
  }

  return world.createRenderFrame();
}
