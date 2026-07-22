import { BotDirector } from "../src/ai/bot-director";
import { getArenaSize } from "../src/app/settings";
import { createNeutralCommand, normalizeGameConfig } from "../src/simulation/contracts";
import { SimulationWorld } from "../src/simulation/world";

const SURVIVAL_TICKS = 300;
const MAXIMUM_CANDIDATES = 256;
const PARTICIPANT_COUNTS = [12, 24, 32] as const;

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
    }),
    seed,
    { humanActorId: 1 },
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

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      kind: "deterministic-browser-profile-fixture-selection",
      maximumCandidates: MAXIMUM_CANDIDATES,
      seeds,
      warning:
        "These seeds define active-load measurement fixtures and are not evidence of typical round duration.",
    },
    null,
    2,
  )}\n`,
);
