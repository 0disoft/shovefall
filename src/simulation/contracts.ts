import {
  assertFiniteNumber,
  normalizeVector,
  SimulationContractError,
  type Vector2,
  ZERO_VECTOR,
} from "./math";
import { FIXED_TICKS_PER_SECOND } from "./versions";

export const MINIMUM_PARTICIPANT_COUNT = 4;
export const MAXIMUM_PARTICIPANT_COUNT = 60;

export type RoundId = number;
export type ActorId = number;
export type ItemId = number;
export type Tick = number;
export type TileId = `${number}:${number}`;
export type CollapseSpeed = "slow" | "normal" | "fast";
export type BotDifficulty = "easy" | "normal" | "hard";
export type TileStateKind = "Stable" | "Warning" | "Collapsing" | "Void";
export type RoundEndReason = "last-standing" | "no-survivors" | "time-limit";
export type ItemDefinitionId =
  | "iron-boots"
  | "feather"
  | "spring-glove"
  | "soap"
  | "brick-bag"
  | "boat"
  | "bomb";
export type InventorySlotIndex = 0 | 1;
export type SkillSlotIndex = 0 | 1 | 2;
export type SkillDefinitionId =
  | "blink-step"
  | "arc-bolt"
  | "chain-bind"
  | "meteor-mark"
  | "frost-field"
  | "aegis";
export type UpgradeStatId = "power" | "stability" | "mobility" | "reflex" | "vitality" | "focus";

export const MINIMUM_ARENA_COLUMNS = 7;
export const MAXIMUM_ARENA_COLUMNS = 52;
export const MINIMUM_ARENA_ROWS = 7;
export const MAXIMUM_ARENA_ROWS = 48;
export type StartingAttributeId =
  | "strength"
  | "agility"
  | "constitution"
  | "spirit"
  | "balance"
  | "willpower";
export type CombatStatusKind = "stun" | "root" | "slow" | "shield";
export type SkillZoneKind = "delayed-blast" | "frost";

export type ParticipantActionKind =
  | "Ready"
  | "ShoveWindup"
  | "ShoveActive"
  | "ShoveRecovery"
  | "DodgeActive"
  | "GrapplePull"
  | "Stumbling"
  | "Slipping"
  | "Anchored"
  | "Falling"
  | "Eliminated";

export interface GameConfigV1 {
  readonly configVersion: 1;
  readonly participantCount: number;
  readonly arenaColumns: number;
  readonly arenaRows: number;
  readonly roundLimitTicks: number | null;
  readonly density: "normal";
  readonly difficulty: BotDifficulty;
  readonly collapseSpeed: CollapseSpeed;
  readonly itemsEnabled: boolean;
  readonly itemPolicyVersion: 2;
  readonly initialItemCount: number;
  readonly maximumItemCount: number;
  readonly itemSpawnIntervalTicks: number;
}

export interface GameConfigInput {
  readonly participantCount?: number;
  readonly arenaColumns?: number;
  readonly arenaRows?: number;
  readonly roundLimitSeconds?: number | null;
  readonly collapseSpeed?: CollapseSpeed;
  readonly difficulty?: BotDifficulty;
  readonly itemsEnabled?: boolean;
  readonly initialItemCount?: number;
  readonly itemRespawnSeconds?: number;
}

export interface ActorCommandV1 {
  readonly commandVersion: 1;
  readonly tick: Tick;
  readonly actorId: ActorId;
  readonly move: Vector2;
  readonly targetPosition: Vector2 | null;
  readonly grapplePressed: boolean;
  readonly dodgePressed: boolean;
  readonly useSkillSlot: SkillSlotIndex | null;
  readonly useItemSlot: InventorySlotIndex | null;
  readonly upgradeStat: UpgradeStatId | null;
  readonly upgradeSkillSlot: SkillSlotIndex | null;
}

export interface ParticipantStats {
  readonly power: number;
  readonly stability: number;
  readonly mobility: number;
  readonly reflex: number;
  readonly vitality: number;
  readonly focus: number;
}

export interface StartingAttributes {
  readonly strength: number;
  readonly agility: number;
  readonly constitution: number;
  readonly spirit: number;
  readonly balance: number;
  readonly willpower: number;
}

