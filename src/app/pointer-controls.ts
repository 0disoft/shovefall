export interface PointerMovementVector {
  readonly x: number;
  readonly y: number;
}

export interface PointerControls {
  destroy(): void;
  interrupt(): void;
}

export interface PointerControlsOptions {
  readonly arena: HTMLElement;
  readonly joystick: HTMLElement;
  readonly joystickKnob: HTMLElement;
  readonly grappleButton: HTMLButtonElement;
  readonly actionButtons: readonly {
    readonly button: HTMLButtonElement;
    readonly activate: () => void;
  }[];
  readonly isActive: () => boolean;
  readonly isMovementActive?: () => boolean;
  readonly isSpectating: () => boolean;
  readonly isTargetApproaching: () => boolean;
  readonly isTargeting: () => boolean;
  readonly onMove: (x: number, y: number) => void;
  readonly onMoveTo: (clientX: number, clientY: number) => void;
  readonly onSpectatorPan: (deltaX: number, deltaY: number) => void;
  readonly onGrapple: () => void;
  readonly onTargetHover: (clientX: number, clientY: number) => void;
  readonly onTargetConfirm: (clientX: number, clientY: number) => void;
  readonly onTargetCancel: () => void;
  readonly spectatorSurface?: HTMLElement;
}

interface ActivePointer {
  readonly id: number;
  readonly owner: HTMLElement;
  readonly originX: number;
  readonly originY: number;
  readonly radius: number;
  readonly mode: "movement" | "spectator";
  lastX: number;
  lastY: number;
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
    options.arena.removeAttribute("data-spectator-panning");
  };

  const beginPointer = (
    event: PointerEvent,
    owner: HTMLElement,
    originX: number,
    originY: number,
    radius: number,
  ): void => {
    if (
      !(options.isMovementActive?.() ?? options.isActive()) ||
      activePointer !== undefined ||
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();
    activePointer = {
      id: event.pointerId,
      owner,
      originX,
      originY,
      radius,
      mode: "movement",
      lastX: event.clientX,
      lastY: event.clientY,
    };
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

  const beginSpectatorPointer = (event: PointerEvent, owner: HTMLElement): void => {
    if (!options.isSpectating() || activePointer !== undefined || event.button !== 0) {
      return;
    }

    event.preventDefault();
    activePointer = {
      id: event.pointerId,
      owner,
      originX: event.clientX,
      originY: event.clientY,
      radius: 1,
      mode: "spectator",
      lastX: event.clientX,
      lastY: event.clientY,
    };
    owner.setPointerCapture(event.pointerId);
    owner.focus({ preventScroll: true });
    options.arena.dataset.spectatorPanning = "true";
  };

  const handleArenaPointerDown = (event: PointerEvent): void => {
    if (options.isSpectating()) {
      beginSpectatorPointer(event, options.arena);
      return;
    }
    if (options.isActive() && options.isTargeting() && event.button === 0) {
      event.preventDefault();
      options.onTargetConfirm(event.clientX, event.clientY);
      return;
    }
    if (event.pointerType === "mouse") {
      return;
    }
    if (options.isActive() && options.isTargetApproaching() && event.button === 0) {
      options.onTargetCancel();
    }
    beginPointer(event, options.arena, event.clientX, event.clientY, DEFAULT_DRAG_RADIUS);
  };

  const handleSpectatorSurfacePointerDown = (event: PointerEvent): void => {
    if (event.target === options.spectatorSurface) {
      beginSpectatorPointer(event, options.spectatorSurface);
    }
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
    if (
      activePointer === undefined &&
      options.isActive() &&
      options.isTargeting() &&
      event.composedPath().includes(options.arena)
    ) {
      options.onTargetHover(event.clientX, event.clientY);
    }
    if (activePointer?.id !== event.pointerId) {
      return;
    }

    event.preventDefault();
    if (activePointer.mode === "spectator") {
      const deltaX = event.clientX - activePointer.lastX;
      const deltaY = event.clientY - activePointer.lastY;
      activePointer.lastX = event.clientX;
      activePointer.lastY = event.clientY;
      options.onSpectatorPan(deltaX, deltaY);
      return;
    }
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

  const handleLostPointerCapture = (event: PointerEvent): void => {
    if (activePointer?.id === event.pointerId) {
      resetMovement();
    }
  };

  const queueAction = (event: PointerEvent, action: () => void): void => {
    if (!options.isActive() || event.button !== 0) {
      return;
    }

    event.preventDefault();
    action();
  };

  const actionHandlers = options.actionButtons.map(({ button, activate }) => {
    const handler = (event: PointerEvent): void => queueAction(event, activate);
    button.addEventListener("pointerdown", handler);
    return Object.freeze({ button, handler });
  });
  const handleGrapple = (event: PointerEvent): void => queueAction(event, options.onGrapple);
  const handleWindowBlur = (): void => resetMovement();
  const handleVisibilityChange = (): void => {
    if (document.visibilityState !== "visible") {
      resetMovement();
    }
  };
  const handleContextMenu = (event: MouseEvent): void => {
    if (!options.isActive()) {
      return;
    }
    event.preventDefault();
    if (options.isTargeting() || options.isTargetApproaching()) {
      options.onTargetCancel();
      return;
    }
    options.onMoveTo(event.clientX, event.clientY);
  };

  options.arena.addEventListener("pointerdown", handleArenaPointerDown);
  options.arena.addEventListener("lostpointercapture", handleLostPointerCapture);
  options.spectatorSurface?.addEventListener("pointerdown", handleSpectatorSurfacePointerDown);
  options.spectatorSurface?.addEventListener("lostpointercapture", handleLostPointerCapture);
  options.arena.addEventListener("contextmenu", handleContextMenu);
  options.joystick.addEventListener("pointerdown", handleJoystickPointerDown);
  options.joystick.addEventListener("lostpointercapture", handleLostPointerCapture);
  options.grappleButton.addEventListener("pointerdown", handleGrapple);
  window.addEventListener("pointermove", handlePointerMove, { passive: false });
  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);
  window.addEventListener("blur", handleWindowBlur);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return Object.freeze({
    destroy(): void {
      options.arena.removeEventListener("pointerdown", handleArenaPointerDown);
      options.arena.removeEventListener("lostpointercapture", handleLostPointerCapture);
      options.spectatorSurface?.removeEventListener(
        "pointerdown",
        handleSpectatorSurfacePointerDown,
      );
      options.spectatorSurface?.removeEventListener("lostpointercapture", handleLostPointerCapture);
      options.arena.removeEventListener("contextmenu", handleContextMenu);
      options.joystick.removeEventListener("pointerdown", handleJoystickPointerDown);
      options.joystick.removeEventListener("lostpointercapture", handleLostPointerCapture);
      options.grappleButton.removeEventListener("pointerdown", handleGrapple);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endPointer);
      window.removeEventListener("pointercancel", endPointer);
      for (const { button, handler } of actionHandlers) {
        button.removeEventListener("pointerdown", handler);
      }
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resetMovement();
    },
    interrupt(): void {
      resetMovement();
    },
  });
}
