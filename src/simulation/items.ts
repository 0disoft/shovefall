import { getItemDefinition, ITEM_DEFINITION_IDS } from "../content/items";
import type {
  ActorId,
  EffectInstance,
  GameConfigV1,
  ItemDefinitionId,
  ItemId,
  ItemState,
  ParticipantState,
  Tick,
  TileState,
} from "./contracts";
import {
  assertFiniteNumber,
  SimulationContractError,
  vectorLength,
  subtractVectors,
  type Vector2,
} from "./math";
import type { XorShift32 } from "./random";
import { normalizeMassFactor } from "./tuning";

const ITEM_PICKUP_REACH = 0.22;
const PARTICIPANT_SPAWN_CLEARANCE = 1.25;
const ITEM_SPAWN_CLEARANCE = 0.9;

export interface ItemSpawnOverride {
  readonly itemId: ItemId;
  readonly definitionId: ItemDefinitionId;
  readonly position: Vector2;
  readonly spawnedTick?: Tick;
}

export interface ItemSystemState {
  readonly items: readonly ItemState[];
  readonly nextItemId: ItemId;
  readonly nextSpawnTick: Tick | null;
  readonly initialSafeTileCount: number;
}

export interface ItemEventFact {
  readonly kind: "item-picked-up" | "item-spawned" | "item-removed";
  readonly actorId?: ActorId;
  readonly itemId: ItemId;
  readonly itemDefinitionId: ItemDefinitionId;
}

export interface ItemPickupResult {
  readonly participants: readonly ParticipantState[];
  readonly state: ItemSystemState;
  readonly facts: readonly ItemEventFact[];
}

export interface ItemSpawnResult {
  readonly state: ItemSystemState;
  readonly facts: readonly ItemEventFact[];
}

function isItemEligibleParticipant(participant: ParticipantState): boolean {
  return (
    participant.active &&
    participant.action.kind !== "Falling" &&
    participant.action.kind !== "Eliminated"
  );
}

function getStableTiles(tiles: readonly TileState[]): readonly TileState[] {
  return tiles.filter(({ state }) => state === "Stable");
}

function getTileCenter(tile: TileState): Vector2 {
  return Object.freeze({ x: tile.column + 0.5, y: tile.row + 0.5 });
}

function getArenaEdges(tiles: readonly TileState[]): { maximumColumn: number; maximumRow: number } {
  return tiles.reduce(
    (bounds, tile) => ({
      maximumColumn: Math.max(bounds.maximumColumn, tile.column),
      maximumRow: Math.max(bounds.maximumRow, tile.row),
    }),
    { maximumColumn: 0, maximumRow: 0 },
  );
}

function isFarEnough(position: Vector2, other: Vector2, clearance: number): boolean {
  return vectorLength(subtractVectors(position, other)) >= clearance;
}

function getSpawnCandidates(
  tiles: readonly TileState[],
  participants: readonly ParticipantState[],
  items: readonly ItemState[],
): readonly Vector2[] {
  const { maximumColumn, maximumRow } = getArenaEdges(tiles);

  return getStableTiles(tiles)
    .filter(
      (tile) =>
        tile.column >= 1 &&
        tile.row >= 1 &&
        tile.column <= maximumColumn - 1 &&
        tile.row <= maximumRow - 1,
    )
    .map(getTileCenter)
    .filter((position) =>
      participants.every((participant) =>
        isFarEnough(position, participant.body.position, PARTICIPANT_SPAWN_CLEARANCE),
      ),
    )
    .filter((position) =>
      items.every((item) => isFarEnough(position, item.position, ITEM_SPAWN_CLEARANCE)),
    );
}

function chooseCandidate<T>(candidates: readonly T[], random: XorShift32): T | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  return candidates[random.nextUint32() % candidates.length];
}

