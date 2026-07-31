import { quantize } from "./math";
import type {
  BombState,
  BrickWallState,
  GiftDeliveryState,
  ItemState,
  ParticipantState,
  PendingSoapDamageState,
  RoundId,
  RoundStateV1,
  SkillZoneState,
  SoapPatchState,
  Tick,
  TileState,
  TreeObstacleState,
} from "./contracts";

export interface HashableWorldState {
  readonly roundId: RoundId;
  readonly tick: Tick;
  readonly participants: readonly ParticipantState[];
  readonly items: readonly ItemState[];
  readonly giftDeliveries: readonly GiftDeliveryState[];
  readonly brickWalls: readonly BrickWallState[];
  readonly trees: readonly TreeObstacleState[];
  readonly bombs: readonly BombState[];
  readonly soapPatches: readonly SoapPatchState[];
  readonly pendingSoapDamage: readonly PendingSoapDamageState[];
  readonly skillZones: readonly SkillZoneState[];
  readonly nextSkillZoneId: number;
  readonly nextItemId: number;
  readonly nextDeliveryId: number;
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
      const skillPart = participant.skills
        .map((slot) => `${slot.slotIndex},${slot.definitionId},${slot.readyTick}`)
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
        participant.cooldowns.grappleReadyTick,
        participant.cooldowns.dodgeReadyTick,
        participant.action.springBoosted ? 1 : 0,
        participant.action.skillDefinitionId ?? "none",
        ...(inventoryPart === "" ? [] : [`inventory=${inventoryPart}`]),
        `skills=${skillPart}`,
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
        participant.progression.stats.vitality,
        participant.progression.stats.focus,
        participant.progression.skillRanks.join(","),
        participant.startingAttributes.strength,
        participant.startingAttributes.agility,
        participant.startingAttributes.constitution,
        participant.startingAttributes.spirit,
        participant.startingAttributes.balance,
        participant.startingAttributes.willpower,
        quantize(participant.combat.health),
        quantize(participant.combat.maximumHealth),
        quantize(participant.combat.mana),
        quantize(participant.combat.maximumMana),
        quantize(participant.combat.shield),
        participant.combat.shieldEndsTick,
        participant.combat.lastDamageTick ?? "none",
        participant.combat.lastManaSpendTick ?? "none",
        participant.combat.lastDamageSourceActorId ?? "none",
        participant.combat.stunnedUntilTick,
        participant.combat.rootedUntilTick,
        participant.combat.slowedUntilTick,
        quantize(participant.combat.slowMultiplier),
        participant.shoveCredit.attackerActorId ?? "none",
        participant.shoveCredit.hitTick ?? "none",
        quantize(participant.shoveCredit.strength),
      ].join(":");
    });
  const itemParts = state.items.map(
    (item) =>
      `${item.itemId}:${item.definitionId}:${quantize(item.position.x)}:${quantize(item.position.y)}:${item.spawnedTick}`,
  );
  const giftDeliveryParts = state.giftDeliveries
    .toSorted((left, right) => left.deliveryId - right.deliveryId)
    .map(
      (delivery) =>
        `${delivery.deliveryId}:${delivery.shipId}:${delivery.itemId}:${delivery.definitionId}:${quantize(delivery.origin.x)}:${quantize(delivery.origin.y)}:${quantize(delivery.target.x)}:${quantize(delivery.target.y)}:${delivery.launchTick}:${delivery.impactTick}`,
    );
  const brickWallParts = state.brickWalls
    .toSorted((left, right) => left.tileId.localeCompare(right.tileId))
    .map((wall) => `${wall.tileId}:${wall.ownerActorId}:${wall.placedTick}`);
  const treeParts = state.trees
    .toSorted((left, right) => left.tileId.localeCompare(right.tileId))
    .map((tree) => tree.tileId);
  const bombParts = state.bombs
    .toSorted(
      (left, right) =>
        left.detonateTick - right.detonateTick || left.ownerActorId - right.ownerActorId,
    )
    .map(
      (bomb) =>
        `${bomb.ownerActorId}:${quantize(bomb.position.x)}:${quantize(bomb.position.y)}:${quantize(bomb.fallbackDirection.x)}:${quantize(bomb.fallbackDirection.y)}:${bomb.placedTick}:${bomb.detonateTick}`,
    );
  const soapPatchParts = state.soapPatches
    .toSorted((left, right) => left.tileId.localeCompare(right.tileId))
    .map((patch) => `${patch.tileId}:${patch.ownerActorId}:${patch.placedTick}`);
  const pendingSoapDamageParts = state.pendingSoapDamage
    .toSorted(
      (left, right) =>
        left.applyTick - right.applyTick ||
        left.targetActorId - right.targetActorId ||
        left.ownerActorId - right.ownerActorId,
    )
    .map(
      (pending) =>
        `${pending.ownerActorId}:${pending.targetActorId}:${pending.applyTick}:${quantize(pending.damage)}`,
    );
  const skillZoneParts = state.skillZones
    .toSorted((left, right) => left.zoneId - right.zoneId)
    .map(
      (zone) =>
        `${zone.zoneId}:${zone.ownerActorId}:${zone.skillDefinitionId}:${zone.kind}:${quantize(zone.position.x)}:${quantize(zone.position.y)}:${quantize(zone.radius)}:${zone.placedTick}:${zone.activateTick}:${zone.endsTick}:${zone.rank}`,
    );
  const tileCanonical = getCanonicalTiles(state.tiles);
  const canonical = [
    `round:${state.roundId}`,
    `tick:${state.tick}`,
    `participants:${participantParts.join("|")}`,
    `items:${itemParts.join("|")}`,
    `gift-deliveries:${giftDeliveryParts.join("|")}`,
    `brick-walls:${brickWallParts.join("|")}`,
    ...(treeParts.length === 0 ? [] : [`trees:${treeParts.join("|")}`]),
    `bombs:${bombParts.join("|")}`,
    `soap-patches:${soapPatchParts.join("|")}`,
    `soap-damage:${pendingSoapDamageParts.join("|")}`,
    `skill-zones:${skillZoneParts.join("|")}`,
    `skill-zone-cursor:${state.nextSkillZoneId}`,
    `item-cursor:${state.nextItemId}:${state.nextDeliveryId}:${state.nextItemSpawnTick ?? "none"}`,
    `tiles:${tileCanonical}`,
    `result:${state.round.status}:${state.round.winnerActorId ?? "none"}:${state.round.reason ?? "none"}:${state.round.completedTick ?? -1}`,
  ].join(";");

  return `fnv1a32:${fnv1aHex(canonical)}`;
}