export interface ParticipantProgression {
  readonly statPoints: number;
  readonly creditedEliminations: number;
  readonly stats: ParticipantStats;
  readonly skillRanks: readonly [number, number, number];
}

export interface SkillSlotState {
  readonly slotIndex: SkillSlotIndex;
  readonly definitionId: SkillDefinitionId;
  readonly readyTick: Tick;
}

export interface ParticipantCombatState {
  readonly health: number;
  readonly maximumHealth: number;
  readonly mana: number;
  readonly maximumMana: number;
  readonly shield: number;
  readonly shieldEndsTick: Tick;
  readonly lastDamageTick: Tick | null;
  readonly lastManaSpendTick: Tick | null;
  readonly lastDamageSourceActorId: ActorId | null;
  readonly stunnedUntilTick: Tick;
  readonly rootedUntilTick: Tick;
  readonly slowedUntilTick: Tick;
  readonly slowMultiplier: number;
}

export interface ShoveCreditState {
  readonly attackerActorId: ActorId | null;
  readonly hitTick: Tick | null;
  readonly strength: number;
}

export interface BodyState {
  readonly position: Vector2;
  readonly previousPosition: Vector2;
  readonly velocity: Vector2;
  readonly facing: Vector2;
  readonly radius: number;
  readonly baseMassFactor: number;
  readonly massFactor: number;
  readonly unsupportedTicks: number;
}

export interface ActionState {
  readonly kind: ParticipantActionKind;
  readonly startedTick: Tick;
  readonly endsTick: Tick | null;
  readonly hitActorIds: readonly ActorId[];
  readonly resolvedActorIds: readonly ActorId[];
  readonly lockedDirection: Vector2 | null;
  readonly springBoosted: boolean;
  readonly skillDefinitionId: SkillDefinitionId | null;
}

export interface EffectInstance {
  readonly definitionId: ItemDefinitionId;
  readonly appliedTick: Tick;
  readonly endsTick: Tick | null;
}

export interface InventorySlotState {
  readonly slotIndex: InventorySlotIndex;
  readonly definitionId: ItemDefinitionId;
  readonly charges: number | null;
}

export interface CooldownState {
  readonly grappleReadyTick: Tick;
  readonly dodgeReadyTick: Tick;
}

export interface ParticipantState {
  readonly actorId: ActorId;
  readonly control: "human" | "scripted";
  readonly body: BodyState;
  readonly action: ActionState;
  readonly cooldowns: CooldownState;
  readonly inventory: readonly InventorySlotState[];
  readonly skills: readonly SkillSlotState[];
  readonly combat: ParticipantCombatState;
  readonly effects: readonly EffectInstance[];
  readonly progression: ParticipantProgression;
  readonly startingAttributes: StartingAttributes;
  readonly shoveCredit: ShoveCreditState;
  readonly active: boolean;
}

export interface SkillZoneState {
  readonly zoneId: number;
  readonly ownerActorId: ActorId;
  readonly skillDefinitionId: SkillDefinitionId;
  readonly kind: SkillZoneKind;
  readonly position: Vector2;
  readonly radius: number;
  readonly placedTick: Tick;
  readonly activateTick: Tick;
  readonly endsTick: Tick;
  readonly rank: number;
}

export interface ItemState {
  readonly itemId: ItemId;
  readonly definitionId: ItemDefinitionId;
  readonly position: Vector2;
  readonly spawnedTick: Tick;
}

export interface BrickWallState {
  readonly definitionId: "brick-wall";
  readonly tileId: TileId;
  readonly column: number;
  readonly row: number;
  readonly ownerActorId: ActorId;
  readonly placedTick: Tick;
}

export interface TreeObstacleState {
  readonly definitionId: "tree";
  readonly tileId: TileId;
  readonly column: number;
  readonly row: number;
}

export type BlockingObstacleState = BrickWallState | TreeObstacleState;

export interface BombState {
  readonly ownerActorId: ActorId;
  readonly position: Vector2;
  readonly fallbackDirection: Vector2;
  readonly placedTick: Tick;
  readonly detonateTick: Tick;
}

export interface SoapPatchState {
  readonly ownerActorId: ActorId;
  readonly tileId: TileId;
  readonly column: number;
  readonly row: number;
  readonly placedTick: Tick;
}

export interface PendingSoapDamageState {
  readonly ownerActorId: ActorId;
  readonly targetActorId: ActorId;
  readonly applyTick: Tick;
  readonly damage: number;
}

