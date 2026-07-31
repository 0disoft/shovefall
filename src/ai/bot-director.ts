import { BOT_PERSONALITIES, BOT_PERSONALITY_KINDS, type BotPersonalityKind } from "./personalities";
import {
  createTileId,
  createNeutralCommand,
  type ActorCommandV1,
  type ActorId,
  type BotDifficulty,
  type InventorySlotIndex,
  type ItemDefinitionId,
  type RenderFrameV1,
  type RenderItemV1,
  type RenderParticipantV1,
  type SkillSlotIndex,
  type TileId,
  type UpgradeStatId,
} from "../simulation/contracts";
import {
  addVectors,
  dotVectors,
  normalizeVector,
  scaleVector,
  subtractVectors,
  type Vector2,
  vectorLength,
  ZERO_VECTOR,
} from "../simulation/math";
import { RandomStreamSet, type SeedInput, type XorShift32 } from "../simulation/random";
import { ParticipantSpatialHash } from "../simulation/spatial-hash";
import {
  normalizeGameplayTuning,
  SIMULATION_TUNING,
  type GameplayTuningInput,
  type GameplayTuningV1,
} from "../simulation/tuning";
import { canSpendStatPoint } from "../simulation/progression";
import { getSkillManaCost } from "../simulation/skills";
import { getItemDefinition } from "../content/items";
import { getSkillDefinition } from "../content/skills";
import {
  createBotBlockedTileIds,
  createBotNavigationTerrain,
  findBotNavigationDirection,
  getBotEdgeDistance,
  getImmediateBotTileEscape,
  getSafeBotDodgeDirection,
  isBotNavigationSegmentClear,
  type BotNavigationTerrain,
} from "./bot-navigation";

export interface BotDirectorOptions {
  readonly difficulty?: BotDifficulty;
  readonly reactionDelayTicks?: number;
  readonly decisionIntervalTicks?: number;
  readonly nearbyCandidateLimit?: number;
  readonly personalityOverrides?: readonly BotAssignment[];
  readonly gameplayTuning?: GameplayTuningInput;
}

export interface BotDifficultyProfile {
  readonly reactionDelayTicks: number;
  readonly decisionIntervalTicks: number;
  readonly nearbyCandidateLimit: number;
}

export interface BotAssignment {
  readonly actorId: ActorId;
  readonly personality: BotPersonalityKind;
}

interface BotMemory {
  readonly actorId: ActorId;
  readonly personality: BotPersonalityKind;
  readonly jitter: XorShift32;
  bombEscapePosition: Vector2 | null;
  bombEscapeUntilTick: number;
  intent: Vector2;
  lastItemUseTick: number;
  lastProgressPosition: Vector2;
  lastProgressTick: number;
  nextDecisionTick: number;
  soapEscapeDirection: Vector2;
  soapEscapeUntilTick: number;
  stalledDecisionCount: number;
  targetActorId: ActorId | null;
  targetLockUntilTick: number;
}

interface BotDecision {
  readonly move: Vector2;
  readonly grapplePressed: boolean;
  readonly dodgePressed: boolean;
  readonly useItemSlot: InventorySlotIndex | null;
  readonly useSkillSlot: SkillSlotIndex | null;
  readonly targetPosition: Vector2 | null;
}

const DEFAULT_REACTION_DELAY_TICKS = 10;
const DEFAULT_DECISION_INTERVAL_TICKS = 12;
const DEFAULT_NEARBY_CANDIDATE_LIMIT = 6;
const BOT_DIFFICULTY_PROFILES: Readonly<Record<BotDifficulty, BotDifficultyProfile>> =
  Object.freeze({
    easy: Object.freeze({
      reactionDelayTicks: 24,
      decisionIntervalTicks: 20,
      nearbyCandidateLimit: 4,
    }),
    normal: Object.freeze({
      reactionDelayTicks: DEFAULT_REACTION_DELAY_TICKS,
      decisionIntervalTicks: DEFAULT_DECISION_INTERVAL_TICKS,
      nearbyCandidateLimit: DEFAULT_NEARBY_CANDIDATE_LIMIT,
    }),
    hard: Object.freeze({
      reactionDelayTicks: 6,
      decisionIntervalTicks: 8,
      nearbyCandidateLimit: 8,
    }),
  });
const EDGE_EMERGENCY_DISTANCE = 0.82;
const THREAT_DISTANCE = 1.65;
const THREAT_FACING_DOT = 0.55;
const ACTIVE_ITEM_DECISION_COOLDOWN_TICKS = 75;
const BRICK_BAG_MINIMUM_TARGET_DISTANCE = 1.35;
const BRICK_BAG_MAXIMUM_TARGET_DISTANCE = 3.2;
const BRICK_BAG_EDGE_PRESSURE_DISTANCE = 3.25;
const BRICK_BAG_HEALTH_PRESSURE_RATIO = 0.65;
const MINIMUM_BOMB_LOBBY_SURVIVORS = 10;
const TARGET_LOCK_TICKS = 45;
const TARGET_SWITCH_SCORE_MARGIN = 0.65;
const STALL_PROGRESS_DISTANCE = 0.08;
const STALL_DECISION_THRESHOLD = 2;
const CROWD_AVOIDANCE_DISTANCE = 1.15;
const ITEM_COMBAT_PRIORITY_DISTANCE = 1.8;
const IMMEDIATE_PICKUP_DISTANCE = 0.7;
const COLLECTOR_MAXIMUM_ITEM_PURSUIT_DISTANCE = 2.75;
const COLLECTOR_MINIMUM_SAFE_TILE_DEPTH = 2;
const COLLECTOR_OPPONENT_CLEARANCE_DISTANCE = 2.5;
const SOAP_ESCAPE_TICKS = 120;
const SOAP_PLACEMENT_DISTANCE = 1.2;

