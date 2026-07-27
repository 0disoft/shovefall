import { describe, expect, it } from "vitest";
import { removeTerrainWaterPixels } from "../src/presentation/arena-assets";

describe("terrain coast asset processing", () => {
  it("removes blue water while preserving grass, sand, and white foam", () => {
    const pixels = new Uint8ClampedArray([
      18, 104, 132, 255, 62, 151, 172, 255, 80, 135, 45, 255, 210, 180, 110, 255, 235, 245, 240,
      255,
    ]);

    expect(removeTerrainWaterPixels(pixels)).toBe(2);
    expect([...pixels]).toEqual([
      18, 104, 132, 0, 62, 151, 172, 0, 80, 135, 45, 255, 210, 180, 110, 255, 235, 245, 240, 255,
    ]);
  });
});
