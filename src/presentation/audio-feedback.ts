import type {
  SimulationEventKind,
  SimulationEventV1,
  SkillDefinitionId,
} from "../simulation/contracts";
import { SimulationEventLedger } from "./event-ledger";
import backgroundMusicUrl from "../assets/audio/hyp-catch-me-if-you-can.mp3?url";

export type BackgroundMusicState = "locked" | "playing" | "muted" | "unavailable" | "closed";

export interface AudioElementPort {
  loop: boolean;
  muted: boolean;
  preload: string;
  volume: number;
  pause(): void;
  play(): Promise<void>;
}

export type AudioElementFactory = (source: string) => AudioElementPort | undefined;

export interface BackgroundMusic {
  readonly muted: boolean;
  readonly state: BackgroundMusicState;
  readonly volume: number;
  destroy(): void;
  duck(durationMilliseconds: number): void;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  unlock(): Promise<BackgroundMusicState>;
}

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
export type AudioDuckingRequest = (durationMilliseconds: number) => void;

export interface AudioFeedback {
  readonly muted: boolean;
  readonly state: AudioFeedbackState;
  readonly volume: number;
  consumeEvents(events: readonly SimulationEventV1[]): void;
  destroy(): void;
  playUiClick(): void;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  unlock(): Promise<AudioFeedbackState>;
}

interface SoundDefinition {
  readonly attackSeconds?: number;
  readonly delaySeconds?: number;
  readonly frequency: number;
  readonly endFrequency: number;
  readonly durationSeconds: number;
  readonly gain: number;
  readonly priority: number;
  readonly oscillatorType: OscillatorType;
}

type SoundCue = readonly SoundDefinition[];

interface ActiveVoice {
  readonly oscillator: OscillatorPort;
  readonly priority: number;
}

const MAX_ACTIVE_VOICES = 6;
export const MASTER_GAIN_SCALE = 0.7;
export const MUSIC_REFERENCE_GAIN = 0.08;
export const MUSIC_DUCKING_GAIN = 10 ** (-5 / 20);
export const AUDIO_MIN_DECIBELS = -40;
export const AUDIO_VOLUME_CURVE_EXPONENT = Math.log2(5);
const COMBAT_DUCKING_MILLISECONDS = 350;

