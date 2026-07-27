import { describe, expect, it } from "vitest";
import {
  calculateRoundScore,
  createScoreboardEntry,
  loadScoreboard,
  MAX_SCOREBOARD_ENTRIES,
  saveScoreboardEntry,
  SCOREBOARD_STORAGE_KEY,
  type ScoreboardStorage,
} from "../src/app/scoreboard";

class MemoryStorage implements ScoreboardStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("scoreboard", () => {
  it("weights placement above eliminations and adds a winner bonus", () => {
    expect(
      calculateRoundScore({ rank: 1, participantCount: 50, eliminations: 0, survivalSeconds: 60 }),
    ).toBe(26_600);
    expect(
      calculateRoundScore({ rank: 2, participantCount: 50, eliminations: 2, survivalSeconds: 60 }),
    ).toBe(25_500);
  });

  it("saves newest rounds first and keeps only the latest fifty", () => {
    const storage = new MemoryStorage();

    for (let index = 0; index < MAX_SCOREBOARD_ENTRIES + 3; index += 1) {
      saveScoreboardEntry(
        storage,
        createScoreboardEntry({
          playedAt: new Date(Date.UTC(2026, 6, 25, 0, index)),
          roundId: index + 1,
          rank: 50 - (index % 50),
          participantCount: 50,
          eliminations: index % 5,
          survivalSeconds: index,
          outcome: "defeat",
        }),
      );
    }

    const entries = loadScoreboard(storage);
    expect(entries).toHaveLength(MAX_SCOREBOARD_ENTRIES);
    expect(entries[0]?.id).toContain(":53");
    expect(entries.at(-1)?.id).toContain(":4");
  });

  it("ignores corrupt and invalid persisted records", () => {
    const storage = new MemoryStorage();
    storage.values.set(SCOREBOARD_STORAGE_KEY, "not-json");
    expect(loadScoreboard(storage)).toEqual([]);

    storage.values.set(
      SCOREBOARD_STORAGE_KEY,
      JSON.stringify([{ id: "bad", playedAt: "yesterday", rank: 0 }]),
    );
    expect(loadScoreboard(storage)).toEqual([]);
  });
});
