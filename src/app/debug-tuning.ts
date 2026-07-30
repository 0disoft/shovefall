import {
  DEFAULT_GAMEPLAY_TUNING,
  GAMEPLAY_TUNING_LIMITS,
  normalizeGameplayTuning,
  type GameplayTuningInput,
  type GameplayTuningV1,
} from "../simulation/tuning";
import { PRODUCT_VERSION, SIMULATION_VERSION } from "../simulation/versions";

const TUNING_KEYS = Object.freeze([
  "movementMaximumSpeed",
  "lightweightSpeedMultiplier",
  "heavyweightSpeedMultiplier",
  "dodgeActiveTicks",
  "dodgeCooldownTicks",
  "dodgeEvasionTicks",
  "dodgeSpeed",
  "healthRegenDelayTicks",
  "healthRegenPerTick",
  "manaRegenDelayTicks",
  "manaRegenPerTick",
  "bombFuseTicks",
  "bombBlastRadius",
  "grapplingHookCooldownTicks",
  "grapplingHookRange",
  "grapplingHookPullTicks",
] as const satisfies readonly (keyof GameplayTuningInput)[]);

type TuningKey = (typeof TUNING_KEYS)[number];

const TUNING_INPUT_IDS: Readonly<Record<TuningKey, string>> = Object.freeze({
  movementMaximumSpeed: "debug-movement-speed",
  lightweightSpeedMultiplier: "debug-lightweight-speed",
  heavyweightSpeedMultiplier: "debug-heavyweight-speed",
  dodgeActiveTicks: "debug-dodge-ticks",
  dodgeCooldownTicks: "debug-dodge-cooldown-ticks",
  dodgeEvasionTicks: "debug-dodge-evasion-ticks",
  dodgeSpeed: "debug-dodge-speed",
  healthRegenDelayTicks: "debug-health-regen-delay-ticks",
  healthRegenPerTick: "debug-health-regen-per-tick",
  manaRegenDelayTicks: "debug-mana-regen-delay-ticks",
  manaRegenPerTick: "debug-mana-regen-per-tick",
  bombFuseTicks: "debug-bomb-fuse-ticks",
  bombBlastRadius: "debug-bomb-blast-radius",
  grapplingHookCooldownTicks: "debug-grappling-hook-cooldown-ticks",
  grapplingHookRange: "debug-grappling-hook-range",
  grapplingHookPullTicks: "debug-grappling-hook-pull-ticks",
});

const TUNING_OUTPUT_IDS: Readonly<Record<TuningKey, string>> = Object.freeze({
  movementMaximumSpeed: "debug-movement-speed-value",
  lightweightSpeedMultiplier: "debug-lightweight-speed-value",
  heavyweightSpeedMultiplier: "debug-heavyweight-speed-value",
  dodgeActiveTicks: "debug-dodge-ticks-value",
  dodgeCooldownTicks: "debug-dodge-cooldown-ticks-value",
  dodgeEvasionTicks: "debug-dodge-evasion-ticks-value",
  dodgeSpeed: "debug-dodge-speed-value",
  healthRegenDelayTicks: "debug-health-regen-delay-ticks-value",
  healthRegenPerTick: "debug-health-regen-per-tick-value",
  manaRegenDelayTicks: "debug-mana-regen-delay-ticks-value",
  manaRegenPerTick: "debug-mana-regen-per-tick-value",
  bombFuseTicks: "debug-bomb-fuse-ticks-value",
  bombBlastRadius: "debug-bomb-blast-radius-value",
  grapplingHookCooldownTicks: "debug-grappling-hook-cooldown-ticks-value",
  grapplingHookRange: "debug-grappling-hook-range-value",
  grapplingHookPullTicks: "debug-grappling-hook-pull-ticks-value",
});

export interface DebugTuningController {
  readonly enabled: boolean;
  load(tuning: GameplayTuningV1, enabled: boolean): void;
  read(): GameplayTuningV1;
  reset(): void;
  destroy(): void;
}

interface DebugTuningControllerOptions {
  readonly onChange: () => void;
}

function requireElement<T extends Element>(
  root: ParentNode,
  selector: string,
  elementConstructor: { new (): T },
): T {
  const element = root.querySelector(selector);

  if (!(element instanceof elementConstructor)) {
    throw new Error(`Required debug tuning element is missing: ${selector}`);
  }

  return element;
}

function getDefaultValue(key: TuningKey): number {
  return DEFAULT_GAMEPLAY_TUNING[key];
}

function formatValue(key: TuningKey, tuning: GameplayTuningV1): string {
  switch (key) {
    case "movementMaximumSpeed":
      return `${(tuning.movementMaximumSpeed * 60).toFixed(1)}칸/초`;
    case "lightweightSpeedMultiplier":
      return `${tuning.lightweightSpeedMultiplier.toFixed(2)}×`;
    case "heavyweightSpeedMultiplier":
      return `${tuning.heavyweightSpeedMultiplier.toFixed(2)}×`;
    case "dodgeActiveTicks":
    case "dodgeCooldownTicks":
    case "dodgeEvasionTicks":
    case "healthRegenDelayTicks":
    case "manaRegenDelayTicks":
    case "bombFuseTicks":
    case "grapplingHookCooldownTicks":
    case "grapplingHookPullTicks":
      return `${tuning[key]}틱`;
    case "dodgeSpeed":
      return tuning.dodgeSpeed.toFixed(3);
    case "healthRegenPerTick":
      return `${tuning.healthRegenPerTick.toFixed(2)}/틱`;
    case "manaRegenPerTick":
      return `${tuning.manaRegenPerTick.toFixed(3)}/틱`;
    case "bombBlastRadius":
      return `${tuning.bombBlastRadius.toFixed(1)}칸`;
    case "grapplingHookRange":
      return `${tuning.grapplingHookRange.toFixed(1)}칸`;
  }

  throw new Error("Unsupported tuning key");
}

