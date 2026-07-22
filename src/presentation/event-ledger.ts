import type { SimulationEventV1 } from "../simulation/contracts";

interface EventCursor {
  readonly roundId: number;
  readonly tick: number;
  readonly sequence: number;
}

function isAfter(event: SimulationEventV1, cursor: EventCursor): boolean {
  return (
    event.roundId > cursor.roundId ||
    (event.roundId === cursor.roundId &&
      (event.tick > cursor.tick ||
        (event.tick === cursor.tick && event.sequence > cursor.sequence)))
  );
}

export class SimulationEventLedger {
  #cursor: EventCursor | undefined;

  public consume(events: readonly SimulationEventV1[]): readonly SimulationEventV1[] {
    const accepted: SimulationEventV1[] = [];

    for (const event of events) {
      if (this.#cursor !== undefined && !isAfter(event, this.#cursor)) {
        continue;
      }

      accepted.push(event);
      this.#cursor = Object.freeze({
        roundId: event.roundId,
        tick: event.tick,
        sequence: event.sequence,
      });
    }

    return Object.freeze(accepted);
  }

  public reset(): void {
    this.#cursor = undefined;
  }
}
