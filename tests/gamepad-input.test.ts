import { describe, expect, it } from "vitest";
import { getGamepadMovementVector } from "../src/app/gamepad-input";

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
});
