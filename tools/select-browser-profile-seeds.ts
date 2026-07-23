import { BotDirector } from "../src/ai/bot-director";
import { getArenaSize } from "../src/app/settings";
import { createNeutralCommand, normalizeGameConfig } from "../src/simulation/contracts";
import { SimulationWorld } from "../src/simulation/world";

const SURVIVAL_TICKS = 300;
const HUMAN_DEFEAT_LIMIT_TICKS = 900;
const MAXIMUM_CANDIDATES = 256;
const PARTICIPANT_COUNTS = [16, 24, 32] as const;

function candidateSeed(participantCount: number, candidate: number): string {
  return `${participantCount.toString(16).padStart(8, "0")}${candidate
    .toString(16)
    .padStart(8, "0")}`;
}

function survivesProfileWindow(participantCount: number, seed: string): boolean {
  const arenaSize = getArenaSize(participantCount);
  const world = new SimulationWorld(
    normalizeGameConfig({
      participantCount,
      arenaColumns: arenaSize.columns,
      arenaRows: arenaSize.rows,
      roundLimitSeconds: 120,
      collapseSpeed: participantCount >= 25 ? "fast" : "normal",
      itemsEnabled: true,
      itemRespawnSeconds: participantCount >= 25 ? 3 : participantCount >= 17 ? 4 : 5,
    }),
    seed,
    {
      humanActorId: 1,
      participantOverrides: [
        {
          actorId: 1,
          massFactor: 1,
          startingItems: ["iron-boots", "spring-glove"],
        },
      ],
    },
  );
  const bots = new BotDirector(seed, 1);
  let frame = world.createRenderFrame();

  while (world.tick < SURVIVAL_TICKS && frame.round.status === "Active") {
    const commands = bots.createCommands(world.tick, frame);
    frame = world.step([createNeutralCommand(world.tick, 1), ...commands]).frame;
  }

  const human = frame.participants.find(({ actorId }) => actorId === 1);
  return (
    world.tick === SURVIVAL_TICKS &&
    frame.round.status === "Active" &&
    human?.active === true &&
    human.action !== "Falling" &&
    human.action !== "Eliminated"
  );
}

function findHumanDefeatTick(seed: string): number | undefined {
  const participantCount = 8;
  const arenaSize = getArenaSize(participantCount);
  const world = new SimulationWorld(
    normalizeGameConfig({
      participantCount,
      arenaColumns: arenaSize.columns,
      arenaRows: arenaSize.rows,
      roundLimitSeconds: 75,
      collapseSpeed: "fast",
      itemsEnabled: true,
      itemRespawnSeconds: 3,
    }),
    seed,
    {
      humanActorId: 1,
      participantOverrides: [
        {
          actorId: 1,
          massFactor: 1,
          startingItems: ["iron-boots", "spring-glove"],
        },
      ],
    },
  );
  const bots = new BotDirector(seed, 1);
  let frame = world.createRenderFrame();

  while (world.tick < HUMAN_DEFEAT_LIMIT_TICKS && frame.round.status === "Active") {
    const commands = bots.createCommands(world.tick, frame);
    frame = world.step([createNeutralCommand(world.tick, 1), ...commands]).frame;
    const human = frame.participants.find(({ actorId }) => actorId === 1);
    const standingBots = frame.participants.filter(
      (participant) =>
        participant.actorId !== 1 &&
        participant.active &&
        participant.action !== "Falling" &&
        participant.action !== "Eliminated",
    ).length;

    if (
      frame.round.status === "Active" &&
      (human?.action === "Falling" || human?.action === "Eliminated") &&
      standingBots >= 2
    ) {
      return world.tick;
    }
  }

  return undefined;
}

const seeds = PARTICIPANT_COUNTS.map((participantCount) => {
  for (let candidate = 0; candidate < MAXIMUM_CANDIDATES; candidate += 1) {
    const seed = candidateSeed(participantCount, candidate);

    if (survivesProfileWindow(participantCount, seed)) {
      return Object.freeze({ participantCount, seed, candidate, survivalTicks: SURVIVAL_TICKS });
    }
  }

  throw new Error(
    `No browser profile seed kept the human active for ${SURVIVAL_TICKS} ticks at ${participantCount} participants`,
  );
});

let humanDefeatFixture:
  | Readonly<{ participantCount: 8; seed: string; candidate: number; defeatTick: number }>
  | undefined;

for (let candidate = 0; candidate < MAXIMUM_CANDIDATES; candidate += 1) {
  const seed = candidateSeed(8, candidate);
  const defeatTick = findHumanDefeatTick(seed);

  if (defeatTick !== undefined) {
    humanDefeatFixture = Object.freeze({ participantCount: 8, seed, candidate, defeatTick });
    break;
  }
}

if (humanDefeatFixture === undefined) {
  throw new Error(
    `No browser fixture eliminated the human with two bots standing within ${HUMAN_DEFEAT_LIMIT_TICKS} ticks`,
  );
}

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      kind: "deterministic-browser-profile-fixture-selection",
      maximumCandidates: MAXIMUM_CANDIDATES,
      seeds,
      humanDefeatFixture,
      warning:
        "These seeds define active-load measurement fixtures and are not evidence of typical round duration.",
    },
    null,
    2,
  )}\n`,
);
