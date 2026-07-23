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
      upgradeStat: null,
    });
    expect(input.consumeCommand(5, 1)).toEqual({
      commandVersion: 1,
      tick: 5,
      actorId: 1,
      move: { x: 1, y: -1 },
      shovePressed: false,
      dodgePressed: false,
      upgradeStat: null,
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
    expect(isGameplayCode("ArrowLeft")).toBe(true);
    expect(isGameplayCode("Space")).toBe(true);
    expect(isGameplayCode("Digit1")).toBe(true);
    expect(isGameplayCode("Enter")).toBe(false);
  });

  it("maps arrow keys to the same movement contract as WASD", () => {
    const input = new InputState();
    input.press("ArrowUp");
    input.press("ArrowRight");

    expect(input.consumeCommand(0, 1).move).toEqual({ x: 1, y: -1 });
    input.release("ArrowUp");
    input.release("ArrowRight");
    expect(input.consumeCommand(1, 1).move).toEqual({ x: 0, y: 0 });
  });

  it("uses bounded pointer movement while a pointer is active and clears it safely", () => {
    const input = new InputState();
    input.press("KeyA");
    input.setPointerMovement(2, 0.5);

    expect(input.consumeCommand(0, 1).move).toEqual({ x: 1, y: 0.5 });
    input.setPointerMovement(0, 0);
    expect(input.consumeCommand(1, 1).move).toEqual({ x: -1, y: 0 });
    input.setPointerMovement(Number.NaN, Number.POSITIVE_INFINITY);
    expect(input.consumeCommand(2, 1).move).toEqual({ x: -1, y: 0 });
    input.clear();
    expect(input.consumeCommand(3, 1).move).toEqual({ x: 0, y: 0 });
  });

  it("prioritizes active pointer, gamepad, then keyboard movement", () => {
    const input = new InputState();
    input.press("KeyA");
    input.setGamepadMovement(0, 0.75);
    expect(input.consumeCommand(0, 1).move).toEqual({ x: 0, y: 0.75 });

    input.setPointerMovement(0.5, 0);
    expect(input.consumeCommand(1, 1).move).toEqual({ x: 0.5, y: 0 });

    input.setPointerMovement(0, 0);
    input.setGamepadMovement(0, 0);
    expect(input.consumeCommand(2, 1).move).toEqual({ x: -1, y: 0 });
  });

  it("queues pointer action buttons as one-shot edges", () => {
    const input = new InputState();
    input.queueShove();
    input.queueDodge();

    expect(input.consumeCommand(0, 1)).toMatchObject({
      shovePressed: true,
      dodgePressed: true,
    });
    expect(input.consumeCommand(1, 1)).toMatchObject({
      shovePressed: false,
      dodgePressed: false,
    });
  });

  it("queues one stat upgrade from number keys or the UI bridge", () => {
    const input = new InputState();
    input.press("Digit3");
    expect(input.consumeCommand(0, 1).upgradeStat).toBe("mobility");
    expect(input.consumeCommand(1, 1).upgradeStat).toBeNull();
    input.queueUpgrade("stability");
    expect(input.consumeCommand(2, 1).upgradeStat).toBe("stability");
  });
});