export interface PirateShipState {
  readonly shipId: number;
  readonly position: Vector2;
}

export interface CannonShotState {
  readonly shotId: number;
  readonly shipId: number;
  readonly targetTileId: TileId;
  readonly origin: Vector2;
  readonly target: Vector2;
  readonly launchTick: Tick;
  readonly warningTick: Tick;
  readonly dangerTick: Tick;
  readonly impactTick: Tick;
}

export interface RockShotState {
  readonly shotId: number;
  readonly shipId: number;
  readonly targetActorId: ActorId;
  readonly origin: Vector2;
  readonly target: Vector2;
  readonly launchTick: Tick;
  readonly impactTick: Tick;
  readonly blastRadius: number;
}

export interface TreasureShipState {
  readonly shipId: number;
  readonly position: Vector2;
}

export interface GiftDeliveryState {
  readonly deliveryId: number;
  readonly shipId: number;
  readonly itemId: ItemId;
  readonly definitionId: ItemDefinitionId;
  readonly origin: Vector2;
  readonly target: Vector2;
  readonly launchTick: Tick;
  readonly impactTick: Tick;
}

export interface TileState {
  readonly tileId: TileId;
  readonly column: number;
  readonly row: number;
  readonly state: TileStateKind;
}

export interface RoundStateV1 {
  readonly status: "Active" | "Completed";
  readonly winnerActorId: ActorId | null;
  readonly reason: RoundEndReason | null;
  readonly completedTick: Tick | null;
}

export interface RenderParticipantV1 {
  readonly actorId: ActorId;
  readonly position: Vector2;
  readonly previousPosition: Vector2;
  readonly velocity: Vector2;
  readonly facing: Vector2;
  readonly radius: number;
  readonly massFactor: number;
  readonly action: ParticipantActionKind;
  readonly active: boolean;
  readonly unsupportedTicks: number;
  readonly grappleReadyTick: Tick;
  readonly dodgeReadyTick: Tick;
  readonly inventory: readonly InventorySlotState[];
  readonly skills: readonly SkillSlotState[];
  readonly combat: ParticipantCombatState;
  readonly effects: readonly EffectInstance[];
  readonly springBoosted: boolean;
  readonly progression: ParticipantProgression;
  readonly startingAttributes: StartingAttributes;
}

export interface RenderItemV1 {
  readonly itemId: ItemId;
  readonly definitionId: ItemDefinitionId;
  readonly position: Vector2;
  readonly spawnedTick: Tick;
}

export interface RenderFrameV1 {
  readonly frameVersion: 1;
  readonly roundId: RoundId;
  readonly tick: Tick;
  readonly stateHash: string;
  readonly participants: readonly RenderParticipantV1[];
  readonly items: readonly RenderItemV1[];
  readonly brickWalls: readonly BrickWallState[];
  readonly trees: readonly TreeObstacleState[];
  readonly bombs: readonly BombState[];
  readonly soapPatches: readonly SoapPatchState[];
  readonly skillZones: readonly SkillZoneState[];
  readonly pirateShips: readonly PirateShipState[];
  readonly cannonShots: readonly CannonShotState[];
  readonly rockShots: readonly RockShotState[];
  readonly treasureShips: readonly TreasureShipState[];
  readonly giftDeliveries: readonly GiftDeliveryState[];
  readonly tiles: readonly TileState[];
  readonly round: RoundStateV1;
}

export type SimulationEventKind =
  | "command-ignored"
  | "shove-started"
  | "shove-hit"
  | "shove-missed"
  | "dodge-started"
  | "dodge-succeeded"
  | "falling-started"
  | "item-picked-up"
  | "item-used"
  | "skill-used"
  | "skill-hit"
  | "skill-zone-created"
  | "skill-zone-expired"
  | "damage-applied"
  | "healed"
  | "shield-applied"
  | "status-applied"
  | "soap-placed"
  | "soap-triggered"
  | "grappling-hook-hit"
  | "bomb-detonated"
  | "brick-wall-placed"
  | "brick-wall-removed"
  | "item-spawned"
  | "item-removed"
  | "eliminated"
  | "stat-point-earned"
  | "stat-upgraded"
  | "tile-warning"
  | "tile-collapsing"
  | "tile-void"
  | "rock-fired"
  | "rock-impact"
  | "round-completed";

