export const PRESET_NAMES = ["default", "relaxed", "chaos"] as const;

export type PresetName = (typeof PRESET_NAMES)[number];

export interface GameSettings {
  readonly playerCount: number;
  readonly preset: PresetName;
}

export interface ArenaSize {
  readonly columns: number;
  readonly rows: number;
}

export type CollapseSpeed = "slow" | "normal" | "fast";

export const PLAYER_COUNT_LIMITS = Object.freeze({
  minimum: 4,
  maximum: 32,
});

const PRESET_PLAYER_COUNTS: Readonly<Record<PresetName, number>> = Object.freeze({
  default: 12,
  relaxed: 8,
  chaos: 32,
});

const PRESET_COLLAPSE_SPEEDS: Readonly<Record<PresetName, CollapseSpeed>> = Object.freeze({
  default: "normal",
  relaxed: "slow",
  chaos: "fast",
});

export function isPresetName(value: string): value is PresetName {
  return PRESET_NAMES.some((preset) => preset === value);
}

export function getPresetPlayerCount(preset: PresetName): number {
  return PRESET_PLAYER_COUNTS[preset];
}

export function getPresetCollapseSpeed(preset: PresetName): CollapseSpeed {
  return PRESET_COLLAPSE_SPEEDS[preset];
}

export function normalizePlayerCount(value: number): number {
  if (!Number.isFinite(value)) {
    return PRESET_PLAYER_COUNTS.default;
  }

  const rounded = Math.round(value);
  return Math.min(PLAYER_COUNT_LIMITS.maximum, Math.max(PLAYER_COUNT_LIMITS.minimum, rounded));
}

export function normalizeSettings(input: {
  readonly playerCount: number;
  readonly preset: string;
}): GameSettings {
  const preset = isPresetName(input.preset) ? input.preset : "default";

  return Object.freeze({
    playerCount: normalizePlayerCount(input.playerCount),
    preset,
  });
}

export function getArenaSize(playerCount: number): ArenaSize {
  const normalizedCount = normalizePlayerCount(playerCount);

  if (normalizedCount <= 8) {
    return Object.freeze({ columns: 9, rows: 7 });
  }

  if (normalizedCount <= 16) {
    return Object.freeze({ columns: 11, rows: 9 });
  }

  if (normalizedCount <= 24) {
    return Object.freeze({ columns: 15, rows: 11 });
  }

  return Object.freeze({ columns: 17, rows: 13 });
}
