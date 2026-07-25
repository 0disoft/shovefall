import { InputState, isGameplayCode, isMovementCode } from "./input-state";

export interface KeyboardInput {
  readonly state: InputState;
  destroy(): void;
}

export interface KeyboardInputActivity {
  isCommandActive(): boolean;
  isMovementWarmupActive(): boolean;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function createKeyboardInput(activity: KeyboardInputActivity): KeyboardInput {
  const state = new InputState();

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!isGameplayCode(event.code) || isInteractiveTarget(event.target)) {
      return;
    }

    const commandActive = activity.isCommandActive();
    const movementWarmupActive = activity.isMovementWarmupActive() && isMovementCode(event.code);

    if (!commandActive && !movementWarmupActive) {
      return;
    }

    event.preventDefault();
    state.press(event.code, event.repeat);
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    if (!isGameplayCode(event.code)) {
      return;
    }

    state.release(event.code);
  };

  const clear = (): void => state.clear();

  window.addEventListener("keydown", handleKeyDown, { passive: false });
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", clear);

  return Object.freeze({
    state,
    destroy(): void {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
      state.clear();
    },
  });
}