const ACTIVE_ITEM_IDS = Object.freeze([
  "soap",
  "brick-bag",
  "boat",
  "bomb",
] as const satisfies readonly ItemDefinitionId[]);
type ActiveItemDefinitionId = (typeof ACTIVE_ITEM_IDS)[number];

export function canBotCollectMapItem(
  participant: RenderParticipantV1,
  item: RenderItemV1,
): boolean {
  if (getItemDefinition(item.definitionId).loadoutKind === "passive") {
    return true;
  }

  const activeSlot = participant.inventory.find(({ slotIndex }) => slotIndex === 0);
  return activeSlot === undefined || activeSlot.charges === 0;
}

export function getBotMapItemClaimantActorId(
  item: RenderItemV1,
  participants: readonly RenderParticipantV1[],
): ActorId | null {
  const claimant = participants
    .filter(isControllable)
    .filter((participant) => canBotCollectMapItem(participant, item))
    .map((participant) => ({
      actorId: participant.actorId,
      distance: vectorLength(subtractVectors(participant.position, item.position)),
    }))
    .toSorted((left, right) => left.distance - right.distance || left.actorId - right.actorId)[0];
  return claimant?.actorId ?? null;
}

function canCollectorClearActiveSlotForItem(
  participant: RenderParticipantV1,
  item: RenderItemV1,
): boolean {
  if (getItemDefinition(item.definitionId).loadoutKind !== "active") {
    return false;
  }

  return participant.inventory.some(
    ({ slotIndex, definitionId, charges }) =>
      slotIndex === 0 &&
      getItemDefinition(definitionId).loadoutKind === "active" &&
      charges !== null &&
      charges > 0,
  );
}

function canBotPursueMapItem(
  participant: RenderParticipantV1,
  item: RenderItemV1,
  personality: BotPersonalityKind,
  terrain: BotNavigationTerrain,
  participants: readonly RenderParticipantV1[],
): boolean {
  const distance = vectorLength(subtractVectors(participant.position, item.position));
  const profile = BOT_PERSONALITIES[personality];

  if (distance > 3.5 * profile.itemInterestWeight) {
    return false;
  }

  if (canBotCollectMapItem(participant, item)) {
    if (personality !== "Collector") {
      return true;
    }
  } else if (
    personality !== "Collector" ||
    !canCollectorClearActiveSlotForItem(participant, item)
  ) {
    return false;
  }

  if (distance > COLLECTOR_MAXIMUM_ITEM_PURSUIT_DISTANCE) {
    return false;
  }

  const tileId = createTileId(Math.floor(item.position.x), Math.floor(item.position.y));
  if ((terrain.stableTileDepths.get(tileId) ?? 0) < COLLECTOR_MINIMUM_SAFE_TILE_DEPTH) {
    return false;
  }

  return !participants.some(
    (candidate) =>
      candidate.actorId !== participant.actorId &&
      isControllable(candidate) &&
      vectorLength(subtractVectors(candidate.position, item.position)) <=
        COLLECTOR_OPPONENT_CLEARANCE_DISTANCE,
  );
}

function getNearestEligibleItemPursuerActorId(
  item: RenderItemV1,
  participants: readonly RenderParticipantV1[],
): ActorId | null {
  return (
    participants
      .filter(isControllable)
      .map((participant) => ({
        actorId: participant.actorId,
        distance: vectorLength(subtractVectors(participant.position, item.position)),
      }))
      .toSorted((left, right) => left.distance - right.distance || left.actorId - right.actorId)[0]
      ?.actorId ?? null
  );
}

