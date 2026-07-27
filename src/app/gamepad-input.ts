import type { InputState } from "./input-state";

export interface GamepadMovementVector {
  readonly x: number;
  readonly y: number;
}

export interface GamepadInput {
  clear(state: InputState): void;
  sample(state: InputState, actions?: GamepadActions): void;
}

export interface GamepadActions {
  readonly isTargeting?: () => boolean;
  readonly onTargetingMoved?: (x: number, y: number) => void;
  readonly onGrappleRequested?: () => void;
  readonly onSkillRequested: (slotIndex: 0 | 1) => void;
  readonly onItemRequested: (slotIndex: 0) => void;
}

export interface GamepadSnapshot {
  readonly connected: boolean;
  readonly axes: readonly number[];
  readonly buttons: readonly GamepadButton[];
}

export type GamepadSource = () => readonly (GamepadSnapshot | null)[];

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

export function createGamepadInput(
  source: GamepadSource = () => navigator.getGamepads(),
): GamepadInput {
  let firstSkillHeld = false;
  let secondSkillHeld = false;
  let grappleHeld = false;
  let firstItemHeld = false;

  const clear = (state: InputState): void => {
    firstSkillHeld = false;
    secondSkillHeld = false;
    grappleHeld = false;
    firstItemHeld = false;
    state.setGamepadMovement(0, 0);
  };

  return Object.freeze({
    clear,
    sample(state: InputState, actions?: GamepadActions): void {
      const gamepads = source();
      const gamepad = [...gamepads].find((candidate) => candidate?.connected === true);

      if (gamepad === undefined || gamepad === null) {
        clear(state);
        return;
      }

      const movement = getGamepadMovementVector(gamepad.axes, gamepad.buttons);
      const firstSkillPressed = readButton(gamepad.buttons, 0);
      const secondSkillPressed = readButton(gamepad.buttons, 1);
      const grapplePressed = readButton(gamepad.buttons, 2);
      const firstItemPressed = readButton(gamepad.buttons, 4);
      if (actions?.isTargeting?.() === true) {
        state.setGamepadMovement(0, 0);
        if (movement.x !== 0 || movement.y !== 0) {
          actions.onTargetingMoved?.(movement.x, movement.y);
        }
      } else {
        state.setGamepadMovement(movement.x, movement.y);
      }

      if (firstSkillPressed && !firstSkillHeld) {
        actions?.onSkillRequested(0);
      }
      if (secondSkillPressed && !secondSkillHeld) {
        actions?.onSkillRequested(1);
      }
      if (grapplePressed && !grappleHeld) {
        actions?.onGrappleRequested?.();
      }
      if (firstItemPressed && !firstItemHeld) {
        actions?.onItemRequested(0);
      }

      firstSkillHeld = firstSkillPressed;
      secondSkillHeld = secondSkillPressed;
      grappleHeld = grapplePressed;
      firstItemHeld = firstItemPressed;
    },
  });
}
