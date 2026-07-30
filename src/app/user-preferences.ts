export const FONT_SCALE_IDS = Object.freeze([
  "compact",
  "standard",
  "large",
  "extra-large",
] as const);
export type FontScaleId = (typeof FONT_SCALE_IDS)[number];

export interface UserPreferences {
  readonly fontScale: FontScaleId;
  readonly soundEffectsVolume: number;
  readonly backgroundMusicVolume: number;
}

export interface UserPreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const USER_PREFERENCES_STORAGE_KEY = "shovefall:user-preferences:v1";
export const DEFAULT_USER_PREFERENCES: UserPreferences = Object.freeze({
  fontScale: "standard",
  soundEffectsVolume: 50,
  backgroundMusicVolume: 50,
});

export function isFontScaleId(value: unknown): value is FontScaleId {
  return typeof value === "string" && FONT_SCALE_IDS.some((id) => id === value);
}

function normalizeVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.round(Math.min(100, Math.max(0, value)));
}

export function normalizeUserPreferences(value: unknown): UserPreferences {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_USER_PREFERENCES;
  }
  const candidate = value as Partial<UserPreferences>;
  return Object.freeze({
    fontScale: isFontScaleId(candidate.fontScale)
      ? candidate.fontScale
      : DEFAULT_USER_PREFERENCES.fontScale,
    soundEffectsVolume: normalizeVolume(
      candidate.soundEffectsVolume,
      DEFAULT_USER_PREFERENCES.soundEffectsVolume,
    ),
    backgroundMusicVolume: normalizeVolume(
      candidate.backgroundMusicVolume,
      DEFAULT_USER_PREFERENCES.backgroundMusicVolume,
    ),
  });
}

export function loadUserPreferences(storage: UserPreferencesStorage | undefined): UserPreferences {
  if (storage === undefined) {
    return DEFAULT_USER_PREFERENCES;
  }
  try {
    const raw = storage.getItem(USER_PREFERENCES_STORAGE_KEY);
    return raw === null ? DEFAULT_USER_PREFERENCES : normalizeUserPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_USER_PREFERENCES;
  }
}

export function saveUserPreferences(
  storage: UserPreferencesStorage | undefined,
  preferences: UserPreferences,
): void {
  if (storage === undefined) {
    return;
  }
  try {
    storage.setItem(
      USER_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalizeUserPreferences(preferences)),
    );
  } catch {
    // Browser storage is optional; current-session preferences remain active.
  }
}