function serializeDebugTuning(tuning: GameplayTuningV1): string {
  return JSON.stringify(
    {
      schemaVersion: "shovefall-debug-tuning/v1",
      versions: {
        product: PRODUCT_VERSION,
        simulation: SIMULATION_VERSION,
      },
      tuning,
    },
    null,
    2,
  );
}

export function createDebugTuningController(
  root: HTMLElement,
  options: DebugTuningControllerOptions,
): DebugTuningController {
  const enabledInput = requireElement(root, "#debug-tuning-enabled", HTMLInputElement);
  const resetButton = requireElement(root, "#reset-debug-tuning", HTMLButtonElement);
  const copyButton = requireElement(root, "#copy-debug-tuning", HTMLButtonElement);
  const summary = requireElement(root, "#debug-tuning-summary", HTMLElement);
  const inputs = new Map<TuningKey, HTMLInputElement>();
  const outputs = new Map<TuningKey, HTMLOutputElement>();

  for (const key of TUNING_KEYS) {
    const input = requireElement(root, `#${TUNING_INPUT_IDS[key]}`, HTMLInputElement);
    const output = requireElement(root, `#${TUNING_OUTPUT_IDS[key]}`, HTMLOutputElement);
    const limit = GAMEPLAY_TUNING_LIMITS[key];
    input.min = String(limit.minimum);
    input.max = String(limit.maximum);
    input.step = String(limit.step);
    inputs.set(key, input);
    outputs.set(key, output);
  }

  const read = (): GameplayTuningV1 => {
    const values: GameplayTuningInput = Object.fromEntries(
      TUNING_KEYS.map((key) => [key, Number(inputs.get(key)?.value)]),
    );
    return normalizeGameplayTuning(values);
  };

  const render = (): void => {
    const tuning = read();
    const enabled = enabledInput.checked;
    root.dataset.debugTuning = enabled ? "enabled" : "disabled";

    for (const key of TUNING_KEYS) {
      const input = inputs.get(key);
      const output = outputs.get(key);

      if (input !== undefined) {
        input.disabled = !enabled;
      }

      if (output !== undefined) {
        output.value = formatValue(key, tuning);
      }
    }

    resetButton.disabled = !enabled;
    copyButton.disabled = !enabled;
    const normalTilesPerSecond = tuning.movementMaximumSpeed * 60;
    const lightTilesPerSecond = normalTilesPerSecond * tuning.lightweightSpeedMultiplier;
    const dodgeDistance = tuning.dodgeSpeed * tuning.dodgeActiveTicks;
    summary.textContent = enabled
      ? `기본 ${normalTilesPerSecond.toFixed(1)}칸/초 · 가벼움 ${lightTilesPerSecond.toFixed(
          1,
        )}칸/초 · 회피 약 ${dodgeDistance.toFixed(2)}칸`
      : "기본 밸런스로 시작해. 켜면 다음 라운드부터 조정값을 써.";
  };

  const notifyChange = (): void => {
    render();
    options.onChange();
  };

  const handleEnabledChange = (): void => notifyChange();
  enabledInput.addEventListener("change", handleEnabledChange);

  const inputListeners = new Map<HTMLInputElement, () => void>();
  for (const input of inputs.values()) {
    const listener = (): void => notifyChange();
    input.addEventListener("input", listener);
    inputListeners.set(input, listener);
  }

  const reset = (): void => {
    for (const key of TUNING_KEYS) {
      const input = inputs.get(key);

      if (input !== undefined) {
        input.value = String(getDefaultValue(key));
      }
    }

    notifyChange();
    summary.textContent = "튜닝값을 기본으로 돌렸어.";
  };

  const handleReset = (): void => reset();
  resetButton.addEventListener("click", handleReset);

  const handleCopy = (): void => {
    void navigator.clipboard
      .writeText(serializeDebugTuning(read()))
      .then(() => {
        summary.textContent = "튜닝값을 복사했어.";
        return undefined;
      })
      .catch((error: unknown) => {
        summary.textContent = "튜닝값을 복사하지 못했어.";
        console.error("Unable to copy the local gameplay tuning values.", error);
      });
  };
  copyButton.addEventListener("click", handleCopy);

  for (const key of TUNING_KEYS) {
    const input = inputs.get(key);

    if (input !== undefined) {
      input.value = String(getDefaultValue(key));
    }
  }
  render();

  return Object.freeze({
    get enabled(): boolean {
      return enabledInput.checked;
    },
    load(tuning: GameplayTuningV1, enabled: boolean): void {
      for (const key of TUNING_KEYS) {
        const input = inputs.get(key);

        if (input !== undefined) {
          input.value = String(tuning[key]);
        }
      }

      enabledInput.checked = enabled;
      notifyChange();
    },
    read,
    reset,
    destroy(): void {
      enabledInput.removeEventListener("change", handleEnabledChange);
      resetButton.removeEventListener("click", handleReset);
      copyButton.removeEventListener("click", handleCopy);

      for (const [input, listener] of inputListeners) {
        input.removeEventListener("input", listener);
      }
    },
  });
}