function createItem(itemId: ItemId, position: Vector2, tick: Tick, random: XorShift32): ItemState {
  const definitionId =
    ITEM_DEFINITION_IDS[random.nextUint32() % ITEM_DEFINITION_IDS.length] ?? "iron-boots";
  return Object.freeze({ itemId, definitionId, position, spawnedTick: tick });
}

function spawnOne(
  state: ItemSystemState,
  tiles: readonly TileState[],
  participants: readonly ParticipantState[],
  tick: Tick,
  random: XorShift32,
): { state: ItemSystemState; fact?: ItemEventFact } {
  const position = chooseCandidate(getSpawnCandidates(tiles, participants, state.items), random);

  if (position === undefined) {
    return { state };
  }

  const item = createItem(state.nextItemId, position, tick, random);
  return {
    state: Object.freeze({
      ...state,
      items: Object.freeze([...state.items, item]),
      nextItemId: state.nextItemId + 1,
    }),
    fact: Object.freeze({
      kind: "item-spawned",
      itemId: item.itemId,
      itemDefinitionId: item.definitionId,
    }),
  };
}

function validateOverrides(overrides: readonly ItemSpawnOverride[]): readonly ItemState[] {
  const itemIds = new Set<ItemId>();

  return Object.freeze(
    overrides
      .map((override) => {
        if (!Number.isSafeInteger(override.itemId) || override.itemId < 1) {
          throw new SimulationContractError("item override itemId must be a positive safe integer");
        }

        if (itemIds.has(override.itemId)) {
          throw new SimulationContractError(`duplicate item override ${override.itemId}`);
        }

        itemIds.add(override.itemId);
        if (!ITEM_DEFINITION_IDS.some((definitionId) => definitionId === override.definitionId)) {
          throw new SimulationContractError("item override definitionId is unsupported");
        }

        assertFiniteNumber(override.position.x, "item override position.x");
        assertFiniteNumber(override.position.y, "item override position.y");
        getItemDefinition(override.definitionId);
        return Object.freeze({
          itemId: override.itemId,
          definitionId: override.definitionId,
          position: Object.freeze({ ...override.position }),
          spawnedTick: override.spawnedTick ?? 0,
        });
      })
      .toSorted((left, right) => left.itemId - right.itemId),
  );
}

export function createItemSystem(
  config: GameConfigV1,
  tiles: readonly TileState[],
  participants: readonly ParticipantState[],
  random: XorShift32,
  overrides?: readonly ItemSpawnOverride[],
): ItemSystemState {
  const initialSafeTileCount = getStableTiles(tiles).length;
  let state: ItemSystemState = Object.freeze({
    items: overrides === undefined ? Object.freeze([]) : validateOverrides(overrides),
    nextItemId:
      overrides === undefined ? 1 : Math.max(0, ...overrides.map(({ itemId }) => itemId)) + 1,
    nextSpawnTick:
      config.itemsEnabled && config.itemSpawnIntervalTicks > 0
        ? config.itemSpawnIntervalTicks
        : null,
    initialSafeTileCount,
  });

  if (!config.itemsEnabled || overrides !== undefined) {
    return state;
  }

  for (let index = 0; index < config.initialItemCount; index += 1) {
    const next = spawnOne(state, tiles, participants, 0, random);

    if (next.fact === undefined) {
      break;
    }

    state = next.state;
  }

  return state;
}

function withEffectiveMass(participant: ParticipantState): ParticipantState {
  const massFactor = normalizeMassFactor(
    participant.effects.reduce(
      (mass, effect) => mass * getItemDefinition(effect.definitionId).massMultiplier,
      participant.body.baseMassFactor,
    ),
  );

  if (massFactor === participant.body.massFactor) {
    return participant;
  }

  return Object.freeze({
    ...participant,
    body: Object.freeze({ ...participant.body, massFactor }),
  });
}

