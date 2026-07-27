import { describe, expect, it } from "vitest";
import { InputState, isGameplayCode, isMovementCode } from "../src/app/input-state";

describe("human input state", () => {
  it("tracks held movement and consumes action edges once", () => {
    const input = new InputState();
    input.press("ArrowUp");
    input.press("ArrowRight");
    input.press("KeyQ");
    input.press("KeyD");

    expect(input.consumeCommand(4, 1)).toEqual({
      commandVersion: 1,
      tick: 4,
      actorId: 1,
      move: { x: 1, y: -1 },
      grapplePressed: false,
      dodgePressed: false,
      targetPosition: null,
      useSkillSlot: null,
      useItemSlot: null,
      upgradeStat: null,
      upgradeSkillSlot: null,
    });
    expect(input.consumeCommand(5, 1)).toEqual({
      commandVersion: 1,
      tick: 5,
      actorId: 1,
      move: { x: 1, y: -1 },
      grapplePressed: false,
      dodgePressed: false,
      targetPosition: null,
      useSkillSlot: null,
      useItemSlot: null,
      upgradeStat: null,
      upgradeSkillSlot: null,
    });
  });

  it("does not queue a new edge for keyboard repeat", () => {
    const input = new InputState();
    input.press("KeyQ", true);
    expect(input.consumeCommand(0, 1).useSkillSlot).toBeNull();
  });

  it("clears held keys and queued actions on focus loss", () => {
    const input = new InputState();
    input.press("ArrowLeft");
    input.press("KeyQ");
    input.clear();

    expect(input.consumeCommand(0, 1)).toMatchObject({
      move: { x: 0, y: 0 },
      useSkillSlot: null,
    });
  });

  it("recognizes only the approved gameplay keys", () => {
    expect(isGameplayCode("KeyW")).toBe(true);
    expect(isGameplayCode("ArrowLeft")).toBe(true);
    expect(isGameplayCode("Space")).toBe(false);
    expect(isGameplayCode("KeyQ")).toBe(true);
    expect(isGameplayCode("KeyE")).toBe(true);
    expect(isGameplayCode("KeyD")).toBe(true);
    expect(isGameplayCode("KeyF")).toBe(false);
    expect(isGameplayCode("Digit1")).toBe(false);
    expect(isGameplayCode("Enter")).toBe(false);
    expect(isMovementCode("KeyW")).toBe(false);
    expect(isMovementCode("ArrowRight")).toBe(true);
    expect(isMovementCode("Space")).toBe(false);
  });

  it("maps only arrow keys to keyboard movement", () => {
    const input = new InputState();
    input.press("ArrowUp");
    input.press("ArrowRight");

    expect(input.consumeCommand(0, 1).move).toEqual({ x: 1, y: -1 });
    input.release("ArrowUp");
    input.release("ArrowRight");
    expect(input.consumeCommand(1, 1).move).toEqual({ x: 0, y: 0 });
  });

  it("clears locomotion for aiming without discarding a confirmed action", () => {
    const input = new InputState();
    input.press("ArrowRight");
    input.queueSkillSlot(0);
    input.clearMovement();

    expect(input.consumeCommand(0, 1)).toMatchObject({
      move: { x: 0, y: 0 },
      useSkillSlot: 0,
    });
  });

  it("uses bounded pointer movement while a pointer is active and clears it safely", () => {
    const input = new InputState();
    input.press("ArrowLeft");
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
    input.press("ArrowLeft");
    input.setGamepadMovement(0, 0.75);
    expect(input.consumeCommand(0, 1).move).toEqual({ x: 0, y: 0.75 });

    input.setPointerMovement(0.5, 0);
    expect(input.consumeCommand(1, 1).move).toEqual({ x: 0.5, y: 0 });

    input.setPointerMovement(0, 0);
    input.setGamepadMovement(0, 0);
    expect(input.consumeCommand(2, 1).move).toEqual({ x: -1, y: 0 });
  });

  it("queues skill buttons as one-shot edges", () => {
    const input = new InputState();
    input.queueSkillSlot(0);
    input.queueSkillSlot(1);

    expect(input.consumeCommand(0, 1).useSkillSlot).toBe(0);
    expect(input.consumeCommand(1, 1).useSkillSlot).toBeNull();
  });

  it("leaves built-in grapple confirmation to GameSession targeting", () => {
    const input = new InputState();
    input.press("KeyE");

    expect(input.consumeCommand(0, 1).grapplePressed).toBe(false);
    expect(input.consumeCommand(1, 1).grapplePressed).toBe(false);
    input.press("KeyE", true);
    expect(input.consumeCommand(2, 1).grapplePressed).toBe(false);
  });

  it("queues the single inventory slot only through an explicit confirmed action", () => {
    const input = new InputState();
    input.press("KeyD");
    expect(input.consumeCommand(0, 1).useItemSlot).toBeNull();
    expect(input.consumeCommand(1, 1).useItemSlot).toBeNull();
    input.queueItemSlot(0);
    expect(input.consumeCommand(2, 1).useItemSlot).toBe(0);
  });

  it("does not smart-cast D before targeting is confirmed", () => {
    const input = new InputState();
    input.press("KeyD");
    input.press("KeyD", true);

    expect(input.consumeCommand(0, 1).useItemSlot).toBeNull();
    expect(input.consumeCommand(1, 1).useItemSlot).toBeNull();
    input.clear();
    expect(input.consumeCommand(2, 1).useItemSlot).toBeNull();
  });

  it("leaves progression allocation to the paused skill tree", () => {
    const input = new InputState();
    input.press("KeyQ");
    expect(input.consumeCommand(0, 1).upgradeStat).toBeNull();
    expect(input.consumeCommand(1, 1).upgradeSkillSlot).toBeNull();
    expect(input.consumeCommand(1, 1).upgradeStat).toBeNull();
  });
});
