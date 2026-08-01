import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const FAVICON_PATH = resolve(REPOSITORY_ROOT, "src/assets/generated/favicon.png");
const INDEX_PATH = resolve(REPOSITORY_ROOT, "index.html");

describe("favicon", () => {
  it("ships a square PNG floor tile through the document head", async () => {
    const [favicon, index] = await Promise.all([
      readFile(FAVICON_PATH),
      readFile(INDEX_PATH, "utf8"),
    ]);

    expect(favicon.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(favicon.readUInt32BE(16)).toBe(256);
    expect(favicon.readUInt32BE(20)).toBe(256);
    expect(index).toContain(
      '<link rel="icon" type="image/png" sizes="256x256" href="./src/assets/generated/favicon.png" />',
    );
  });
});
