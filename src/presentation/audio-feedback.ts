import type { SimulationEventKind, SimulationEventV1 } from "../simulation/contracts";
import { SimulationEventLedger } from "./event-ledger";

export type AudioFeedbackState = "locked" | "ready" | "muted" | "unavailable" | "closed";

interface AudioParamPort {
  exponentialRampToValueAtTime(value: number, endTime: number): AudioParamPort;
  setValueAtTime(value: number, startTime: number): AudioParamPort;
}

interface AudioNodePort {
  connect(destination: unknown): unknown;
}

interface OscillatorPort extends AudioNodePort {
  addEventListener(type: "ended", listener: () => void, options?: AddEventListenerOptions): void;
  frequency: AudioParamPort;
  type: OscillatorType;
  start(when?: number): void;
  stop(when?: number): void;
}

interface GainPort extends AudioNodePort {
  gain: AudioParamPort;
}

export interface AudioContextPort {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state: string;
  close(): Promise<void>;
  createGain(): GainPort;
  createOscillator(): OscillatorPort;
  resume(): Promise<void>;
}

export type AudioContextFactory = () => AudioContextPort | undefined;

export interface AudioFeedback {
  readonly muted: boolean;
  readonly state: AudioFeedbackState;
  consumeEvents(events: readonly SimulationEventV1[]): void;
  destroy(): void;
  setMuted(muted: boolean): void;
  unlock(): Promise<AudioFeedbackState>;
}

interface SoundDefinition {
  readonly frequency: number;
  readonly endFrequency: number;
  readonly durationSeconds: number;
  readonly gain: number;
  readonly priority: number;
  readonly oscillatorType: OscillatorType;
}

interface ActiveVoice {
  readonly oscillator: OscillatorPort;
  readonly priority: number;
}

const MAX_ACTIVE_VOICES = 6;
const SOUND_DEFINITIONS: Partial<Record<SimulationEventKind, SoundDefinition>> = Object.freeze({
  "shove-hit": Object.freeze({
    frequency: 150,
    endFrequency: 82,
    durationSeconds: 0.11,
    gain: 0.11,
    priority: 3,
    oscillatorType: "square",
  }),
  "shove-missed": Object.freeze({
    frequency: 210,
    endFrequency: 125,
    durationSeconds: 0.14,
    gain: 0.055,
    priority: 1,
    oscillatorType: "sawtooth",
  }),
  "wind-blast-hit": Object.freeze({
    frequency: 110,
    endFrequency: 54,
    durationSeconds: 0.2,
    gain: 0.105,
    priority: 4,
    oscillatorType: "sawtooth",
  }),
  "brick-wall-placed": Object.freeze({
    frequency: 118,
    endFrequency: 72,
    durationSeconds: 0.09,
    gain: 0.075,
    priority: 2,
    oscillatorType: "square",
  }),
  "bomb-detonated": Object.freeze({
    frequency: 92,
    endFrequency: 34,
    durationSeconds: 0.34,
    gain: 0.12,
    priority: 5,
    oscillatorType: "sawtooth",
  }),
  "dodge-succeeded": Object.freeze({
    frequency: 420,
    endFrequency: 690,
    durationSeconds: 0.09,
    gain: 0.05,
    priority: 2,
    oscillatorType: "sine",
  }),
  "falling-started": Object.freeze({
    frequency: 190,
    endFrequency: 48,
    durationSeconds: 0.32,
    gain: 0.09,
    priority: 4,
    oscillatorType: "triangle",
  }),
  "item-picked-up": Object.freeze({
    frequency: 520,
    endFrequency: 780,
    durationSeconds: 0.1,
    gain: 0.045,
    priority: 1,
    oscillatorType: "sine",
  }),
  "round-completed": Object.freeze({
    frequency: 260,
    endFrequency: 520,
    durationSeconds: 0.28,
    gain: 0.08,
    priority: 5,
    oscillatorType: "triangle",
  }),
});
const BOAT_ACTIVATION_SOUND: SoundDefinition = Object.freeze({
  frequency: 310,
  endFrequency: 185,
  durationSeconds: 0.16,
  gain: 0.055,
  priority: 2,
  oscillatorType: "triangle",
});
const BOMB_PLACEMENT_SOUND: SoundDefinition = Object.freeze({
  frequency: 640,
  endFrequency: 360,
  durationSeconds: 0.08,
  gain: 0.05,
  priority: 2,
  oscillatorType: "square",
});