export function expireEffects(
  participants: readonly ParticipantState[],
  tick: Tick,
): readonly ParticipantState[] {
  if (
    !participants.some((participant) =>
      participant.effects.some((effect) => effect.endsTick !== null && tick >= effect.endsTick),
    )
  ) {
    return participants;
  }

  return participants.map((participant) => {
    const effects = participant.effects.filter(
      (effect) => effect.endsTick === null || tick < effect.endsTick,
    );

    if (effects.length === participant.effects.length) {
      return participant;
    }

    return withEffectiveMass(Object.freeze({ ...participant, effects: Object.freeze(effects) }));
  });
}

function applyItemEffect(
  participant: ParticipantState,
  definitionId: ItemDefinitionId,
  tick: Tick,
): ParticipantState {
  const definition = getItemDefinition(definitionId);
  const effect: EffectInstance = Object.freeze({
    definitionId,
    appliedTick: tick,
    endsTick: definition.durationTicks === null ? null : tick + definition.durationTicks,
  });
  const effects = Object.freeze(
    [
      ...participant.effects.filter((existing) => existing.definitionId !== definitionId),
      effect,
    ].toSorted((left, right) => left.definitionId.localeCompare(right.definitionId)),
  );
  return withEffectiveMass(Object.freeze({ ...participant, effects }));
}

export function consumeSpringGlove(participant: ParticipantState): ParticipantState {
  if (!participant.effects.some(({ definitionId }) => definitionId === "spring-glove")) {
    return participant;
  }

  return withEffectiveMass(
    Object.freeze({
      ...participant,
      effects: Object.freeze(
        participant.effects.filter(({ definitionId }) => definitionId !== "spring-glove"),
      ),
    }),
  );
}

export function clearEffects(participant: ParticipantState): ParticipantState {
  if (participant.effects.length === 0) {
    return participant;
  }

  return Object.freeze({
    ...participant,
    effects: Object.freeze([]),
    body: Object.freeze({
      ...participant.body,
      massFactor: participant.body.baseMassFactor,
    }),
  });
}

export function hasSpringGlove(participant: ParticipantState): boolean {
  return participant.effects.some(({ definitionId }) => definitionId === "spring-glove");
}

export function getDodgeSpeedMultiplier(participant: ParticipantState): number {
  return participant.effects.reduce(
    (multiplier, effect) =>
      multiplier * getItemDefinition(effect.definitionId).dodgeSpeedMultiplier,
    1,
  );
}

export function resolveItemPickups(
  participants: readonly ParticipantState[],
  state: ItemSystemState,
  tick: Tick,
  tieBreakRandom: XorShift32,
): ItemPickupResult {
  let participantsById: Map<ActorId, ParticipantState> | undefined;
  const pickedItemIds = new Set<ItemId>();
  const facts: ItemEventFact[] = [];

  for (const item of state.items) {
    let closestDistanceSquared = Number.POSITIVE_INFINITY;
    let tiedActorIds: ActorId[] | undefined;

    for (const originalParticipant of participants) {
      const participant = participantsById?.get(originalParticipant.actorId) ?? originalParticipant;

      if (!isItemEligibleParticipant(participant)) {
        continue;
      }

      const deltaX = participant.body.position.x - item.position.x;
      const deltaY = participant.body.position.y - item.position.y;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      const pickupDistance = participant.body.radius + ITEM_PICKUP_REACH;

      if (distanceSquared > pickupDistance * pickupDistance) {
        continue;
      }

      if (distanceSquared + 1e-12 < closestDistanceSquared) {
        closestDistanceSquared = distanceSquared;
        tiedActorIds = [participant.actorId];
      } else if (Math.abs(distanceSquared - closestDistanceSquared) < 1e-12) {
        tiedActorIds?.push(participant.actorId);
      }
    }

    if (tiedActorIds === undefined || tiedActorIds.length === 0) {
      continue;
    }

    const winnerActorId =
      tiedActorIds.length === 1
        ? tiedActorIds[0]
        : tiedActorIds[tieBreakRandom.nextUint32() % tiedActorIds.length];
    const winner =
      winnerActorId === undefined
        ? undefined
        : (participantsById?.get(winnerActorId) ??
          participants.find(({ actorId }) => actorId === winnerActorId));

    if (winner === undefined) {
      continue;
    }

    participantsById ??= new Map(
      participants.map((participant) => [participant.actorId, participant] as const),
    );
    participantsById.set(winner.actorId, applyItemEffect(winner, item.definitionId, tick));
    pickedItemIds.add(item.itemId);
    facts.push(
      Object.freeze({
        kind: "item-picked-up",
        actorId: winner.actorId,
        itemId: item.itemId,
        itemDefinitionId: item.definitionId,
      }),
    );
  }

  if (participantsById === undefined) {
    return Object.freeze({ participants, state, facts: Object.freeze([]) });
  }

  return Object.freeze({
    participants: Object.freeze(
      participants.map((participant) => participantsById.get(participant.actorId) ?? participant),
    ),
    state: Object.freeze({
      ...state,
      items: Object.freeze(state.items.filter(({ itemId }) => !pickedItemIds.has(itemId))),
    }),
    facts: Object.freeze(facts),
  });
}

