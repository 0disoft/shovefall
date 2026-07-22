import { describe, expect, it } from "vitest";
import { deriveSeed, RandomStreamSet, XorShift32 } from "../src/simulation/random";

describe("deterministic random streams", () => {
  it("matches the versioned xorshift32 vector", () => {
    const random = new XorShift32(1);

    expect(Array.from({ length: 5 }, () => random.nextUint32())).toEqual([
      270_369, 67_634_689, 2_647_435_461, 307_599_695, 2_398_689_233,
    ]);
  });

  it("derives stable named streams", () => {
    expect(deriveSeed("경기-001", "arena")).toBe(deriveSeed("경기-001", "arena"));
    expect(deriveSeed("경기-001", "arena")).not.toBe(deriveSeed("경기-001", "items"));
  });

  it("keeps stream consumption independent", () => {
    const left = new RandomStreamSet("round-seed");
    const right = new RandomStreamSet("round-seed");
    const expectedItems = Array.from({ length: 4 }, () => right.get("items").nextUint32());

    Array.from({ length: 20 }, () => left.get("collapse").nextUint32());

    expect(Array.from({ length: 4 }, () => left.get("items").nextUint32())).toEqual(expectedItems);
  });
});
