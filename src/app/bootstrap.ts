import {
  getArenaSize,
  getPresetCollapseSpeed,
  getPresetItemRespawnSeconds,
  getPresetPlayerCount,
  getRecommendedInitialItemCount,
  isBotDifficulty,
  isCollapseSpeed,
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
import {
  createAudioFeedback,
  type AudioFeedback,
  type AudioFeedbackState,
} from "../presentation/audio-feedback";

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

const ITEM_LABELS = Object.freeze({
  "iron-boots": "철 장화",
  feather: "깃털",
  "spring-glove": "스프링 장갑",
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

function readSelectedBotDifficulty(form: HTMLFormElement): GameSettings["botDifficulty"] {
  const data = new FormData(form);
  const value = data.get("botDifficulty");
  return typeof value === "string" && isBotDifficulty(value) ? value : "normal";
}

function readSelectedCollapseSpeed(form: HTMLFormElement): GameSettings["collapseSpeed"] {
  const data = new FormData(form);
  const value = data.get("collapseSpeed");
  return typeof value === "string" && isCollapseSpeed(value) ? value : "normal";
}

function setSelectedCollapseSpeed(
  form: HTMLFormElement,
  speed: GameSettings["collapseSpeed"],
): void {
  for (const input of form.querySelectorAll<HTMLInputElement>('input[name="collapseSpeed"]')) {
    input.checked = input.value === speed;
  }
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
    collapseSpeed: settings.collapseSpeed,
    difficulty: settings.botDifficulty,
    itemsEnabled: settings.initialItemCount > 0 || settings.itemRespawnSeconds > 0,
    initialItemCount: settings.initialItemCount,
    itemRespawnSeconds: settings.itemRespawnSeconds,
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
    case "item-picked-up":
      return event.actorId === 1 && event.itemDefinitionId !== undefined
        ? `${ITEM_LABELS[event.itemDefinitionId]} 획득!`
        : undefined;
    default:
      return undefined;
  }
}

export async function bootstrapApplication(root: HTMLElement): Promise<void> {
  const form = requireElement(root, "#game-settings", HTMLFormElement);
  const playerCount = requireElement(root, "#player-count", HTMLInputElement);
  const playerCountValue = requireElement(root, "#player-count-value", HTMLOutputElement);
  const initialItemCount = requireElement(root, "#initial-item-count", HTMLInputElement);
  const initialItemCountValue = requireElement(
    root,
    "#initial-item-count-value",
    HTMLOutputElement,
  );
  const itemRespawn = requireElement(root, "#item-respawn", HTMLInputElement);
  const itemRespawnValue = requireElement(root, "#item-respawn-value", HTMLOutputElement);
  const setupSummary = requireElement(root, "#setup-summary", HTMLElement);
  const arenaActions = requireElement(root, "#arena-actions", HTMLElement);
  const readyMessage = requireElement(root, "#round-message", HTMLElement);
  const restartButton = requireElement(root, "#restart-round", HTMLButtonElement);
  const backButton = requireElement(root, "#back-to-settings", HTMLButtonElement);
  const soundButton = requireElement(root, "#toggle-sound", HTMLButtonElement);
  const arenaHost = requireElement(root, "#arena-host", HTMLElement);
  const rendererStatus = requireElement(root, "#renderer-status", HTMLElement);
  const telemetry = requireElement(root, "#game-telemetry", HTMLElement);
  const tickValue = requireElement(root, "#tick-value", HTMLOutputElement);
  const actionValue = requireElement(root, "#action-value", HTMLOutputElement);
  const massValue = requireElement(root, "#mass-value", HTMLOutputElement);
  const effectValue = requireElement(root, "#effect-value", HTMLOutputElement);
  const itemValue = requireElement(root, "#item-value", HTMLOutputElement);
  const survivorValue = requireElement(root, "#survivor-value", HTMLOutputElement);
  const rateValue = requireElement(root, "#rate-value", HTMLOutputElement);
  const positionValue = requireElement(root, "#position-value", HTMLOutputElement);
  const seedValue = requireElement(root, "#seed-value", HTMLOutputElement);
  const hashValue = requireElement(root, "#hash-value", HTMLOutputElement);

  let renderer: ArenaRenderer | undefined;
  let session: GameSession | undefined;
  let audio: AudioFeedback | undefined;
  let latestSettings = normalizeSettings({ playerCount: 16, preset: "default" });

  const updateSoundControl = (state: AudioFeedbackState): void => {
    root.dataset.audio = state;
    const unavailable = state === "unavailable" || state === "closed";
    soundButton.disabled = unavailable;
    soundButton.textContent = unavailable
      ? "무음"
      : audio?.muted === true
        ? "소리 켜기"
        : "소리 끄기";
    soundButton.setAttribute("aria-pressed", String(audio?.muted === true));
  };

  audio = createAudioFeedback(undefined, updateSoundControl);

  const readSettings = (): GameSettings =>
    normalizeSettings({
      playerCount: Number(playerCount.value),
      preset: readSelectedPreset(form),
      initialItemCount: Number(initialItemCount.value),
      itemRespawnSeconds: Number(itemRespawn.value),
      botDifficulty: readSelectedBotDifficulty(form),
      collapseSpeed: readSelectedCollapseSpeed(form),
    });

  const setRecommendedInitialItems = (participantCount: number): void => {
    initialItemCount.max = String(Math.ceil(participantCount * 0.5));
    initialItemCount.value = String(getRecommendedInitialItemCount(participantCount));
  };

  const renderSettingsSummary = (): void => {
    const settings = readSettings();
    const isMayhem = settings.playerCount >= 25;
    initialItemCount.max = String(Math.ceil(settings.playerCount * 0.5));
    initialItemCount.value = String(settings.initialItemCount);
    initialItemCountValue.value = `${settings.initialItemCount}개`;
    itemRespawn.value = String(settings.itemRespawnSeconds);
    itemRespawnValue.value =
      settings.itemRespawnSeconds === 0 ? "추가 없음" : `${settings.itemRespawnSeconds}초`;
    const difficultyLabel =
      settings.botDifficulty === "easy"
        ? "AI 쉬움"
        : settings.botDifficulty === "hard"
          ? "AI 어려움"
          : "AI 보통";
    const collapseLabel =
      settings.collapseSpeed === "slow"
        ? "붕괴 느림"
        : settings.collapseSpeed === "fast"
          ? "붕괴 빠름"
          : "붕괴 보통";
    setupSummary.textContent = `${settings.playerCount}명 · ${difficultyLabel} · ${collapseLabel} · 시작 아이템 ${settings.initialItemCount}개 · ${
      settings.itemRespawnSeconds === 0
        ? "추가 생성 없음"
        : `${settings.itemRespawnSeconds}초마다 1개`
    }${isMayhem ? " · 난장판" : ""}`;
    root.dataset.scale = isMayhem ? "mayhem" : "normal";
  };

  const renderSetupPreview = (): void => {
    if (renderer === undefined) {
      return;
    }

    const settings = readSettings();
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
    telemetry.dataset.backlogTicks = String(current.backlogTicks);
    telemetry.dataset.simulationRate = String(current.simulationRate);
    telemetry.dataset.countdown = current.countdown === null ? "" : String(current.countdown);
    tickValue.value = String(current.frame.tick);
    actionValue.value = ACTION_LABELS[human.action];
    massValue.value =
      human.massFactor < 0.9 ? "가벼움" : human.massFactor > 1.1 ? "무거움" : "보통";
    effectValue.value =
      human.effects.length === 0
        ? human.springBoosted
          ? "스프링 발동"
          : "없음"
        : human.effects.map(({ definitionId }) => ITEM_LABELS[definitionId]).join(" · ");
    itemValue.value = String(current.frame.items.length);
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
    if (current.countdown !== null) {
      root.dataset.round = "countdown";
      readyMessage.textContent = String(current.countdown);
    } else if (root.dataset.round === "countdown") {
      root.dataset.round = "active";
      readyMessage.textContent = "시작! 움직여서 가장자리로 몰아붙여.";
    }

    const rendererLost = arenaHost.dataset.renderer === "lost";
    rendererStatus.dataset.state = rendererLost
      ? "error"
      : current.paused
        ? "paused"
        : current.countdown !== null
          ? "countdown"
          : current.simulationRate > 1
            ? "spectating"
            : "playing";
    rendererStatus.textContent = rendererLost
      ? "그래픽 연결이 끊겼어"
      : current.paused
        ? "일시 정지"
        : current.countdown !== null
          ? `시작까지 ${current.countdown}`
          : current.simulationRate > 1
            ? `빠른 관전 · ${current.simulationRate}×`
            : current.backlogTicks > 0
              ? `따라잡는 중 · ${current.backlogTicks}`
              : "플레이 중";
  };

  try {
    renderer = await createArenaRenderer(arenaHost, {
      onContextLost(): void {
        session?.setRendererAvailable(false);
        rendererStatus.dataset.state = "error";
        rendererStatus.textContent = "그래픽 연결이 끊겼어";
        readyMessage.textContent = "화면이 돌아올 때까지 멈췄어.";
      },
      onContextRestored(): void {
        session?.setRendererAvailable(true);
        const countingDown = root.dataset.round === "countdown";
        rendererStatus.dataset.state =
          session?.active === true ? (countingDown ? "countdown" : "playing") : "ready";
        rendererStatus.textContent =
          session?.active === true ? (countingDown ? "다시 준비" : "플레이 중") : "WebGL 준비됨";
      },
    });
    session = createGameSession(renderer, {
      onTelemetry: updateTelemetry,
      onEvents(events): void {
        audio?.consumeEvents(events);
        const message = events.map(getEventMessage).find((value) => value !== undefined);

        if (message !== undefined) {
          readyMessage.textContent = message;
        }
      },
      onHumanEliminated(): void {
        root.dataset.humanEliminated = "true";
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
        } else if (session?.active === true && root.dataset.round !== "countdown") {
          readyMessage.textContent = "움직여서 가장자리로 몰아붙여.";
        }
      },
      onFatalError(error): void {
        root.dataset.round = "fatal";
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
    void audio?.unlock();
    root.dataset.screen = "arena";
    root.dataset.round = "countdown";
    delete root.dataset.humanEliminated;
    root.dataset.initialItems = String(settings.initialItemCount);
    root.dataset.botDifficulty = settings.botDifficulty;
    root.dataset.collapseSpeed = settings.collapseSpeed;
    form.hidden = true;
    arenaActions.hidden = false;
    telemetry.hidden = false;
    readyMessage.textContent = "3";
    arenaHost.setAttribute(
      "aria-label",
      `${settings.playerCount}명이 참가하는 Shovefall 회색 상자 아레나. WASD로 이동하고 Space로 밀치며 Shift로 회피해.`,
    );
    session.start(createConfig(settings), createRoundSeed());
    arenaHost.focus();
  };

  playerCount.addEventListener("input", () => {
    setPlayerCount(playerCount, playerCountValue, Number(playerCount.value));
    setRecommendedInitialItems(Number(playerCount.value));
    renderSettingsSummary();
    renderSetupPreview();
  });

  initialItemCount.addEventListener("input", renderSettingsSummary);
  itemRespawn.addEventListener("input", renderSettingsSummary);

  form.addEventListener("change", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.name === "preset" && isPresetName(target.value)) {
      setPlayerCount(playerCount, playerCountValue, getPresetPlayerCount(target.value));
      setRecommendedInitialItems(getPresetPlayerCount(target.value));
      itemRespawn.value = String(getPresetItemRespawnSeconds(target.value));
      setSelectedCollapseSpeed(form, getPresetCollapseSpeed(target.value));
      renderSetupPreview();
    }

    renderSettingsSummary();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    startRound(readSettings());
  });

  restartButton.addEventListener("click", () => startRound(latestSettings));

  soundButton.addEventListener("click", () => {
    if (audio === undefined) {
      return;
    }

    audio.setMuted(!audio.muted);
    updateSoundControl(audio.state);

    if (!audio.muted) {
      void audio.unlock();
    }
  });

  const handleDiagnosticFatal = (): void => {
    session?.failForDiagnostics(new Error("Injected diagnostic failure"));
  };

  if (import.meta.env.DEV) {
    window.addEventListener("shovefall:diagnostic-fatal", handleDiagnosticFatal);
  }

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
      audio?.destroy();

      if (import.meta.env.DEV) {
        window.removeEventListener("shovefall:diagnostic-fatal", handleDiagnosticFatal);
      }
    },
    { once: true },
  );

  renderSettingsSummary();
}
