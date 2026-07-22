export const PRESET_NAMES = ["default", "relaxed", "chaos"] as const;

export type PresetName = (typeof PRESET_NAMES)[number];

export interface GameSettings {
  readonly playerCount: number;
  readonly preset: PresetName;
  readonly initialItemCount: number;
  readonly itemRespawnSeconds: number;
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

export const ITEM_RESPAWN_LIMITS = Object.freeze({ minimum: 0, maximum: 30 });

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

const PRESET_ITEM_RESPAWN_SECONDS: Readonly<Record<PresetName, number>> = Object.freeze({
  default: 5,
  relaxed: 7,
  chaos: 3,
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

export function getRecommendedInitialItemCount(playerCount: number): number {
  return Math.ceil(normalizePlayerCount(playerCount) * 0.33);
}

export function getMaximumItemCount(playerCount: number): number {
  return Math.ceil(normalizePlayerCount(playerCount) * 0.5);
}

export function getPresetItemRespawnSeconds(preset: PresetName): number {
  return PRESET_ITEM_RESPAWN_SECONDS[preset];
}

export function normalizeInitialItemCount(value: number, playerCount: number): number {
  if (!Number.isFinite(value)) {
    return getRecommendedInitialItemCount(playerCount);
  }

  return Math.min(getMaximumItemCount(playerCount), Math.max(0, Math.round(value)));
}

export function normalizeItemRespawnSeconds(value: number, preset: PresetName): number {
  if (!Number.isFinite(value)) {
    return getPresetItemRespawnSeconds(preset);
  }

  return Math.min(
    ITEM_RESPAWN_LIMITS.maximum,
    Math.max(ITEM_RESPAWN_LIMITS.minimum, Math.round(value)),
  );
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
  readonly initialItemCount?: number;
  readonly itemRespawnSeconds?: number;
}): GameSettings {
  const preset = isPresetName(input.preset) ? input.preset : "default";
  const playerCount = normalizePlayerCount(input.playerCount);

  return Object.freeze({
    playerCount,
    preset,
    initialItemCount: normalizeInitialItemCount(input.initialItemCount ?? Number.NaN, playerCount),
    itemRespawnSeconds: normalizeItemRespawnSeconds(input.itemRespawnSeconds ?? Number.NaN, preset),
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
