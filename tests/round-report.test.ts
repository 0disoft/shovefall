import { describe, expect, it } from "vitest";
import { createPlaytestRoundReport, serializePlaytestRoundReport } from "../src/app/round-report";
import { normalizeSettings } from "../src/app/settings";
import { normalizeGameConfig, type RenderFrameV1 } from "../src/simulation/contracts";
import { DEFAULT_GAMEPLAY_TUNING } from "../src/simulation/tuning";
import { SimulationWorld } from "../src/simulation/world";

const SETTINGS = normalizeSettings({
  initialItemCount: 6,
  itemRespawnSeconds: 5,
  collapseSpeed: "slow",
  startingWeight: 75,
});

function createFrame(round: RenderFrameV1["round"]): RenderFrameV1 {
  const frame = new SimulationWorld(
    normalizeGameConfig({ participantCount: 16 }),
    "report-frame",
  ).createRenderFrame();

  return Object.freeze({ ...frame, round });
}

describe("playtest round reports", () => {
  it("serializes a completed round with versions, settings, seed, and deterministic evidence", () => {
    const report = createPlaytestRoundReport(
      SETTINGS,
      "0000000800000000",
      createFrame({
        status: "Completed",
        winnerActorId: 7,
        reason: "last-standing",
        completedTick: 1_350,
      }),
      DEFAULT_GAMEPLAY_TUNING,
    );

    expect(report).toMatchObject({
      schemaVersion: "shovefall-playtest-round/v5",
      seed: "0000000800000000",
      settings: {
        preset: "massive",
        participantCount: 50,
        botDifficulty: "hard",
        collapseSpeed: "slow",
        initialItemCount: 6,
        itemRespawnSeconds: 5,
        startingWeight: 75,
        startingItems: ["iron-boots", "spring-glove"],
        upgradePlan: expect.arrayContaining(["power", "stability", "mobility", "reflex"]),
      },
      gameplayTuning: DEFAULT_GAMEPLAY_TUNING,
      result: {
        outcome: "bot-win",
        reason: "last-standing",
        winnerActorId: 7,
        completedTick: 1_350,
        durationSeconds: 22.5,
        humanProgression: {
          statPoints: 0,
          creditedEliminations: 0,
          stats: { power: 0, stability: 0, mobility: 0, reflex: 0 },
        },
      },
    });
    expect(report.versions).toEqual({
      product: "0.37.0",
      simulation: "19.0.0",
      content: "13.0.0",
    });
    expect(JSON.parse(serializePlaytestRoundReport(report))).toEqual(report);
  });

  it("rejects an active frame instead of copying partial evidence", () => {
    expect(() =>
      createPlaytestRoundReport(
        SETTINGS,
        "active-round",
        createFrame({
          status: "Active",
          winnerActorId: null,
          reason: null,
          completedTick: null,
        }),
        DEFAULT_GAMEPLAY_TUNING,
      ),
    ).toThrow("requires a completed round");
  });
});
