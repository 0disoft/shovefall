import { describe, expect, it } from "vitest";
import {
  ARENA_CAMERA_ELEVATION_DEGREES,
  ARENA_DEPTH_SCALE,
  ARENA_SHADOW_OFFSET_SCALE,
  createArenaProjection,
  getProjectedArenaSize,
  projectArenaPoint,
  projectArenaVector,
} from "../src/presentation/arena-projection";

describe("arena 2.5D projection", () => {
  it("uses the chosen 58 degree elevation without changing horizontal scale", () => {
    const projection = createArenaProjection(1440, 688);
    const origin = projectArenaPoint({ x: 0, y: 0 }, projection);
    const horizontal = projectArenaPoint({ x: 1, y: 0 }, projection);
    const depth = projectArenaPoint({ x: 0, y: 1 }, projection);

    expect(ARENA_CAMERA_ELEVATION_DEGREES).toBe(58);
    expect(ARENA_DEPTH_SCALE).toBeCloseTo(Math.sin((58 * Math.PI) / 180), 8);
    expect(horizontal.x - origin.x).toBeCloseTo(projection.pitch, 8);
    expect(depth.y - origin.y).toBeCloseTo(projection.pitch * ARENA_DEPTH_SCALE, 8);
    expect(projection.cliffDepth).toBeGreaterThanOrEqual(6);
    expect(projection.cliffDepth).toBeLessThanOrEqual(14);
    expect(ARENA_SHADOW_OFFSET_SCALE).toBeGreaterThanOrEqual(0.18);
    expect(ARENA_SHADOW_OFFSET_SCALE).toBeLessThanOrEqual(0.55);
  });

  it("projects facing vectors onto the same screen plane as movement", () => {
    const component = Math.SQRT1_2;
    const projected = projectArenaVector({ x: component, y: component });

    expect(projected.x).toBeCloseTo(component, 8);
    expect(projected.y).toBeCloseTo(component * ARENA_DEPTH_SCALE, 8);
    expect(Math.hypot(projected.x, projected.y)).toBeLessThan(1);
  });

  it("includes the visible cliff front in camera bounds", () => {
    const projection = createArenaProjection(1280, 720);
    const size = getProjectedArenaSize(25, 20, projection);
    const topSurfaceHeight = 19 * projection.depthPitch + projection.tileDepth;

    expect(size.width).toBeGreaterThan(1280);
    expect(size.height).toBeCloseTo(topSurfaceHeight + projection.cliffDepth, 8);
  });
});
