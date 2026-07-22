import {
  getArenaSize,
  getPresetCollapseSpeed,
  getPresetPlayerCount,
  isPresetName,
  normalizeSettings,
  type GameSettings,
  type PresetName,
} from "./settings";
import { createGameSession, type GameSession, type SessionTelemetry } from "./game-session";
import type { SimulationEventV1 } from "../simulation/contracts";
import { normalizeGameConfig } from "../simulation/contracts";
import { SimulationWorld } from "../simulation/world";
import { createArenaRenderer, type ArenaRenderer } from "../presentation/arena-renderer";

interface ElementConstructor<T extends Element> {
  new (): T;
}

const ACTION_LABELS = Object.freeze({
  Ready: "준비",
  ShoveWindup: "밀치기 준비",
  ShoveActive: "밀치기",
  ShoveRecovery: "밀치기 회복",
  DodgeActive: "회피",
  Stumbling: "휘청거림",
  Anchored: "고정",
  Falling: "낙하",
  Eliminated: "탈락",
} as const);

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

function createRoundSeed(): string {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return `${values[0]?.toString(16).padStart(8, "0")}${values[1]?.toString(16).padStart(8, "0")}`;
}

function createConfig(settings: GameSettings) {
  const arenaSize = getArenaSize(settings.playerCount);
  return normalizeGameConfig({
    participantCount: settings.playerCount,
    arenaColumns: arenaSize.columns,
    arenaRows: arenaSize.rows,
    roundLimitSeconds: 75,
    collapseSpeed: getPresetCollapseSpeed(settings.preset),
  });
}

function reportRendererFailure(status: HTMLElement): void {
  status.dataset.state = "error";
  status.textContent = "그래픽을 시작하지 못했어";
}

function getEventMessage(event: SimulationEventV1): string | undefined {
  switch (event.kind) {
    case "shove-hit":
      return event.actorId === 1 ? "밀치기 적중!" : undefined;
    case "shove-missed":
      return event.actorId === 1 ? "헛밀치기! 균형을 잡아." : undefined;
    case "dodge-succeeded":
      return event.actorId === 1 ? "회피 성공!" : undefined;
    case "falling-started":
      return event.actorId === 1 ? "발밑이 없어!" : undefined;
    default:
      return undefined;
  }
}

