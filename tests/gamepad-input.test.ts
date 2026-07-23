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

  it("bridges item buttons as one-shot edges with slot zero priority", () => {
    let buttons = Array.from({ length: 16 }, () => button());
    const input = new InputState();
    const adapter = createGamepadInput(() => [
      {
        connected: true,
        axes: [0, 0],
        buttons,
      },
    ]);

    buttons[2] = button(true);
    buttons[3] = button(true);
    adapter.sample(input);
    expect(input.consumeCommand(0, 1).useItemSlot).toBe(0);
    adapter.sample(input);
    expect(input.consumeCommand(1, 1).useItemSlot).toBeNull();

    buttons = Array.from({ length: 16 }, () => button());
    adapter.sample(input);
    buttons[3] = button(true);
    adapter.sample(input);
    expect(input.consumeCommand(2, 1).useItemSlot).toBe(1);
    adapter.clear(input);
    expect(input.consumeCommand(3, 1).useItemSlot).toBeNull();
  });
});
