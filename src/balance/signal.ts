import type { BalanceAggregate, BalanceSignal } from "./contract";

export interface BalancePeerBaseline {
  readonly winRate: number;
  readonly averageRank: number;
  readonly top10Rate: number;
  readonly top5Rate: number;
  readonly averageSurvivalSeconds: number;
}

type SignalAggregate = Pick<
  BalanceAggregate,
  "averageRank" | "averageSurvivalSeconds" | "top10Rate" | "top5Rate" | "winRate95"
>;

function isMateriallyBelow(value: number, baseline: number, ratio: number): boolean {
  return baseline > 0 && value < baseline * ratio;
}

export function classifyBalanceSignal(
  aggregate: SignalAggregate,
  peer: BalancePeerBaseline,
): BalanceSignal {
  const winnerSignalHigh = peer.winRate > 0 && aggregate.winRate95.lower > peer.winRate * 1.25;
  const winnerSignalLow = peer.winRate > 0 && aggregate.winRate95.upper < peer.winRate * 0.75;
  const placementSignalHigh =
    aggregate.averageRank <= peer.averageRank && aggregate.top10Rate >= peer.top10Rate;
  const placementSignalLow =
    aggregate.averageRank > peer.averageRank && aggregate.top10Rate < peer.top10Rate;
  const survivalTailLow =
    isMateriallyBelow(aggregate.top5Rate, peer.top5Rate, 0.75) &&
    isMateriallyBelow(aggregate.averageSurvivalSeconds, peer.averageSurvivalSeconds, 0.75);

  if (winnerSignalHigh && survivalTailLow) {
    return "high-variance";
  }
  if (winnerSignalHigh && placementSignalHigh) {
    return "nerf-review";
  }
  if (winnerSignalLow && placementSignalLow) {
    return "buff-review";
  }
  return "watch";
}
