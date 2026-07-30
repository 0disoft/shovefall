import { InputState, isGameplayCode, isMovementCode, type MovementCode } from "./input-state";

export interface KeyboardInput {
  readonly state: InputState;
  destroy(): void;
}

export interface KeyboardInputActivity {
  isCommandActive(): boolean;
  isMovementWarmupActive(): boolean;
  isTargetApproachPending(): boolean;
  isTargeting(): boolean;
  onGrappleRequested(): void;
  onSkillRequested(slotIndex: 0 | 1): void;
  onItemRequested(slotIndex: 0): void;
  onTargetingCanceled(): void;
  onTargetingConfirmed(): void;
  onTargetingMoved(x: number, y: number): void;
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
  const heldMovementCodes = new Set<MovementCode>();

  const getHeldTargetingDirection = (): Readonly<{ x: number; y: number }> =>
    Object.freeze({
      x: Number(heldMovementCodes.has("ArrowRight")) - Number(heldMovementCodes.has("ArrowLeft")),
      y: Number(heldMovementCodes.has("ArrowDown")) - Number(heldMovementCodes.has("ArrowUp")),
    });

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === "Escape" && !isInteractiveTarget(event.target)) {
      event.preventDefault();
      activity.onTargetingCanceled();
      return;
    }

    if (event.code === "Enter" && !isInteractiveTarget(event.target) && activity.isTargeting()) {
      event.preventDefault();
      activity.onTargetingConfirmed();
      return;
    }

    if (!isGameplayCode(event.code) || isInteractiveTarget(event.target)) {
      return;
    }

    const commandActive = activity.isCommandActive();
    const movementWarmupActive = activity.isMovementWarmupActive() && isMovementCode(event.code);

    if (!commandActive && !movementWarmupActive) {
      return;
    }

    event.preventDefault();
    if (isMovementCode(event.code)) {
      heldMovementCodes.add(event.code);
      if (activity.isTargeting()) {
        state.press(event.code, event.repeat);
        state.clearTransientMovement();
        const direction = getHeldTargetingDirection();
        activity.onTargetingMoved(direction.x, direction.y);
        return;
      }
      if (activity.isTargetApproachPending()) {
        activity.onTargetingCanceled();
      }
      state.press(event.code, event.repeat);
      return;
    }
    if (!event.repeat && event.code === "KeyE") {
      activity.onGrappleRequested();
      return;
    }
    if (!event.repeat && event.code === "KeyQ") {
      activity.onSkillRequested(0);
      return;
    }
    if (!event.repeat && event.code === "KeyW") {
      activity.onSkillRequested(1);
      return;
    }
    if (!event.repeat && event.code === "KeyD") {
      activity.onItemRequested(0);
      return;
    }
    state.press(event.code, event.repeat);
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    if (!isGameplayCode(event.code)) {
      return;
    }

    if (isMovementCode(event.code)) {
      heldMovementCodes.delete(event.code);
      if (activity.isTargeting()) {
        const direction = getHeldTargetingDirection();
        if (direction.x !== 0 || direction.y !== 0) {
          activity.onTargetingMoved(direction.x, direction.y);
        }
      }
    }
    state.release(event.code);
  };

  const clear = (): void => {
    heldMovementCodes.clear();
    state.clear();
  };

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
