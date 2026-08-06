import { readFile } from "node:fs/promises";
import { parseReplayFixtureJson } from "../src/simulation/replay";
import { SimulationWorld } from "../src/simulation/world";

const fixture = parseReplayFixtureJson(
  await readFile("tests/fixtures/replay/seventy-battle-items.json", "utf8"),
);

for (let index = 0; index < 3; index += 1) {
  const started = performance.now();
  const world = new SimulationWorld(fixture.config, fixture.masterSeed, {
    humanActorId: fixture.humanActorId,
    participantOverrides: fixture.humanSetup
      ? [
          {
            actorId: fixture.humanActorId,
            startingAttributes: fixture.humanSetup.startingAttributes,
            startingItems: fixture.humanSetup.startingItems,
            startingSkills: fixture.humanSetup.startingSkills,
          },
        ]
      : [],
  });
  const elapsed = performance.now() - started;
  console.log(`construction ${index}: ${elapsed.toFixed(1)} ms (tick ${world.tick})`);
}
