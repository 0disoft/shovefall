import type { GameSettings } from "./settings";
import type { RenderFrameV1 } from "../simulation/contracts";
import type { GameplayTuningV1 } from "../simulation/tuning";
import {
  CONTENT_VERSION,
  FIXED_TICKS_PER_SECOND,
  PRODUCT_VERSION,
  SIMULATION_VERSION,
} from "../simulation/versions";

export interface PlaytestRoundReportV5 {
  readonly schemaVersion: "shovefall-playtest-round/v5";
  readonly versions: {
    readonly product: string;
    readonly simulation: string;
    readonly content: string;
  };
  readonly seed: string;
  readonly stateHash: string;
  readonly roundId: number;
  readonly settings: {
    readonly preset: GameSettings["preset"];
    readonly participantCount: number;
    readonly botDifficulty: GameSettings["botDifficulty"];
    readonly collapseSpeed: GameSettings["collapseSpeed"];
    readonly initialItemCount: number;
    readonly itemRespawnSeconds: number;
    readonly startingWeight: GameSettings["startingWeight"];
    readonly startingItems: GameSettings["startingItems"];
    readonly upgradePlan: GameSettings["upgradePlan"];
  };
  readonly gameplayTuning: GameplayTuningV1;
  readonly result: {
    readonly outcome: "human-win" | "bot-win" | "no-survivors";
    readonly reason: NonNullable<RenderFrameV1["round"]["reason"]>;
    readonly winnerActorId: number | null;
    readonly completedTick: number;
    readonly durationSeconds: number;
    readonly humanProgression: RenderFrameV1["participants"][number]["progression"];
  };
}

export function createPlaytestRoundReport(
  settings: GameSettings,
  seed: string,
  frame: RenderFrameV1,
  gameplayTuning: GameplayTuningV1,
): PlaytestRoundReportV5 {
  const { round } = frame;

  if (round.status !== "Completed" || round.completedTick === null || round.reason === null) {
    throw new Error("A playtest round report requires a completed round.");
  }

  const outcome =
    round.winnerActorId === 1
      ? "human-win"
      : round.winnerActorId === null
        ? "no-survivors"
        : "bot-win";
  const human = frame.participants.find(({ actorId }) => actorId === 1);

  if (human === undefined) {
    throw new Error("A playtest round report requires the human participant.");
  }

  return Object.freeze({
    schemaVersion: "shovefall-playtest-round/v5",
    versions: Object.freeze({
      product: PRODUCT_VERSION,
      simulation: SIMULATION_VERSION,
      content: CONTENT_VERSION,
    }),
    seed,
    stateHash: frame.stateHash,
    roundId: frame.roundId,
    settings: Object.freeze({
      preset: settings.preset,
      participantCount: settings.playerCount,
      botDifficulty: settings.botDifficulty,
      collapseSpeed: settings.collapseSpeed,
      initialItemCount: settings.initialItemCount,
      itemRespawnSeconds: settings.itemRespawnSeconds,
      startingWeight: settings.startingWeight,
      startingItems: settings.startingItems,
      upgradePlan: settings.upgradePlan,
    }),
    gameplayTuning,
    result: Object.freeze({
      outcome,
      reason: round.reason,
      winnerActorId: round.winnerActorId,
      completedTick: round.completedTick,
      durationSeconds: round.completedTick / FIXED_TICKS_PER_SECOND,
      humanProgression: human.progression,
    }),
  });
}

export function serializePlaytestRoundReport(report: PlaytestRoundReportV5): string {
  return JSON.stringify(report, null, 2);
}
