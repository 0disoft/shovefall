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
  assertFiniteNumber(minimum, "minimum");
  assertFiniteNumber(maximum, "maximum");

  if (minimum > maximum) {
    throw new SimulationContractError("minimum must not exceed maximum");
  }

  return Math.min(maximum, Math.max(minimum, value));
}

export function addVectors(left: Vector2, right: Vector2): Vector2 {
  return Object.freeze({ x: left.x + right.x, y: left.y + right.y });
}

export function subtractVectors(left: Vector2, right: Vector2): Vector2 {
  return Object.freeze({ x: left.x - right.x, y: left.y - right.y });
}

export function scaleVector(vector: Vector2, scale: number): Vector2 {
  assertFiniteNumber(scale, "vector scale");
  return Object.freeze({ x: vector.x * scale, y: vector.y * scale });
}

export function dotVectors(left: Vector2, right: Vector2): number {
  return left.x * right.x + left.y * right.y;
}

export function vectorLengthSquared(vector: Vector2): number {
  return dotVectors(vector, vector);
}

export function vectorLength(vector: Vector2): number {
  assertFiniteNumber(vector.x, "vector.x");
  assertFiniteNumber(vector.y, "vector.y");
  return Math.hypot(vector.x, vector.y);
}

export function clampVectorLength(vector: Vector2, maximum: number): Vector2 {
  assertFiniteNumber(vector.x, "vector.x");
  assertFiniteNumber(vector.y, "vector.y");
  assertFiniteNumber(maximum, "maximum vector length");

  if (maximum < 0) {
    throw new SimulationContractError("maximum vector length must not be negative");
  }

  const length = vectorLength(vector);

  if (length <= maximum) {
    return Object.freeze({ x: vector.x, y: vector.y });
  }

  if (length === 0) {
    return ZERO_VECTOR;
  }

  return scaleVector(vector, maximum / length);
}

export function moveVectorToward(current: Vector2, target: Vector2, maximumDelta: number): Vector2 {
  assertFiniteNumber(maximumDelta, "maximum vector delta");

  if (maximumDelta < 0) {
    throw new SimulationContractError("maximum vector delta must not be negative");
  }

  const delta = subtractVectors(target, current);
  const distance = vectorLength(delta);

  if (distance <= maximumDelta || distance === 0) {
    return Object.freeze({ x: target.x, y: target.y });
  }

  return addVectors(current, scaleVector(delta, maximumDelta / distance));
}

export function normalizeVector(vector: Vector2): Vector2 {
  assertFiniteNumber(vector.x, "vector.x");
  assertFiniteNumber(vector.y, "vector.y");

  const length = Math.hypot(vector.x, vector.y);

  if (length <= 1) {
    return Object.freeze({ x: vector.x, y: vector.y });
  }

  const inverseLength = 1 / length;
  return Object.freeze({
    x: vector.x * inverseLength,
    y: vector.y * inverseLength,
  });
}

export function isZeroVector(vector: Vector2): boolean {
  return vector.x === 0 && vector.y === 0;
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
