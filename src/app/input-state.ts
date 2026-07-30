import { createNeutralCommand, type ActorCommandV1 } from "../simulation/contracts";

export const MOVEMENT_CODES = Object.freeze([
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "ArrowRight",
] as const);

export type MovementCode = (typeof MOVEMENT_CODES)[number];

export const GAMEPLAY_CODES = Object.freeze([
  ...MOVEMENT_CODES,
  "KeyQ",
  "KeyW",
  "KeyE",
  "KeyD",
] as const);

type GameplayCode = (typeof GAMEPLAY_CODES)[number];

const GAMEPLAY_CODE_SET: ReadonlySet<string> = new Set(GAMEPLAY_CODES);
const MOVEMENT_CODE_SET: ReadonlySet<string> = new Set(MOVEMENT_CODES);

export function isGameplayCode(code: string): code is GameplayCode {
  return GAMEPLAY_CODE_SET.has(code);
}

export function isMovementCode(code: string): code is MovementCode {
  return MOVEMENT_CODE_SET.has(code);
}

export class InputState {
  readonly #heldCodes = new Set<GameplayCode>();
  #pointerMoveX = 0;
  #pointerMoveY = 0;
  #gamepadMoveX = 0;
  #gamepadMoveY = 0;
  #skillSlotQueued: 0 | 1 | null = null;
  #itemSlotQueued: 0 | null = null;

  public press(code: GameplayCode, _repeat = false): void {
    this.#heldCodes.add(code);
  }

  public release(code: GameplayCode): void {
    this.#heldCodes.delete(code);
  }

  public clear(): void {
    this.#heldCodes.clear();
    this.clearTransientMovement();
    this.#skillSlotQueued = null;
    this.#itemSlotQueued = null;
  }

  public clearMovement(): void {
    for (const code of MOVEMENT_CODES) {
      this.#heldCodes.delete(code);
    }
    this.clearTransientMovement();
  }

  public clearTransientMovement(): void {
    this.#pointerMoveX = 0;
    this.#pointerMoveY = 0;
    this.#gamepadMoveX = 0;
    this.#gamepadMoveY = 0;
  }

  public queueSkillSlot(slotIndex: 0 | 1): void {
    if (this.#skillSlotQueued === null || slotIndex < this.#skillSlotQueued) {
      this.#skillSlotQueued = slotIndex;
    }
  }

  public queueItemSlot(slotIndex: 0): void {
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
      Number(this.#heldCodes.has("ArrowRight")) - Number(this.#heldCodes.has("ArrowLeft"));
    const keyboardY =
      Number(this.#heldCodes.has("ArrowDown")) - Number(this.#heldCodes.has("ArrowUp"));
    const pointerActive = this.#pointerMoveX !== 0 || this.#pointerMoveY !== 0;
    const gamepadActive = this.#gamepadMoveX !== 0 || this.#gamepadMoveY !== 0;
    const command = Object.freeze({
      ...createNeutralCommand(tick, actorId),
      move: Object.freeze({
        x: pointerActive ? this.#pointerMoveX : gamepadActive ? this.#gamepadMoveX : keyboardX,
        y: pointerActive ? this.#pointerMoveY : gamepadActive ? this.#gamepadMoveY : keyboardY,
      }),
      grapplePressed: false,
      useSkillSlot: this.#skillSlotQueued,
      useItemSlot: this.#itemSlotQueued,
      upgradeStat: null,
      upgradeSkillSlot: null,
    });
    this.#skillSlotQueued = null;
    this.#itemSlotQueued = null;
    return command;
  }
}
