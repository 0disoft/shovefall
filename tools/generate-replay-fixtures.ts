import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createNeutralCommand,
  normalizeGameConfig,
  type ActorCommandV1,
} from "../src/simulation/contracts";
import { createReplayFixture } from "../src/simulation/replay";

interface FixtureDefinition {
  readonly name: string;
  readonly participantCount: number;
  readonly seed: string;
  readonly endTick: number;
  readonly commands: readonly ActorCommandV1[];
  readonly checkpoints: readonly number[];
  readonly humanSetup?: {
    readonly baseMassFactor: number;
    readonly startingItems: readonly ["wind-blast", "iron-boots"];
  };
}

function movementCommand(tick: number, x: number, y: number): ActorCommandV1 {
  return {
    ...createNeutralCommand(tick, 1),
    move: { x, y },
  };
}

const definitions: readonly FixtureDefinition[] = [
  {
    name: "idle-four",
    participantCount: 4,
    seed: "idle-four-v1",
    endTick: 180,
    commands: [],
    checkpoints: [60, 120, 180],
  },
  {
    name: "cardinal-four",
    participantCount: 4,
    seed: "cardinal-four-v1",
    endTick: 180,
    commands: [
      { ...movementCommand(0, 1, 0), useItemSlot: 0 },
      movementCommand(30, 0, 1),
      movementCommand(60, -1, 0),
      movementCommand(90, 0, -1),
    ],
    checkpoints: [30, 60, 90, 120, 180],
    humanSetup: {
      baseMassFactor: 1,
      startingItems: ["wind-blast", "iron-boots"],
    },
  },
  {
    name: "diagonal-twelve",
    participantCount: 12,
    seed: "diagonal-twelve-v1",
    endTick: 240,
    commands: [
      movementCommand(0, 1, 1),
      movementCommand(40, -1, 1),
      movementCommand(80, -1, -1),
      movementCommand(120, 1, -1),
      movementCommand(160, 1, 0),
    ],
    checkpoints: [60, 120, 180, 240],
  },
];

const outputDirectory = join(process.cwd(), "tests", "fixtures", "replay");
await mkdir(outputDirectory, { recursive: true });

await Promise.all(
  definitions.map(async (definition) => {
    const fixture = createReplayFixture({
      buildId: "fixture-v4",
      config: normalizeGameConfig({
        participantCount: definition.participantCount,
        roundLimitSeconds: 10,
      }),
      masterSeed: definition.seed,
      humanActorId: 1,
      ...(definition.humanSetup === undefined ? {} : { humanSetup: definition.humanSetup }),
      endTick: definition.endTick,
      commands: definition.commands,
      checkpointTicks: definition.checkpoints,
    });
    const path = join(outputDirectory, `${definition.name}.json`);
    await writeFile(path, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  }),
);

process.stdout.write(
  `${JSON.stringify({ ok: true, fixtures: definitions.map(({ name }) => name) })}\n`,
);
