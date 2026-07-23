import type { BotDifficulty, ItemDefinitionId } from "../simulation/contracts";

export const PRESET_NAMES = ["relaxed", "default", "crowded", "chaos"] as const;
export const BOT_DIFFICULTIES = ["easy", "normal", "hard"] as const;

export type PresetName = (typeof PRESET_NAMES)[number];
export type StartingMass = "light" | "normal" | "heavy";

export const STARTING_MASS_FACTORS: Readonly<Record<StartingMass, number>> = Object.freeze({
  light: 0.85,
  normal: 1,
  heavy: 1.25,
});
export const DEFAULT_STARTING_ITEMS = Object.freeze([
  "iron-boots",
  "spring-glove",
] as const satisfies readonly ItemDefinitionId[]);

export interface GameSettings {
  readonly playerCount: number;
  readonly preset: PresetName;
  readonly collapseSpeed: CollapseSpeed;
  readonly initialItemCount: number;
  readonly itemRespawnSeconds: number;
  readonly botDifficulty: BotDifficulty;
  readonly startingMass: StartingMass;
  readonly startingItems: readonly ItemDefinitionId[];
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
  relaxed: 8,
  default: 16,
  crowded: 24,
  chaos: 32,
});

const PRESET_COLLAPSE_SPEEDS: Readonly<Record<PresetName, CollapseSpeed>> = Object.freeze({
  relaxed: "slow",
  default: "normal",
  crowded: "normal",
  chaos: "fast",
});

const PRESET_ITEM_RESPAWN_SECONDS: Readonly<Record<PresetName, number>> = Object.freeze({
  relaxed: 7,
  default: 5,
  crowded: 4,
  chaos: 3,
});

export function isPresetName(value: string): value is PresetName {
  return PRESET_NAMES.some((preset) => preset === value);
}

export function isBotDifficulty(value: string): value is BotDifficulty {
  return BOT_DIFFICULTIES.some((difficulty) => difficulty === value);
}

export function isCollapseSpeed(value: string): value is CollapseSpeed {
  return value === "slow" || value === "normal" || value === "fast";
}

export function isStartingMass(value: string): value is StartingMass {
  return value === "light" || value === "normal" || value === "heavy";
}

function normalizeStartingItems(
  values: readonly string[] | undefined,
): readonly ItemDefinitionId[] {
  const selected = [...new Set(values ?? [])].filter(
    (value): value is ItemDefinitionId =>
      value === "iron-boots" || value === "feather" || value === "spring-glove",
  );
  return Object.freeze(selected.length === 2 ? selected : [...DEFAULT_STARTING_ITEMS]);
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
  readonly botDifficulty?: string;
  readonly collapseSpeed?: string;
  readonly startingMass?: string;
  readonly startingItems?: readonly string[];
}): GameSettings {
  const preset = isPresetName(input.preset) ? input.preset : "default";
  const playerCount = normalizePlayerCount(input.playerCount);

  return Object.freeze({
    playerCount,
    preset,
    collapseSpeed:
      input.collapseSpeed !== undefined && isCollapseSpeed(input.collapseSpeed)
        ? input.collapseSpeed
        : getPresetCollapseSpeed(preset),
    initialItemCount: normalizeInitialItemCount(input.initialItemCount ?? Number.NaN, playerCount),
    itemRespawnSeconds: normalizeItemRespawnSeconds(input.itemRespawnSeconds ?? Number.NaN, preset),
    botDifficulty:
      input.botDifficulty !== undefined && isBotDifficulty(input.botDifficulty)
        ? input.botDifficulty
        : "normal",
    startingMass:
      input.startingMass !== undefined && isStartingMass(input.startingMass)
        ? input.startingMass
        : "normal",
    startingItems: normalizeStartingItems(input.startingItems),
  });
}

export function getArenaSize(playerCount: number): ArenaSize {
  const normalizedCount = normalizePlayerCount(playerCount);

  if (normalizedCount <= 8) {
    return Object.freeze({ columns: 16, rows: 13 });
  }

  if (normalizedCount <= 16) {
    return Object.freeze({ columns: 20, rows: 16 });
  }

  if (normalizedCount <= 24) {
    return Object.freeze({ columns: 24, rows: 19 });
  }

  return Object.freeze({ columns: 28, rows: 22 });
}
