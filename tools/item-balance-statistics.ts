export type BalanceSignal = "investigate-buff" | "balanced" | "investigate-nerf";

export interface BinomialInterval {
  readonly lower: number;
  readonly upper: number;
}

export function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : roundMetric(numerator / denominator);
}

export function wilsonInterval(successes: number, trials: number): BinomialInterval | null {
  if (trials === 0) {
    return null;
  }

  const z = 1.96;
  const probability = successes / trials;
  const denominator = 1 + z ** 2 / trials;
  const center = (probability + z ** 2 / (2 * trials)) / denominator;
  const margin =
    (z * Math.sqrt((probability * (1 - probability) + z ** 2 / (4 * trials)) / trials)) /
    denominator;

  return Object.freeze({
    lower: roundMetric(Math.max(0, center - margin)),
    upper: roundMetric(Math.min(1, center + margin)),
  });
}

export function getBalanceSignal(
  relativeWinIndex: number | null,
): BalanceSignal | "insufficient-data" {
  if (relativeWinIndex === null) {
    return "insufficient-data";
  }

  if (relativeWinIndex < 0.75) {
    return "investigate-buff";
  }

  return relativeWinIndex > 1.25 ? "investigate-nerf" : "balanced";
}
