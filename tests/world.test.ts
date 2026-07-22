import { describe, expect, it } from "vitest";
import {
  createNeutralCommand,
  normalizeActorCommand,
  normalizeGameConfig,
} from "../src/simulation/contracts";
import { SimulationContractError } from "../src/simulation/math";
import { SimulationWorld } from "../src/simulation/world";

describe("simulation world contracts", () => {
  it("rejects invalid participant counts", () => {
    expect(() => normalizeGameConfig({ participantCount: 0 })).toThrow(SimulationContractError);
    expect(() => normalizeGameConfig({ participantCount: 33 })).toThrow(SimulationContractError);
  });

  it("normalizes movement without changing valid directions", () => {
    const command = normalizeActorCommand({
      ...createNeutralCommand(0, 1),
      move: { x: 3, y: 4 },
    });

    expect(command.move.x).toBeCloseTo(0.6);
    expect(command.move.y).toBeCloseTo(0.8);
  });

  it("rejects duplicate actor commands for one tick", () => {
    const world = new SimulationWorld(normalizeGameConfig({ participantCount: 4 }), 42);
    const command = createNeutralCommand(0, 1);

    expect(() => world.step([command, command])).toThrow(SimulationContractError);
  });

  it("fills missing commands with neutral input deterministically", () => {
    const config = normalizeGameConfig({ participantCount: 4 });
    const left = new SimulationWorld(config, "same-seed");
    const right = new SimulationWorld(config, "same-seed");

    expect(left.step().frame.stateHash).toBe(right.step([]).frame.stateHash);
  });

  it("does not depend on command array order", () => {
    const config = normalizeGameConfig({ participantCount: 4 });
    const left = new SimulationWorld(config, "command-order");
    const right = new SimulationWorld(config, "command-order");
    const first = { ...createNeutralCommand(0, 1), move: { x: 1, y: 0 } };
    const second = { ...createNeutralCommand(0, 2), move: { x: 0, y: 1 } };

    expect(left.step([first, second]).frame.stateHash).toBe(
      right.step([second, first]).frame.stateHash,
    );
  });

  it("produces the same state hash across one hundred runs", () => {
    const config = normalizeGameConfig({ participantCount: 12 });
    const hashes = Array.from({ length: 100 }, () => {
      const world = new SimulationWorld(config, "repeat-100");

      for (let tick = 0; tick < 120; tick += 1) {
        world.step([
          {
            ...createNeutralCommand(tick, 1),
            move: { x: tick % 2 === 0 ? 1 : 0, y: tick % 2 === 0 ? 0 : 1 },
          },
        ]);
      }

      return world.createRenderFrame().stateHash;
    });

    expect(new Set(hashes)).toHaveLength(1);
  });
});
