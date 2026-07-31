import { isActiveItemDefinitionId } from "../content/items";
import { DEFAULT_SKILL_LOADOUT, isSkillDefinitionId } from "../content/skills";
import {
  MAXIMUM_PARTICIPANT_COUNT,
  MINIMUM_PARTICIPANT_COUNT,
  type BotDifficulty,
  type ItemDefinitionId,
  type SkillDefinitionId,
  type StartingAttributes,
} from "../simulation/contracts";
import {
  DEFAULT_STARTING_ATTRIBUTES,
  normalizeStartingAttributes,
} from "../simulation/starting-attributes";

export const FORCED_PLAYER_COUNT = MAXIMUM_PARTICIPANT_COUNT;
export const FORCED_BOT_DIFFICULTY = "hard" as const satisfies BotDifficulty;
export const PRESET_NAMES = ["massive"] as const;
export const BOT_DIFFICULTIES = [FORCED_BOT_DIFFICULTY] as const;
export const FIXED_COLLAPSE_SPEED = "slow" as const;
export const FIXED_INITIAL_ITEM_COUNT = 8;
export const FIXED_ITEM_RESPAWN_SECONDS = 7;
export const PUBLIC_ROUND_LIMIT_SECONDS = null;
export const AUTOMATION_ROUND_LIMIT_SECONDS = 120;

export type PresetName = (typeof PRESET_NAMES)[number];
export type CollapseSpeed = "slow" | "normal" | "fast";

export const DEFAULT_STARTING_ITEMS = Object.freeze([
  "bomb",
] as const satisfies readonly ItemDefinitionId[]);
export const DEFAULT_STARTING_SKILLS = DEFAULT_SKILL_LOADOUT;
export const PLAYER_COUNT_LIMITS = Object.freeze({
  minimum: MINIMUM_PARTICIPANT_COUNT,
  maximum: FORCED_PLAYER_COUNT,
});
export const ITEM_RESPAWN_LIMITS = Object.freeze({ minimum: 0, maximum: 30 });

export interface GameSettings {
  readonly playerCount: typeof FORCED_PLAYER_COUNT;
  readonly preset: PresetName;
  readonly collapseSpeed: CollapseSpeed;
  readonly initialItemCount: number;
  readonly itemRespawnSeconds: number;
  readonly botDifficulty: typeof FORCED_BOT_DIFFICULTY;
  readonly startingAttributes: StartingAttributes;
  readonly startingItems: readonly ItemDefinitionId[];
  readonly startingSkills: readonly SkillDefinitionId[];
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
  const selected = [...new Set(values ?? [])].filter(isActiveItemDefinitionId);
  return Object.freeze(selected.length === 1 ? selected : [...DEFAULT_STARTING_ITEMS]);
}

function normalizeStartingSkills(
  values: readonly string[] | undefined,
): readonly SkillDefinitionId[] {
  const selected = [...new Set(values ?? [])].filter(isSkillDefinitionId);
  return Object.freeze(selected.length === 2 ? selected : [...DEFAULT_STARTING_SKILLS]);
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

export function normalizeSettings(
  input: {
    readonly initialItemCount?: number;
    readonly itemRespawnSeconds?: number;
    readonly collapseSpeed?: string;
    readonly startingAttributes?: unknown;
    readonly startingItems?: readonly string[];
    readonly startingSkills?: readonly string[];
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
    startingAttributes: normalizeStartingAttributes(
      input.startingAttributes ?? DEFAULT_STARTING_ATTRIBUTES,
    ),
    startingItems: normalizeStartingItems(input.startingItems),
    startingSkills: normalizeStartingSkills(input.startingSkills),
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

  return Object.freeze({ columns: 52, rows: 44 });
}
