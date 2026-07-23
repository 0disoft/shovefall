export interface PointerMovementVector {
  readonly x: number;
  readonly y: number;
}

export interface PointerControls {
  destroy(): void;
}

export interface PointerControlsOptions {
  readonly arena: HTMLElement;
  readonly joystick: HTMLElement;
  readonly joystickKnob: HTMLElement;
  readonly shoveButton: HTMLButtonElement;
  readonly dodgeButton: HTMLButtonElement;
  readonly isActive: () => boolean;
  readonly onMove: (x: number, y: number) => void;
  readonly onShove: () => void;
  readonly onDodge: () => void;
}

interface ActivePointer {
  readonly id: number;
  readonly owner: HTMLElement;
  readonly originX: number;
  readonly originY: number;
  readonly radius: number;
}

const DEFAULT_DRAG_RADIUS = 64;
const DEAD_ZONE_RATIO = 0.12;

export function getPointerMovementVector(
  originX: number,
  originY: number,
  clientX: number,
  clientY: number,
  radius: number,
): PointerMovementVector {
  const safeRadius = Math.max(1, radius);
  const deltaX = clientX - originX;
  const deltaY = clientY - originY;
  const distance = Math.hypot(deltaX, deltaY);

  if (!Number.isFinite(distance) || distance <= safeRadius * DEAD_ZONE_RATIO) {
    return Object.freeze({ x: 0, y: 0 });
  }

  const scale = Math.min(1, distance / safeRadius) / distance;
  return Object.freeze({ x: deltaX * scale, y: deltaY * scale });
}

export function createPointerControls(options: PointerControlsOptions): PointerControls {
  let activePointer: ActivePointer | undefined;

  const setKnobPosition = (vector: PointerMovementVector): void => {
    options.joystickKnob.style.setProperty("--joystick-x", `${vector.x * 38}px`);
    options.joystickKnob.style.setProperty("--joystick-y", `${vector.y * 38}px`);
  };

  const resetMovement = (): void => {
    activePointer = undefined;
    options.onMove(0, 0);
    setKnobPosition({ x: 0, y: 0 });
    options.joystick.removeAttribute("data-active");
    options.arena.removeAttribute("data-pointer-moving");
  };

  const beginPointer = (
    event: PointerEvent,
    owner: HTMLElement,
    originX: number,
    originY: number,
    radius: number,
  ): void => {
    if (!options.isActive() || activePointer !== undefined || event.button !== 0) {
      return;
    }

    event.preventDefault();
    activePointer = { id: event.pointerId, owner, originX, originY, radius };
    owner.setPointerCapture(event.pointerId);
    const vector = getPointerMovementVector(originX, originY, event.clientX, event.clientY, radius);
    options.onMove(vector.x, vector.y);

    if (owner === options.joystick) {
      options.joystick.dataset.active = "true";
      setKnobPosition(vector);
    } else {
      options.arena.dataset.pointerMoving = "true";
    }
  };

  const handleArenaPointerDown = (event: PointerEvent): void => {
    beginPointer(event, options.arena, event.clientX, event.clientY, DEFAULT_DRAG_RADIUS);
  };

  const handleJoystickPointerDown = (event: PointerEvent): void => {
    const bounds = options.joystick.getBoundingClientRect();
    beginPointer(
      event,
      options.joystick,
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
      Math.max(1, Math.min(bounds.width, bounds.height) / 2),
    );
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (activePointer?.id !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const vector = getPointerMovementVector(
      activePointer.originX,
      activePointer.originY,
      event.clientX,
      event.clientY,
      activePointer.radius,
    );
    options.onMove(vector.x, vector.y);

    if (activePointer.owner === options.joystick) {
      setKnobPosition(vector);
    }
  };

  const endPointer = (event: PointerEvent): void => {
    if (activePointer?.id !== event.pointerId) {
      return;
    }

    if (activePointer.owner.hasPointerCapture(event.pointerId)) {
      activePointer.owner.releasePointerCapture(event.pointerId);
    }
    resetMovement();
  };

  const queueAction = (event: PointerEvent, action: () => void): void => {
    if (!options.isActive() || event.button !== 0) {
      return;
    }

    event.preventDefault();
    action();
  };

  const handleShove = (event: PointerEvent): void => queueAction(event, options.onShove);
  const handleDodge = (event: PointerEvent): void => queueAction(event, options.onDodge);
  const handleWindowBlur = (): void => resetMovement();
  const handleVisibilityChange = (): void => {
    if (document.visibilityState !== "visible") {
      resetMovement();
    }
  };

  options.arena.addEventListener("pointerdown", handleArenaPointerDown);
  options.joystick.addEventListener("pointerdown", handleJoystickPointerDown);
  window.addEventListener("pointermove", handlePointerMove, { passive: false });
  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);
  options.shoveButton.addEventListener("pointerdown", handleShove);
  options.dodgeButton.addEventListener("pointerdown", handleDodge);
  window.addEventListener("blur", handleWindowBlur);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return Object.freeze({
    destroy(): void {
      options.arena.removeEventListener("pointerdown", handleArenaPointerDown);
      options.joystick.removeEventListener("pointerdown", handleJoystickPointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endPointer);
      window.removeEventListener("pointercancel", endPointer);
      options.shoveButton.removeEventListener("pointerdown", handleShove);
      options.dodgeButton.removeEventListener("pointerdown", handleDodge);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resetMovement();
    },
  });
}
