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

    expect(() => parseReplayFixtureJson(JSON.stringify({ ...fixture, formatVersion: 3 }))).toThrow(
      /unsupported replay format major/u,
    );
    expect(() => parseReplayFixtureJson(JSON.stringify({ ...fixture, formatVersion: 1 }))).toThrow(
      /unsupported replay format major/u,
    );
  });

  it("round-trips the human mass, loadout, and active-item command", () => {
    const fixture = createReplayFixture({
      buildId: "active-item-replay",
      config: normalizeGameConfig({ participantCount: 4, roundLimitSeconds: 10 }),
      masterSeed: "active-item-replay",
      humanActorId: 1,
      humanSetup: {
        baseMassFactor: 1.25,
        startingItems: ["wind-blast", "iron-boots"],
      },
      endTick: 30,
      commands: [{ ...createNeutralCommand(0, 1), useItemSlot: 0 }],
      checkpointTicks: [1, 30],
    });
    const parsed = parseReplayFixtureJson(JSON.stringify(fixture));

    expect(parsed.humanSetup).toEqual({
      baseMassFactor: 1.25,
      startingItems: ["wind-blast", "iron-boots"],
    });
    expect(parsed.commands[0]?.useItemSlot).toBe(0);
    expect(runReplayFixture(parsed).finalHash).toBe(fixture.finalHash);
  });

  it("rejects malformed active-item slots and human setup", () => {
    const fixture = createFixture();
    const commands = [{ ...createNeutralCommand(0, 1), useItemSlot: 2 }];

    expect(() => parseReplayFixtureJson(JSON.stringify({ ...fixture, commands }))).toThrow(
      /useItemSlot/u,
    );
    expect(() =>
      parseReplayFixtureJson(
        JSON.stringify({
          ...fixture,
          humanSetup: { baseMassFactor: 1, startingItems: ["wind-blast", "wind-blast"] },
        }),
      ),
    ).toThrow(/unique items/u);
  });

  it("accepts bounded bot difficulty and rejects unknown values", () => {
    const fixture = createFixture();
    const hard = parseReplayFixtureJson(
      JSON.stringify({ ...fixture, config: { ...fixture.config, difficulty: "hard" } }),
    );

    expect(hard.config.difficulty).toBe("hard");
    expect(() =>
      parseReplayFixtureJson(
        JSON.stringify({ ...fixture, config: { ...fixture.config, difficulty: "impossible" } }),
      ),
    ).toThrow(/difficulty is unsupported/u);
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
