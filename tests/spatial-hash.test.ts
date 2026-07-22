import { describe, expect, it } from "vitest";
import { SimulationContractError, vectorLength, subtractVectors } from "../src/simulation/math";
import {
  ParticipantSpatialHash,
  type ActorPair,
  type SpatialParticipant,
} from "../src/simulation/spatial-hash";

function pairKey(pair: ActorPair): string {
  return `${pair.leftActorId}:${pair.rightActorId}`;
}

function bruteForcePairs(
  participants: readonly SpatialParticipant[],
  maximumDistance: number,
): readonly string[] {
  const pairs: string[] = [];
  const ordered = participants.toSorted((left, right) => left.actorId - right.actorId);

  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    const left = ordered[leftIndex];

    if (left === undefined) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const right = ordered[rightIndex];

      if (
        right !== undefined &&
        vectorLength(subtractVectors(right.position, left.position)) <= maximumDistance
      ) {
        pairs.push(`${left.actorId}:${right.actorId}`);
      }
    }
  }

  return pairs;
}

describe("participant spatial hash", () => {
  it("preserves every full-scan contact across boundaries and negative cells", () => {
    const participants: readonly SpatialParticipant[] = Object.freeze([
      { actorId: 1, position: { x: -1.7, y: -1.7 } },
      { actorId: 2, position: { x: -1.69, y: -1.69 } },
      { actorId: 3, position: { x: 1.69, y: 0 } },
      { actorId: 4, position: { x: 1.7, y: 0 } },
      { actorId: 5, position: { x: 6, y: 6 } },
      { actorId: 6, position: { x: 6, y: 6 } },
    ]);
    const maximumDistance = 0.86;
    const spatialHash = new ParticipantSpatialHash(participants, 1.7);
    const participantsById = new Map(
      participants.map((participant) => [participant.actorId, participant] as const),
    );
    const exactCandidatePairs = spatialHash
      .getCandidatePairs()
      .filter((pair) => {
        const left = participantsById.get(pair.leftActorId);
        const right = participantsById.get(pair.rightActorId);
        return (
          left !== undefined &&
          right !== undefined &&
          vectorLength(subtractVectors(right.position, left.position)) <= maximumDistance
        );
      })
      .map(pairKey);

    expect(exactCandidatePairs).toEqual(bruteForcePairs(participants, maximumDistance));
  });

  it("returns all 496 stable pairs when 32 actors share one position", () => {
    const participants = Array.from({ length: 32 }, (_, index) =>
      Object.freeze({ actorId: index + 1, position: Object.freeze({ x: 2, y: 2 }) }),
    );
    const pairs = new ParticipantSpatialHash(participants, 1.7).getCandidatePairs();

    expect(pairs).toHaveLength(496);
    expect(pairs[0]).toEqual({ leftActorId: 1, rightActorId: 2 });
    expect(pairs.at(-1)).toEqual({ leftActorId: 31, rightActorId: 32 });
  });

  it("rejects invalid cells, radii, duplicate actors, and non-finite positions", () => {
    expect(() => new ParticipantSpatialHash([], 0)).toThrow(SimulationContractError);
    expect(() => new ParticipantSpatialHash([], 1).queryNearby({ x: 0, y: 0 }, -1)).toThrow(
      SimulationContractError,
    );
    expect(
      () =>
        new ParticipantSpatialHash(
          [
            { actorId: 1, position: { x: 0, y: 0 } },
            { actorId: 1, position: { x: 1, y: 1 } },
          ],
          1,
        ),
    ).toThrow(SimulationContractError);
    expect(
      () => new ParticipantSpatialHash([{ actorId: 1, position: { x: Number.NaN, y: 0 } }], 1),
    ).toThrow(SimulationContractError);
  });
});
