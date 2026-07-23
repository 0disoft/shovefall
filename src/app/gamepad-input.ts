import type { InputState } from "./input-state";

export interface GamepadMovementVector {
  readonly x: number;
  readonly y: number;
}

export interface GamepadInput {
  clear(state: InputState): void;
  sample(state: InputState): void;
}

const AXIS_DEAD_ZONE = 0.18;

function readButton(buttons: readonly GamepadButton[], index: number): boolean {
  return buttons[index]?.pressed === true || (buttons[index]?.value ?? 0) > 0.5;
}

export function getGamepadMovementVector(
  axes: readonly number[],
  buttons: readonly GamepadButton[],
): GamepadMovementVector {
  const horizontalButtons = Number(readButton(buttons, 15)) - Number(readButton(buttons, 14));
  const verticalButtons = Number(readButton(buttons, 13)) - Number(readButton(buttons, 12));
  const rawX = horizontalButtons === 0 ? (axes[0] ?? 0) : horizontalButtons;
  const rawY = verticalButtons === 0 ? (axes[1] ?? 0) : verticalButtons;
  const safeX = Number.isFinite(rawX) ? rawX : 0;
  const safeY = Number.isFinite(rawY) ? rawY : 0;
  const magnitude = Math.hypot(safeX, safeY);

  if (magnitude <= AXIS_DEAD_ZONE) {
    return Object.freeze({ x: 0, y: 0 });
  }

  const normalizedMagnitude = Math.min(1, (magnitude - AXIS_DEAD_ZONE) / (1 - AXIS_DEAD_ZONE));
  const scale = normalizedMagnitude / magnitude;
  return Object.freeze({ x: safeX * scale, y: safeY * scale });
}

export function createGamepadInput(): GamepadInput {
  let shoveHeld = false;
  let dodgeHeld = false;

  const clear = (state: InputState): void => {
    shoveHeld = false;
    dodgeHeld = false;
    state.setGamepadMovement(0, 0);
  };

  return Object.freeze({
    clear,
    sample(state: InputState): void {
      const gamepads = navigator.getGamepads?.() ?? [];
      const gamepad = [...gamepads].find((candidate) => candidate?.connected === true);

      if (gamepad === undefined || gamepad === null) {
        clear(state);
        return;
      }

      const movement = getGamepadMovementVector(gamepad.axes, gamepad.buttons);
      const shovePressed = readButton(gamepad.buttons, 0);
      const dodgePressed = readButton(gamepad.buttons, 1);
      state.setGamepadMovement(movement.x, movement.y);

      if (shovePressed && !shoveHeld) {
        state.queueShove();
      }
      if (dodgePressed && !dodgeHeld) {
        state.queueDodge();
      }

      shoveHeld = shovePressed;
      dodgeHeld = dodgePressed;
    },
  });
}
