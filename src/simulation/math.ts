export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

export const ZERO_VECTOR: Vector2 = Object.freeze({ x: 0, y: 0 });

export function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new SimulationContractError(`${name} must be finite`);
  }
}

export function clamp(value: number, minimum: number, maximum: number): number {
  assertFiniteNumber(value, "value");
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeVector(vector: Vector2): Vector2 {
  assertFiniteNumber(vector.x, "vector.x");
  assertFiniteNumber(vector.y, "vector.y");

  const lengthSquared = vector.x * vector.x + vector.y * vector.y;

  if (lengthSquared <= 1) {
    return Object.freeze({ x: vector.x, y: vector.y });
  }

  const inverseLength = 1 / Math.sqrt(lengthSquared);
  return Object.freeze({
    x: vector.x * inverseLength,
    y: vector.y * inverseLength,
  });
}

export function quantize(value: number, scale = 10_000): number {
  assertFiniteNumber(value, "quantized value");
  return Math.round(value * scale);
}

export class SimulationContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SimulationContractError";
  }
}
