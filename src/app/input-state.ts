import { createNeutralCommand, type ActorCommandV1 } from "../simulation/contracts";

export const GAMEPLAY_CODES = Object.freeze([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Space",
  "ShiftLeft",
  "ShiftRight",
] as const);

type GameplayCode = (typeof GAMEPLAY_CODES)[number];

const GAMEPLAY_CODE_SET: ReadonlySet<string> = new Set(GAMEPLAY_CODES);

export function isGameplayCode(code: string): code is GameplayCode {
  return GAMEPLAY_CODE_SET.has(code);
}

export class InputState {
  readonly #heldCodes = new Set<GameplayCode>();
  #shoveQueued = false;
  #dodgeQueued = false;

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
  }

  public release(code: GameplayCode): void {
    this.#heldCodes.delete(code);
  }

  public clear(): void {
    this.#heldCodes.clear();
    this.#shoveQueued = false;
    this.#dodgeQueued = false;
  }

  public consumeCommand(tick: number, actorId: number): ActorCommandV1 {
    const command = Object.freeze({
      ...createNeutralCommand(tick, actorId),
      move: Object.freeze({
        x: Number(this.#heldCodes.has("KeyD")) - Number(this.#heldCodes.has("KeyA")),
        y: Number(this.#heldCodes.has("KeyS")) - Number(this.#heldCodes.has("KeyW")),
      }),
      shovePressed: this.#shoveQueued,
      dodgePressed: this.#dodgeQueued,
    });
    this.#shoveQueued = false;
    this.#dodgeQueued = false;
    return command;
  }
}
