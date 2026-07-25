import { ITEM_DEFINITION_IDS } from "../content/items";
import type { BotDifficulty, ItemDefinitionId } from "../simulation/contracts";
import { SIMULATION_TUNING } from "../simulation/tuning";

export const FORCED_PLAYER_COUNT = 50;
export const FORCED_BOT_DIFFICULTY = "hard" as const satisfies BotDifficulty;
export const PRESET_NAMES = ["massive"] as const;
export const BOT_DIFFICULTIES = [FORCED_BOT_DIFFICULTY] as const;
export const DEFAULT_STARTING_WEIGHT = 75;
export const FIXED_COLLAPSE_SPEED = "slow" as const;
export const FIXED_INITIAL_ITEM_COUNT = 8;
export const FIXED_ITEM_RESPAWN_SECONDS = 4;
export const PUBLIC_ROUND_LIMIT_SECONDS = 120;

export type PresetName = (typeof PRESET_NAMES)[number];
export type CollapseSpeed = "slow" | "normal" | "fast";

export const STARTING_WEIGHT_LIMITS = Object.freeze({ minimum: 50, maximum: 100 });
export const DEFAULT_STARTING_ITEMS = Object.freeze([
  "iron-boots",
  "spring-glove",
] as const satisfies readonly ItemDefinitionId[]);
export const PLAYER_COUNT_LIMITS = Object.freeze({ minimum: 4, maximum: FORCED_PLAYER_COUNT });
export const ITEM_RESPAWN_LIMITS = Object.freeze({ minimum: 0, maximum: 30 });

export interface GameSettings {
  readonly playerCount: typeof FORCED_PLAYER_COUNT;
  readonly preset: PresetName;
  readonly collapseSpeed: CollapseSpeed;
  readonly initialItemCount: number;
  readonly itemRespawnSeconds: number;
  readonly botDifficulty: typeof FORCED_BOT_DIFFICULTY;
  readonly startingWeight: number;
  readonly startingItems: readonly ItemDefinitionId[];
}

export interface ArenaSize {
  readonly columns: number;
  readonly rows: number;
}

export function isPresetName(value: string): value is PresetName {
  return value === "massive";
}

export function isBotDifficulty(value: string): value is typeof FORCED_BOT_DIFFICULTY {
  return value === FORCED_BOT_DIFFICULTY;
}

export function isCollapseSpeed(value: string): value is CollapseSpeed {
  return value === "slow" || value === "normal" || value === "fast";
}

function normalizeStartingItems(
  values: readonly string[] | undefined,
): readonly ItemDefinitionId[] {
  const selected = [...new Set(values ?? [])].filter((value): value is ItemDefinitionId =>
    ITEM_DEFINITION_IDS.some((definitionId) => definitionId === value),
  );
  return Object.freeze(selected.length === 2 ? selected : [...DEFAULT_STARTING_ITEMS]);
}

export function getPresetPlayerCount(_preset: PresetName): typeof FORCED_PLAYER_COUNT {
  return FORCED_PLAYER_COUNT;
}

export function getPresetCollapseSpeed(_preset: PresetName): CollapseSpeed {
  return FIXED_COLLAPSE_SPEED;
}

export function getRecommendedInitialItemCount(playerCount: number): number {
  return Math.min(FIXED_INITIAL_ITEM_COUNT, getMaximumItemCount(playerCount));
}

export function getMaximumItemCount(playerCount: number): number {
  return Math.ceil(normalizePlayerCount(playerCount) * 0.5);
}

export function getPresetItemRespawnSeconds(_preset: PresetName): number {
  return FIXED_ITEM_RESPAWN_SECONDS;
}

export function normalizeInitialItemCount(value: number, playerCount: number): number {
  if (!Number.isFinite(value)) {
    return getRecommendedInitialItemCount(playerCount);
  }

  return Math.min(getMaximumItemCount(playerCount), Math.max(0, Math.round(value)));
}

export function normalizeItemRespawnSeconds(value: number, _preset: PresetName): number {
  if (!Number.isFinite(value)) {
    return getPresetItemRespawnSeconds("massive");
  }

  return Math.min(
    ITEM_RESPAWN_LIMITS.maximum,
    Math.max(ITEM_RESPAWN_LIMITS.minimum, Math.round(value)),
  );
}

export function normalizePlayerCount(value: number): number {
  if (!Number.isFinite(value)) {
    return FORCED_PLAYER_COUNT;
  }

  return Math.min(
    PLAYER_COUNT_LIMITS.maximum,
    Math.max(PLAYER_COUNT_LIMITS.minimum, Math.round(value)),
  );
}

export function normalizeStartingWeight(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_STARTING_WEIGHT;
  }

  return Math.min(
    STARTING_WEIGHT_LIMITS.maximum,
    Math.max(STARTING_WEIGHT_LIMITS.minimum, Math.round(value)),
  );
}

export function getStartingMassFactor(weight: number): number {
  const normalized = normalizeStartingWeight(weight);

  if (normalized <= DEFAULT_STARTING_WEIGHT) {
    return (
      SIMULATION_TUNING.mass.minimum +
      ((normalized - STARTING_WEIGHT_LIMITS.minimum) / 25) *
        (SIMULATION_TUNING.mass.default - SIMULATION_TUNING.mass.minimum)
    );
  }

  return (
    SIMULATION_TUNING.mass.default +
    ((normalized - DEFAULT_STARTING_WEIGHT) / 25) *
      (SIMULATION_TUNING.mass.maximum - SIMULATION_TUNING.mass.default)
  );
}

export function normalizeSettings(
  input: {
    readonly initialItemCount?: number;
    readonly itemRespawnSeconds?: number;
    readonly collapseSpeed?: string;
    readonly startingWeight?: number;
    readonly startingItems?: readonly string[];
    readonly playerCount?: number;
    readonly preset?: string;
    readonly botDifficulty?: string;
    readonly startingMass?: string;
  } = {},
): GameSettings {
  return Object.freeze({
    playerCount: FORCED_PLAYER_COUNT,
    preset: "massive",
    collapseSpeed: FIXED_COLLAPSE_SPEED,
    initialItemCount: FIXED_INITIAL_ITEM_COUNT,
    itemRespawnSeconds: FIXED_ITEM_RESPAWN_SECONDS,
    botDifficulty: FORCED_BOT_DIFFICULTY,
    startingWeight: normalizeStartingWeight(input.startingWeight ?? Number.NaN),
    startingItems: normalizeStartingItems(input.startingItems),
  });
}

export function getArenaSize(playerCount: number): ArenaSize {
  const normalizedCount = normalizePlayerCount(playerCount);

  if (normalizedCount <= 8) {
    return Object.freeze({ columns: 22, rows: 17 });
  }

  if (normalizedCount <= 16) {
    return Object.freeze({ columns: 25, rows: 20 });
  }

  if (normalizedCount <= 24) {
    return Object.freeze({ columns: 28, rows: 23 });
  }

  if (normalizedCount <= 32) {
    return Object.freeze({ columns: 31, rows: 26 });
  }

  return Object.freeze({ columns: 48, rows: 40 });
}
