import { describe, expect, it } from "vitest";
import { createPlaytestRoundReport, serializePlaytestRoundReport } from "../src/app/round-report";
import { normalizeSettings } from "../src/app/settings";
import { normalizeGameConfig, type RenderFrameV1 } from "../src/simulation/contracts";
import { SimulationWorld } from "../src/simulation/world";

const SETTINGS = normalizeSettings({
  playerCount: 16,
  preset: "default",
  initialItemCount: 6,
  itemRespawnSeconds: 5,
  botDifficulty: "hard",
  collapseSpeed: "slow",
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
    );

    expect(report).toMatchObject({
      schemaVersion: "shovefall-playtest-round/v1",
      seed: "0000000800000000",
      settings: {
        preset: "default",
        participantCount: 16,
        botDifficulty: "hard",
        collapseSpeed: "slow",
        initialItemCount: 6,
        itemRespawnSeconds: 5,
      },
      result: {
        outcome: "bot-win",
        reason: "last-standing",
        winnerActorId: 7,
        completedTick: 1_350,
        durationSeconds: 22.5,
      },
    });
    expect(report.versions.product).toBe("0.18.1");
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
      ),
    ).toThrow("requires a completed round");
  });
});
