import { normalizeVector, SimulationContractError, type Vector2, ZERO_VECTOR } from "./math";
import { FIXED_TICKS_PER_SECOND } from "./versions";

export type RoundId = number;
export type ActorId = number;
export type ItemId = number;
export type Tick = number;
export type TileId = `${number}:${number}`;
export type CollapseSpeed = "slow" | "normal" | "fast";
export type BotDifficulty = "easy" | "normal" | "hard";
export type TileStateKind = "Stable" | "Warning" | "Collapsing" | "Void";
export type RoundEndReason = "last-standing" | "no-survivors" | "time-limit";
export type ItemDefinitionId = "iron-boots" | "feather" | "spring-glove";
export type UpgradeStatId = "power" | "stability" | "mobility" | "reflex";

export type ParticipantActionKind =
  | "Ready"
  | "ShoveWindup"
  | "ShoveActive"
  | "ShoveRecovery"
  | "DodgeActive"
  | "Stumbling"
  | "Anchored"
  | "Falling"
  | "Eliminated";

export interface GameConfigV1 {
  readonly configVersion: 1;
  readonly participantCount: number;
  readonly arenaColumns: number;
  readonly arenaRows: number;
  readonly roundLimitTicks: number;
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
  readonly roundLimitSeconds?: number;
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
  readonly shovePressed: boolean;
  readonly dodgePressed: boolean;
  readonly upgradeStat: UpgradeStatId | null;
}

export interface ParticipantStats {
  readonly power: number;
  readonly stability: number;
  readonly mobility: number;
  readonly reflex: number;
}

export interface ParticipantProgression {
  readonly statPoints: number;
  readonly creditedEliminations: number;
  readonly stats: ParticipantStats;
}

export interface ShoveCreditState {
  readonly attackerActorId: ActorId | null;
  readonly hitTick: Tick | null;
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
}

export interface EffectInstance {
  readonly definitionId: ItemDefinitionId;
  readonly appliedTick: Tick;
  readonly endsTick: Tick | null;
}

export interface CooldownState {
  readonly shoveReadyTick: Tick;
  readonly dodgeReadyTick: Tick;
}

export interface ParticipantState {
  readonly actorId: ActorId;
  readonly control: "human" | "scripted";
  readonly body: BodyState;
  readonly action: ActionState;
  readonly cooldowns: CooldownState;
  readonly effects: readonly EffectInstance[];
  readonly progression: ParticipantProgression;
  readonly shoveCredit: ShoveCreditState;
  readonly active: boolean;
}

export interface ItemState {
  readonly itemId: ItemId;
  readonly definitionId: ItemDefinitionId;
  readonly position: Vector2;
  readonly spawnedTick: Tick;
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
  readonly shoveReadyTick: Tick;
  readonly dodgeReadyTick: Tick;
  readonly effects: readonly EffectInstance[];
  readonly springBoosted: boolean;
  readonly progression: ParticipantProgression;
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
  | "item-spawned"
  | "item-removed"
  | "eliminated"
  | "stat-point-earned"
  | "stat-upgraded"
  | "tile-warning"
  | "tile-collapsing"
  | "tile-void"
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
  readonly upgradeStat?: UpgradeStatId;
  readonly winnerActorId?: ActorId;
  readonly vector?: Vector2;
  readonly reason?: "inactive-actor" | "unknown-actor" | RoundEndReason;
}

export interface ReplayCheckpointV1 {
  readonly tick: Tick;
  readonly stateHash: string;
}

export interface ReplayFixtureV1 {
  readonly formatVersion: 1;
  readonly productVersion: string;
  readonly simulationVersion: string;
  readonly contentVersion: string;
  readonly buildId: string;
  readonly config: GameConfigV1;
  readonly masterSeed: string | number;
  readonly humanActorId: ActorId;
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

export function normalizeGameConfig(input: GameConfigInput): GameConfigV1 {
  const participantCount = Math.round(input.participantCount ?? 16);
  const arenaColumns = Math.round(input.arenaColumns ?? 12);
  const arenaRows = Math.round(input.arenaRows ?? 10);
  const roundLimitSeconds = Math.round(input.roundLimitSeconds ?? 75);
  const collapseSpeed = input.collapseSpeed ?? "normal";
  const difficulty = input.difficulty ?? "normal";
  const itemsEnabled = input.itemsEnabled ?? false;
  const maximumItemCount = Math.ceil(participantCount * 0.5);
  const defaultInitialItemCount = Math.ceil(participantCount * 0.33);
  const initialItemCount = itemsEnabled
    ? Math.round(input.initialItemCount ?? defaultInitialItemCount)
    : 0;
  const itemRespawnSeconds = itemsEnabled ? Math.round(input.itemRespawnSeconds ?? 5) : 0;

  assertIntegerInRange(participantCount, "participantCount", 4, 32);
  assertIntegerInRange(arenaColumns, "arenaColumns", 7, 31);
  assertIntegerInRange(arenaRows, "arenaRows", 7, 31);
  assertIntegerInRange(roundLimitSeconds, "roundLimitSeconds", 1, 120);
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
    roundLimitTicks: roundLimitSeconds * FIXED_TICKS_PER_SECOND,
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
    shovePressed: false,
    dodgePressed: false,
    upgradeStat: null,
  });
}

export function normalizeActorCommand(command: ActorCommandV1): ActorCommandV1 {
  assertIntegerInRange(command.tick, "command.tick", 0, Number.MAX_SAFE_INTEGER);
  assertIntegerInRange(command.actorId, "command.actorId", 1, 32);

  if (
    command.upgradeStat !== null &&
    command.upgradeStat !== "power" &&
    command.upgradeStat !== "stability" &&
    command.upgradeStat !== "mobility" &&
    command.upgradeStat !== "reflex"
  ) {
    throw new SimulationContractError("command.upgradeStat is unsupported");
  }

  return Object.freeze({
    commandVersion: 1,
    tick: command.tick,
    actorId: command.actorId,
    move: normalizeVector(command.move),
    shovePressed: command.shovePressed,
    dodgePressed: command.dodgePressed,
    upgradeStat: command.upgradeStat,
  });
}

export function createTileId(column: number, row: number): TileId {
  assertIntegerInRange(column, "tile.column", -1_000, 1_000);
  assertIntegerInRange(row, "tile.row", -1_000, 1_000);
  return `${column}:${row}`;
}
