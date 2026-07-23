import { describe, expect, it } from "vitest";
import { getPointerMovementVector } from "../src/app/pointer-controls";

describe("pointer movement vector", () => {
  it("keeps small accidental motion inside the dead zone neutral", () => {
    expect(getPointerMovementVector(100, 100, 105, 100, 64)).toEqual({ x: 0, y: 0 });
  });

  it("preserves direction and analog strength inside the drag radius", () => {
    const vector = getPointerMovementVector(100, 100, 132, 124, 64);

    expect(vector.x).toBeCloseTo(0.5);
    expect(vector.y).toBeCloseTo(0.375);
  });

  it("clamps long drags to a unit vector", () => {
    const vector = getPointerMovementVector(0, 0, 300, 400, 64);

    expect(vector.x).toBeCloseTo(0.6);
    expect(vector.y).toBeCloseTo(0.8);
    expect(Math.hypot(vector.x, vector.y)).toBeCloseTo(1);
  });

  it("neutralizes invalid coordinates and radii", () => {
    expect(getPointerMovementVector(0, 0, Number.NaN, 1, 0)).toEqual({ x: 0, y: 0 });
  });
});
