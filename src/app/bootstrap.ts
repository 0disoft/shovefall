import { getPresetPlayerCount, isPresetName, normalizeSettings, type PresetName } from "./settings";
import { createArenaPreview, type ArenaPreview } from "../presentation/arena-preview";

interface ElementConstructor<T extends Element> {
  new (): T;
}

function requireElement<T extends Element>(
  root: ParentNode,
  selector: string,
  elementConstructor: ElementConstructor<T>,
): T {
  const element = root.querySelector(selector);

  if (!(element instanceof elementConstructor)) {
    throw new Error(`Required application element is missing: ${selector}`);
  }

  return element;
}

function readSelectedPreset(form: HTMLFormElement): PresetName {
  const data = new FormData(form);
  const value = data.get("preset");

  return typeof value === "string" && isPresetName(value) ? value : "default";
}

function setPlayerCount(input: HTMLInputElement, output: HTMLOutputElement, value: number): void {
  input.value = String(value);
  output.value = `${value}명`;
}

function reportRendererFailure(status: HTMLElement): void {
  status.dataset.state = "error";
  status.textContent = "그래픽을 시작하지 못했어";
}

export async function bootstrapApplication(root: HTMLElement): Promise<void> {
  const form = requireElement(root, "#game-settings", HTMLFormElement);
  const playerCount = requireElement(root, "#player-count", HTMLInputElement);
  const playerCountValue = requireElement(root, "#player-count-value", HTMLOutputElement);
  const arenaActions = requireElement(root, "#arena-actions", HTMLElement);
  const backButton = requireElement(root, "#back-to-settings", HTMLButtonElement);
  const arenaHost = requireElement(root, "#arena-host", HTMLElement);
  const rendererStatus = requireElement(root, "#renderer-status", HTMLElement);

  let preview: ArenaPreview | undefined;

  try {
    preview = await createArenaPreview(arenaHost);
    rendererStatus.dataset.state = "ready";
    rendererStatus.textContent = "WebGL 준비됨";
  } catch (error: unknown) {
    reportRendererFailure(rendererStatus);
    requireElement(form, "button[type='submit']", HTMLButtonElement).disabled = true;
    console.error("Unable to initialize the PixiJS renderer.", error);
  }

  playerCount.addEventListener("input", () => {
    setPlayerCount(playerCount, playerCountValue, Number(playerCount.value));
  });

  form.addEventListener("change", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLInputElement) || target.name !== "preset") {
      return;
    }

    if (isPresetName(target.value)) {
      setPlayerCount(playerCount, playerCountValue, getPresetPlayerCount(target.value));
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const settings = normalizeSettings({
      playerCount: Number(playerCount.value),
      preset: readSelectedPreset(form),
    });

    root.dataset.screen = "arena";
    form.hidden = true;
    arenaActions.hidden = false;
    arenaHost.setAttribute(
      "aria-label",
      `${settings.playerCount}명이 참가하는 Shovefall 아레나 미리보기`,
    );
    preview?.setParticipantCount(settings.playerCount);
    backButton.focus();
  });

  backButton.addEventListener("click", () => {
    root.dataset.screen = "setup";
    arenaActions.hidden = true;
    form.hidden = false;
    requireElement(form, "button[type='submit']", HTMLButtonElement).focus();
  });

  window.addEventListener(
    "pagehide",
    () => {
      preview?.destroy();
    },
    { once: true },
  );
}