export async function bootstrapApplication(root: HTMLElement): Promise<void> {
  const form = requireElement(root, "#game-settings", HTMLFormElement);
  const playerCount = requireElement(root, "#player-count", HTMLInputElement);
  const playerCountValue = requireElement(root, "#player-count-value", HTMLOutputElement);
  const arenaActions = requireElement(root, "#arena-actions", HTMLElement);
  const readyMessage = requireElement(root, "#round-message", HTMLElement);
  const restartButton = requireElement(root, "#restart-round", HTMLButtonElement);
  const backButton = requireElement(root, "#back-to-settings", HTMLButtonElement);
  const arenaHost = requireElement(root, "#arena-host", HTMLElement);
  const rendererStatus = requireElement(root, "#renderer-status", HTMLElement);
  const telemetry = requireElement(root, "#game-telemetry", HTMLElement);
  const tickValue = requireElement(root, "#tick-value", HTMLOutputElement);
  const actionValue = requireElement(root, "#action-value", HTMLOutputElement);
  const massValue = requireElement(root, "#mass-value", HTMLOutputElement);
  const survivorValue = requireElement(root, "#survivor-value", HTMLOutputElement);
  const rateValue = requireElement(root, "#rate-value", HTMLOutputElement);
  const positionValue = requireElement(root, "#position-value", HTMLOutputElement);
  const seedValue = requireElement(root, "#seed-value", HTMLOutputElement);
  const hashValue = requireElement(root, "#hash-value", HTMLOutputElement);

  let renderer: ArenaRenderer | undefined;
  let session: GameSession | undefined;
  let latestSettings = normalizeSettings({ playerCount: 12, preset: "default" });

  const renderSetupPreview = (): void => {
    if (renderer === undefined) {
      return;
    }

    const settings = normalizeSettings({
      playerCount: Number(playerCount.value),
      preset: readSelectedPreset(form),
    });
    const previewWorld = new SimulationWorld(
      createConfig(settings),
      `setup-${settings.playerCount}`,
    );
    renderer.render(previewWorld.createRenderFrame(), 0, 1);
  };

  const updateTelemetry = (current: SessionTelemetry): void => {
    const human = current.frame.participants.find((participant) => participant.actorId === 1);

    if (human === undefined) {
      throw new Error("Human participant is missing from the render frame.");
    }

    telemetry.dataset.tick = String(current.frame.tick);
    telemetry.dataset.action = human.action;
    tickValue.value = String(current.frame.tick);
    actionValue.value = ACTION_LABELS[human.action];
    massValue.value =
      human.massFactor < 0.9 ? "가벼움" : human.massFactor > 1.1 ? "무거움" : "보통";
    survivorValue.value = String(
      current.frame.participants.filter(
        (participant) =>
          participant.active &&
          participant.action !== "Falling" &&
          participant.action !== "Eliminated",
      ).length,
    );
    rateValue.value = `${current.simulationRate}×`;
    positionValue.value = `${human.position.x.toFixed(2)}, ${human.position.y.toFixed(2)}`;
    seedValue.value = current.masterSeed;
    hashValue.value = current.frame.stateHash;
    rendererStatus.dataset.state = current.paused
      ? "paused"
      : current.simulationRate > 1
        ? "spectating"
        : "playing";
    rendererStatus.textContent = current.paused
      ? "일시 정지"
      : current.simulationRate > 1
        ? `빠른 관전 · ${current.simulationRate}×`
        : current.backlogTicks > 0
          ? `따라잡는 중 · ${current.backlogTicks}`
          : "플레이 중";
  };

  try {
    renderer = await createArenaRenderer(arenaHost);
    session = createGameSession(renderer, {
      onTelemetry: updateTelemetry,
      onEvents(events): void {
        const message = events.map(getEventMessage).find((value) => value !== undefined);

        if (message !== undefined) {
          readyMessage.textContent = message;
        }
      },
      onHumanEliminated(): void {
        readyMessage.textContent = "떨어졌어. 남은 승부를 빠르게 돌리는 중.";
      },
      onRoundCompleted(round): void {
        root.dataset.round = "completed";
        rendererStatus.dataset.state = round.winnerActorId === 1 ? "victory" : "completed";
        rendererStatus.textContent = round.winnerActorId === 1 ? "승리" : "라운드 종료";
        readyMessage.textContent =
          round.winnerActorId === 1
            ? "끝까지 남았어. 한 판 더?"
            : round.winnerActorId === null
              ? "마지막 순간에 모두 떨어졌어. 다시 붙자."
              : `${round.winnerActorId}번이 마지막까지 남았어.`;
        restartButton.focus();
      },
      onPauseChanged(paused): void {
        if (paused) {
          readyMessage.textContent = "잠시 멈췄어.";
        } else if (session?.active === true) {
          readyMessage.textContent = "움직여서 가장자리로 몰아붙여.";
        }
      },
      onFatalError(error): void {
        rendererStatus.dataset.state = "error";
        rendererStatus.textContent = "라운드를 멈췄어";
        readyMessage.textContent = "문제가 생겼어. 다시 시작해 줘.";
        restartButton.focus();
        console.error("The Shovefall round stopped at its error boundary.", error);
      },
    });
    rendererStatus.dataset.state = "ready";
    rendererStatus.textContent = "WebGL 준비됨";
    renderSetupPreview();
  } catch (error: unknown) {
    reportRendererFailure(rendererStatus);
    requireElement(form, "button[type='submit']", HTMLButtonElement).disabled = true;
    console.error("Unable to initialize the PixiJS renderer.", error);
  }

  const startRound = (settings: GameSettings): void => {
    if (session === undefined) {
      return;
    }

    latestSettings = settings;
    root.dataset.screen = "arena";
    root.dataset.round = "active";
    form.hidden = true;
    arenaActions.hidden = false;
    telemetry.hidden = false;
    readyMessage.textContent = "움직여서 가장자리로 몰아붙여.";
    arenaHost.setAttribute(
      "aria-label",
      `${settings.playerCount}명이 참가하는 Shovefall 회색 상자 아레나. WASD로 이동하고 Space로 밀치며 Shift로 회피해.`,
    );
    session.start(createConfig(settings), createRoundSeed());
    arenaHost.focus();
  };

  playerCount.addEventListener("input", () => {
    setPlayerCount(playerCount, playerCountValue, Number(playerCount.value));
    renderSetupPreview();
  });

  form.addEventListener("change", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLInputElement) || target.name !== "preset") {
      return;
    }

    if (isPresetName(target.value)) {
      setPlayerCount(playerCount, playerCountValue, getPresetPlayerCount(target.value));
      renderSetupPreview();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    startRound(
      normalizeSettings({
        playerCount: Number(playerCount.value),
        preset: readSelectedPreset(form),
      }),
    );
  });

  restartButton.addEventListener("click", () => startRound(latestSettings));

  backButton.addEventListener("click", () => {
    session?.stop();
    root.dataset.screen = "setup";
    delete root.dataset.round;
    arenaActions.hidden = true;
    telemetry.hidden = true;
    form.hidden = false;
    rendererStatus.dataset.state = "ready";
    rendererStatus.textContent = "WebGL 준비됨";
    arenaHost.setAttribute("aria-label", "타일로 이루어진 Shovefall 아레나 미리보기");
    renderSetupPreview();
    requireElement(form, "button[type='submit']", HTMLButtonElement).focus();
  });

  window.addEventListener(
    "pagehide",
    () => {
      session?.destroy();
      renderer?.destroy();
    },
    { once: true },
  );
}
