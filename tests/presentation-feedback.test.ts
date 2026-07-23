import { describe, expect, it } from "vitest";
import { createAudioFeedback, type AudioContextPort } from "../src/presentation/audio-feedback";
import { SimulationEventLedger } from "../src/presentation/event-ledger";
import type { SimulationEventKind, SimulationEventV1 } from "../src/simulation/contracts";

function createEvent(
  roundId: number,
  tick: number,
  sequence: number,
  kind: SimulationEventKind = "shove-hit",
): SimulationEventV1 {
  return Object.freeze({
    eventVersion: 1,
    roundId,
    tick,
    sequence,
    kind,
    actorId: 1,
    targetActorId: 2,
  });
}

class FakeAudioParam {
  public readonly values: number[] = [];

  public exponentialRampToValueAtTime(value: number): this {
    this.values.push(value);
    return this;
  }

  public setValueAtTime(value: number): this {
    this.values.push(value);
    return this;
  }
}

class FakeGain {
  public readonly gain = new FakeAudioParam();

  public connect(): void {}
}

class FakeOscillator {
  public readonly frequency = new FakeAudioParam();
  public type: OscillatorType = "sine";
  public startCount = 0;
  public stopCount = 0;

  public connect(): void {}

  public addEventListener(): void {}

  public start(): void {
    this.startCount += 1;
  }

  public stop(): void {
    this.stopCount += 1;
  }
}

class FakeAudioContext implements AudioContextPort {
  public readonly currentTime = 10;
  public readonly destination = Object.freeze({});
  public state = "suspended";
  public readonly oscillators: FakeOscillator[] = [];

  public async close(): Promise<void> {
    this.state = "closed";
  }

  public createGain(): FakeGain {
    return new FakeGain();
  }

  public createOscillator(): FakeOscillator {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  public async resume(): Promise<void> {
    this.state = "running";
  }
}

describe("presentation event ledger", () => {
  it("accepts each ordered event once and resets naturally on a higher round", () => {
    const ledger = new SimulationEventLedger();
    const first = createEvent(1, 2, 3);
    const second = createEvent(1, 2, 4);

    expect(ledger.consume([first, second])).toEqual([first, second]);
    expect(ledger.consume([first, second])).toEqual([]);
    expect(ledger.consume([createEvent(1, 1, 99)])).toEqual([]);
    expect(ledger.consume([createEvent(2, 0, 0)])).toHaveLength(1);
  });
});

describe("optional Web Audio feedback", () => {
  it("falls back to unavailable without throwing when no context exists", async () => {
    const states: string[] = [];
    const audio = createAudioFeedback(
      () => undefined,
      (state) => states.push(state),
    );

    await expect(audio.unlock()).resolves.toBe("unavailable");
    expect(() => audio.consumeEvents([createEvent(1, 0, 0)])).not.toThrow();
    expect(states).toEqual(["locked", "unavailable"]);
  });

  it("unlocks after a gesture boundary, deduplicates events, and honors mute", async () => {
    const context = new FakeAudioContext();
    const audio = createAudioFeedback(() => context);
    const first = createEvent(1, 0, 0);

    audio.consumeEvents([first]);
    expect(context.oscillators).toHaveLength(0);
    await expect(audio.unlock()).resolves.toBe("ready");
    audio.consumeEvents([createEvent(1, 1, 1)]);
    audio.consumeEvents([createEvent(1, 1, 1)]);
    expect(context.oscillators).toHaveLength(1);

    audio.setMuted(true);
    audio.consumeEvents([createEvent(1, 2, 2)]);
    expect(context.oscillators).toHaveLength(1);
    audio.setMuted(false);
    audio.consumeEvents([createEvent(1, 3, 3)]);
    expect(context.oscillators).toHaveLength(2);
  });

  it("plays a dedicated high-priority Wind Blast impact cue", async () => {
    const context = new FakeAudioContext();
    const audio = createAudioFeedback(() => context);
    await audio.unlock();

    audio.consumeEvents([createEvent(1, 0, 0, "wind-blast-hit")]);

    expect(context.oscillators).toHaveLength(1);
    expect(context.oscillators[0]?.type).toBe("sawtooth");
  });

  it("uses distinct procedural cues for Bomb placement and detonation", async () => {
    const context = new FakeAudioContext();
    const audio = createAudioFeedback(() => context);
    await audio.unlock();

    audio.consumeEvents([
      {
        ...createEvent(1, 0, 0, "item-used"),
        itemDefinitionId: "bomb",
        position: { x: 4, y: 5 },
      },
      {
        ...createEvent(1, 300, 1, "bomb-detonated"),
        itemDefinitionId: "bomb",
        position: { x: 4, y: 5 },
      },
    ]);

    expect(context.oscillators).toHaveLength(2);
    expect(context.oscillators.map(({ type }) => type)).toEqual(["square", "sawtooth"]);
    expect(context.oscillators[0]?.frequency.values[0]).toBe(640);
    expect(context.oscillators[1]?.frequency.values[0]).toBe(92);
  });

  it("caps concurrent voices and lets a higher-priority result replace a low voice", async () => {
    const context = new FakeAudioContext();
    const audio = createAudioFeedback(() => context);
    await audio.unlock();
    audio.consumeEvents(
      Array.from({ length: 7 }, (_, sequence) =>
        createEvent(1, sequence, sequence, "shove-missed"),
      ),
    );
    expect(context.oscillators).toHaveLength(6);

    audio.consumeEvents([createEvent(1, 8, 8, "round-completed")]);
    expect(context.oscillators).toHaveLength(7);
    expect(context.oscillators.reduce((sum, oscillator) => sum + oscillator.stopCount, 0)).toBe(8);
  });
});
