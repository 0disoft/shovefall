import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_PREFERENCES,
  loadUserPreferences,
  normalizeUserPreferences,
  saveUserPreferences,
  USER_PREFERENCES_STORAGE_KEY,
} from "../src/app/user-preferences";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("user preferences", () => {
  it("defaults to standard text and balanced 50 percent audio controls", () => {
    expect(loadUserPreferences(undefined)).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("normalizes invalid font scales and clamps volume", () => {
    expect(
      normalizeUserPreferences({
        fontScale: "huge",
        soundEffectsVolume: 140,
        backgroundMusicVolume: -4,
      }),
    ).toEqual({
      fontScale: "standard",
      soundEffectsVolume: 100,
      backgroundMusicVolume: 0,
    });
    expect(normalizeUserPreferences({ fontScale: "large", soundEffectsVolume: -4 })).toEqual({
      fontScale: "large",
      soundEffectsVolume: 0,
      backgroundMusicVolume: 50,
    });
  });

  it("round-trips saved preferences and survives malformed storage", () => {
    const storage = new MemoryStorage();
    saveUserPreferences(storage, {
      fontScale: "extra-large",
      soundEffectsVolume: 37,
      backgroundMusicVolume: 24,
    });
    expect(loadUserPreferences(storage)).toEqual({
      fontScale: "extra-large",
      soundEffectsVolume: 37,
      backgroundMusicVolume: 24,
    });
    storage.values.set(USER_PREFERENCES_STORAGE_KEY, "not json");
    expect(loadUserPreferences(storage)).toEqual(DEFAULT_USER_PREFERENCES);
  });
});
