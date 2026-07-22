import { quantize } from "./math";
import type { ParticipantState, RoundId, Tick, TileState } from "./contracts";

export interface HashableWorldState {
  readonly roundId: RoundId;
  readonly tick: Tick;
  readonly participants: readonly ParticipantState[];
  readonly tiles: readonly TileState[];
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
      ].join(":");
    });
  const tileParts = state.tiles
    .toSorted((left, right) => left.tileId.localeCompare(right.tileId))
    .map((tile) => `${tile.tileId}:${tile.state}`);
  const canonical = [
    `round:${state.roundId}`,
    `tick:${state.tick}`,
    `participants:${participantParts.join("|")}`,
    `tiles:${tileParts.join("|")}`,
  ].join(";");

  return `fnv1a32:${fnv1aHex(canonical)}`;
}
