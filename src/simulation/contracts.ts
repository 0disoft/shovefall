import { normalizeVector, SimulationContractError, type Vector2, ZERO_VECTOR } from "./math";
import { FIXED_TICKS_PER_SECOND } from "./versions";

export type RoundId = number;
export type ActorId = number;
export type Tick = number;
export type TileId = `${number}:${number}`;

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
  readonly difficulty: "normal";
  readonly itemsEnabled: false;
}

export interface GameConfigInput {
  readonly participantCount?: number;
  readonly arenaColumns?: number;
  readonly arenaRows?: number;
  readonly roundLimitSeconds?: number;
}

export interface ActorCommandV1 {
  readonly commandVersion: 1;
  readonly tick: Tick;
  readonly actorId: ActorId;
  readonly move: Vector2;
  readonly shovePressed: boolean;
  readonly dodgePressed: boolean;
}

export interface BodyState {
  readonly position: Vector2;
  readonly velocity: Vector2;
  readonly facing: Vector2;
  readonly radius: number;
  readonly massFactor: number;
  readonly unsupportedTicks: number;
}

export interface ActionState {
  readonly kind: ParticipantActionKind;
  readonly startedTick: Tick;
  readonly endsTick: Tick | null;
  readonly hitActorIds: readonly ActorId[];
}

export interface ParticipantState {
  readonly actorId: ActorId;
  readonly control: "human" | "scripted";
  readonly body: BodyState;
  readonly action: ActionState;
  readonly active: boolean;
}

export interface TileState {
  readonly tileId: TileId;
  readonly column: number;
  readonly row: number;
  readonly state: "Stable";
}

export interface RenderParticipantV1 {
  readonly actorId: ActorId;
  readonly position: Vector2;
  readonly previousPosition: Vector2;
  readonly facing: Vector2;
  readonly radius: number;
  readonly massFactor: number;
  readonly action: ParticipantActionKind;
  readonly active: boolean;
}

export interface RenderFrameV1 {
  readonly frameVersion: 1;
  readonly roundId: RoundId;
  readonly tick: Tick;
  readonly stateHash: string;
  readonly participants: readonly RenderParticipantV1[];
  readonly tiles: readonly TileState[];
}

export type SimulationEventKind = "round-started" | "command-ignored";

export interface SimulationEventV1 {
  readonly eventVersion: 1;
  readonly roundId: RoundId;
  readonly tick: Tick;
  readonly sequence: number;
  readonly kind: SimulationEventKind;
  readonly actorId?: ActorId;
  readonly reason?: "inactive-actor" | "unknown-actor";
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
  const participantCount = Math.round(input.participantCount ?? 12);
  const arenaColumns = Math.round(input.arenaColumns ?? 11);
  const arenaRows = Math.round(input.arenaRows ?? 9);
  const roundLimitSeconds = Math.round(input.roundLimitSeconds ?? 75);

  assertIntegerInRange(participantCount, "participantCount", 4, 32);
  assertIntegerInRange(arenaColumns, "arenaColumns", 7, 31);
  assertIntegerInRange(arenaRows, "arenaRows", 7, 31);
  assertIntegerInRange(roundLimitSeconds, "roundLimitSeconds", 1, 120);

  return Object.freeze({
    configVersion: 1,
    participantCount,
    arenaColumns,
    arenaRows,
    roundLimitTicks: roundLimitSeconds * FIXED_TICKS_PER_SECOND,
    density: "normal",
    difficulty: "normal",
    itemsEnabled: false,
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
  });
}

export function normalizeActorCommand(command: ActorCommandV1): ActorCommandV1 {
  assertIntegerInRange(command.tick, "command.tick", 0, Number.MAX_SAFE_INTEGER);
  assertIntegerInRange(command.actorId, "command.actorId", 1, 32);

  return Object.freeze({
    commandVersion: 1,
    tick: command.tick,
    actorId: command.actorId,
    move: normalizeVector(command.move),
    shovePressed: command.shovePressed,
    dodgePressed: command.dodgePressed,
  });
}

export function createTileId(column: number, row: number): TileId {
  assertIntegerInRange(column, "tile.column", -1_000, 1_000);
  assertIntegerInRange(row, "tile.row", -1_000, 1_000);
  return `${column}:${row}`;
}
