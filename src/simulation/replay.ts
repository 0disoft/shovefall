import {
  assertIntegerInRange,
  normalizeActorCommand,
  type ActorCommandV1,
  type GameConfigV1,
  type ReplayCheckpointV1,
  type ReplayFixtureV1,
} from "./contracts";
import { SimulationContractError } from "./math";
import { SimulationWorld } from "./world";
import {
  CONTENT_VERSION,
  MAX_REPLAY_BYTES,
  MAX_REPLAY_TICKS,
  PRODUCT_VERSION,
  REPLAY_FORMAT_VERSION,
  SIMULATION_VERSION,
} from "./versions";

export interface ReplayRunResult {
  readonly checkpoints: readonly ReplayCheckpointV1[];
  readonly finalHash: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readInteger(record: Readonly<Record<string, unknown>>, key: string): number {
  const value = record[key];

  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new SimulationContractError(`${key} must be a safe integer`);
  }

  return value;
}

function readString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];

  if (typeof value !== "string" || value.length === 0) {
    throw new SimulationContractError(`${key} must be a non-empty string`);
  }

  return value;
}

function readBoolean(record: Readonly<Record<string, unknown>>, key: string): boolean {
  const value = record[key];

  if (typeof value !== "boolean") {
    throw new SimulationContractError(`${key} must be a boolean`);
  }

  return value;
}