export interface SimulationEventV1 {
  readonly eventVersion: 1;
  readonly roundId: RoundId;
  readonly tick: Tick;
  readonly sequence: number;
  readonly kind: SimulationEventKind;
  readonly actorId?: ActorId;
  readonly targetActorId?: ActorId;
  readonly tileId?: TileId;
  readonly itemId?: ItemId;
  readonly itemDefinitionId?: ItemDefinitionId;
  readonly skillDefinitionId?: SkillDefinitionId;
  readonly skillSlotIndex?: SkillSlotIndex;
  readonly upgradeStat?: UpgradeStatId;
  readonly upgradeSkillSlot?: SkillSlotIndex;
  readonly shipId?: number;
  readonly projectileId?: number;
  readonly zoneId?: number;
  readonly amount?: number;
  readonly absorbedAmount?: number;
  readonly healthAfter?: number;
  readonly manaAfter?: number;
  readonly durationTicks?: number;
  readonly statusKind?: CombatStatusKind;
  readonly winnerActorId?: ActorId;
  readonly vector?: Vector2;
  readonly position?: Vector2;
  readonly reason?: "inactive-actor" | "unknown-actor" | RoundEndReason;
}

export interface ReplayCheckpointV1 {
  readonly tick: Tick;
  readonly stateHash: string;
}

export interface ReplayHumanSetupV4 {
  readonly startingAttributes: StartingAttributes;
  readonly startingItems: readonly ItemDefinitionId[];
  readonly startingSkills: readonly SkillDefinitionId[];
}

export interface ReplayFixtureV4 {
  readonly formatVersion: 8;
  readonly productVersion: string;
  readonly simulationVersion: string;
  readonly contentVersion: string;
  readonly buildId: string;
  readonly config: GameConfigV1;
  readonly masterSeed: string | number;
  readonly humanActorId: ActorId;
  readonly humanSetup: ReplayHumanSetupV4;
  readonly endTick: Tick;
  readonly commands: readonly ActorCommandV1[];
  readonly checkpoints: readonly ReplayCheckpointV1[];
  readonly finalHash: string;
}

export function assertIntegerInRange(
  value: number,
  name: string,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new SimulationContractError(
      `${name} must be a safe integer between ${minimum} and ${maximum}`,
    );
  }
}

export function assertArenaParticipantCapacity(
  arenaColumns: number,
  arenaRows: number,
  participantCount: number,
  name = "arena",
): void {
  if (arenaColumns * arenaRows < participantCount) {
    throw new SimulationContractError(
      `${name} must provide at least one spawn tile per participant`,
    );
  }
}

export function normalizeGameConfig(input: GameConfigInput): GameConfigV1 {
  const participantCount = Math.round(input.participantCount ?? 16);
  const arenaColumns = Math.round(input.arenaColumns ?? 12);
  const arenaRows = Math.round(input.arenaRows ?? 10);
  const roundLimitSeconds =
    input.roundLimitSeconds === null ? null : Math.round(input.roundLimitSeconds ?? 75);
  const collapseSpeed = input.collapseSpeed ?? "normal";
  const difficulty = input.difficulty ?? "normal";
  const itemsEnabled = input.itemsEnabled ?? false;
  const maximumItemCount = Math.ceil(participantCount * 0.5);
  const defaultInitialItemCount = Math.ceil(participantCount * 0.33);
  const initialItemCount = itemsEnabled
    ? Math.round(input.initialItemCount ?? defaultInitialItemCount)
    : 0;
  const itemRespawnSeconds = itemsEnabled ? Math.round(input.itemRespawnSeconds ?? 5) : 0;

  assertIntegerInRange(
    participantCount,
    "participantCount",
    MINIMUM_PARTICIPANT_COUNT,
    MAXIMUM_PARTICIPANT_COUNT,
  );
  assertIntegerInRange(arenaColumns, "arenaColumns", MINIMUM_ARENA_COLUMNS, MAXIMUM_ARENA_COLUMNS);
  assertIntegerInRange(arenaRows, "arenaRows", MINIMUM_ARENA_ROWS, MAXIMUM_ARENA_ROWS);
  assertArenaParticipantCapacity(arenaColumns, arenaRows, participantCount);
  if (roundLimitSeconds !== null) {
    assertIntegerInRange(roundLimitSeconds, "roundLimitSeconds", 1, 120);
  }
  assertIntegerInRange(initialItemCount, "initialItemCount", 0, maximumItemCount);
  assertIntegerInRange(itemRespawnSeconds, "itemRespawnSeconds", 0, 30);

  if (collapseSpeed !== "slow" && collapseSpeed !== "normal" && collapseSpeed !== "fast") {
    throw new SimulationContractError("collapseSpeed is unsupported");
  }

  if (difficulty !== "easy" && difficulty !== "normal" && difficulty !== "hard") {
    throw new SimulationContractError("difficulty is unsupported");
  }

  return Object.freeze({
    configVersion: 1,
    participantCount,
    arenaColumns,
    arenaRows,
    roundLimitTicks: roundLimitSeconds === null ? null : roundLimitSeconds * FIXED_TICKS_PER_SECOND,
    density: "normal",
    difficulty,
    collapseSpeed,
    itemsEnabled,
    itemPolicyVersion: 2,
    initialItemCount,
    maximumItemCount,
    itemSpawnIntervalTicks: itemRespawnSeconds * FIXED_TICKS_PER_SECOND,
  });
}

