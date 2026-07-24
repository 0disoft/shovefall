import { describe, expect, it } from "vitest";
import { isIgnorableFaviconProbe, normalizeCandidateSha } from "../tools/capture-submission";

describe("submission capture candidate contract", () => {
  it("normalizes a full commit SHA", () => {
    expect(normalizeCandidateSha(" A".repeat(40).replaceAll(" ", ""))).toBe("a".repeat(40));
  });

  it("rejects abbreviated and non-hexadecimal identities", () => {
    expect(() => normalizeCandidateSha("8633101")).toThrow(/full lowercase hexadecimal/u);
    expect(() => normalizeCandidateSha("z".repeat(40))).toThrow(/full lowercase hexadecimal/u);
  });

  it("isolates only Chrome's optional favicon probe from real asset failures", () => {
    const missing =
      "Failed to load resource: the server responded with a status of 404 (Not Found)";
    expect(isIgnorableFaviconProbe(missing, "http://127.0.0.1:4176/favicon.ico")).toBe(true);
    expect(isIgnorableFaviconProbe(missing, "http://127.0.0.1:4176/assets/game.js")).toBe(false);
    expect(isIgnorableFaviconProbe("net::ERR_CONNECTION_RESET", "http://x/favicon.ico")).toBe(
      false,
    );
  });
});
