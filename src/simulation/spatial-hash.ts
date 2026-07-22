import type { ActorId } from "./contracts";
import type { Vector2 } from "./math";
import { SimulationContractError } from "./math";

export interface SpatialParticipant {
  readonly actorId: ActorId;
  readonly position: Vector2;
}

export interface ActorPair {
  readonly leftActorId: ActorId;
  readonly rightActorId: ActorId;
}

interface CellCoordinate {
  readonly column: number;
  readonly row: number;
}

function getCellKey(column: number, row: number): string {
  return `${column}:${row}`;
}

export class ParticipantSpatialHash<T extends SpatialParticipant> {
  readonly #cellSize: number;
  readonly #participantsById = new Map<ActorId, T>();
  readonly #cells = new Map<string, readonly T[]>();

  public constructor(participants: readonly T[], cellSize: number) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new SimulationContractError("spatial hash cellSize must be finite and positive");
    }

    this.#cellSize = cellSize;
    const mutableCells = new Map<string, T[]>();

    for (const participant of participants.toSorted(
      (left, right) => left.actorId - right.actorId,
    )) {
      if (this.#participantsById.has(participant.actorId)) {
        throw new SimulationContractError(
          `spatial hash contains duplicate actor ${participant.actorId}`,
        );
      }

      if (!Number.isFinite(participant.position.x) || !Number.isFinite(participant.position.y)) {
        throw new SimulationContractError(
          `spatial hash actor ${participant.actorId} has a non-finite position`,
        );
      }

      this.#participantsById.set(participant.actorId, participant);
      const coordinate = this.#getCoordinate(participant.position);
      const key = getCellKey(coordinate.column, coordinate.row);
      const bucket = mutableCells.get(key) ?? [];
      bucket.push(participant);
      mutableCells.set(key, bucket);
    }

    for (const [key, bucket] of mutableCells) {
      this.#cells.set(
        key,
        Object.freeze(bucket.toSorted((left, right) => left.actorId - right.actorId)),
      );
    }
  }

  public getCandidatePairs(): readonly ActorPair[] {
    const pairs: ActorPair[] = [];

    for (const left of [...this.#participantsById.values()].toSorted(
      (first, second) => first.actorId - second.actorId,
    )) {
      for (const right of this.queryNearby(left.position, 1)) {
        if (right.actorId <= left.actorId) {
          continue;
        }

        pairs.push(Object.freeze({ leftActorId: left.actorId, rightActorId: right.actorId }));
      }
    }

    return Object.freeze(
      pairs.toSorted(
        (left, right) =>
          left.leftActorId - right.leftActorId || left.rightActorId - right.rightActorId,
      ),
    );
  }

  public queryNearby(position: Vector2, cellRadius: number): readonly T[] {
    if (!Number.isSafeInteger(cellRadius) || cellRadius < 0) {
      throw new SimulationContractError("spatial hash cellRadius must be a non-negative integer");
    }

    const center = this.#getCoordinate(position);
    const participants: T[] = [];

    for (let row = center.row - cellRadius; row <= center.row + cellRadius; row += 1) {
      for (
        let column = center.column - cellRadius;
        column <= center.column + cellRadius;
        column += 1
      ) {
        participants.push(...(this.#cells.get(getCellKey(column, row)) ?? []));
      }
    }

    return Object.freeze(participants.toSorted((left, right) => left.actorId - right.actorId));
  }

  #getCoordinate(position: Vector2): CellCoordinate {
    return Object.freeze({
      column: Math.floor(position.x / this.#cellSize),
      row: Math.floor(position.y / this.#cellSize),
    });
  }
}
