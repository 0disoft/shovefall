import { describe, expect, it } from "vitest";
import { getBalanceSignal, ratio, wilsonInterval } from "../tools/item-balance-statistics";

describe("item balance statistics", () => {
  it("keeps zero-denominator ratios and intervals explicit", () => {
    expect(ratio(1, 0)).toBeNull();
    expect(wilsonInterval(0, 0)).toBeNull();
  });

  it("produces bounded Wilson intervals around the observed win rate", () => {
    const interval = wilsonInterval(12, 48);

    expect(interval).not.toBeNull();
    expect(interval?.lower).toBeGreaterThan(0);
    expect(interval?.lower).toBeLessThan(0.25);
    expect(interval?.upper).toBeGreaterThan(0.25);
    expect(interval?.upper).toBeLessThan(1);
  });

  it("classifies only material deviations as balance investigations", () => {
    expect(getBalanceSignal(null)).toBe("insufficient-data");
    expect(getBalanceSignal(0.74)).toBe("investigate-buff");
    expect(getBalanceSignal(0.75)).toBe("balanced");
    expect(getBalanceSignal(1.25)).toBe("balanced");
    expect(getBalanceSignal(1.26)).toBe("investigate-nerf");
  });
});
