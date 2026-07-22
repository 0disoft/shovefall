import { InputState, isGameplayCode } from "./input-state";

export interface KeyboardInput {
  readonly state: InputState;
  destroy(): void;
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

export function createKeyboardInput(isActive: () => boolean): KeyboardInput {
  const state = new InputState();

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!isActive() || !isGameplayCode(event.code) || isInteractiveTarget(event.target)) {
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
