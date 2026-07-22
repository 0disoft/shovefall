import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createNeutralCommand, normalizeGameConfig } from "../src/simulation/contracts";
import { SimulationContractError } from "../src/simulation/math";
import {
  createReplayFixture,
  parseReplayFixtureJson,
  runReplayFixture,
} from "../src/simulation/replay";

function createFixture() {
  return createReplayFixture({
    buildId: "test-build",
    config: normalizeGameConfig({ participantCount: 4, roundLimitSeconds: 10 }),
    masterSeed: "fixture-seed",
    humanActorId: 1,
    endTick: 120,
    commands: [
      { ...createNeutralCommand(0, 1), move: { x: 1, y: 0 } },
      { ...createNeutralCommand(30, 1), move: { x: 0, y: 1 } },
      { ...createNeutralCommand(60, 1), move: { x: -1, y: 0 } },
    ],
    checkpointTicks: [30, 60, 120],
  });
}

describe("replay fixture contract", () => {
  it("replays every checked-in fixture to its recorded hash", async () => {
    const fixtureDirectory = join(process.cwd(), "tests", "fixtures", "replay");
    const fixtureFiles = (await readdir(fixtureDirectory))
      .filter((file) => file.endsWith(".json"))
      .toSorted();

    expect(fixtureFiles).toHaveLength(3);

    const fixtures = await Promise.all(
      fixtureFiles.map(async (fixtureFile) =>
        parseReplayFixtureJson(await readFile(join(fixtureDirectory, fixtureFile), "utf8")),
      ),
    );

    for (const fixture of fixtures) {
      expect(runReplayFixture(fixture).finalHash).toBe(fixture.finalHash);
    }
  });

  it("round-trips and verifies every checkpoint", () => {
    const fixture = createFixture();
    const parsed = parseReplayFixtureJson(JSON.stringify(fixture));

    expect(runReplayFixture(parsed)).toEqual({
      checkpoints: fixture.checkpoints,
      finalHash: fixture.finalHash,
    });
  });

  it("rejects unknown format majors", () => {
    const fixture = createFixture();

    expect(() => parseReplayFixtureJson(JSON.stringify({ ...fixture, formatVersion: 2 }))).toThrow(
      /unsupported replay format major/u,
    );
  });

  it("rejects commands that are not strictly ordered", () => {
    const fixture = createFixture();
    const commands = fixture.commands.toReversed();

    expect(() => parseReplayFixtureJson(JSON.stringify({ ...fixture, commands }))).toThrow(
      /strictly increasing/u,
    );
  });

  it("rejects corrupted hashes", () => {
    const fixture = createFixture();
    const corrupted = parseReplayFixtureJson(
      JSON.stringify({ ...fixture, finalHash: "fnv1a32:00000000" }),
    );

    expect(() => runReplayFixture(corrupted)).toThrow(SimulationContractError);
  });

  it("rejects non-finite command vectors encoded as null", () => {
    const fixture = createFixture();
    const commands = fixture.commands.map((command, index) =>
      index === 0 ? { ...command, move: { x: null, y: 0 } } : command,
    );

    expect(() => parseReplayFixtureJson(JSON.stringify({ ...fixture, commands }))).toThrow(
      /finite/u,
    );
  });

  it("rejects non-boolean action flags instead of treating them as false", () => {
    const fixture = createFixture();
    const commands = fixture.commands.map((command, index) =>
      index === 0 ? { ...command, shovePressed: "false" } : command,
    );

    expect(() => parseReplayFixtureJson(JSON.stringify({ ...fixture, commands }))).toThrow(
      /boolean/u,
    );
  });
});
