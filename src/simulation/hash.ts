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

export function hashWorldState(state: HashableWorldState): string {
  const participantParts = state.participants
    .toSorted((left, right) => left.actorId - right.actorId)
    .map((participant) => {
      const { body } = participant;
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
  const tileParts = state.tiles
    .toSorted((left, right) => left.tileId.localeCompare(right.tileId))
    .map((tile) => `${tile.tileId}:${tile.state}`);
  const canonical = [
    `round:${state.roundId}`,
    `tick:${state.tick}`,
    `participants:${participantParts.join("|")}`,
    `items:${itemParts.join("|")}`,
    `item-cursor:${state.nextItemId}:${state.nextItemSpawnTick ?? "none"}`,
    `tiles:${tileParts.join("|")}`,
    `result:${state.round.status}:${state.round.winnerActorId ?? "none"}:${state.round.reason ?? "none"}:${state.round.completedTick ?? -1}`,
  ].join(";");

  return `fnv1a32:${fnv1aHex(canonical)}`;
}
