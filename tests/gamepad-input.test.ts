import { describe, expect, it } from "vitest";
import { createGamepadInput, getGamepadMovementVector } from "../src/app/gamepad-input";
import { InputState } from "../src/app/input-state";

function button(pressed = false): GamepadButton {
  return { pressed, touched: pressed, value: pressed ? 1 : 0 };
}

describe("gamepad movement", () => {
  it("filters stick drift inside the dead zone", () => {
    expect(getGamepadMovementVector([0.1, -0.1], [])).toEqual({ x: 0, y: 0 });
  });

  it("normalizes a full diagonal stick without exceeding one", () => {
    const movement = getGamepadMovementVector([1, 1], []);

    expect(Math.hypot(movement.x, movement.y)).toBeCloseTo(1);
    expect(movement.x).toBeCloseTo(Math.SQRT1_2);
    expect(movement.y).toBeCloseTo(Math.SQRT1_2);
  });

  it("gives the digital d-pad priority over stick drift", () => {
    const buttons = Array.from({ length: 16 }, () => button());
    buttons[12] = button(true);
    buttons[15] = button(true);

    const movement = getGamepadMovementVector([-0.4, 0.4], buttons);
    expect(movement.x).toBeCloseTo(Math.SQRT1_2);
    expect(movement.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it("bridges two skill buttons, built-in grapple, and one bumper item as targeting requests", () => {
    let buttons = Array.from({ length: 16 }, () => button());
    const input = new InputState();
    const adapter = createGamepadInput(() => [
      {
        connected: true,
        axes: [0, 0],
        buttons,
      },
    ]);
    const skillRequests: number[] = [];
    const itemRequests: number[] = [];
    let grappleRequests = 0;
    const actions = {
      onGrappleRequested: () => {
        grappleRequests += 1;
      },
      onSkillRequested: (slotIndex: 0 | 1) => skillRequests.push(slotIndex),
      onItemRequested: (slotIndex: 0) => itemRequests.push(slotIndex),
    };

    buttons[0] = button(true);
    buttons[1] = button(true);
    adapter.sample(input, actions);
    expect(skillRequests).toEqual([0, 1]);
    adapter.sample(input, actions);
    expect(skillRequests).toEqual([0, 1]);

    buttons = Array.from({ length: 16 }, () => button());
    adapter.sample(input, actions);
    buttons[2] = button(true);
    adapter.sample(input, actions);
    expect(grappleRequests).toBe(1);
    adapter.sample(input, actions);
    expect(grappleRequests).toBe(1);
    expect(skillRequests).toEqual([0, 1]);
    buttons = Array.from({ length: 16 }, () => button());
    adapter.sample(input, actions);
    buttons[4] = button(true);
    buttons[5] = button(true);
    adapter.sample(input, actions);
    expect(itemRequests).toEqual([0]);
    adapter.clear(input);
    expect(input.consumeCommand(0, 1).useItemSlot).toBeNull();
  });

  it("rate-limits held-stick aim independently from fixed-step catch-up", () => {
    const input = new InputState();
    const adapter = createGamepadInput(() => [
      {
        connected: true,
        axes: [1, 0],
        buttons: [],
      },
    ]);
    const aimMoves: Array<readonly [number, number]> = [];
    const actions = {
      isTargeting: () => true,
      onTargetingMoved: (x: number, y: number) => aimMoves.push([x, y]),
      onSkillRequested: () => {},
      onItemRequested: () => {},
    };

    adapter.sample(input, actions, 0);
    adapter.sample(input, actions, 16);
    adapter.sample(input, actions, 279);
    expect(aimMoves).toHaveLength(1);

    adapter.sample(input, actions, 280);
    adapter.sample(input, actions, 399);
    expect(aimMoves).toHaveLength(2);

    adapter.sample(input, actions, 400);
    expect(aimMoves).toHaveLength(3);
  });
});