export function volumeToGain(volume: number): number {
  const normalized = Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : 100;
  if (normalized === 0) {
    return 0;
  }
  const decibels = AUDIO_MIN_DECIBELS * (1 - normalized / 100) ** AUDIO_VOLUME_CURVE_EXPONENT;
  return 10 ** (decibels / 20);
}
const SOUND_DEFINITIONS: Partial<Record<SimulationEventKind, SoundDefinition>> = Object.freeze({
  "shield-applied": Object.freeze({
    frequency: 480,
    endFrequency: 760,
    durationSeconds: 0.18,
    gain: 0.055,
    priority: 3,
    oscillatorType: "sine",
  }),
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
  "soap-placed": Object.freeze({
    frequency: 520,
    endFrequency: 390,
    durationSeconds: 0.08,
    gain: 0.045,
    priority: 1,
    oscillatorType: "sine",
  }),
  "soap-triggered": Object.freeze({
    frequency: 310,
    endFrequency: 120,
    durationSeconds: 0.18,
    gain: 0.08,
    priority: 3,
    oscillatorType: "triangle",
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
  "grappling-hook-hit": Object.freeze({
    frequency: 1_080,
    endFrequency: 540,
    durationSeconds: 0.075,
    gain: 0.055,
    priority: 3,
    oscillatorType: "square",
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

const STAT_POINT_EARNED_SOUND: SoundDefinition = Object.freeze({
  frequency: 560,
  endFrequency: 880,
  durationSeconds: 0.18,
  gain: 0.07,
  priority: 4,
  oscillatorType: "triangle",
});

const GENERIC_SKILL_USE_SOUND: SoundDefinition = Object.freeze({
  frequency: 390,
  endFrequency: 660,
  durationSeconds: 0.12,
  gain: 0.05,
  priority: 2,
  oscillatorType: "triangle",
});
const GENERIC_SKILL_HIT_SOUND: SoundDefinition = Object.freeze({
  frequency: 170,
  endFrequency: 76,
  durationSeconds: 0.16,
  gain: 0.085,
  priority: 4,
  oscillatorType: "square",
});

function defineCue(...layers: SoundDefinition[]): SoundCue {
  return Object.freeze(layers.map((layer) => Object.freeze(layer)));
}

const SKILL_USE_CUES: Readonly<Record<SkillDefinitionId, SoundCue>> = Object.freeze({
  "blink-step": defineCue(
    {
      attackSeconds: 0.008,
      frequency: 260,
      endFrequency: 1_040,
      durationSeconds: 0.16,
      gain: 0.04,
      priority: 3,
      oscillatorType: "triangle",
    },
    {
      attackSeconds: 0.006,
      delaySeconds: 0.035,
      frequency: 720,
      endFrequency: 1_440,
      durationSeconds: 0.11,
      gain: 0.025,
      priority: 3,
      oscillatorType: "sine",
    },
  ),
  "arc-bolt": defineCue(
    {
      attackSeconds: 0.004,
      frequency: 980,
      endFrequency: 170,
      durationSeconds: 0.11,
      gain: 0.045,
      priority: 3,
      oscillatorType: "square",
    },
    {
      delaySeconds: 0.015,
      frequency: 2_100,
      endFrequency: 420,
      durationSeconds: 0.08,
      gain: 0.025,
      priority: 3,
      oscillatorType: "sawtooth",
    },
  ),
  "chain-bind": defineCue(
    {
      attackSeconds: 0.006,
      frequency: 140,
      endFrequency: 90,
      durationSeconds: 0.18,
      gain: 0.04,
      priority: 3,
      oscillatorType: "square",
    },
    {
      delaySeconds: 0.045,
      frequency: 760,
      endFrequency: 320,
      durationSeconds: 0.13,
      gain: 0.035,
      priority: 3,
      oscillatorType: "triangle",
    },
  ),
  "meteor-mark": defineCue(
    {
      attackSeconds: 0.018,
      frequency: 880,
      endFrequency: 440,
      durationSeconds: 0.14,
      gain: 0.03,
      priority: 3,
      oscillatorType: "sine",
    },
    {
      attackSeconds: 0.025,
      delaySeconds: 0.04,
      frequency: 110,
      endFrequency: 45,
      durationSeconds: 0.28,
      gain: 0.045,
      priority: 3,
      oscillatorType: "sawtooth",
    },
  ),
  "frost-field": defineCue(
    {
      attackSeconds: 0.012,
      frequency: 1_320,
      endFrequency: 880,
      durationSeconds: 0.28,
      gain: 0.025,
      priority: 3,
      oscillatorType: "sine",
    },
    {
      attackSeconds: 0.008,
      delaySeconds: 0.05,
      frequency: 1_980,
      endFrequency: 1_120,
      durationSeconds: 0.18,
      gain: 0.02,
      priority: 3,
      oscillatorType: "triangle",
    },
  ),
  aegis: defineCue(
    {
      attackSeconds: 0.016,
      frequency: 330,
      endFrequency: 660,
      durationSeconds: 0.24,
      gain: 0.03,
      priority: 3,
      oscillatorType: "sine",
    },
    {
      attackSeconds: 0.012,
      delaySeconds: 0.035,
      frequency: 495,
      endFrequency: 990,
      durationSeconds: 0.22,
      gain: 0.025,
      priority: 3,
      oscillatorType: "triangle",
    },
  ),
});

const SKILL_HIT_CUES: Partial<Readonly<Record<SkillDefinitionId, SoundCue>>> = Object.freeze({
  "arc-bolt": defineCue(
    {
      frequency: 240,
      endFrequency: 58,
      durationSeconds: 0.16,
      gain: 0.07,
      priority: 4,
      oscillatorType: "square",
    },
    {
      delaySeconds: 0.015,
      frequency: 960,
      endFrequency: 180,
      durationSeconds: 0.09,
      gain: 0.035,
      priority: 4,
      oscillatorType: "triangle",
    },
  ),
  "chain-bind": defineCue(
    {
      frequency: 180,
      endFrequency: 70,
      durationSeconds: 0.2,
      gain: 0.065,
      priority: 4,
      oscillatorType: "square",
    },
    {
      delaySeconds: 0.035,
      frequency: 540,
      endFrequency: 180,
      durationSeconds: 0.13,
      gain: 0.035,
      priority: 4,
      oscillatorType: "square",
    },
  ),
  "meteor-mark": defineCue(
    {
      frequency: 90,
      endFrequency: 28,
      durationSeconds: 0.38,
      gain: 0.09,
      priority: 5,
      oscillatorType: "sawtooth",
    },
    {
      delaySeconds: 0.025,
      frequency: 280,
      endFrequency: 55,
      durationSeconds: 0.24,
      gain: 0.05,
      priority: 5,
      oscillatorType: "triangle",
    },
  ),
  "frost-field": defineCue(
    {
      frequency: 1_200,
      endFrequency: 240,
      durationSeconds: 0.24,
      gain: 0.04,
      priority: 4,
      oscillatorType: "triangle",
    },
    {
      delaySeconds: 0.03,
      frequency: 1_800,
      endFrequency: 420,
      durationSeconds: 0.18,
      gain: 0.03,
      priority: 4,
      oscillatorType: "sine",
    },
  ),
});
const UI_CLICK_CUE = defineCue(
  {
    attackSeconds: 0.003,
    frequency: 560,
    endFrequency: 420,
    durationSeconds: 0.055,
    gain: 0.032,
    priority: 6,
    oscillatorType: "triangle",
  },
  {
    attackSeconds: 0.002,
    delaySeconds: 0.008,
    frequency: 920,
    endFrequency: 720,
    durationSeconds: 0.04,
    gain: 0.018,
    priority: 6,
    oscillatorType: "sine",
  },
);
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
  requestBackgroundDucking: AudioDuckingRequest = () => undefined,
): AudioFeedback {
  const ledger = new SimulationEventLedger();
  const voices = new Set<ActiveVoice>();
  let context: AudioContextPort | undefined;
  let state: AudioFeedbackState = "locked";
  let muted = false;
  let volume = 100;

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

  const play = (definition: SoundDefinition, priorityBoost = 0): void => {
    const userGain = volumeToGain(volume);
    if (context === undefined || state !== "ready" || muted || userGain === 0) {
      return;
    }

    if (voices.size >= MAX_ACTIVE_VOICES) {
      const lowestPriority = [...voices].toSorted(
        (left, right) => left.priority - right.priority,
      )[0];

      const priority = definition.priority + priorityBoost;

      if (lowestPriority === undefined || lowestPriority.priority >= priority) {
        return;
      }

      stopVoice(lowestPriority);
    }

    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startedAt = context.currentTime + (definition.delaySeconds ?? 0);
      const endsAt = startedAt + definition.durationSeconds;
      const priority = definition.priority + priorityBoost;
      const voice: ActiveVoice = Object.freeze({ oscillator, priority });
      oscillator.type = definition.oscillatorType;
      oscillator.frequency.setValueAtTime(definition.frequency, startedAt);
      oscillator.frequency.exponentialRampToValueAtTime(definition.endFrequency, endsAt);
      const peakGain = definition.gain * MASTER_GAIN_SCALE * userGain;
      const attackSeconds = Math.min(
        definition.attackSeconds ?? 0,
        definition.durationSeconds * 0.5,
      );

      if (attackSeconds > 0) {
        gain.gain.setValueAtTime(0.000_1, startedAt);
        gain.gain.exponentialRampToValueAtTime(peakGain, startedAt + attackSeconds);
      } else {
        gain.gain.setValueAtTime(peakGain, startedAt);
      }
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

  const playCue = (cue: SoundCue, priorityBoost = 0): void => {
    for (const layer of cue) {
      play(layer, priorityBoost);
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
    get volume(): number {
      return volume;
    },
    consumeEvents(events: readonly SimulationEventV1[]): void {
      for (const event of ledger.consume(events)) {
        const shouldDuck =
          (event.kind === "skill-hit" && (event.actorId === 1 || event.targetActorId === 1)) ||
          event.kind === "bomb-detonated";
        if (state === "ready" && !muted && volumeToGain(volume) > 0 && shouldDuck) {
          requestBackgroundDucking(COMBAT_DUCKING_MILLISECONDS);
        }

        if (event.kind === "skill-used") {
          playCue(
            event.skillDefinitionId === undefined
              ? [GENERIC_SKILL_USE_SOUND]
              : SKILL_USE_CUES[event.skillDefinitionId],
            event.actorId === 1 ? 2 : 0,
          );
          continue;
        }

        if (event.kind === "skill-hit") {
          playCue(
            event.skillDefinitionId === undefined
              ? [GENERIC_SKILL_HIT_SOUND]
              : (SKILL_HIT_CUES[event.skillDefinitionId] ?? [GENERIC_SKILL_HIT_SOUND]),
            event.actorId === 1 || event.targetActorId === 1 ? 2 : 0,
          );
          continue;
        }

        if (event.kind === "stat-point-earned" && event.actorId === 1) {
          play(STAT_POINT_EARNED_SOUND);
          continue;
        }

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
    playUiClick(): void {
      playCue(UI_CLICK_CUE);
    },
    setMuted(nextMuted: boolean): void {
      muted = nextMuted;

      if (state === "ready" || state === "muted") {
        setState(muted ? "muted" : "ready");
      }
    },
    setVolume(nextVolume: number): void {
      volume = Number.isFinite(nextVolume)
        ? Math.round(Math.min(100, Math.max(0, nextVolume)))
        : 100;
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

function createBrowserAudioElement(source: string): AudioElementPort | undefined {
  if (typeof Audio === "undefined") {
    return undefined;
  }

  return new Audio(source);
}

function normalizeBackgroundMusicVolume(value: number): number {
  return Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value))) : 50;
}

function isAutoplayRejection(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotAllowedError";
}

export function createBackgroundMusic(
  factory: AudioElementFactory = createBrowserAudioElement,
  onStateChange: (state: BackgroundMusicState) => void = () => undefined,
): BackgroundMusic {
  let element: AudioElementPort | undefined;
  let state: BackgroundMusicState = "locked";
  let muted = false;
  let volume = 50;
  let ducked = false;
  let duckingTimer: ReturnType<typeof setTimeout> | undefined;

  const applyVolume = (): void => {
    if (element !== undefined) {
      element.volume =
        volumeToGain(volume) * MUSIC_REFERENCE_GAIN * (ducked ? MUSIC_DUCKING_GAIN : 1);
    }
  };

  const setState = (nextState: BackgroundMusicState): void => {
    if (state === nextState) {
      return;
    }
    state = nextState;
    onStateChange(state);
  };

  const ensureElement = (): AudioElementPort | undefined => {
    if (element !== undefined) {
      return element;
    }
    element = factory(backgroundMusicUrl);
    if (element === undefined) {
      setState("unavailable");
      return undefined;
    }
    element.loop = true;
    element.preload = "auto";
    element.muted = muted;
    applyVolume();
    return element;
  };

  onStateChange(state);

  return Object.freeze({
    get muted(): boolean {
      return muted;
    },
    get state(): BackgroundMusicState {
      return state;
    },
    get volume(): number {
      return volume;
    },
    destroy(): void {
      if (duckingTimer !== undefined) {
        clearTimeout(duckingTimer);
        duckingTimer = undefined;
      }
      element?.pause();
      element = undefined;
      setState("closed");
    },
    duck(durationMilliseconds: number): void {
      if (!Number.isFinite(durationMilliseconds) || durationMilliseconds <= 0) {
        return;
      }
      ducked = true;
      applyVolume();
      if (duckingTimer !== undefined) {
        clearTimeout(duckingTimer);
      }
      duckingTimer = setTimeout(() => {
        duckingTimer = undefined;
        ducked = false;
        applyVolume();
      }, durationMilliseconds);
    },
    setMuted(nextMuted: boolean): void {
      muted = nextMuted;
      if (element !== undefined) {
        element.muted = muted;
      }
      if (state === "playing" || state === "muted") {
        setState(muted ? "muted" : "playing");
      }
    },
    setVolume(nextVolume: number): void {
      volume = normalizeBackgroundMusicVolume(nextVolume);
      applyVolume();
    },
    async unlock(): Promise<BackgroundMusicState> {
      if (
        state === "closed" ||
        state === "unavailable" ||
        state === "playing" ||
        state === "muted"
      ) {
        return state;
      }

      const music = ensureElement();
      if (music === undefined) {
        return state;
      }

      try {
        await music.play();
        setState(muted ? "muted" : "playing");
      } catch (error) {
        if (!isAutoplayRejection(error)) {
          element = undefined;
          setState("unavailable");
        }
      }

      return state;
    },
  });
}