export function createNeutralCommand(tick: Tick, actorId: ActorId): ActorCommandV1 {
  return Object.freeze({
    commandVersion: 1,
    tick,
    actorId,
    move: ZERO_VECTOR,
    targetPosition: null,
    grapplePressed: false,
    dodgePressed: false,
    useSkillSlot: null,
    useItemSlot: null,
    upgradeStat: null,
    upgradeSkillSlot: null,
  });
}

export function normalizeActorCommand(command: ActorCommandV1): ActorCommandV1 {
  assertIntegerInRange(command.tick, "command.tick", 0, Number.MAX_SAFE_INTEGER);
  assertIntegerInRange(command.actorId, "command.actorId", 1, 60);
  if (command.targetPosition !== null) {
    assertFiniteNumber(command.targetPosition.x, "command.targetPosition.x");
    assertFiniteNumber(command.targetPosition.y, "command.targetPosition.y");
  }

  if (
    command.upgradeStat !== null &&
    command.upgradeStat !== "power" &&
    command.upgradeStat !== "stability" &&
    command.upgradeStat !== "mobility" &&
    command.upgradeStat !== "reflex" &&
    command.upgradeStat !== "vitality" &&
    command.upgradeStat !== "focus"
  ) {
    throw new SimulationContractError("command.upgradeStat is unsupported");
  }

  if (command.upgradeStat !== null && command.upgradeSkillSlot !== null) {
    throw new SimulationContractError("command cannot upgrade a stat and skill together");
  }

  if (command.useItemSlot !== null && command.useItemSlot !== 0 && command.useItemSlot !== 1) {
    throw new SimulationContractError("command.useItemSlot is unsupported");
  }

  if (
    command.useSkillSlot !== null &&
    command.useSkillSlot !== 0 &&
    command.useSkillSlot !== 1 &&
    command.useSkillSlot !== 2
  ) {
    throw new SimulationContractError("command.useSkillSlot is unsupported");
  }

  if (
    command.upgradeSkillSlot !== null &&
    command.upgradeSkillSlot !== 0 &&
    command.upgradeSkillSlot !== 1 &&
    command.upgradeSkillSlot !== 2
  ) {
    throw new SimulationContractError("command.upgradeSkillSlot is unsupported");
  }

  return Object.freeze({
    commandVersion: 1,
    tick: command.tick,
    actorId: command.actorId,
    move: normalizeVector(command.move),
    targetPosition:
      command.targetPosition === null
        ? null
        : Object.freeze({ x: command.targetPosition.x, y: command.targetPosition.y }),
    grapplePressed: command.grapplePressed,
    dodgePressed: command.dodgePressed,
    useSkillSlot: command.useSkillSlot,
    useItemSlot: command.useItemSlot,
    upgradeStat: command.upgradeStat,
    upgradeSkillSlot: command.upgradeSkillSlot,
  });
}

export function createTileId(column: number, row: number): TileId {
  assertIntegerInRange(column, "tile.column", -1_000, 1_000);
  assertIntegerInRange(row, "tile.row", -1_000, 1_000);
  return `${column}:${row}`;
}