function assertPositiveInteger(value: number, name: string, allowZero = false): void {
  const minimum = allowZero ? 0 : 1;

  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be a safe integer greater than or equal to ${minimum}`);
  }
}

export function getBotDifficultyProfile(difficulty: BotDifficulty): BotDifficultyProfile {
  return BOT_DIFFICULTY_PROFILES[difficulty];
}

function rotateVector(vector: Vector2, radians: number): Vector2 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return Object.freeze({
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  });
}

function getPerpendicularTowardCenter(
  threatFacing: Vector2,
  selfPosition: Vector2,
  center: Vector2,
): Vector2 {
  const left = Object.freeze({ x: -threatFacing.y, y: threatFacing.x });
  const right = Object.freeze({ x: threatFacing.y, y: -threatFacing.x });
  const towardCenter = normalizeVector(subtractVectors(center, selfPosition));
  return dotVectors(left, towardCenter) >= dotVectors(right, towardCenter) ? left : right;
}

function isControllable(participant: RenderParticipantV1): boolean {
  return (
    participant.active && participant.action !== "Falling" && participant.action !== "Eliminated"
  );
}

function isThreatening(candidate: RenderParticipantV1, self: RenderParticipantV1): boolean {
  const deltaX = self.position.x - candidate.position.x;
  const deltaY = self.position.y - candidate.position.y;
  const distance = Math.hypot(deltaX, deltaY);

  if (distance > THREAT_DISTANCE || distance === 0) {
    return false;
  }

  const inverseDistance = 1 / distance;
  const towardSelfX = deltaX * inverseDistance;
  const towardSelfY = deltaY * inverseDistance;
  const facingSelf =
    candidate.facing.x * towardSelfX + candidate.facing.y * towardSelfY >= THREAT_FACING_DOT;
  const advancing = candidate.velocity.x * towardSelfX + candidate.velocity.y * towardSelfY > 0.035;
  return (
    facingSelf &&
    (advancing || candidate.action === "ShoveWindup" || candidate.action === "ShoveActive")
  );
}

function getChargedItemSlot(
  participant: RenderParticipantV1,
  definitionId: ActiveItemDefinitionId,
): InventorySlotIndex | null {
  const slot = participant.inventory.find(
    (candidate) => candidate.definitionId === definitionId && (candidate.charges ?? 0) > 0,
  );
  return slot?.slotIndex ?? null;
}

function createDecision(
  move: Vector2,
  grapplePressed = false,
  dodgePressed = false,
  useItemSlot: InventorySlotIndex | null = null,
  useSkillSlot: SkillSlotIndex | null = null,
  targetPosition: Vector2 | null = null,
): BotDecision {
  return Object.freeze({
    move,
    grapplePressed,
    dodgePressed,
    useItemSlot,
    useSkillSlot,
    targetPosition,
  });
}

function chooseReadySkillSlot(
  participant: RenderParticipantV1,
  tick: number,
  purpose: "attack" | "escape",
  allowMovementSkills = true,
  attackContext?: Readonly<{
    target: RenderParticipantV1 | undefined;
    terrain: BotNavigationTerrain;
    blockedTileIds: ReadonlySet<TileId>;
    nearbyOpponentCount: number;
  }>,
): SkillSlotIndex | null {
  const lowHealth = participant.combat.health / participant.combat.maximumHealth <= 0.42;
  const preferred =
    purpose === "escape"
      ? allowMovementSkills
        ? ["blink-step", "aegis"]
        : ["aegis"]
      : lowHealth
        ? ["aegis", "meteor-mark", "frost-field", "arc-bolt", "chain-bind"]
        : ["meteor-mark", "frost-field", "arc-bolt", "chain-bind", "aegis"];

  let selected: { slotIndex: SkillSlotIndex; score: number } | undefined;
  for (const definitionId of preferred) {
    const slot = participant.skills.find((candidate) => candidate.definitionId === definitionId);
    if (slot === undefined || tick < slot.readyTick) {
      continue;
    }
    const rank = participant.progression.skillRanks[slot.slotIndex] ?? 0;
    const manaCost = getSkillManaCost(slot.definitionId, rank, participant.startingAttributes);
    if (participant.combat.mana + 1e-9 < manaCost) {
      continue;
    }
    if (purpose === "escape") {
      return slot.slotIndex;
    }

    const definition = getSkillDefinition(slot.definitionId);
    if (definition.castKind === "self") {
      if (!lowHealth) {
        continue;
      }
      const score = definition.shield * 1.5 - manaCost * 0.08;
      if (selected === undefined || score > selected.score) {
        selected = { slotIndex: slot.slotIndex, score };
      }
      continue;
    }
    if (definition.id === "blink-step" || attackContext?.target === undefined) {
      continue;
    }

    const distance = vectorLength(
      subtractVectors(attackContext.target.position, participant.position),
    );
    const requiresClearSegment =
      definition.castKind === "melee" ||
      definition.castKind === "line" ||
      definition.castKind === "dash";
    if (distance > definition.range + 0.15) {
      continue;
    }
    if (
      requiresClearSegment &&
      !isBotNavigationSegmentClear(
        attackContext.terrain,
        attackContext.blockedTileIds,
        participant.position,
        attackContext.target.position,
        participant.radius * 0.5,
      )
    ) {
      continue;
    }

    const targetEdgePressure = Math.max(
      0,
      2.5 - getBotEdgeDistance(attackContext.target, attackContext.terrain),
    );
    const controlScore = (definition.stunTicks + definition.rootTicks) / 12;
    const slowScore = (1 - definition.slowMultiplier) * (definition.durationTicks / 60) * 8;
    const finishingScore = definition.damage >= attackContext.target.combat.health ? 24 : 0;
    const score =
      definition.damage +
      controlScore +
      slowScore +
      definition.impulse * targetEdgePressure * 16 +
      finishingScore -
      manaCost * 0.08;
    if (
      selected === undefined ||
      score > selected.score ||
      (score === selected.score && slot.slotIndex < selected.slotIndex)
    ) {
      selected = { slotIndex: slot.slotIndex, score };
    }
  }

  return selected?.slotIndex ?? null;
}

function getCrowdAvoidance(
  current: RenderParticipantV1,
  nearby: readonly RenderParticipantV1[],
): Vector2 {
  let avoidanceX = 0;
  let avoidanceY = 0;
  for (const candidate of nearby) {
    if (candidate.actorId === current.actorId || !isControllable(candidate)) {
      continue;
    }
    const awayX = current.position.x - candidate.position.x;
    const awayY = current.position.y - candidate.position.y;
    const distance = Math.hypot(awayX, awayY);
    if (distance >= CROWD_AVOIDANCE_DISTANCE) {
      continue;
    }
    const weight = 1 - distance / CROWD_AVOIDANCE_DISTANCE;
    if (distance <= Number.EPSILON) {
      const angle = (current.actorId * 2.399963229728653) % (Math.PI * 2);
      avoidanceX += Math.cos(angle) * weight;
      avoidanceY += Math.sin(angle) * weight;
    } else {
      const inverseDistance = 1 / distance;
      avoidanceX += awayX * inverseDistance * weight;
      avoidanceY += awayY * inverseDistance * weight;
    }
  }
  return Object.freeze({ x: avoidanceX, y: avoidanceY });
}

function getStalledEscapeMovement(
  current: RenderParticipantV1,
  desiredDirection: Vector2,
  perceivedParticipants: readonly RenderParticipantV1[],
  terrain: BotNavigationTerrain,
  blockedTileIds: ReadonlySet<TileId>,
): Vector2 | undefined {
  const desired = normalizeVector(desiredDirection);
  const separation = normalizeVector(getCrowdAvoidance(current, perceivedParticipants));
  const actorOffset = (current.actorId % 8) * (Math.PI / 4);
  const candidates = Array.from({ length: 8 }, (_, index) => {
    const direction = Object.freeze({
      x: Math.cos(actorOffset + index * (Math.PI / 4)),
      y: Math.sin(actorOffset + index * (Math.PI / 4)),
    });
    const endpoint = addVectors(current.position, scaleVector(direction, 1.35));

    if (
      !isBotNavigationSegmentClear(
        terrain,
        blockedTileIds,
        current.position,
        endpoint,
        current.radius,
      )
    ) {
      return undefined;
    }

    const crowdClearance = perceivedParticipants.reduce((minimum, participant) => {
      if (participant.actorId === current.actorId || !isControllable(participant)) {
        return minimum;
      }
      return Math.min(minimum, vectorLength(subtractVectors(endpoint, participant.position)));
    }, CROWD_AVOIDANCE_DISTANCE * 2);
    const desiredAlignment = vectorLength(desired) === 0 ? 0 : dotVectors(direction, desired);
    const separationAlignment =
      vectorLength(separation) === 0 ? 0 : dotVectors(direction, separation);
    const inwardAlignment = dotVectors(
      direction,
      normalizeVector(subtractVectors(terrain.center, current.position)),
    );
    return Object.freeze({
      direction,
      score:
        crowdClearance * 2.4 +
        separationAlignment * 2.2 +
        desiredAlignment * 0.55 +
        inwardAlignment * 0.25 -
        index * 0.001,
    });
  }).filter(
    (candidate): candidate is Readonly<{ direction: Vector2; score: number }> =>
      candidate !== undefined,
  );

  return candidates.toSorted((left, right) => right.score - left.score)[0]?.direction;
}

function getSteeredMovement(
  current: RenderParticipantV1,
  desiredDirection: Vector2,
  perceivedParticipants: readonly RenderParticipantV1[],
  terrain: BotNavigationTerrain,
  blockedTileIds: ReadonlySet<TileId>,
  memory: BotMemory,
): Vector2 {
  const desired = normalizeVector(desiredDirection);
  const stalled = memory.stalledDecisionCount >= STALL_DECISION_THRESHOLD;
  let nearbyCrowdCount = 0;
  for (const participant of perceivedParticipants) {
    if (
      participant.actorId !== current.actorId &&
      isControllable(participant) &&
      Math.hypot(
        participant.position.x - current.position.x,
        participant.position.y - current.position.y,
      ) < CROWD_AVOIDANCE_DISTANCE
    ) {
      nearbyCrowdCount += 1;
    }
  }
  const desiredIsZero = desired.x === 0 && desired.y === 0;
  if (stalled && (nearbyCrowdCount >= 2 || desiredIsZero)) {
    const escape = getStalledEscapeMovement(
      current,
      desired,
      perceivedParticipants,
      terrain,
      blockedTileIds,
    );
    if (escape !== undefined) {
      return escape;
    }
  }
  if (desiredIsZero) {
    return ZERO_VECTOR;
  }
  const crowdAvoidance = getCrowdAvoidance(current, perceivedParticipants);
  const avoidanceScale = stalled ? 1.2 : 0.38;
  let steeredX = desired.x + crowdAvoidance.x * avoidanceScale;
  let steeredY = desired.y + crowdAvoidance.y * avoidanceScale;
  const steeredLength = Math.hypot(steeredX, steeredY);
  if (steeredLength > 1) {
    const steeredInverse = 1 / steeredLength;
    steeredX *= steeredInverse;
    steeredY *= steeredInverse;
  }
  const probeDistance = stalled ? 1.35 : 0.9;
  const steeredEndX = current.position.x + steeredX * probeDistance;
  const steeredEndY = current.position.y + steeredY * probeDistance;
  if (
    !isBotNavigationSegmentClear(
      terrain,
      blockedTileIds,
      current.position,
      Object.freeze({ x: steeredEndX, y: steeredEndY }),
      current.radius,
    )
  ) {
    steeredX = desired.x;
    steeredY = desired.y;
  }
  if (!stalled) {
    return Object.freeze({ x: steeredX, y: steeredY });
  }

  const side = current.actorId % 2 === 0 ? 1 : -1;
  for (const offset of [side * (Math.PI / 3), -side * (Math.PI / 3), side * (Math.PI / 2)]) {
    const cosine = Math.cos(offset);
    const sine = Math.sin(offset);
    let detourX = desired.x * cosine - desired.y * sine;
    let detourY = desired.x * sine + desired.y * cosine;
    const detourLength = Math.hypot(detourX, detourY);
    if (detourLength > 1) {
      const detourInverse = 1 / detourLength;
      detourX *= detourInverse;
      detourY *= detourInverse;
    }
    const detourEndX = current.position.x + detourX * probeDistance;
    const detourEndY = current.position.y + detourY * probeDistance;
    if (
      isBotNavigationSegmentClear(
        terrain,
        blockedTileIds,
        current.position,
        Object.freeze({ x: detourEndX, y: detourEndY }),
        current.radius,
      )
    ) {
      return Object.freeze({ x: detourX, y: detourY });
    }
  }
  return Object.freeze({ x: steeredX, y: steeredY });
}

function chooseEmergencyItemSlot(
  participant: RenderParticipantV1,
  _edgeDistance: number,
): InventorySlotIndex | null {
  if (participant.unsupportedTicks > 0) {
    return getChargedItemSlot(participant, "boat");
  }

  return null;
}

export class BotDirector {
  readonly #humanActorId: ActorId | null;
  readonly #reactionDelayTicks: number;
  readonly #decisionIntervalTicks: number;
  readonly #nearbyCandidateLimit: number;
  readonly #streams: RandomStreamSet;
  readonly #memories = new Map<ActorId, BotMemory>();
  readonly #history: RenderFrameV1[] = [];
  readonly #personalityOverrides: ReadonlyMap<ActorId, BotPersonalityKind>;
  readonly #gameplayTuning: GameplayTuningV1;
  readonly #navigationTerrainCache = new WeakMap<RenderFrameV1["tiles"], BotNavigationTerrain>();

  public constructor(
    masterSeed: SeedInput,
    humanActorId: ActorId | null,
    options: BotDirectorOptions = {},
  ) {
    const profile = getBotDifficultyProfile(options.difficulty ?? "normal");
    this.#reactionDelayTicks = options.reactionDelayTicks ?? profile.reactionDelayTicks;
    this.#decisionIntervalTicks = options.decisionIntervalTicks ?? profile.decisionIntervalTicks;
    this.#nearbyCandidateLimit = options.nearbyCandidateLimit ?? profile.nearbyCandidateLimit;
    this.#gameplayTuning = normalizeGameplayTuning(options.gameplayTuning);
    assertPositiveInteger(this.#reactionDelayTicks, "reactionDelayTicks", true);
    assertPositiveInteger(this.#decisionIntervalTicks, "decisionIntervalTicks");
    assertPositiveInteger(this.#nearbyCandidateLimit, "nearbyCandidateLimit");
    this.#humanActorId = humanActorId;
    this.#streams = new RandomStreamSet(masterSeed);
    const personalityOverrides = new Map<ActorId, BotPersonalityKind>();

    for (const assignment of options.personalityOverrides ?? []) {
      if (personalityOverrides.has(assignment.actorId)) {
        throw new Error(`duplicate personality override for actor ${assignment.actorId}`);
      }

      personalityOverrides.set(assignment.actorId, assignment.personality);
    }
    this.#personalityOverrides = personalityOverrides;
  }

  public getAssignments(): readonly BotAssignment[] {
    return Object.freeze(
      [...this.#memories.values()]
        .toSorted((left, right) => left.actorId - right.actorId)
        .map(({ actorId, personality }) => Object.freeze({ actorId, personality })),
    );
  }

  public createCommands(tick: number, currentFrame: RenderFrameV1): readonly ActorCommandV1[] {
    if (currentFrame.tick !== tick) {
      throw new Error(`bot frame tick ${currentFrame.tick} does not match command tick ${tick}`);
    }

    this.#history.push(currentFrame);
    const minimumHistoryTick = tick - this.#reactionDelayTicks - 2;

    while ((this.#history[0]?.tick ?? tick) < minimumHistoryTick) {
      this.#history.shift();
    }

    const perceptionTick = Math.max(0, tick - this.#reactionDelayTicks);
    const perceptionFrame =
      this.#history.findLast((frame) => frame.tick <= perceptionTick) ??
      this.#history[0] ??
      currentFrame;
    const terrain = this.#getNavigationTerrain(currentFrame);
    const blockedTileIds = createBotBlockedTileIds(currentFrame);
    const perceivedActors = new Map(
      perceptionFrame.participants.map(
        (participant) => [participant.actorId, participant] as const,
      ),
    );
    const perceivedSpatialHash = new ParticipantSpatialHash(
      perceptionFrame.participants.filter(isControllable),
      SIMULATION_TUNING.spatialHash.cellSize,
    );
    const commands: ActorCommandV1[] = [];

    for (const current of currentFrame.participants) {
      if (
        (this.#humanActorId !== null && current.actorId === this.#humanActorId) ||
        !isControllable(current)
      ) {
        continue;
      }

      const memory = this.#getMemory(current);
      this.#updateProgress(memory, current, tick);
      const perceived = perceivedActors.get(current.actorId) ?? current;
      let grapplePressed = false;
      let dodgePressed = false;
      let useItemSlot: InventorySlotIndex | null = null;
      let useSkillSlot: SkillSlotIndex | null = null;
      let targetPosition: Vector2 | null = null;
      const upgradeStat = this.#chooseUpgrade(memory.personality, current);
      const edgeDistance = getBotEdgeDistance(current, terrain);
      const tileEscape = getImmediateBotTileEscape(current, terrain, blockedTileIds);
      const escapingOwnBomb =
        memory.bombEscapePosition !== null && tick < memory.bombEscapeUntilTick;
      const escapingOwnSoap = tick < memory.soapEscapeUntilTick;

      if (tileEscape !== undefined || edgeDistance < EDGE_EMERGENCY_DISTANCE) {
        memory.intent =
          tileEscape ??
          findBotNavigationDirection(
            terrain,
            blockedTileIds,
            current.position,
            terrain.center,
            current.radius,
          ) ??
          ZERO_VECTOR;
        grapplePressed =
          current.action === "Ready" && tick >= current.grappleReadyTick && edgeDistance < 1.2;
        useItemSlot =
          current.action === "Ready" &&
          tick - memory.lastItemUseTick >= Math.min(20, ACTIVE_ITEM_DECISION_COOLDOWN_TICKS)
            ? chooseEmergencyItemSlot(current, edgeDistance)
            : null;

        if (useItemSlot !== null) {
          memory.lastItemUseTick = tick;
        }
        memory.nextDecisionTick = Math.min(memory.nextDecisionTick, tick + 1);
      } else if (escapingOwnBomb) {
        const awayFromBomb = normalizeVector(
          subtractVectors(current.position, memory.bombEscapePosition ?? current.position),
        );
        memory.intent =
          vectorLength(awayFromBomb) > 0
            ? awayFromBomb
            : (findBotNavigationDirection(
                terrain,
                blockedTileIds,
                current.position,
                terrain.center,
                current.radius,
              ) ?? ZERO_VECTOR);
        memory.nextDecisionTick = Math.min(memory.nextDecisionTick, tick + 1);
      } else if (escapingOwnSoap) {
        memory.intent = getSteeredMovement(
          current,
          memory.soapEscapeDirection,
          perceivedSpatialHash.queryNearby(perceived.position, 2),
          terrain,
          blockedTileIds,
          memory,
        );
        memory.nextDecisionTick = Math.min(memory.nextDecisionTick, tick + 1);
      } else if (tick >= memory.nextDecisionTick) {
        const decision = this.#decide(
          tick,
          perceived,
          current,
          perceivedSpatialHash,
          perceptionFrame,
          terrain,
          blockedTileIds,
          memory,
        );
        memory.intent = decision.move;
        grapplePressed = decision.grapplePressed;
        dodgePressed = decision.dodgePressed;
        useItemSlot = decision.useItemSlot;
        useSkillSlot = decision.useSkillSlot;
        targetPosition = decision.targetPosition;

        if (useItemSlot !== null) {
          memory.lastItemUseTick = tick;
          const usedSlot = current.inventory.find(({ slotIndex }) => slotIndex === useItemSlot);

          if (usedSlot?.definitionId === "bomb") {
            memory.bombEscapePosition = current.position;
            memory.bombEscapeUntilTick = tick + this.#gameplayTuning.bombFuseTicks;
          }
        }
        memory.nextDecisionTick = tick + this.#decisionIntervalTicks;
      }

      commands.push(
        Object.freeze({
          ...createNeutralCommand(tick, current.actorId),
          move: memory.intent,
          grapplePressed,
          dodgePressed,
          useItemSlot,
          useSkillSlot,
          targetPosition,
          upgradeStat,
        }),
      );
    }

    return Object.freeze(commands.toSorted((left, right) => left.actorId - right.actorId));
  }

  #getMemory(participant: RenderParticipantV1): BotMemory {
    const actorId = participant.actorId;
    const existing = this.#memories.get(actorId);

    if (existing !== undefined) {
      return existing;
    }

    const personalityRandom = this.#streams.get(`bot-personality:${actorId}`);
    const personality =
      this.#personalityOverrides.get(actorId) ??
      BOT_PERSONALITY_KINDS[personalityRandom.nextUint32() % BOT_PERSONALITY_KINDS.length] ??
      "Survivor";
    const memory: BotMemory = {
      actorId,
      personality,
      jitter: this.#streams.get(`bot-jitter:${actorId}`),
      bombEscapePosition: null,
      bombEscapeUntilTick: Number.NEGATIVE_INFINITY,
      intent: ZERO_VECTOR,
      lastItemUseTick: Number.NEGATIVE_INFINITY,
      lastProgressPosition: participant.position,
      lastProgressTick: 0,
      nextDecisionTick: (actorId * 3) % this.#decisionIntervalTicks,
      soapEscapeDirection: ZERO_VECTOR,
      soapEscapeUntilTick: Number.NEGATIVE_INFINITY,
      stalledDecisionCount: 0,
      targetActorId: null,
      targetLockUntilTick: Number.NEGATIVE_INFINITY,
    };
    this.#memories.set(actorId, memory);
    return memory;
  }

  #updateProgress(memory: BotMemory, participant: RenderParticipantV1, tick: number): void {
    if (tick - memory.lastProgressTick < this.#decisionIntervalTicks) {
      return;
    }
    const progress = vectorLength(
      subtractVectors(participant.position, memory.lastProgressPosition),
    );
    if (vectorLength(memory.intent) > 0.1 && progress < STALL_PROGRESS_DISTANCE) {
      memory.stalledDecisionCount += 1;
    } else {
      memory.stalledDecisionCount = 0;
    }
    memory.lastProgressPosition = participant.position;
    memory.lastProgressTick = tick;
  }

  #getNavigationTerrain(frame: RenderFrameV1): BotNavigationTerrain {
    const cached = this.#navigationTerrainCache.get(frame.tiles);

    if (cached !== undefined) {
      return cached;
    }

    const terrain = createBotNavigationTerrain(frame.tiles);
    this.#navigationTerrainCache.set(frame.tiles, terrain);
    return terrain;
  }

  #chooseUpgrade(
    personality: BotPersonalityKind,
    participant: RenderParticipantV1,
  ): UpgradeStatId | null {
    if (participant.progression.statPoints < 1) {
      return null;
    }

    const priorities: Readonly<Record<BotPersonalityKind, readonly UpgradeStatId[]>> = {
      Aggressor: ["power", "stability", "reflex", "mobility", "vitality", "focus"],
      Survivor: ["vitality", "stability", "focus", "mobility", "reflex", "power"],
      Opportunist: ["mobility", "power", "reflex", "focus", "stability", "vitality"],
      Disruptor: ["power", "reflex", "focus", "stability", "mobility", "vitality"],
      Collector: ["mobility", "focus", "vitality", "stability", "reflex", "power"],
    };
    return (
      priorities[personality].find((stat) => canSpendStatPoint(participant.progression, stat)) ??
      null
    );
  }

  #decide(
    tick: number,
    perceived: RenderParticipantV1,
    current: RenderParticipantV1,
    perceivedSpatialHash: ParticipantSpatialHash<RenderParticipantV1>,
    perceptionFrame: RenderFrameV1,
    terrain: BotNavigationTerrain,
    blockedTileIds: ReadonlySet<TileId>,
    memory: BotMemory,
  ): BotDecision {
    const personality = BOT_PERSONALITIES[memory.personality];
    const perceivedItems: readonly RenderItemV1[] = perceptionFrame.items;
    const canUseActiveItem =
      current.action === "Ready" &&
      tick - memory.lastItemUseTick >= ACTIVE_ITEM_DECISION_COOLDOWN_TICKS;
    const perceivedParticipants = perceivedSpatialHash.queryNearby(perceived.position, 2);
    let threat: RenderParticipantV1 | undefined;
    let threatDistanceSquared = Number.POSITIVE_INFINITY;
    for (const candidate of perceivedParticipants) {
      if (
        candidate.actorId === perceived.actorId ||
        !isControllable(candidate) ||
        !isThreatening(candidate, perceived)
      ) {
        continue;
      }
      const deltaX = candidate.position.x - perceived.position.x;
      const deltaY = candidate.position.y - perceived.position.y;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      if (
        distanceSquared < threatDistanceSquared ||
        (distanceSquared === threatDistanceSquared &&
          threat !== undefined &&
          candidate.actorId < threat.actorId)
      ) {
        threat = candidate;
        threatDistanceSquared = distanceSquared;
      }
    }

    if (threat !== undefined && tick >= current.dodgeReadyTick && current.action === "Ready") {
      const preferredDirection = getPerpendicularTowardCenter(
        threat.facing,
        current.position,
        terrain.center,
      );
      const safeDodgeDirection = getSafeBotDodgeDirection(
        current,
        preferredDirection,
        terrain,
        blockedTileIds,
        this.#gameplayTuning,
      );
      return createDecision(
        safeDodgeDirection ?? preferredDirection,
        false,
        safeDodgeDirection !== undefined,
      );
    }

    const nearby = perceivedParticipants
      .filter((candidate) => candidate.actorId !== perceived.actorId && isControllable(candidate))
      .map((candidate) => ({
        candidate,
        distance: Math.hypot(
          candidate.position.x - perceived.position.x,
          candidate.position.y - perceived.position.y,
        ),
      }))
      .toSorted(
        (left, right) =>
          left.distance - right.distance || left.candidate.actorId - right.candidate.actorId,
      )
      .slice(0, this.#nearbyCandidateLimit);
    const hasCloseOpponent = nearby.some(
      ({ distance }) => distance <= ITEM_COMBAT_PRIORITY_DISTANCE,
    );
    const itemCandidates = perceivedItems
      .map((item) => ({
        item,
        distance: Math.hypot(
          item.position.x - perceived.position.x,
          item.position.y - perceived.position.y,
        ),
      }))
      .filter(
        ({ item, distance }) =>
          canBotPursueMapItem(
            current,
            item,
            memory.personality,
            terrain,
            perceptionFrame.participants,
          ) &&
          getNearestEligibleItemPursuerActorId(
            item,
            perceptionFrame.participants.filter((participant) => {
              const candidateDistance = vectorLength(
                subtractVectors(participant.position, item.position),
              );
              if (participant.actorId === this.#humanActorId) {
                return (
                  candidateDistance <= IMMEDIATE_PICKUP_DISTANCE &&
                  canBotCollectMapItem(participant, item)
                );
              }
              return canBotPursueMapItem(
                participant,
                item,
                this.#getMemory(participant).personality,
                terrain,
                perceptionFrame.participants,
              );
            }),
          ) === current.actorId &&
          (!hasCloseOpponent || distance <= IMMEDIATE_PICKUP_DISTANCE),
      )
      .toSorted(
        (left, right) => left.distance - right.distance || left.item.itemId - right.item.itemId,
      )
      .slice(0, 4);
    if (current.action === "Ready") {
      for (const { item } of itemCandidates) {
        if (!canBotCollectMapItem(current, item)) {
          if (memory.personality !== "Collector" || !canUseActiveItem) {
            continue;
          }

          const occupiedSlot = current.inventory.find(
            ({ slotIndex, charges }) => slotIndex === 0 && charges !== null && charges > 0,
          );
          if (occupiedSlot === undefined || occupiedSlot.definitionId === "boat") {
            continue;
          }

          const awayFromItem = normalizeVector(subtractVectors(current.position, item.position));
          const towardCenter =
            findBotNavigationDirection(
              terrain,
              blockedTileIds,
              current.position,
              terrain.center,
              current.radius,
            ) ?? current.facing;
          const placementDirection =
            occupiedSlot.definitionId === "soap" && vectorLength(awayFromItem) > 0
              ? awayFromItem
              : towardCenter;
          const definition = getItemDefinition(occupiedSlot.definitionId);
          const placementDistance = Math.min(1, definition.castRange);
          const placementTarget =
            definition.targetMode === "ground"
              ? addVectors(current.position, scaleVector(placementDirection, placementDistance))
              : null;

          if (occupiedSlot.definitionId === "soap") {
            memory.soapEscapeDirection = placementDirection;
            memory.soapEscapeUntilTick = tick + SOAP_ESCAPE_TICKS;
          }

          return createDecision(
            placementDirection,
            false,
            false,
            occupiedSlot.slotIndex,
            null,
            placementTarget,
          );
        }

        const itemDirection = findBotNavigationDirection(
          terrain,
          blockedTileIds,
          current.position,
          item.position,
          current.radius,
        );
        if (itemDirection !== undefined) {
          return createDecision(
            getSteeredMovement(
              current,
              itemDirection,
              perceivedParticipants,
              terrain,
              blockedTileIds,
              memory,
            ),
          );
        }
      }
    }

    const scoredTargets = nearby.map(({ candidate, distance }) => {
      const edgeOpportunity = Math.max(0, 2.2 - getBotEdgeDistance(candidate, terrain));
      const stumblingOpportunity =
        candidate.action === "Stumbling" || candidate.action === "Slipping" ? 1 : 0;
      const massPenalty = Math.max(0, candidate.massFactor - perceived.massFactor);
      const healthOpportunity =
        1 - candidate.combat.health / Math.max(1, candidate.combat.maximumHealth);
      const score =
        -distance * personality.approachWeight +
        edgeOpportunity * personality.edgeOpportunityWeight +
        stumblingOpportunity * personality.stumblingTargetWeight -
        massPenalty * personality.heavyTargetPenalty +
        healthOpportunity * 0.8;
      return Object.freeze({ candidate, distance, score });
    });
    const highestScored = scoredTargets.toSorted(
      (left, right) => right.score - left.score || left.candidate.actorId - right.candidate.actorId,
    )[0];
    const retainedTarget = scoredTargets.find(
      ({ candidate }) => candidate.actorId === memory.targetActorId,
    );
    const selectedTarget =
      retainedTarget !== undefined &&
      (tick < memory.targetLockUntilTick ||
        retainedTarget.score >=
          (highestScored?.score ?? Number.NEGATIVE_INFINITY) - TARGET_SWITCH_SCORE_MARGIN)
        ? retainedTarget
        : highestScored;
    const bestTarget = selectedTarget?.candidate;
    const bestDistance = selectedTarget?.distance ?? Number.POSITIVE_INFINITY;

    if (bestTarget === undefined) {
      memory.targetActorId = null;
      const centerDirection = findBotNavigationDirection(
        terrain,
        blockedTileIds,
        current.position,
        terrain.center,
        current.radius,
      );
      return createDecision(
        centerDirection === undefined
          ? ZERO_VECTOR
          : getSteeredMovement(
              current,
              centerDirection,
              perceivedParticipants,
              terrain,
              blockedTileIds,
              memory,
            ),
      );
    }

    if (memory.targetActorId !== bestTarget.actorId) {
      memory.targetActorId = bestTarget.actorId;
      memory.targetLockUntilTick = tick + TARGET_LOCK_TICKS;
    }

    const direct = normalizeVector(subtractVectors(bestTarget.position, perceived.position));
    const pathDirection =
      findBotNavigationDirection(
        terrain,
        blockedTileIds,
        current.position,
        bestTarget.position,
        current.radius,
      ) ??
      findBotNavigationDirection(
        terrain,
        blockedTileIds,
        current.position,
        terrain.center,
        current.radius,
      ) ??
      ZERO_VECTOR;
    const jitter =
      memory.stalledDecisionCount > 0
        ? 0
        : (memory.jitter.nextFloat() * 2 - 1) * personality.jitterRadians;
    const jitteredPath = normalizeVector(rotateVector(pathDirection, jitter));
    const move = getSteeredMovement(
      current,
      jitteredPath,
      perceivedParticipants,
      terrain,
      blockedTileIds,
      memory,
    );
    const safetyPressure = Math.max(0, 1.45 - getBotEdgeDistance(current, terrain));
    const attackSkillSlot =
      current.action === "Ready"
        ? chooseReadySkillSlot(current, tick, "attack", true, {
            target: bestTarget,
            terrain,
            blockedTileIds,
            nearbyOpponentCount: nearby.filter(({ distance }) => distance <= 2.75).length,
          })
        : null;
    if (canUseActiveItem) {
      const closeOpponents = nearby.filter(
        ({ distance }) => distance <= this.#gameplayTuning.bombBlastRadius * 0.9,
      );
      const nearbyBomb = perceptionFrame.bombs.some(
        (bomb) =>
          vectorLength(subtractVectors(bomb.position, perceived.position)) <=
          this.#gameplayTuning.bombBlastRadius * 2,
      );
      const bombSlot = getChargedItemSlot(current, "bomb");

      if (
        bombSlot !== null &&
        perceptionFrame.participants.filter(isControllable).length >=
          MINIMUM_BOMB_LOBBY_SURVIVORS &&
        closeOpponents.length >= 3 &&
        !nearbyBomb &&
        getBotEdgeDistance(current, terrain) >= 3.25 &&
        (memory.personality === "Aggressor" || memory.personality === "Disruptor")
      ) {
        const crowdCenter = closeOpponents.reduce(
          (sum, { candidate }) => addVectors(sum, candidate.position),
          ZERO_VECTOR,
        );
        const average = scaleVector(crowdCenter, 1 / closeOpponents.length);
        return createDecision(
          normalizeVector(subtractVectors(current.position, average)),
          false,
          false,
          bombSlot,
        );
      }

      const brickBagSlot = getChargedItemSlot(current, "brick-bag");
      const healthRatio = current.combat.health / current.combat.maximumHealth;
      const crowdedNearby = nearby.filter(({ distance }) => distance < 1.4).length >= 2;
      const needsBrickCover =
        threat !== undefined ||
        getBotEdgeDistance(current, terrain) <= BRICK_BAG_EDGE_PRESSURE_DISTANCE ||
        healthRatio <= BRICK_BAG_HEALTH_PRESSURE_RATIO;

      if (
        brickBagSlot !== null &&
        !crowdedNearby &&
        needsBrickCover &&
        bestDistance >= BRICK_BAG_MINIMUM_TARGET_DISTANCE &&
        bestDistance <= BRICK_BAG_MAXIMUM_TARGET_DISTANCE
      ) {
        return createDecision(direct, false, false, brickBagSlot);
      }

      const soapSlot = getChargedItemSlot(current, "soap");
      if (
        soapSlot !== null &&
        bestDistance <= 2.2 &&
        (threat !== undefined ||
          memory.personality === "Survivor" ||
          memory.personality === "Opportunist")
      ) {
        const awayFromTarget = normalizeVector(
          subtractVectors(current.position, bestTarget.position),
        );
        const towardCenter =
          findBotNavigationDirection(
            terrain,
            blockedTileIds,
            current.position,
            terrain.center,
            current.radius,
          ) ?? ZERO_VECTOR;
        const retreatDirection = normalizeVector(
          addVectors(scaleVector(awayFromTarget, 0.75), scaleVector(towardCenter, 0.25)),
        );
        const safeRetreatDirection = vectorLength(retreatDirection) > 0 ? retreatDirection : move;
        const soapTargetPosition = addVectors(
          current.position,
          scaleVector(safeRetreatDirection, SOAP_PLACEMENT_DISTANCE),
        );
        memory.soapEscapeDirection = safeRetreatDirection;
        memory.soapEscapeUntilTick = tick + SOAP_ESCAPE_TICKS;
        return createDecision(
          safeRetreatDirection,
          false,
          false,
          soapSlot,
          null,
          soapTargetPosition,
        );
      }
    }

    if (safetyPressure * personality.safetyWeight > 1) {
      const centerDirection =
        findBotNavigationDirection(
          terrain,
          blockedTileIds,
          current.position,
          terrain.center,
          current.radius,
        ) ?? ZERO_VECTOR;
      return createDecision(
        normalizeVector(addVectors(scaleVector(move, 0.35), scaleVector(centerDirection, 0.65))),
        false,
        false,
        null,
        attackSkillSlot,
      );
    }

    return createDecision(move, false, false, null, attackSkillSlot);
  }
}
