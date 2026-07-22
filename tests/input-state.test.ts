import { describe, expect, it } from "vitest";
import { InputState, isGameplayCode } from "../src/app/input-state";

describe("human input state", () => {
  it("tracks held movement and consumes action edges once", () => {
    const input = new InputState();
    input.press("KeyW");
    input.press("KeyD");
    input.press("Space");
    input.press("ShiftLeft");

    expect(input.consumeCommand(4, 1)).toEqual({
      commandVersion: 1,
      tick: 4,
      actorId: 1,
      move: { x: 1, y: -1 },
      shovePressed: true,
      dodgePressed: true,
    });
    expect(input.consumeCommand(5, 1)).toEqual({
      commandVersion: 1,
      tick: 5,
      actorId: 1,
      move: { x: 1, y: -1 },
      shovePressed: false,
      dodgePressed: false,
    });
  });

  it("does not queue a new edge for keyboard repeat", () => {
    const input = new InputState();
    input.press("Space", true);
    expect(input.consumeCommand(0, 1).shovePressed).toBe(false);
  });

  it("clears held keys and queued actions on focus loss", () => {
    const input = new InputState();
    input.press("KeyA");
    input.press("Space");
    input.clear();

    expect(input.consumeCommand(0, 1)).toMatchObject({
      move: { x: 0, y: 0 },
      shovePressed: false,
      dodgePressed: false,
    });
  });

  it("recognizes only the approved gameplay keys", () => {
    expect(isGameplayCode("KeyW")).toBe(true);
    expect(isGameplayCode("Space")).toBe(true);
    expect(isGameplayCode("Enter")).toBe(false);
  });
});
