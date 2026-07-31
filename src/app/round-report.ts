import type { GameSettings } from "./settings";
import type { RenderFrameV1, UpgradeStatId } from "../simulation/contracts";
import { PUBLIC_ROUND_LIMIT_SECONDS } from "./settings";
import type { GameplayTuningV1 } from "../simulation/tuning";
import {
  CONTENT_VERSION,
  FIXED_TICKS_PER_SECOND,
  PRODUCT_VERSION,
  SIMULATION_VERSION,
} from "../simulation/versions";

export interface HumanUpgradeSelection {
  readonly tick: number;
  readonly stat?: UpgradeStatId;
  readonly skillSlot?: 0 | 1 | 2;
}

export interface PlaytestRoundReportV11 {
  readonly schemaVersion: "shovefall-playtest-round/v11";
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
    readonly startingAttributes: GameSettings["startingAttributes"];
    readonly startingItems: GameSettings["startingItems"];
    readonly startingSkills: GameSettings["startingSkills"];
    readonly roundLimitSeconds: number | null;
  };
  readonly gameplayTuning: GameplayTuningV1;
  readonly result: {
    readonly outcome: "human-win" | "bot-win" | "no-survivors";
    readonly reason: NonNullable<RenderFrameV1["round"]["reason"]>;
    readonly winnerActorId: number | null;
    readonly completedTick: number;
    readonly durationSeconds: number;
    readonly humanProgression: RenderFrameV1["participants"][number]["progression"];
    readonly humanCombat: RenderFrameV1["participants"][number]["combat"];
    readonly humanUpgradeSelections: readonly HumanUpgradeSelection[];
  };
}

export function createPlaytestRoundReport(
  settings: GameSettings,
  seed: string,
  frame: RenderFrameV1,
  gameplayTuning: GameplayTuningV1,
  humanUpgradeSelections: readonly HumanUpgradeSelection[] = Object.freeze([]),
): PlaytestRoundReportV11 {
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
    schemaVersion: "shovefall-playtest-round/v11",
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
      startingAttributes: settings.startingAttributes,
      startingItems: settings.startingItems,
      startingSkills: settings.startingSkills,
      roundLimitSeconds: PUBLIC_ROUND_LIMIT_SECONDS,
    }),
    gameplayTuning,
    result: Object.freeze({
      outcome,
      reason: round.reason,
      winnerActorId: round.winnerActorId,
      completedTick: round.completedTick,
      durationSeconds: round.completedTick / FIXED_TICKS_PER_SECOND,
      humanProgression: human.progression,
      humanCombat: human.combat,
      humanUpgradeSelections: Object.freeze(
        humanUpgradeSelections.map((selection) => Object.freeze({ ...selection })),
      ),
    }),
  });
}

export function serializePlaytestRoundReport(report: PlaytestRoundReportV11): string {
  return JSON.stringify(report, null, 2);
}
