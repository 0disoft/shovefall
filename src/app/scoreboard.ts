import { MAXIMUM_PARTICIPANT_COUNT } from "../simulation/contracts";

export const SCOREBOARD_STORAGE_KEY = "shovefall.scoreboard.v1";
export const MAX_SCOREBOARD_ENTRIES = 50;

export type ScoreboardOutcome = "victory" | "defeat" | "draw";

export interface ScoreboardEntry {
  readonly id: string;
  readonly playedAt: string;
  readonly rank: number;
  readonly participantCount: number;
  readonly score: number;
  readonly eliminations: number;
  readonly survivalSeconds: number;
  readonly outcome: ScoreboardOutcome;
}

export interface ScoreboardStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CreateScoreboardEntryInput {
  readonly playedAt: Date;
  readonly roundId: number;
  readonly rank: number;
  readonly participantCount: number;
  readonly eliminations: number;
  readonly survivalSeconds: number;
  readonly outcome: ScoreboardOutcome;
}

function isSafeIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum
  );
}

function isScoreboardEntry(value: unknown): value is ScoreboardEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ScoreboardEntry>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    candidate.id.length <= 120 &&
    typeof candidate.playedAt === "string" &&
    Number.isFinite(Date.parse(candidate.playedAt)) &&
    isSafeIntegerInRange(candidate.rank, 1, MAXIMUM_PARTICIPANT_COUNT) &&
    isSafeIntegerInRange(candidate.participantCount, candidate.rank, MAXIMUM_PARTICIPANT_COUNT) &&
    isSafeIntegerInRange(candidate.score, 0, 1_000_000) &&
    isSafeIntegerInRange(candidate.eliminations, 0, MAXIMUM_PARTICIPANT_COUNT - 1) &&
    isSafeIntegerInRange(candidate.survivalSeconds, 0, 7_200) &&
    (candidate.outcome === "victory" ||
      candidate.outcome === "defeat" ||
      candidate.outcome === "draw")
  );
}

export function calculateRoundScore(input: {
  readonly rank: number;
  readonly participantCount: number;
  readonly eliminations: number;
  readonly survivalSeconds: number;
}): number {
  const placementScore = (input.participantCount - input.rank + 1) * 500;
  const eliminationScore = input.eliminations * 200;
  const survivalScore = Math.floor(input.survivalSeconds * 10);
  const victoryBonus = input.rank === 1 ? 1_000 : 0;
  return placementScore + eliminationScore + survivalScore + victoryBonus;
}

export function createScoreboardEntry(input: CreateScoreboardEntryInput): ScoreboardEntry {
  const playedAt = input.playedAt.toISOString();
  const survivalSeconds = Math.max(0, Math.floor(input.survivalSeconds));
  const score = calculateRoundScore({
    rank: input.rank,
    participantCount: input.participantCount,
    eliminations: input.eliminations,
    survivalSeconds,
  });

  return Object.freeze({
    id: `${playedAt}:${input.roundId}`,
    playedAt,
    rank: input.rank,
    participantCount: input.participantCount,
    score,
    eliminations: input.eliminations,
    survivalSeconds,
    outcome: input.outcome,
  });
}

export function loadScoreboard(storage: ScoreboardStorage | undefined): readonly ScoreboardEntry[] {
  if (storage === undefined) {
    return Object.freeze([]);
  }

  try {
    const serialized = storage.getItem(SCOREBOARD_STORAGE_KEY);
    if (serialized === null) {
      return Object.freeze([]);
    }

    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) {
      return Object.freeze([]);
    }

    return Object.freeze(
      parsed
        .filter(isScoreboardEntry)
        .toSorted((left, right) => Date.parse(right.playedAt) - Date.parse(left.playedAt))
        .slice(0, MAX_SCOREBOARD_ENTRIES)
        .map((entry) => Object.freeze({ ...entry })),
    );
  } catch {
    return Object.freeze([]);
  }
}

export function saveScoreboardEntry(
  storage: ScoreboardStorage | undefined,
  entry: ScoreboardEntry,
): readonly ScoreboardEntry[] {
  const nextEntries = Object.freeze(
    [entry, ...loadScoreboard(storage).filter((candidate) => candidate.id !== entry.id)].slice(
      0,
      MAX_SCOREBOARD_ENTRIES,
    ),
  );

  if (storage !== undefined) {
    try {
      storage.setItem(SCOREBOARD_STORAGE_KEY, JSON.stringify(nextEntries));
    } catch {
      // The round still completes when storage is unavailable or full.
    }
  }

  return nextEntries;
}
