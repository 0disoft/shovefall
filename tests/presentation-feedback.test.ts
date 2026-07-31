import { describe, expect, it } from "vitest";
import {
  createAudioFeedback,
  MASTER_GAIN_SCALE,
  type AudioContextPort,
  volumeToGain,
} from "../src/presentation/audio-feedback";
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
  public readonly gains: FakeGain[] = [];

  public async close(): Promise<void> {
    this.state = "closed";
  }

  public createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
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
  it("maps the visible midpoint to the former 80-volume output", () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(50)).toBeCloseTo(10 ** (-8 / 20), 10);
    expect(volumeToGain(100)).toBe(1);
    expect(volumeToGain(25)).toBeLessThan(volumeToGain(50));
    expect(volumeToGain(75)).toBeGreaterThan(volumeToGain(50));
  });

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
    expect(context.gains[0]?.gain.values[0]).toBeCloseTo(0.11 * MASTER_GAIN_SCALE, 10);

    audio.setVolume(50);
    audio.consumeEvents([createEvent(1, 2, 2)]);
    expect(context.gains[1]?.gain.values[0]).toBeCloseTo(
      0.11 * MASTER_GAIN_SCALE * volumeToGain(50),
      10,
    );

    audio.setMuted(true);
    audio.consumeEvents([createEvent(1, 3, 3)]);
    expect(context.oscillators).toHaveLength(2);
    audio.setMuted(false);
    audio.consumeEvents([createEvent(1, 4, 4)]);
    expect(context.oscillators).toHaveLength(3);
  });

  it("requests short music ducking for player combat impacts", async () => {
    const context = new FakeAudioContext();
    const duckingRequests: number[] = [];
    const audio = createAudioFeedback(
      () => context,
      () => undefined,
      (duration) => duckingRequests.push(duration),
    );
    await audio.unlock();

    audio.consumeEvents([
      { ...createEvent(1, 0, 0, "skill-hit"), skillDefinitionId: "arc-bolt" },
      createEvent(1, 1, 1, "bomb-detonated"),
    ]);

    expect(duckingRequests).toEqual([350, 350]);
  });

  it("plays a dedicated Soap trigger cue", async () => {
    const context = new FakeAudioContext();
    const audio = createAudioFeedback(() => context);
    await audio.unlock();

    audio.consumeEvents([createEvent(1, 0, 0, "soap-triggered")]);

    expect(context.oscillators).toHaveLength(1);
    expect(context.oscillators[0]?.type).toBe("triangle");
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

  it("plays a brief metallic catch when Grappling Hook finds an anchor", async () => {
    const context = new FakeAudioContext();
    const audio = createAudioFeedback(() => context);
    await audio.unlock();

    audio.consumeEvents([
      {
        ...createEvent(1, 0, 0, "grappling-hook-hit"),
        position: { x: 4.5, y: 5.5 },
        vector: { x: 3, y: 0 },
      },
    ]);

    expect(context.oscillators).toHaveLength(1);
    expect(context.oscillators[0]?.type).toBe("square");
    expect(context.oscillators[0]?.frequency.values).toEqual([1_080, 540]);
  });

  it("gives each reusable skill a layered and distinct cast cue", async () => {
    const skillDefinitionIds = [
      "blink-step",
      "arc-bolt",
      "chain-bind",
      "meteor-mark",
      "frost-field",
      "aegis",
    ] as const;

    const signatures = await Promise.all(
      skillDefinitionIds.map(async (skillDefinitionId, index) => {
        const context = new FakeAudioContext();
        const audio = createAudioFeedback(() => context);
        await audio.unlock();
        audio.consumeEvents([
          {
            ...createEvent(1, index, index, "skill-used"),
            skillDefinitionId,
          },
        ]);

        expect(context.oscillators).toHaveLength(2);
        return context.oscillators
          .map((oscillator) => `${oscillator.type}:${oscillator.frequency.values.join("-")}`)
          .join("|");
      }),
    );

    expect(new Set(signatures).size).toBe(6);
  });

  it("uses a heavier layered impact for Meteor Mark", async () => {
    const context = new FakeAudioContext();
    const audio = createAudioFeedback(() => context);
    await audio.unlock();

    audio.consumeEvents([
      {
        ...createEvent(1, 0, 0, "skill-hit"),
        skillDefinitionId: "meteor-mark",
      },
    ]);

    expect(context.oscillators).toHaveLength(2);
    expect(context.oscillators.map(({ type }) => type)).toEqual(["sawtooth", "triangle"]);
    expect(context.oscillators[0]?.frequency.values).toEqual([90, 28]);
  });

  it("plays a short layered click for ordinary interface buttons", async () => {
    const context = new FakeAudioContext();
    const audio = createAudioFeedback(() => context);
    await audio.unlock();

    audio.playUiClick();

    expect(context.oscillators).toHaveLength(2);
    expect(context.oscillators.map(({ type }) => type)).toEqual(["triangle", "sine"]);
    expect(context.oscillators[0]?.frequency.values).toEqual([560, 420]);
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
