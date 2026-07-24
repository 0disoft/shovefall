import { describe, expect, it } from "vitest";
import { normalizeCandidateSha } from "../tools/capture-submission";

describe("submission capture candidate contract", () => {
  it("normalizes a full commit SHA", () => {
    expect(normalizeCandidateSha(" A".repeat(40).replaceAll(" ", ""))).toBe("a".repeat(40));
  });

  it("rejects abbreviated and non-hexadecimal identities", () => {
    expect(() => normalizeCandidateSha("8633101")).toThrow(/full lowercase hexadecimal/u);
    expect(() => normalizeCandidateSha("z".repeat(40))).toThrow(/full lowercase hexadecimal/u);
  });
});
