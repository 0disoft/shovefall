import { quantize } from "./math";
import type {
  ItemState,
  ParticipantState,
  RoundId,
  RoundStateV1,
  Tick,
  TileState,
} from "./contracts";

export interface HashableWorldState {
  readonly roundId: RoundId;
  readonly tick: Tick;
  readonly participants: readonly ParticipantState[];
  readonly items: readonly ItemState[];
  readonly nextItemId: number;
  readonly nextItemSpawnTick: Tick | null;
  readonly tiles: readonly TileState[];
  readonly round: RoundStateV1;
}

function fnv1aHex(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

const TILE_CANONICAL_CACHE = new WeakMap<readonly TileState[], string>();

function getCanonicalTiles(tiles: readonly TileState[]): string {
  const cached = TILE_CANONICAL_CACHE.get(tiles);

  if (cached !== undefined) {
    return cached;
  }

  const canonical = tiles
    .toSorted((left, right) => left.tileId.localeCompare(right.tileId))
    .map((tile) => `${tile.tileId}:${tile.state}`)
    .join("|");
  TILE_CANONICAL_CACHE.set(tiles, canonical);
  return canonical;
}

export function hashWorldState(state: HashableWorldState): string {
  const participantParts = state.participants
    .toSorted((left, right) => left.actorId - right.actorId)
    .map((participant) => {
      const { body } = participant;
      const inventoryPart = participant.inventory
        .map(
          (slot) =>
            `${slot.slotIndex},${slot.definitionId},${slot.charges === null ? "passive" : slot.charges}`,
        )
        .join("/");
      return [
        participant.actorId,
        participant.active ? 1 : 0,
        participant.action.kind,
        quantize(body.position.x),
        quantize(body.position.y),
        quantize(body.previousPosition.x),
        quantize(body.previousPosition.y),
        quantize(body.velocity.x),
        quantize(body.velocity.y),
        quantize(body.facing.x),
        quantize(body.facing.y),
        quantize(body.radius),
        quantize(body.baseMassFactor),
        quantize(body.massFactor),
        body.unsupportedTicks,
        participant.action.startedTick,
        participant.action.endsTick ?? -1,
        participant.action.hitActorIds.join(","),
        participant.action.resolvedActorIds.join(","),
        participant.action.lockedDirection === null
          ? "none"
          : `${quantize(participant.action.lockedDirection.x)},${quantize(participant.action.lockedDirection.y)}`,
        participant.cooldowns.shoveReadyTick,
        participant.cooldowns.dodgeReadyTick,
        participant.action.springBoosted ? 1 : 0,
        ...(inventoryPart === "" ? [] : [`inventory=${inventoryPart}`]),
        participant.effects
          .map(
            (effect) => `${effect.definitionId},${effect.appliedTick},${effect.endsTick ?? "none"}`,
          )
          .join("/"),
        participant.progression.statPoints,
        participant.progression.creditedEliminations,
        participant.progression.stats.power,
        participant.progression.stats.stability,
        participant.progression.stats.mobility,
        participant.progression.stats.reflex,
        participant.shoveCredit.attackerActorId ?? "none",
        participant.shoveCredit.hitTick ?? "none",
      ].join(":");
    });
  const itemParts = state.items.map(
    (item) =>
      `${item.itemId}:${item.definitionId}:${quantize(item.position.x)}:${quantize(item.position.y)}:${item.spawnedTick}`,
  );
  const tileCanonical = getCanonicalTiles(state.tiles);
  const canonical = [
    `round:${state.roundId}`,
    `tick:${state.tick}`,
    `participants:${participantParts.join("|")}`,
    `items:${itemParts.join("|")}`,
    `item-cursor:${state.nextItemId}:${state.nextItemSpawnTick ?? "none"}`,
    `tiles:${tileCanonical}`,
    `result:${state.round.status}:${state.round.winnerActorId ?? "none"}:${state.round.reason ?? "none"}:${state.round.completedTick ?? -1}`,
  ].join(";");

  return `fnv1a32:${fnv1aHex(canonical)}`;
}