function readSeed(record: Readonly<Record<string, unknown>>, key: string): string | number {
  const value = record[key];

  if (
    (typeof value !== "string" || value.length === 0) &&
    (typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new SimulationContractError(`${key} must be a non-empty string or finite number`);
  }

  return value;
}

function parseConfig(value: unknown): GameConfigV1 {
  if (!isRecord(value)) {
    throw new SimulationContractError("config must be an object");
  }

  const config: GameConfigV1 = Object.freeze({
    configVersion: 1,
    participantCount: readInteger(value, "participantCount"),
    arenaColumns: readInteger(value, "arenaColumns"),
    arenaRows: readInteger(value, "arenaRows"),
    roundLimitTicks: readInteger(value, "roundLimitTicks"),
    density: value.density === "normal" ? "normal" : fail("config.density is unsupported"),
    difficulty: value.difficulty === "normal" ? "normal" : fail("config.difficulty is unsupported"),
    collapseSpeed:
      value.collapseSpeed === "slow" ||
      value.collapseSpeed === "normal" ||
      value.collapseSpeed === "fast"
        ? value.collapseSpeed
        : fail("config.collapseSpeed is unsupported"),
    itemsEnabled: value.itemsEnabled === false ? false : fail("config.itemsEnabled must be false"),
  });

  if (config.configVersion !== readInteger(value, "configVersion")) {
    throw new SimulationContractError("configVersion is unsupported");
  }

  if (config.participantCount < 4 || config.participantCount > 32) {
    throw new SimulationContractError("config participant count is outside 4..32");
  }

  assertIntegerInRange(config.arenaColumns, "config.arenaColumns", 7, 31);
  assertIntegerInRange(config.arenaRows, "config.arenaRows", 7, 31);

  if (config.roundLimitTicks < 1 || config.roundLimitTicks > MAX_REPLAY_TICKS) {
    throw new SimulationContractError("config round limit is outside replay bounds");
  }

  return config;
}

function fail(message: string): never {
  throw new SimulationContractError(message);
}

function parseCommand(value: unknown): ActorCommandV1 {
  if (!isRecord(value) || !isRecord(value.move)) {
    throw new SimulationContractError("replay command must be an object");
  }

  return normalizeActorCommand({
    commandVersion:
      readInteger(value, "commandVersion") === 1 ? 1 : fail("commandVersion is unsupported"),
    tick: readInteger(value, "tick"),
    actorId: readInteger(value, "actorId"),
    move: {
      x: typeof value.move.x === "number" ? value.move.x : Number.NaN,
      y: typeof value.move.y === "number" ? value.move.y : Number.NaN,
    },
    shovePressed: readBoolean(value, "shovePressed"),
    dodgePressed: readBoolean(value, "dodgePressed"),
  });
}

function parseCheckpoint(value: unknown): ReplayCheckpointV1 {
  if (!isRecord(value)) {
    throw new SimulationContractError("replay checkpoint must be an object");
  }

  return Object.freeze({
    tick: readInteger(value, "tick"),
    stateHash: readString(value, "stateHash"),
  });
}

export function parseReplayFixtureJson(json: string): ReplayFixtureV1 {
  const byteLength = new TextEncoder().encode(json).byteLength;

  if (byteLength > MAX_REPLAY_BYTES) {
    throw new SimulationContractError("replay fixture exceeds 5 MiB");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SimulationContractError("replay fixture is not valid JSON");
  }

  if (!isRecord(parsed)) {
    throw new SimulationContractError("replay fixture must be an object");
  }

  const formatVersion = readInteger(parsed, "formatVersion");

  if (formatVersion !== REPLAY_FORMAT_VERSION) {
    throw new SimulationContractError(`unsupported replay format major: ${formatVersion}`);
  }

  if (!Array.isArray(parsed.commands) || !Array.isArray(parsed.checkpoints)) {
    throw new SimulationContractError("replay commands and checkpoints must be arrays");
  }

  const commands = Object.freeze(parsed.commands.map(parseCommand));
  const checkpoints = Object.freeze(parsed.checkpoints.map(parseCheckpoint));
  const fixture: ReplayFixtureV1 = Object.freeze({
    formatVersion: 1,
    productVersion: readString(parsed, "productVersion"),
    simulationVersion: readString(parsed, "simulationVersion"),
    contentVersion: readString(parsed, "contentVersion"),
    buildId: readString(parsed, "buildId"),
    config: parseConfig(parsed.config),
    masterSeed: readSeed(parsed, "masterSeed"),
    humanActorId: readInteger(parsed, "humanActorId"),
    endTick: readInteger(parsed, "endTick"),
    commands,
    checkpoints,
    finalHash: readString(parsed, "finalHash"),
  });

  if (fixture.simulationVersion !== SIMULATION_VERSION) {
    throw new SimulationContractError("replay simulationVersion is incompatible");
  }

  if (fixture.endTick < 0 || fixture.endTick > MAX_REPLAY_TICKS) {
    throw new SimulationContractError("replay endTick is outside 0..7200");
  }

  validateReplayTimeline(fixture);

  return fixture;
}

function validateReplayTimeline(fixture: ReplayFixtureV1): void {
  assertIntegerInRange(fixture.humanActorId, "humanActorId", 1, fixture.config.participantCount);
  assertIntegerInRange(
    fixture.endTick,
    "endTick",
    0,
    Math.min(MAX_REPLAY_TICKS, fixture.config.roundLimitTicks),
  );

  let previousTick = -1;

  for (const command of fixture.commands) {
    if (command.actorId !== fixture.humanActorId) {
      throw new SimulationContractError("replay contains a command for a non-human actor");
    }

    if (command.tick <= previousTick) {
      throw new SimulationContractError("replay command ticks must be strictly increasing");
    }

    if (command.tick >= fixture.endTick) {
      throw new SimulationContractError("replay command tick must precede endTick");
    }

    previousTick = command.tick;
  }

  previousTick = -1;

  for (const checkpoint of fixture.checkpoints) {
    if (checkpoint.tick <= previousTick || checkpoint.tick > fixture.endTick) {
      throw new SimulationContractError("replay checkpoint ticks must increase within the run");
    }

    if (!/^fnv1a32:[0-9a-f]{8}$/u.test(checkpoint.stateHash)) {
      throw new SimulationContractError("replay checkpoint hash has an invalid shape");
    }

    previousTick = checkpoint.tick;
  }

  if (!/^fnv1a32:[0-9a-f]{8}$/u.test(fixture.finalHash)) {
    throw new SimulationContractError("replay final hash has an invalid shape");
  }
}

export function runReplayFixture(fixture: ReplayFixtureV1): ReplayRunResult {
  const world = new SimulationWorld(fixture.config, fixture.masterSeed, {
    humanActorId: fixture.humanActorId,
  });
  const commandsByTick = new Map(
    fixture.commands.map((command) => [command.tick, Object.freeze([command])] as const),
  );
  const expectedCheckpoints = new Map(
    fixture.checkpoints.map((checkpoint) => [checkpoint.tick, checkpoint.stateHash] as const),
  );
  const actualCheckpoints: ReplayCheckpointV1[] = [];

  while (world.tick < fixture.endTick) {
    world.step(commandsByTick.get(world.tick) ?? []);
    const expectedHash = expectedCheckpoints.get(world.tick);

    if (expectedHash !== undefined) {
      const actualHash = world.createRenderFrame().stateHash;

      if (actualHash !== expectedHash) {
        throw new SimulationContractError(
          `replay checkpoint mismatch at tick ${world.tick}: ${actualHash} !== ${expectedHash}`,
        );
      }

      actualCheckpoints.push(Object.freeze({ tick: world.tick, stateHash: actualHash }));
    }
  }

  const finalHash = world.createRenderFrame().stateHash;

  if (finalHash !== fixture.finalHash) {
    throw new SimulationContractError(
      `replay final hash mismatch: ${finalHash} !== ${fixture.finalHash}`,
    );
  }

  return Object.freeze({
    checkpoints: Object.freeze(actualCheckpoints),
    finalHash,
  });
}

export function createReplayFixture(input: {
  readonly buildId: string;
  readonly config: GameConfigV1;
  readonly masterSeed: string | number;
  readonly humanActorId: number;
  readonly endTick: number;
  readonly commands: readonly ActorCommandV1[];
  readonly checkpointTicks?: readonly number[];
}): ReplayFixtureV1 {
  const normalizedCommands = Object.freeze(input.commands.map(normalizeActorCommand));
  const requestedCheckpointTicks = input.checkpointTicks ?? [];
  const checkpointTicks = new Set(requestedCheckpointTicks);

  if (checkpointTicks.size !== requestedCheckpointTicks.length) {
    throw new SimulationContractError("replay checkpoint ticks must be unique");
  }

  const world = new SimulationWorld(input.config, input.masterSeed, {
    humanActorId: input.humanActorId,
  });
  const commandsByTick = new Map(
    normalizedCommands.map((command) => [command.tick, Object.freeze([command])] as const),
  );
  const checkpoints: ReplayCheckpointV1[] = [];

  const provisionalFixture: ReplayFixtureV1 = {
    formatVersion: 1,
    productVersion: PRODUCT_VERSION,
    simulationVersion: SIMULATION_VERSION,
    contentVersion: CONTENT_VERSION,
    buildId: input.buildId,
    config: input.config,
    masterSeed: input.masterSeed,
    humanActorId: input.humanActorId,
    endTick: input.endTick,
    commands: normalizedCommands,
    checkpoints: requestedCheckpointTicks.map((tick) => ({
      tick,
      stateHash: "fnv1a32:00000000",
    })),
    finalHash: "fnv1a32:00000000",
  };
  validateReplayTimeline(provisionalFixture);

  while (world.tick < input.endTick) {
    world.step(commandsByTick.get(world.tick) ?? []);

    if (checkpointTicks.has(world.tick)) {
      checkpoints.push(
        Object.freeze({
          tick: world.tick,
          stateHash: world.createRenderFrame().stateHash,
        }),
      );
    }
  }

  return Object.freeze({
    formatVersion: 1,
    productVersion: PRODUCT_VERSION,
    simulationVersion: SIMULATION_VERSION,
    contentVersion: CONTENT_VERSION,
    buildId: input.buildId,
    config: input.config,
    masterSeed: input.masterSeed,
    humanActorId: input.humanActorId,
    endTick: input.endTick,
    commands: normalizedCommands,
    checkpoints: Object.freeze(checkpoints),
    finalHash: world.createRenderFrame().stateHash,
  });
}
