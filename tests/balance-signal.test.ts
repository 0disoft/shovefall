import { describe, expect, it } from "vitest";
import { classifyBalanceSignal } from "../src/balance/signal";

const PEER = Object.freeze({
  winRate: 0.0065,
  averageRank: 28.2,
  top10Rate: 0.24,
  top5Rate: 0.19,
  averageSurvivalSeconds: 36,
});

describe("balance review signal", () => {
  it("classifies sparse winners with a weak survival tail as high variance", () => {
    expect(
      classifyBalanceSignal(
        {
          winRate95: { lower: 0.0082, upper: 0.0215 },
          averageRank: 30.37,
          top10Rate: 0.1608,
          top5Rate: 0.0892,
          averageSurvivalSeconds: 19.8057,
        },
        PEER,
      ),
    ).toBe("high-variance");
  });

  it("requires winner and placement evidence before recommending a nerf", () => {
    expect(
      classifyBalanceSignal(
        {
          winRate95: { lower: 0.009, upper: 0.018 },
          averageRank: 25.5,
          top10Rate: 0.31,
          top5Rate: 0.24,
          averageSurvivalSeconds: 42,
        },
        PEER,
      ),
    ).toBe("nerf-review");
  });

  it("does not recommend a buff from sparse wins when placement remains healthy", () => {
    expect(
      classifyBalanceSignal(
        {
          winRate95: { lower: 0, upper: 0.004 },
          averageRank: 27.5,
          top10Rate: 0.27,
          top5Rate: 0.2,
          averageSurvivalSeconds: 40,
        },
        PEER,
      ),
    ).toBe("watch");
  });
});
