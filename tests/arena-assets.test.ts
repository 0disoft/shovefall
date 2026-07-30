import { describe, expect, it } from "vitest";
import {
  composeTerrainAutotilePixels,
  composeTerrainDiagonalAutotilePixels,
  getCharacterMotionAtlasFrame,
  getTerrainDirectFrameIndex,
  removeTerrainWaterPixels,
  TERRAIN_WATER_EAST,
  TERRAIN_WATER_NORTH,
  TERRAIN_WATER_SOUTH,
  TERRAIN_WATER_WEST,
} from "../src/presentation/arena-assets";

const createOpaquePair = (red: number): Uint8ClampedArray =>
  new Uint8ClampedArray([red, 1, 1, 255, red, 1, 1, 255]);

describe("terrain coast asset processing", () => {
  it("uses atlas art only for straight coasts and composes every corner from shared edges", () => {
    expect(getTerrainDirectFrameIndex(0)).toBe(0);
    expect(getTerrainDirectFrameIndex(TERRAIN_WATER_NORTH)).toBe(4);
    expect(getTerrainDirectFrameIndex(TERRAIN_WATER_EAST)).toBe(5);
    expect(getTerrainDirectFrameIndex(TERRAIN_WATER_SOUTH)).toBe(6);
    expect(getTerrainDirectFrameIndex(TERRAIN_WATER_WEST)).toBe(7);
    expect(getTerrainDirectFrameIndex(TERRAIN_WATER_NORTH | TERRAIN_WATER_EAST)).toBeUndefined();
    expect(getTerrainDirectFrameIndex(TERRAIN_WATER_SOUTH | TERRAIN_WATER_WEST)).toBeUndefined();
    expect(
      getTerrainDirectFrameIndex(
        TERRAIN_WATER_NORTH | TERRAIN_WATER_EAST | TERRAIN_WATER_SOUTH | TERRAIN_WATER_WEST,
      ),
    ).toBeUndefined();
  });

  it("maps all sixteen character variants onto four fixed animation rows", () => {
    expect(getCharacterMotionAtlasFrame(0, "idle")).toEqual([0, 0, 192, 192]);
    expect(getCharacterMotionAtlasFrame(3, "walk")).toEqual([576, 192, 192, 192]);
    expect(getCharacterMotionAtlasFrame(12, "cast")).toEqual([0, 384, 192, 192]);
    expect(getCharacterMotionAtlasFrame(15, "hit")).toEqual([576, 576, 192, 192]);
    expect(() => getCharacterMotionAtlasFrame(16, "idle")).toThrow(/0\.\.15/u);
  });

  it("removes blue water while preserving grass, sand, and white foam", () => {
    const pixels = new Uint8ClampedArray([
      18, 104, 132, 255, 62, 151, 172, 255, 80, 135, 45, 255, 210, 180, 110, 255, 235, 245, 240,
      255,
    ]);

    expect(removeTerrainWaterPixels(pixels)).toBe(3);
    expect([...pixels]).toEqual([
      18, 104, 132, 0, 62, 151, 172, 0, 80, 135, 45, 255, 210, 180, 110, 255, 235, 245, 240, 0,
    ]);
  });

  it("removes dark water and pale reflections that used to leave rectangular seams", () => {
    const pixels = new Uint8ClampedArray([
      30, 69, 78, 255, 122, 158, 164, 255, 72, 93, 67, 255, 202, 173, 104, 255,
    ]);

    expect(removeTerrainWaterPixels(pixels)).toBe(2);
    expect([...pixels]).toEqual([
      30, 69, 78, 0, 122, 158, 164, 0, 72, 93, 67, 255, 202, 173, 104, 255,
    ]);
  });

  it("intersects every exposed shoreline mask instead of substituting one edge", () => {
    const north = createOpaquePair(10);
    const east = createOpaquePair(20);
    const south = createOpaquePair(30);
    const west = createOpaquePair(40);
    north[3] = 0;
    east[7] = 0;

    expect([
      ...composeTerrainAutotilePixels(createOpaquePair(1), [north, east, south, west], 0, 2, 1),
    ]).toEqual([...createOpaquePair(1)]);
    expect([
      ...composeTerrainAutotilePixels(
        createOpaquePair(1),
        [north, east, south, west],
        TERRAIN_WATER_NORTH | TERRAIN_WATER_EAST,
        2,
        1,
      ),
    ]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect([
      ...composeTerrainAutotilePixels(
        createOpaquePair(1),
        [north, east, south, west],
        TERRAIN_WATER_SOUTH | TERRAIN_WATER_WEST,
        2,
        1,
      ),
    ]).toEqual([40, 1, 1, 255, 30, 1, 1, 255]);
  });

  it("cuts and paints diagonal-only water corners without a square grass shelf", () => {
    const base = new Uint8ClampedArray([1, 1, 1, 255, 1, 1, 1, 255, 1, 1, 1, 255, 1, 1, 1, 255]);
    const north = new Uint8ClampedArray([10, 1, 1, 0, 10, 1, 1, 0, 10, 1, 1, 255, 10, 1, 1, 255]);
    const east = new Uint8ClampedArray([20, 1, 1, 255, 20, 1, 1, 0, 20, 1, 1, 255, 20, 1, 1, 0]);
    const south = new Uint8ClampedArray(base);
    const west = new Uint8ClampedArray(base);

    expect([
      ...composeTerrainDiagonalAutotilePixels(base, [north, east, south, west], 1, 2, 2),
    ]).toEqual([20, 1, 1, 255, 0, 0, 0, 0, 1, 1, 1, 255, 10, 1, 1, 255]);
  });
});
