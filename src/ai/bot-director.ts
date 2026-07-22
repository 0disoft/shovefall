import { BOT_PERSONALITIES, BOT_PERSONALITY_KINDS, type BotPersonalityKind } from "./personalities";
import {
  createNeutralCommand,
  type ActorCommandV1,
  type ActorId,
  type RenderFrameV1,
  type RenderItemV1,
  type RenderParticipantV1,
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
import { SIMULATION_TUNING } from "../simulation/tuning";

export interface BotDirectorOptions {
  readonly reactionDelayTicks?: number;
  readonly decisionIntervalTicks?: number;
  readonly nearbyCandidateLimit?: number;
}

export interface BotAssignment {
  readonly actorId: ActorId;
  readonly personality: BotPersonalityKind;
}

interface BotMemory {
  readonly actorId: ActorId;
  readonly personality: BotPersonalityKind;
  readonly jitter: XorShift32;
  intent: Vector2;
  nextDecisionTick: number;
}

interface ArenaBounds {
  readonly columns: number;
  readonly rows: number;
  readonly center: Vector2;
}

interface BotDecision {
  readonly move: Vector2;
  readonly shovePressed: boolean;
  readonly dodgePressed: boolean;
}

const DEFAULT_REACTION_DELAY_TICKS = 10;
const DEFAULT_DECISION_INTERVAL_TICKS = 12;
const DEFAULT_NEARBY_CANDIDATE_LIMIT = 6;
const EDGE_EMERGENCY_DISTANCE = 0.82;
const THREAT_DISTANCE = 1.65;
const THREAT_FACING_DOT = 0.55;

function assertPositiveInteger(value: number, name: string, allowZero = false): void {
  const minimum = allowZero ? 0 : 1;

  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be a safe integer greater than or equal to ${minimum}`);
  }
}

function getArenaBounds(frame: RenderFrameV1): ArenaBounds {
  const dimensions = frame.tiles.reduce(
    (result, tile) => ({
      columns: Math.max(result.columns, tile.column + 1),
      rows: Math.max(result.rows, tile.row + 1),
    }),
    { columns: 1, rows: 1 },
  );
  return Object.freeze({
    ...dimensions,
    center: Object.freeze({ x: dimensions.columns / 2, y: dimensions.rows / 2 }),
  });
}

function getEdgeDistance(participant: RenderParticipantV1, bounds: ArenaBounds): number {
  return Math.min(
    participant.position.x,
    participant.position.y,
    bounds.columns - participant.position.x,
    bounds.rows - participant.position.y,
  );
}

function getImmediateTileEscape(
  frame: RenderFrameV1,
  participant: RenderParticipantV1,
): Vector2 | undefined {
  const column = Math.floor(participant.position.x);
  const row = Math.floor(participant.position.y);
  const currentTile = frame.tiles.find((tile) => tile.column === column && tile.row === row);

  if (currentTile?.state === "Stable") {
    return undefined;
  }

  const safeTile = frame.tiles
    .filter(({ state }) => state === "Stable")
    .map((tile) => ({
      tile,
      distance: vectorLength(
        subtractVectors(
          Object.freeze({ x: tile.column + 0.5, y: tile.row + 0.5 }),
          participant.position,
        ),
      ),
    }))
    .toSorted(
      (left, right) =>
        left.distance - right.distance || left.tile.tileId.localeCompare(right.tile.tileId),
    )[0]?.tile;

  return safeTile === undefined
    ? undefined
    : normalizeVector(
        subtractVectors(
          Object.freeze({ x: safeTile.column + 0.5, y: safeTile.row + 0.5 }),
          participant.position,
        ),
      );
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
  const delta = subtractVectors(self.position, candidate.position);
  const distance = vectorLength(delta);

  if (distance > THREAT_DISTANCE || distance === 0) {
    return false;
  }

  const towardSelf = scaleVector(delta, 1 / distance);
  const facingSelf = dotVectors(candidate.facing, towardSelf) >= THREAT_FACING_DOT;
  const advancing = dotVectors(candidate.velocity, towardSelf) > 0.035;
  return (
    facingSelf &&
    (advancing || candidate.action === "ShoveWindup" || candidate.action === "ShoveActive")
  );
}

export class BotDirector {
  readonly #humanActorId: ActorId;
  readonly #reactionDelayTicks: number;
  readonly #decisionIntervalTicks: number;
  readonly #nearbyCandidateLimit: number;
  readonly #streams: RandomStreamSet;
  readonly #memories = new Map<ActorId, BotMemory>();
  readonly #history: RenderFrameV1[] = [];

  public constructor(
    masterSeed: SeedInput,
    humanActorId: ActorId,
    options: BotDirectorOptions = {},
  ) {
    this.#reactionDelayTicks = options.reactionDelayTicks ?? DEFAULT_REACTION_DELAY_TICKS;
    this.#decisionIntervalTicks = options.decisionIntervalTicks ?? DEFAULT_DECISION_INTERVAL_TICKS;
    this.#nearbyCandidateLimit = options.nearbyCandidateLimit ?? DEFAULT_NEARBY_CANDIDATE_LIMIT;
    assertPositiveInteger(this.#reactionDelayTicks, "reactionDelayTicks", true);
    assertPositiveInteger(this.#decisionIntervalTicks, "decisionIntervalTicks");
    assertPositiveInteger(this.#nearbyCandidateLimit, "nearbyCandidateLimit");
    this.#humanActorId = humanActorId;
    this.#streams = new RandomStreamSet(masterSeed);
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
    const bounds = getArenaBounds(currentFrame);
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
      if (current.actorId === this.#humanActorId || !isControllable(current)) {
        continue;
      }

      const memory = this.#getMemory(current.actorId);
      const perceived = perceivedActors.get(current.actorId) ?? current;
      let shovePressed = false;
      let dodgePressed = false;
      const edgeDistance = getEdgeDistance(current, bounds);
      const tileEscape = getImmediateTileEscape(currentFrame, current);

      if (tileEscape !== undefined || edgeDistance < EDGE_EMERGENCY_DISTANCE) {
        memory.intent =
          tileEscape ?? normalizeVector(subtractVectors(bounds.center, current.position));
        memory.nextDecisionTick = Math.min(memory.nextDecisionTick, tick + 1);
      } else if (tick >= memory.nextDecisionTick) {
        const decision = this.#decide(
          tick,
          perceived,
          current,
          perceivedSpatialHash,
          perceptionFrame.items,
          bounds,
          memory,
        );
        memory.intent = decision.move;
        shovePressed = decision.shovePressed;
        dodgePressed = decision.dodgePressed;
        memory.nextDecisionTick = tick + this.#decisionIntervalTicks;
      }

      commands.push(
        Object.freeze({
          ...createNeutralCommand(tick, current.actorId),
          move: memory.intent,
          shovePressed,
          dodgePressed,
        }),
      );
    }

    return Object.freeze(commands.toSorted((left, right) => left.actorId - right.actorId));
  }

  #getMemory(actorId: ActorId): BotMemory {
    const existing = this.#memories.get(actorId);

    if (existing !== undefined) {
      return existing;
    }

    const personalityRandom = this.#streams.get(`bot-personality:${actorId}`);
    const personality =
      BOT_PERSONALITY_KINDS[personalityRandom.nextUint32() % BOT_PERSONALITY_KINDS.length] ??
      "Survivor";
    const memory: BotMemory = {
      actorId,
      personality,
      jitter: this.#streams.get(`bot-jitter:${actorId}`),
      intent: ZERO_VECTOR,
      nextDecisionTick: (actorId * 3) % this.#decisionIntervalTicks,
    };
    this.#memories.set(actorId, memory);
    return memory;
  }

  #decide(
    tick: number,
    perceived: RenderParticipantV1,
    current: RenderParticipantV1,
    perceivedSpatialHash: ParticipantSpatialHash<RenderParticipantV1>,
    perceivedItems: readonly RenderItemV1[],
    bounds: ArenaBounds,
    memory: BotMemory,
  ): BotDecision {
    const personality = BOT_PERSONALITIES[memory.personality];
    const perceivedParticipants = perceivedSpatialHash.queryNearby(perceived.position, 2);
    const threats = perceivedParticipants
      .filter(
        (candidate) =>
          candidate.actorId !== perceived.actorId &&
          isControllable(candidate) &&
          isThreatening(candidate, perceived),
      )
      .toSorted(
        (left, right) =>
          vectorLength(subtractVectors(left.position, perceived.position)) -
            vectorLength(subtractVectors(right.position, perceived.position)) ||
          left.actorId - right.actorId,
      );
    const threat = threats[0];

    if (threat !== undefined && tick >= current.dodgeReadyTick && current.action === "Ready") {
      return Object.freeze({
        move: getPerpendicularTowardCenter(threat.facing, current.position, bounds.center),
        shovePressed: false,
        dodgePressed: true,
      });
    }

    let nearestItem: { item: RenderItemV1; distance: number } | undefined;

    for (const item of perceivedItems) {
      const distance = vectorLength(subtractVectors(item.position, perceived.position));

      if (
        nearestItem === undefined ||
        distance < nearestItem.distance ||
        (distance === nearestItem.distance && item.itemId < nearestItem.item.itemId)
      ) {
        nearestItem = { item, distance };
      }
    }

    if (
      nearestItem !== undefined &&
      nearestItem.distance <= 3.5 * personality.itemInterestWeight &&
      current.action === "Ready"
    ) {
      return Object.freeze({
        move: normalizeVector(subtractVectors(nearestItem.item.position, current.position)),
        shovePressed: false,
        dodgePressed: false,
      });
    }

    const nearby = perceivedParticipants
      .filter((candidate) => candidate.actorId !== perceived.actorId && isControllable(candidate))
      .map((candidate) => ({
        candidate,
        distance: vectorLength(subtractVectors(candidate.position, perceived.position)),
      }))
      .toSorted(
        (left, right) =>
          left.distance - right.distance || left.candidate.actorId - right.candidate.actorId,
      )
      .slice(0, this.#nearbyCandidateLimit);
    let bestTarget: RenderParticipantV1 | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const { candidate, distance } of nearby) {
      const edgeOpportunity = Math.max(0, 2.2 - getEdgeDistance(candidate, bounds));
      const stumblingOpportunity = candidate.action === "Stumbling" ? 1 : 0;
      const massPenalty = Math.max(0, candidate.massFactor - perceived.massFactor);
      const score =
        -distance * personality.approachWeight +
        edgeOpportunity * personality.edgeOpportunityWeight +
        stumblingOpportunity * personality.stumblingTargetWeight -
        massPenalty * personality.heavyTargetPenalty;

      if (
        score > bestScore ||
        (score === bestScore && candidate.actorId < (bestTarget?.actorId ?? Infinity))
      ) {
        bestTarget = candidate;
        bestDistance = distance;
        bestScore = score;
      }
    }

    if (bestTarget === undefined) {
      return Object.freeze({
        move: normalizeVector(subtractVectors(bounds.center, current.position)),
        shovePressed: false,
        dodgePressed: false,
      });
    }

    const direct = normalizeVector(subtractVectors(bestTarget.position, perceived.position));
    const jitter = (memory.jitter.nextFloat() * 2 - 1) * personality.jitterRadians;
    const move = normalizeVector(rotateVector(direct, jitter));
    const safetyPressure = Math.max(0, 1.45 - getEdgeDistance(current, bounds));

    if (safetyPressure * personality.safetyWeight > 1) {
      return Object.freeze({
        move: normalizeVector(
          addVectors(
            scaleVector(move, 0.35),
            scaleVector(normalizeVector(subtractVectors(bounds.center, current.position)), 0.65),
          ),
        ),
        shovePressed: false,
        dodgePressed: false,
      });
    }

    return Object.freeze({
      move,
      shovePressed:
        current.action === "Ready" &&
        tick >= current.shoveReadyTick &&
        bestDistance <= personality.shoveDistance,
      dodgePressed: false,
    });
  }
}
