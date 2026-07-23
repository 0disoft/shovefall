import {
  createNeutralCommand,
  type ActorCommandV1,
  type UpgradeStatId,
} from "../simulation/contracts";

export const GAMEPLAY_CODES = Object.freeze([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
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
  #upgradeQueued: UpgradeStatId | null = null;

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

    const upgradeStat =
      code === "Digit1"
        ? "power"
        : code === "Digit2"
          ? "stability"
          : code === "Digit3"
            ? "mobility"
            : code === "Digit4"
              ? "reflex"
              : null;

    if (upgradeStat !== null) {
      this.#upgradeQueued = upgradeStat;
    }
  }

  public release(code: GameplayCode): void {
    this.#heldCodes.delete(code);
  }

  public clear(): void {
    this.#heldCodes.clear();
    this.#shoveQueued = false;
    this.#dodgeQueued = false;
    this.#upgradeQueued = null;
  }

  public queueUpgrade(stat: UpgradeStatId): void {
    this.#upgradeQueued = stat;
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
      upgradeStat: this.#upgradeQueued,
    });
    this.#shoveQueued = false;
    this.#dodgeQueued = false;
    this.#upgradeQueued = null;
    return command;
  }
}
