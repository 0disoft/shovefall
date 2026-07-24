import { createNeutralCommand, type ActorCommandV1 } from "../simulation/contracts";

export const GAMEPLAY_CODES = Object.freeze([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "ArrowRight",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "KeyQ",
  "KeyE",
] as const);

type GameplayCode = (typeof GAMEPLAY_CODES)[number];

const GAMEPLAY_CODE_SET: ReadonlySet<string> = new Set(GAMEPLAY_CODES);

export function isGameplayCode(code: string): code is GameplayCode {
  return GAMEPLAY_CODE_SET.has(code);
}

export class InputState {
  readonly #heldCodes = new Set<GameplayCode>();
  #pointerMoveX = 0;
  #pointerMoveY = 0;
  #gamepadMoveX = 0;
  #gamepadMoveY = 0;
  #shoveQueued = false;
  #dodgeQueued = false;
  #itemSlotQueued: 0 | 1 | null = null;

  public press(code: GameplayCode, repeat = false): void {
    this.#heldCodes.add(code);

    if (repeat) {
      return;
    }

    if (code === "Space") {
      this.#shoveQueued = true;
    }

    if (code === "ShiftLeft" || code === "ShiftRight") {
      this.#dodgeQueued = true;
    }

    if (code === "KeyQ") {
      this.queueItemSlot(0);
    }

    if (code === "KeyE") {
      this.queueItemSlot(1);
    }
  }

  public release(code: GameplayCode): void {
    this.#heldCodes.delete(code);
  }

  public clear(): void {
    this.#heldCodes.clear();
    this.#pointerMoveX = 0;
    this.#pointerMoveY = 0;
    this.#gamepadMoveX = 0;
    this.#gamepadMoveY = 0;
    this.#shoveQueued = false;
    this.#dodgeQueued = false;
    this.#itemSlotQueued = null;
  }

  public queueShove(): void {
    this.#shoveQueued = true;
  }

  public queueDodge(): void {
    this.#dodgeQueued = true;
  }

  public queueItemSlot(slotIndex: 0 | 1): void {
    if (this.#itemSlotQueued === null || slotIndex < this.#itemSlotQueued) {
      this.#itemSlotQueued = slotIndex;
    }
  }

  public setPointerMovement(x: number, y: number): void {
    this.#pointerMoveX = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    this.#pointerMoveY = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
  }

  public setGamepadMovement(x: number, y: number): void {
    this.#gamepadMoveX = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    this.#gamepadMoveY = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
  }

  public consumeCommand(tick: number, actorId: number): ActorCommandV1 {
    const keyboardX =
      Number(this.#heldCodes.has("KeyD") || this.#heldCodes.has("ArrowRight")) -
      Number(this.#heldCodes.has("KeyA") || this.#heldCodes.has("ArrowLeft"));
    const keyboardY =
      Number(this.#heldCodes.has("KeyS") || this.#heldCodes.has("ArrowDown")) -
      Number(this.#heldCodes.has("KeyW") || this.#heldCodes.has("ArrowUp"));
    const pointerActive = this.#pointerMoveX !== 0 || this.#pointerMoveY !== 0;
    const gamepadActive = this.#gamepadMoveX !== 0 || this.#gamepadMoveY !== 0;
    const command = Object.freeze({
      ...createNeutralCommand(tick, actorId),
      move: Object.freeze({
        x: pointerActive ? this.#pointerMoveX : gamepadActive ? this.#gamepadMoveX : keyboardX,
        y: pointerActive ? this.#pointerMoveY : gamepadActive ? this.#gamepadMoveY : keyboardY,
      }),
      shovePressed: this.#shoveQueued,
      dodgePressed: this.#dodgeQueued,
      useItemSlot: this.#itemSlotQueued,
      upgradeStat: null,
    });
    this.#shoveQueued = false;
    this.#dodgeQueued = false;
    this.#itemSlotQueued = null;
    return command;
  }
}
