import { describe, expect, test } from "vitest";

import {
  calculateCpuUsagePercent,
  HOST_CPU_AVERAGE_LIMIT_PERCENT,
  HOST_CPU_MAXIMUM_LIMIT_PERCENT,
  qualifyHostCpu,
} from "../tools/browser-profile-preflight";

describe("browser profile host preflight", () => {
  test("calculates aggregate busy time from monotonic CPU counters", () => {
    expect(calculateCpuUsagePercent({ idle: 50, total: 100 }, { idle: 70, total: 200 })).toBe(80);
  });

  test("rejects malformed counter deltas", () => {
    expect(() =>
      calculateCpuUsagePercent({ idle: 50, total: 100 }, { idle: 40, total: 200 }),
    ).toThrow(/monotonically/);
    expect(() =>
      calculateCpuUsagePercent({ idle: 50, total: 100 }, { idle: 50, total: 100 }),
    ).toThrow(/monotonically/);
  });

  test("accepts only a complete sample inside both host-load limits", () => {
    expect(qualifyHostCpu([20, 30, 35, 25, 30])).toMatchObject({
      accepted: true,
      averagePercent: 28,
      maximumPercent: 35,
      averageLimitPercent: HOST_CPU_AVERAGE_LIMIT_PERCENT,
      maximumLimitPercent: HOST_CPU_MAXIMUM_LIMIT_PERCENT,
    });
    expect(qualifyHostCpu([10, 20, 30, 40, 70])).toMatchObject({
      accepted: false,
      maximumPercent: 70,
    });
    expect(qualifyHostCpu([36, 36, 36, 36, 36])).toMatchObject({
      accepted: false,
      averagePercent: 36,
    });
    expect(() => qualifyHostCpu([10, 20, 30, 40])).toThrow(/Expected 5/);
    expect(() => qualifyHostCpu([10, 20, 30, 40, Number.NaN])).toThrow(/finite percentages/);
  });
});