function getCurrentItemCap(
  config: GameConfigV1,
  tiles: readonly TileState[],
  initialSafeTileCount: number,
): number {
  const stableCount = getStableTiles(tiles).length;
  const areaAdjusted = Math.ceil(
    config.maximumItemCount * (stableCount / Math.max(1, initialSafeTileCount)),
  );
  return Math.min(config.maximumItemCount, areaAdjusted);
}

export function advanceItemSpawns(
  config: GameConfigV1,
  state: ItemSystemState,
  tiles: readonly TileState[],
  participants: readonly ParticipantState[],
  tick: Tick,
  random: XorShift32,
  arenaChanged: boolean,
): ItemSpawnResult {
  const spawnDue = state.nextSpawnTick !== null && tick >= state.nextSpawnTick;

  if (!arenaChanged && !spawnDue) {
    return Object.freeze({ state, facts: Object.freeze([]) });
  }

  const voidTileIds = new Set(
    tiles.filter(({ state: tileState }) => tileState === "Void").map(({ tileId }) => tileId),
  );
  const surviving = state.items.filter(
    (item) => !voidTileIds.has(`${Math.floor(item.position.x)}:${Math.floor(item.position.y)}`),
  );
  const facts: ItemEventFact[] = state.items
    .filter((item) => !surviving.includes(item))
    .map((item) =>
      Object.freeze({
        kind: "item-removed" as const,
        itemId: item.itemId,
        itemDefinitionId: item.definitionId,
      }),
    );
  const cap = getCurrentItemCap(config, tiles, state.initialSafeTileCount);
  const retained = surviving.toSorted((left, right) => left.itemId - right.itemId).slice(0, cap);

  for (const removed of surviving.slice(retained.length)) {
    facts.push(
      Object.freeze({
        kind: "item-removed",
        itemId: removed.itemId,
        itemDefinitionId: removed.definitionId,
      }),
    );
  }

  let nextState: ItemSystemState = Object.freeze({ ...state, items: Object.freeze(retained) });

  if (!config.itemsEnabled || nextState.nextSpawnTick === null || !spawnDue) {
    return Object.freeze({ state: nextState, facts: Object.freeze(facts) });
  }

  nextState = Object.freeze({
    ...nextState,
    nextSpawnTick: tick + config.itemSpawnIntervalTicks,
  });

  if (nextState.items.length < cap) {
    const spawned = spawnOne(nextState, tiles, participants, tick, random);
    nextState = spawned.state;

    if (spawned.fact !== undefined) {
      facts.push(spawned.fact);
    }
  }

  return Object.freeze({ state: nextState, facts: Object.freeze(facts) });
}
