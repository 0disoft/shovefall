import {
  createNeutralCommand,
  createTileId,
  normalizeActorCommand,
  type ActorCommandV1,
  type ActorId,
  type GameConfigV1,
  type ParticipantState,
  type RenderFrameV1,
  type RoundId,
  type SimulationEventV1,
  type TileState,
} from "./contracts";
import { hashWorldState } from "./hash";
import { SimulationContractError, type Vector2 } from "./math";
import { RandomStreamSet, type SeedInput } from "./random";
import { SYSTEM_ORDER } from "./versions";

export interface SimulationStepResult {
  readonly frame: RenderFrameV1;
  readonly events: readonly SimulationEventV1[];
}

export interface SimulationWorldOptions {
  readonly roundId?: RoundId;
  readonly humanActorId?: ActorId;
}

const BASE_RADIUS = 0.38;
const PLACEHOLDER_SPEED_PER_TICK = 0.05;

function createTiles(config: GameConfigV1): readonly TileState[] {
  const tiles: TileState[] = [];

  for (let row = 0; row < config.arenaRows; row += 1) {
    for (let column = 0; column < config.arenaColumns; column += 1) {
      tiles.push(
        Object.freeze({
          tileId: createTileId(column, row),
          column,
          row,
          state: "Stable",
        }),
      );
    }
  }

  return Object.freeze(tiles);
}

function createParticipants(
  config: GameConfigV1,
  streams: RandomStreamSet,
  humanActorId: ActorId,
): readonly ParticipantState[] {
  const centerX = config.arenaColumns / 2;
  const centerY = config.arenaRows / 2;
  const spawnRadius = Math.min(config.arenaColumns, config.arenaRows) * 0.28;
  const phase = streams.get("arena").nextFloat() * Math.PI * 2;
  const participants: ParticipantState[] = [];

  for (let index = 0; index < config.participantCount; index += 1) {
    const actorId = index + 1;
    const angle = phase + (index / config.participantCount) * Math.PI * 2;
    const facing: Vector2 = Object.freeze({
      x: -Math.cos(angle),
      y: -Math.sin(angle),
    });

    participants.push(
      Object.freeze({
        actorId,
        control: actorId === humanActorId ? "human" : "scripted",
        body: Object.freeze({
          position: Object.freeze({
            x: centerX + Math.cos(angle) * spawnRadius,
            y: centerY + Math.sin(angle) * spawnRadius,
          }),
          velocity: Object.freeze({ x: 0, y: 0 }),
          facing,
          radius: BASE_RADIUS,
          massFactor: 1,
          unsupportedTicks: 0,
        }),
        action: Object.freeze({
          kind: "Ready",
          startedTick: 0,
          endsTick: null,
          hitActorIds: Object.freeze([]),
        }),
        active: true,
      }),
    );
  }

  return Object.freeze(participants);
}

export class SimulationWorld {
  readonly #config: GameConfigV1;
  readonly #roundId: RoundId;
  readonly #tiles: readonly TileState[];
  #participants: readonly ParticipantState[];
  #tick = 0;
  #eventSequence = 0;

  public readonly systemOrder = SYSTEM_ORDER;

  public constructor(
    config: GameConfigV1,
    masterSeed: SeedInput,
    options: SimulationWorldOptions = {},
  ) {
    const roundId = options.roundId ?? 1;
    const humanActorId = options.humanActorId ?? 1;

    if (!Number.isSafeInteger(roundId) || roundId < 1) {
      throw new SimulationContractError("roundId must be a positive safe integer");
    }

    if (
      !Number.isSafeInteger(humanActorId) ||
      humanActorId < 1 ||
      humanActorId > config.participantCount
    ) {
      throw new SimulationContractError("humanActorId must identify a configured participant");
    }

    const streams = new RandomStreamSet(masterSeed);
    this.#config = config;
    this.#roundId = roundId;
    this.#tiles = createTiles(config);
    this.#participants = createParticipants(config, streams, humanActorId);
  }

  public get tick(): number {
    return this.#tick;
  }

  public get config(): GameConfigV1 {
    return this.#config;
  }