function createBrowserAudioContext(): AudioContextPort | undefined {
  const audioWindow = window as Window & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextConstructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;

  return AudioContextConstructor === undefined ? undefined : new AudioContextConstructor();
}

export function createAudioFeedback(
  factory: AudioContextFactory = createBrowserAudioContext,
  onStateChange: (state: AudioFeedbackState) => void = () => undefined,
): AudioFeedback {
  const ledger = new SimulationEventLedger();
  const voices = new Set<ActiveVoice>();
  let context: AudioContextPort | undefined;
  let state: AudioFeedbackState = "locked";
  let muted = false;

  const setState = (nextState: AudioFeedbackState): void => {
    if (state === nextState) {
      return;
    }

    state = nextState;
    onStateChange(state);
  };

  const stopVoice = (voice: ActiveVoice): void => {
    voices.delete(voice);

    try {
      voice.oscillator.stop();
    } catch {
      // A browser may already have ended the oscillator. The sound is optional.
    }
  };

  const play = (definition: SoundDefinition): void => {
    if (context === undefined || state !== "ready" || muted) {
      return;
    }

    if (voices.size >= MAX_ACTIVE_VOICES) {
      const lowestPriority = [...voices].toSorted(
        (left, right) => left.priority - right.priority,
      )[0];

      if (lowestPriority === undefined || lowestPriority.priority >= definition.priority) {
        return;
      }

      stopVoice(lowestPriority);
    }

    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startedAt = context.currentTime;
      const endsAt = startedAt + definition.durationSeconds;
      const voice: ActiveVoice = Object.freeze({ oscillator, priority: definition.priority });
      oscillator.type = definition.oscillatorType;
      oscillator.frequency.setValueAtTime(definition.frequency, startedAt);
      oscillator.frequency.exponentialRampToValueAtTime(definition.endFrequency, endsAt);
      gain.gain.setValueAtTime(definition.gain, startedAt);
      gain.gain.exponentialRampToValueAtTime(0.000_1, endsAt);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.addEventListener("ended", () => voices.delete(voice), { once: true });
      voices.add(voice);
      oscillator.start(startedAt);
      oscillator.stop(endsAt);
    } catch {
      setState("unavailable");
    }
  };

  onStateChange(state);

  return Object.freeze({
    get muted(): boolean {
      return muted;
    },
    get state(): AudioFeedbackState {
      return state;
    },
    consumeEvents(events: readonly SimulationEventV1[]): void {
      for (const event of ledger.consume(events)) {
        const definition =
          event.kind === "item-used" && event.itemDefinitionId === "boat"
            ? BOAT_ACTIVATION_SOUND
            : event.kind === "item-used" && event.itemDefinitionId === "bomb"
              ? BOMB_PLACEMENT_SOUND
              : SOUND_DEFINITIONS[event.kind];

        if (definition !== undefined) {
          play(definition);
        }
      }
    },
    destroy(): void {
      for (const voice of voices) {
        stopVoice(voice);
      }

      const closingContext = context;
      context = undefined;
      setState("closed");
      void closingContext?.close().catch(() => undefined);
    },
    setMuted(nextMuted: boolean): void {
      muted = nextMuted;

      if (state === "ready" || state === "muted") {
        setState(muted ? "muted" : "ready");
      }
    },
    async unlock(): Promise<AudioFeedbackState> {
      if (state === "closed" || state === "unavailable") {
        return state;
      }

      try {
        context ??= factory();

        if (context === undefined) {
          setState("unavailable");
          return state;
        }

        if (context.state !== "running") {
          await context.resume();
        }

        setState(muted ? "muted" : "ready");
      } catch {
        context = undefined;
        setState("unavailable");
      }

      return state;
    },
  });
}
