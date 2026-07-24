import { cpus } from "node:os";

export interface CpuSnapshot {
  readonly idle: number;
  readonly total: number;
}

export interface HostCpuQualification {
  readonly accepted: boolean;
  readonly samples: readonly number[];
  readonly averagePercent: number;
  readonly maximumPercent: number;
  readonly averageLimitPercent: number;
  readonly maximumLimitPercent: number;
}

export const HOST_CPU_SAMPLE_COUNT = 5;
export const HOST_CPU_SAMPLE_INTERVAL_MILLISECONDS = 500;
export const HOST_CPU_AVERAGE_LIMIT_PERCENT = 35;
export const HOST_CPU_MAXIMUM_LIMIT_PERCENT = 65;

export function captureCpuSnapshot(): CpuSnapshot {
  return cpus().reduce<CpuSnapshot>(
    (snapshot, cpu) => {
      const total = Object.values(cpu.times).reduce((sum, duration) => sum + duration, 0);
      return {
        idle: snapshot.idle + cpu.times.idle,
        total: snapshot.total + total,
      };
    },
    { idle: 0, total: 0 },
  );
}

export function calculateCpuUsagePercent(start: CpuSnapshot, end: CpuSnapshot): number {
  const idleDelta = end.idle - start.idle;
  const totalDelta = end.total - start.total;

  if (idleDelta < 0 || totalDelta <= 0 || idleDelta > totalDelta) {
    throw new Error("CPU counters did not advance monotonically during browser-profile preflight.");
  }

  return Math.round((1 - idleDelta / totalDelta) * 1_000) / 10;
}

export function qualifyHostCpu(
  samples: readonly number[],
  averageLimitPercent = HOST_CPU_AVERAGE_LIMIT_PERCENT,
  maximumLimitPercent = HOST_CPU_MAXIMUM_LIMIT_PERCENT,
): HostCpuQualification {
  if (samples.length !== HOST_CPU_SAMPLE_COUNT) {
    throw new Error(
      `Expected ${HOST_CPU_SAMPLE_COUNT} host CPU samples, received ${samples.length}.`,
    );
  }

  if (samples.some((sample) => !Number.isFinite(sample) || sample < 0 || sample > 100)) {
    throw new Error("Host CPU samples must be finite percentages between 0 and 100.");
  }

  const averagePercent =
    Math.round((samples.reduce((sum, sample) => sum + sample, 0) / samples.length) * 10) / 10;
  const maximumPercent = Math.max(...samples);

  return Object.freeze({
    accepted: averagePercent <= averageLimitPercent && maximumPercent <= maximumLimitPercent,
    samples: Object.freeze([...samples]),
    averagePercent,
    maximumPercent,
    averageLimitPercent,
    maximumLimitPercent,
  });
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function sampleHostCpu(): Promise<HostCpuQualification> {
  async function collectSamples(
    samples: readonly number[],
    start: CpuSnapshot,
  ): Promise<readonly number[]> {
    if (samples.length === HOST_CPU_SAMPLE_COUNT) {
      return samples;
    }

    await wait(HOST_CPU_SAMPLE_INTERVAL_MILLISECONDS);
    const end = captureCpuSnapshot();
    return collectSamples([...samples, calculateCpuUsagePercent(start, end)], end);
  }

  return qualifyHostCpu(await collectSamples([], captureCpuSnapshot()));
}