  public step(commands: readonly ActorCommandV1[] = []): SimulationStepResult {
    if (this.#tick >= this.#config.roundLimitTicks) {
      throw new SimulationContractError("round tick limit has been reached");
    }

    const commandsByActor = new Map<ActorId, ActorCommandV1>();
    const events: SimulationEventV1[] = [];

    for (const rawCommand of commands) {
      const command = normalizeActorCommand(rawCommand);

      if (command.tick !== this.#tick) {
        throw new SimulationContractError(
          `command tick ${command.tick} does not match world tick ${this.#tick}`,
        );
      }

      if (commandsByActor.has(command.actorId)) {
        throw new SimulationContractError(
          `duplicate command for actor ${command.actorId} at tick ${this.#tick}`,
        );
      }

      commandsByActor.set(command.actorId, command);
    }

    const knownActorIds = new Set(this.#participants.map((participant) => participant.actorId));

    for (const actorId of commandsByActor.keys()) {
      if (!knownActorIds.has(actorId)) {
        events.push(this.#createEvent("command-ignored", actorId, "unknown-actor"));
      }
    }

    this.#participants = Object.freeze(
      this.#participants.map((participant) => {
        const command =
          commandsByActor.get(participant.actorId) ??
          createNeutralCommand(this.#tick, participant.actorId);

        if (!participant.active) {
          if (commandsByActor.has(participant.actorId)) {
            events.push(
              this.#createEvent("command-ignored", participant.actorId, "inactive-actor"),
            );
          }

          return participant;
        }

        const previousPosition = participant.body.position;
        const velocity = Object.freeze({
          x: command.move.x * PLACEHOLDER_SPEED_PER_TICK,
          y: command.move.y * PLACEHOLDER_SPEED_PER_TICK,
        });
        const facing =
          command.move.x === 0 && command.move.y === 0 ? participant.body.facing : command.move;

        return Object.freeze({
          ...participant,
          body: Object.freeze({
            ...participant.body,
            position: Object.freeze({
              x: previousPosition.x + velocity.x,
              y: previousPosition.y + velocity.y,
            }),
            velocity,
            facing,
          }),
        });
      }),
    );

    this.#tick += 1;
    return Object.freeze({
      frame: this.createRenderFrame(),
      events: Object.freeze(events),
    });
  }

  public createRenderFrame(): RenderFrameV1 {
    const stateHash = hashWorldState({
      roundId: this.#roundId,
      tick: this.#tick,
      participants: this.#participants,
      tiles: this.#tiles,
    });

    return Object.freeze({
      frameVersion: 1,
      roundId: this.#roundId,
      tick: this.#tick,
      stateHash,
      participants: Object.freeze(
        this.#participants
          .toSorted((left, right) => left.actorId - right.actorId)
          .map((participant) =>
            Object.freeze({
              actorId: participant.actorId,
              position: participant.body.position,
              previousPosition: Object.freeze({
                x: participant.body.position.x - participant.body.velocity.x,
                y: participant.body.position.y - participant.body.velocity.y,
              }),
              facing: participant.body.facing,
              radius: participant.body.radius,
              massFactor: participant.body.massFactor,
              action: participant.action.kind,
              active: participant.active,
            }),
          ),
      ),
      tiles: this.#tiles,
    });
  }

  #createEvent(
    kind: SimulationEventV1["kind"],
    actorId?: ActorId,
    reason?: SimulationEventV1["reason"],
  ): SimulationEventV1 {
    const event: SimulationEventV1 = Object.freeze({
      eventVersion: 1,
      roundId: this.#roundId,
      tick: this.#tick,
      sequence: this.#eventSequence,
      kind,
      ...(actorId === undefined ? {} : { actorId }),
      ...(reason === undefined ? {} : { reason }),
    });
    this.#eventSequence += 1;
    return event;
  }
}

export function runHeadless(
  world: SimulationWorld,
  commandsByTick: ReadonlyMap<number, readonly ActorCommandV1[]>,
  endTick: number,
): RenderFrameV1 {
  if (
    !Number.isSafeInteger(endTick) ||
    endTick < world.tick ||
    endTick > world.config.roundLimitTicks
  ) {
    throw new SimulationContractError("endTick is outside the current round range");
  }

  while (world.tick < endTick) {
    world.step(commandsByTick.get(world.tick) ?? []);
  }

  return world.createRenderFrame();
}
