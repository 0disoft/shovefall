import {
  FORCED_BOT_DIFFICULTY,
  getArenaSize,
  getStartingMassFactor,
  isCollapseSpeed,
  normalizeSettings,
  type GameSettings,
} from "./settings";
import { createGameSession, type GameSession, type SessionTelemetry } from "./game-session";
import { createDebugTuningController, type DebugTuningController } from "./debug-tuning";
import { createPointerControls, type PointerControls } from "./pointer-controls";
import { createPlaytestRoundReport, serializePlaytestRoundReport } from "./round-report";
import { VERSION_HISTORY } from "./version-history";
import type { SimulationEventV1, UpgradeStatId } from "../simulation/contracts";
import { normalizeGameConfig } from "../simulation/contracts";
import { DEFAULT_GAMEPLAY_TUNING, type GameplayTuningV1 } from "../simulation/tuning";
import {
  DEFAULT_UPGRADE_PLAN,
  getNextPlannedUpgrade,
  isUpgradeStatId,
  MAX_UPGRADE_LEVEL,
  MAX_UPGRADE_PLAN_STEPS,
  normalizeUpgradePlan,
  UPGRADE_STAT_IDS,
} from "../simulation/progression";
import { createArenaRenderer, type ArenaRenderer } from "../presentation/arena-renderer";
import {
  createAudioFeedback,
  type AudioFeedback,
  type AudioFeedbackState,
} from "../presentation/audio-feedback";
import { PRODUCT_VERSION } from "../simulation/versions";

interface ElementConstructor<T extends Element> {
  new (): T;
}

interface DeveloperTelemetrySnapshot {
  readonly tick: number;
  readonly rate: number;
  readonly position: string;
  readonly seed: string;
  readonly stateHash: string;
}

interface DeveloperTelemetryController {
  readonly setVisible: (visible: boolean) => void;
  readonly update: (snapshot: DeveloperTelemetrySnapshot) => void;
}

const ACTION_LABELS = Object.freeze({
  Ready: "준비",
  ShoveWindup: "밀치기 준비",
  ShoveActive: "밀치기",
  ShoveRecovery: "밀치기 회복",
  DodgeActive: "회피",
  GrapplePull: "갈고리 이동",
  Stumbling: "휘청거림",
  Anchored: "고정",
  Falling: "낙하",
  Eliminated: "탈락",
} as const);

const ITEM_LABELS = Object.freeze({
  "iron-boots": "철 장화",
  feather: "깃털",
  "spring-glove": "스프링 장갑",
  "wind-blast": "장풍",
  "brick-bag": "벽돌 가방",
  boat: "배",
  bomb: "시한폭탄",
  soap: "비누",
  "grappling-hook": "구조 갈고리",
} as const);

const UPGRADE_LABELS: Readonly<Record<UpgradeStatId, string>> = Object.freeze({
  power: "힘",
  stability: "중심",
  mobility: "발놀림",
  reflex: "반사신경",
});

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

function createDeveloperTelemetry(anchor: HTMLElement): DeveloperTelemetryController {
  const document = anchor.ownerDocument;
  const details = document.createElement("details");
  details.id = "developer-telemetry";
  details.className = "developer-telemetry";
  details.dataset.developmentOnly = "true";
  details.hidden = true;

  const summary = document.createElement("summary");
  summary.textContent = "개발 정보";
  details.append(summary);

  const list = document.createElement("dl");
  list.setAttribute("aria-label", "개발용 라운드 정보");
  details.append(list);

  const appendOutput = (label: string, id: string, initialValue: string): HTMLOutputElement => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = label;
    const definition = document.createElement("dd");
    const output = document.createElement("output");
    output.id = id;
    output.value = initialValue;
    definition.append(output);
    row.append(term, definition);
    list.append(row);
    return output;
  };

  const tick = appendOutput("틱", "tick-value", "0");
  const rate = appendOutput("속도", "rate-value", "1×");
  const position = appendOutput("위치", "position-value", "0.00, 0.00");
  const seed = appendOutput("시드", "seed-value", "not-started");
  const stateHash = appendOutput("상태 해시", "hash-value", "fnv1a32:00000000");
  anchor.insertAdjacentElement("afterend", details);

  return Object.freeze({
    setVisible(visible: boolean): void {
      details.hidden = !visible;
      details.open = false;
    },
    update(snapshot: DeveloperTelemetrySnapshot): void {
      tick.value = String(snapshot.tick);
      rate.value = `${snapshot.rate}×`;
      position.value = snapshot.position;
      seed.value = snapshot.seed;
      stateHash.value = snapshot.stateHash;
    },
  });
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
    case "item-used":
      return event.actorId !== 1
        ? undefined
        : event.itemDefinitionId === "wind-blast"
          ? "장풍을 쐈어."
          : event.itemDefinitionId === "brick-bag"
            ? "벽돌을 세웠어."
            : event.itemDefinitionId === "boat"
              ? "배를 띄웠어. 5초 동안 물을 건널 수 있어."
              : event.itemDefinitionId === "bomb"
                ? "폭탄을 놨어. 5초 뒤 터져."
                : event.itemDefinitionId === "soap"
                  ? "비누를 앞 칸에 놨어."
                  : undefined;
    case "wind-blast-hit":
      return event.actorId === 1 ? "장풍 적중!" : undefined;
    case "bomb-detonated":
      return event.actorId === 1 ? "폭탄 폭발!" : undefined;
    case "soap-triggered":
      return event.targetActorId === 1
        ? "비누를 밟고 미끄러졌어!"
        : event.actorId === 1
          ? "비누 함정 발동!"
          : undefined;
    case "grappling-hook-hit":
      return event.actorId === 1 ? "갈고리가 걸렸어." : undefined;
    case "stat-point-earned":
      return event.actorId === 1 ? "처치 인정! 스탯 포인트를 얻었어." : undefined;
    case "stat-upgraded":
      return event.actorId === 1 ? "스탯을 올렸어." : undefined;
    case "rock-fired":
      return event.actorId === 1 ? "돌탄 표적이 됐어. 움직여!" : undefined;
    case "rock-impact":
      return event.actorId === 1 ? "돌탄이 떨어졌어!" : undefined;
    default:
      return undefined;
  }
}

export async function bootstrapApplication(root: HTMLElement): Promise<void> {
  const skipLink = requireElement(document, ".skip-link", HTMLAnchorElement);
  const startGameButton = requireElement(root, "#start-game", HTMLButtonElement);
  const openSettingsButton = requireElement(root, "#open-settings", HTMLButtonElement);
  const openVersionHistoryButton = requireElement(root, "#open-version-history", HTMLButtonElement);
  const closeVersionHistoryButton = requireElement(
    root,
    "#close-version-history",
    HTMLButtonElement,
  );
  const versionHistoryTitle = requireElement(root, "#version-history-title", HTMLElement);
  const versionHistoryList = requireElement(root, "#version-history-list", HTMLOListElement);
  const currentVersion = requireElement(root, "#current-version", HTMLOutputElement);
  const cancelSettingsButton = requireElement(root, "#cancel-settings", HTMLButtonElement);
  const form = requireElement(root, "#game-settings", HTMLFormElement);
  const startingWeight = requireElement(root, "#starting-weight", HTMLInputElement);
  const startingWeightValue = requireElement(root, "#starting-weight-value", HTMLOutputElement);
  const initialItemCount = requireElement(root, "#initial-item-count", HTMLInputElement);
  const initialItemCountValue = requireElement(
    root,
    "#initial-item-count-value",
    HTMLOutputElement,
  );
  const itemRespawn = requireElement(root, "#item-respawn", HTMLInputElement);
  const itemRespawnValue = requireElement(root, "#item-respawn-value", HTMLOutputElement);
  const setupSummary = requireElement(root, "#setup-summary", HTMLElement);
  const startingItemsHelp = requireElement(root, "#starting-items-help", HTMLElement);
  const upgradePlanList = requireElement(root, "#upgrade-plan-list", HTMLOListElement);
  const upgradePlanHelp = requireElement(root, "#upgrade-plan-help", HTMLElement);
  const addUpgradeButtons = [...root.querySelectorAll<HTMLButtonElement>("[data-add-upgrade]")];
  const clearUpgradePlanButton = requireElement(root, "#clear-upgrade-plan", HTMLButtonElement);
  const undoUpgradePlanButton = requireElement(root, "#undo-upgrade-plan", HTMLButtonElement);
  const resetUpgradePlanButton = requireElement(root, "#reset-upgrade-plan", HTMLButtonElement);
  const debugTuningPanel = requireElement(root, "#debug-tuning", HTMLDetailsElement);
  const startingItemInputs = [
    ...form.querySelectorAll<HTMLInputElement>('input[name="startingItem"]'),
  ];
  const arenaActions = requireElement(root, "#arena-actions", HTMLElement);
  const readyMessage = requireElement(root, "#round-message", HTMLElement);
  const restartButton = requireElement(root, "#restart-round", HTMLButtonElement);
  const backButton = requireElement(root, "#back-to-settings", HTMLButtonElement);
  const copyRoundReportButton = requireElement(root, "#copy-round-report", HTMLButtonElement);
  const soundButton = requireElement(root, "#toggle-sound", HTMLButtonElement);
  const arenaHost = requireElement(root, "#arena-host", HTMLElement);
  const pointerJoystick = requireElement(root, "#pointer-joystick", HTMLElement);
  const pointerJoystickKnob = requireElement(root, "#pointer-joystick-knob", HTMLElement);
  const touchShoveButton = requireElement(root, "#touch-shove", HTMLButtonElement);
  const touchDodgeButton = requireElement(root, "#touch-dodge", HTMLButtonElement);
  const inventoryActions = requireElement(root, "#inventory-actions", HTMLElement);
  const shoveStatusValue = requireElement(root, "#shove-status-value", HTMLOutputElement);
  const dodgeStatusValue = requireElement(root, "#dodge-status-value", HTMLOutputElement);
  const statStatus = requireElement(root, "#stat-status", HTMLElement);
  const itemSlotButtons = Object.freeze([
    requireElement(root, "#use-item-slot-0", HTMLButtonElement),
    requireElement(root, "#use-item-slot-1", HTMLButtonElement),
  ] as const);
  const rendererStatus = requireElement(root, "#renderer-status", HTMLElement);
  const telemetry = requireElement(root, "#game-telemetry", HTMLElement);
  const developerTelemetry = import.meta.env.DEV ? createDeveloperTelemetry(telemetry) : undefined;
  const actionValue = requireElement(root, "#action-value", HTMLOutputElement);
  const massValue = requireElement(root, "#mass-value", HTMLOutputElement);
  const effectValue = requireElement(root, "#effect-value", HTMLOutputElement);
  const itemValue = requireElement(root, "#item-value", HTMLOutputElement);
  const survivorValue = requireElement(root, "#survivor-value", HTMLOutputElement);
  const statPointsValue = requireElement(root, "#stat-points-value", HTMLOutputElement);
  const nextUpgradeValue = requireElement(root, "#next-upgrade-value", HTMLOutputElement);
  const statLevelOutputs: Readonly<Record<UpgradeStatId, HTMLOutputElement>> = Object.freeze({
    power: requireElement(root, "#power-level", HTMLOutputElement),
    stability: requireElement(root, "#stability-level", HTMLOutputElement),
    mobility: requireElement(root, "#mobility-level", HTMLOutputElement),
    reflex: requireElement(root, "#reflex-level", HTMLOutputElement),
  });

  let renderer: ArenaRenderer | undefined;
  let session: GameSession | undefined;
  let audio: AudioFeedback | undefined;
  let debugTuning: DebugTuningController | undefined;
  let pointerControls: PointerControls | undefined;
  let latestSettings = normalizeSettings();
  let latestGameplayTuning: GameplayTuningV1 = DEFAULT_GAMEPLAY_TUNING;
  let latestDebugTuningEnabled = false;
  let latestMasterSeed: string | undefined;
  let latestRoundReport: string | undefined;
  let draftUpgradePlan: UpgradeStatId[] = [...DEFAULT_UPGRADE_PLAN];

  const setScreen = (screen: "menu" | "settings" | "history" | "arena"): void => {
    root.dataset.screen = screen;
    const target =
      screen === "menu"
        ? "#main-menu-title"
        : screen === "settings"
          ? "#setup-title"
          : screen === "history"
            ? "#version-history-title"
            : "#arena-host";
    skipLink.href = target;
    skipLink.textContent =
      screen === "menu"
        ? "메뉴로 이동"
        : screen === "settings"
          ? "게임 설정으로 이동"
          : screen === "history"
            ? "버전 기록으로 이동"
            : "아레나로 이동";
  };

  const renderVersionHistory = (): void => {
    currentVersion.value = `v${PRODUCT_VERSION}`;
    const fragment = document.createDocumentFragment();

    for (const [index, entry] of VERSION_HISTORY.entries()) {
      const item = document.createElement("li");
      const article = document.createElement("article");
      const header = document.createElement("header");
      const version = document.createElement("span");
      const title = document.createElement("h3");
      const details = document.createElement("dl");
      const reasonRow = document.createElement("div");
      const reasonLabel = document.createElement("dt");
      const reason = document.createElement("dd");
      const changeRow = document.createElement("div");
      const changeLabel = document.createElement("dt");
      const change = document.createElement("dd");

      version.textContent = `v${entry.version}`;
      version.className = "version-history__version";
      title.textContent = entry.title;
      reasonLabel.textContent = "왜 바꿨냐면요";
      reason.textContent = entry.reason;
      changeLabel.textContent = "이렇게 바뀌었다요";
      change.textContent = entry.change;
      header.append(version, title);
      reasonRow.append(reasonLabel, reason);
      changeRow.append(changeLabel, change);
      details.append(reasonRow, changeRow);
      article.append(header, details);
      item.append(article);

      if (index === 0) {
        article.dataset.current = "true";
        version.setAttribute("aria-label", `현재 버전 ${entry.version}`);
      }

      fragment.append(item);
    }

    versionHistoryList.replaceChildren(fragment);
  };

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

  const readSettings = (): GameSettings => {
    const data = new FormData(form);
    return normalizeSettings({
      initialItemCount: Number(initialItemCount.value),
      itemRespawnSeconds: Number(itemRespawn.value),
      collapseSpeed: readSelectedCollapseSpeed(form),
      startingWeight: Number(startingWeight.value),
      startingItems: data
        .getAll("startingItem")
        .filter((value): value is string => typeof value === "string"),
      upgradePlan: draftUpgradePlan,
    });
  };

  const renderUpgradePlan = (): void => {
    const fragment = document.createDocumentFragment();
    const counts = new Map<UpgradeStatId, number>();

    for (const [index, stat] of draftUpgradePlan.entries()) {
      counts.set(stat, (counts.get(stat) ?? 0) + 1);
      const item = document.createElement("li");
      item.dataset.step = String(index + 1);
      item.textContent = UPGRADE_LABELS[stat];
      fragment.append(item);
    }

    upgradePlanList.replaceChildren(fragment);
    const full = draftUpgradePlan.length >= MAX_UPGRADE_PLAN_STEPS;

    for (const button of addUpgradeButtons) {
      const stat = button.dataset.addUpgrade;
      button.disabled =
        !isUpgradeStatId(stat) || full || (counts.get(stat) ?? 0) >= MAX_UPGRADE_LEVEL;
    }

    undoUpgradePlanButton.disabled = draftUpgradePlan.length === 0;
    clearUpgradePlanButton.disabled = draftUpgradePlan.length === 0;
    upgradePlanHelp.textContent =
      draftUpgradePlan.length === 0
        ? "성장 단계를 하나 이상 골라. 비어 있으면 균형 순서가 적용돼."
        : `${draftUpgradePlan.length}/${MAX_UPGRADE_PLAN_STEPS}단계 · 처치할 때마다 다음 단계가 자동 적용돼.`;
  };

  const renderStartingItemSelection = (): void => {
    const selectedCount = startingItemInputs.filter(({ checked }) => checked).length;

    for (const input of startingItemInputs) {
      input.disabled = selectedCount >= 2 && !input.checked;
    }

    startingItemsHelp.textContent =
      selectedCount === 2 ? "선택 완료. 다른 걸 고르려면 하나를 먼저 빼." : "하나를 더 골라.";
  };

  const renderSettingsSummary = (): void => {
    const settings = readSettings();
    initialItemCount.max = String(Math.ceil(settings.playerCount * 0.5));
    initialItemCount.value = String(settings.initialItemCount);
    initialItemCountValue.value = `${settings.initialItemCount}개`;
    itemRespawn.value = String(settings.itemRespawnSeconds);
    itemRespawnValue.value =
      settings.itemRespawnSeconds === 0 ? "추가 없음" : `${settings.itemRespawnSeconds}초`;
    const collapseLabel =
      settings.collapseSpeed === "slow"
        ? "붕괴 느림"
        : settings.collapseSpeed === "fast"
          ? "붕괴 빠름"
          : "붕괴 보통";
    startingWeight.value = String(settings.startingWeight);
    startingWeightValue.value = String(settings.startingWeight);
    const loadoutLabel = settings.startingItems.map((item) => ITEM_LABELS[item]).join(" + ");
    setupSummary.textContent = `${collapseLabel} · 몸무게 ${settings.startingWeight} · ${loadoutLabel} · 자동 성장 ${settings.upgradePlan.length}단계 · 맵 아이템 ${settings.initialItemCount}개 · ${
      settings.itemRespawnSeconds === 0
        ? "추가 생성 없음"
        : `${settings.itemRespawnSeconds}초마다 1개`
    }`;
    root.dataset.scale = "mayhem";
  };

  if (import.meta.env.DEV) {
    debugTuningPanel.hidden = false;
    debugTuning = createDebugTuningController(root, { onChange(): void {} });
  } else {
    debugTuningPanel.remove();
  }

  const hydrateSettingsForm = (): void => {
    setSelectedCollapseSpeed(form, latestSettings.collapseSpeed);
    startingWeight.value = String(latestSettings.startingWeight);
    startingWeightValue.value = String(latestSettings.startingWeight);
    initialItemCount.max = String(Math.ceil(latestSettings.playerCount * 0.5));
    initialItemCount.value = String(latestSettings.initialItemCount);
    itemRespawn.value = String(latestSettings.itemRespawnSeconds);

    for (const input of startingItemInputs) {
      input.checked = latestSettings.startingItems.some((item) => item === input.value);
    }

    draftUpgradePlan = [...latestSettings.upgradePlan];

    debugTuning?.load(latestGameplayTuning, latestDebugTuningEnabled);
    renderStartingItemSelection();
    renderUpgradePlan();
    renderSettingsSummary();
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
    telemetry.dataset.roundId = String(current.frame.roundId);
    actionValue.value = ACTION_LABELS[human.action];
    const renderActionStatus = (
      output: HTMLOutputElement,
      key: string,
      label: string,
      readyTick: number,
    ): void => {
      const cooldownTicks = Math.max(0, readyTick - current.frame.tick);
      const unavailableReason =
        current.countdown !== null
          ? "준비 중"
          : !human.active || human.action === "Falling" || human.action === "Eliminated"
            ? "탈락"
            : human.action === "Anchored"
              ? "벽돌 위"
              : human.action !== "Ready"
                ? "행동 중"
                : null;

      if (unavailableReason !== null) {
        output.dataset.state = "blocked";
        output.value = `${key} · ${label} · ${unavailableReason}`;
      } else if (cooldownTicks > 0) {
        output.dataset.state = "cooldown";
        output.value = `${key} · ${label} · ${(cooldownTicks / 60).toFixed(1)}초`;
      } else {
        output.dataset.state = "ready";
        output.value = `${key} · ${label} · 사용 가능`;
      }
    };
    renderActionStatus(shoveStatusValue, "Space", "밀치기", human.shoveReadyTick);
    renderActionStatus(dodgeStatusValue, "Shift", "회피", human.dodgeReadyTick);
    massValue.value =
      human.massFactor < 0.9 ? "가벼움" : human.massFactor > 1.1 ? "무거움" : "보통";
    const inventoryLabel = human.inventory
      .map(({ definitionId, charges }) =>
        charges === null ? ITEM_LABELS[definitionId] : `${ITEM_LABELS[definitionId]} ${charges}`,
      )
      .join(" · ");
    const effectLabel = human.effects
      .map(({ definitionId, endsTick }) =>
        definitionId === "boat" && endsTick !== null
          ? `배 ${Math.max(0, Math.ceil((endsTick - current.frame.tick) / 60))}초`
          : ITEM_LABELS[definitionId],
      )
      .join(" · ");
    effectValue.value =
      [inventoryLabel, effectLabel].filter((label) => label.length > 0).join(" · ") ||
      (human.springBoosted ? "스프링 발동" : "없음");
    itemValue.value = String(current.frame.items.length);
    for (const [slotIndex, button] of itemSlotButtons.entries()) {
      const slot = human.inventory.find((candidate) => candidate.slotIndex === slotIndex);
      const label = slot === undefined ? `슬롯 ${slotIndex + 1}` : ITEM_LABELS[slot.definitionId];
      const amount =
        slot === undefined ? "비어 있음" : slot.charges === null ? "상시" : `${slot.charges}회`;
      const key = slotIndex === 0 ? "Q" : "E";
      button.textContent = `${key} · ${label} · ${amount}`;
      button.setAttribute(
        "aria-label",
        slot === undefined
          ? `${label}, 비어 있음`
          : slot.charges === null
            ? `${label}, 상시 효과`
            : `${label} 사용, ${amount} 남음`,
      );
      button.disabled =
        current.countdown !== null ||
        current.frame.round.status !== "Active" ||
        !human.active ||
        human.action === "Falling" ||
        human.action === "Eliminated" ||
        (slot?.definitionId !== "wind-blast" &&
          slot?.definitionId !== "brick-bag" &&
          slot?.definitionId !== "boat" &&
          slot?.definitionId !== "bomb" &&
          slot?.definitionId !== "soap" &&
          slot?.definitionId !== "grappling-hook") ||
        slot.charges === null ||
        slot.charges < 1;
    }
    survivorValue.value = String(
      current.frame.participants.filter(
        (participant) =>
          participant.active &&
          participant.action !== "Falling" &&
          participant.action !== "Eliminated",
      ).length,
    );
    developerTelemetry?.update({
      tick: current.frame.tick,
      rate: current.simulationRate,
      position: `${human.position.x.toFixed(2)}, ${human.position.y.toFixed(2)}`,
      seed: current.masterSeed,
      stateHash: current.frame.stateHash,
    });
    statPointsValue.value = String(human.progression.statPoints);

    for (const stat of UPGRADE_STAT_IDS) {
      statLevelOutputs[stat].value = String(human.progression.stats[stat]);
    }
    const nextUpgrade = getNextPlannedUpgrade(
      Object.freeze({
        ...human.progression,
        statPoints: Math.max(1, human.progression.statPoints),
      }),
      latestSettings.upgradePlan,
    );
    nextUpgradeValue.value = nextUpgrade === null ? "완료" : UPGRADE_LABELS[nextUpgrade];
    if (current.countdown !== null) {
      root.dataset.round = "countdown";
      readyMessage.textContent = String(current.countdown);
    } else if (root.dataset.round === "countdown") {
      root.dataset.round = "active";
      readyMessage.textContent = "시작!";
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
        const message = events
          .toReversed()
          .map(getEventMessage)
          .find((value) => value !== undefined);

        if (message !== undefined) {
          readyMessage.textContent = message;
        }
      },
      onHumanEliminated(): void {
        root.dataset.humanEliminated = "true";
        readyMessage.textContent = "떨어졌어. 남은 승부를 빠르게 돌리는 중.";
      },
      onRoundCompleted(frame): void {
        const { round } = frame;

        if (latestMasterSeed === undefined) {
          throw new Error("Completed round is missing its master seed.");
        }

        latestRoundReport = serializePlaytestRoundReport(
          createPlaytestRoundReport(latestSettings, latestMasterSeed, frame, latestGameplayTuning),
        );
        root.dataset.round = "completed";
        copyRoundReportButton.hidden = false;
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
          readyMessage.textContent = "계속";
        }
      },
      onFatalError(error): void {
        latestRoundReport = undefined;
        copyRoundReportButton.hidden = true;
        root.dataset.round = "fatal";
        rendererStatus.dataset.state = "error";
        rendererStatus.textContent = "라운드를 멈췄어";
        readyMessage.textContent = "문제가 생겼어. 다시 시작해 줘.";
        restartButton.focus();
        console.error("The Shovefall round stopped at its error boundary.", error);
      },
    });
    pointerControls = createPointerControls({
      arena: arenaHost,
      joystick: pointerJoystick,
      joystickKnob: pointerJoystickKnob,
      shoveButton: touchShoveButton,
      dodgeButton: touchDodgeButton,
      isActive: () =>
        session?.active === true &&
        root.dataset.round === "active" &&
        root.dataset.humanEliminated !== "true",
      onMove: (x, y) => session?.setPointerMovement(x, y),
      onShove: () => session?.queueShove(),
      onDodge: () => session?.queueDodge(),
    });
    rendererStatus.dataset.state = "ready";
    rendererStatus.textContent = "WebGL 준비됨";
  } catch (error: unknown) {
    reportRendererFailure(rendererStatus);
    startGameButton.disabled = true;
    requireElement(form, "button[type='submit']", HTMLButtonElement).disabled = true;
    console.error("Unable to initialize the PixiJS renderer.", error);
  }

  const startRound = (settings: GameSettings): void => {
    if (session === undefined) {
      return;
    }

    latestSettings = settings;
    latestMasterSeed = createRoundSeed();
    latestRoundReport = undefined;
    copyRoundReportButton.hidden = true;
    copyRoundReportButton.textContent = "기록 복사";
    void audio?.unlock();
    setScreen("arena");
    root.dataset.round = "countdown";
    delete root.dataset.humanEliminated;
    root.dataset.initialItems = String(settings.initialItemCount);
    root.dataset.botDifficulty = FORCED_BOT_DIFFICULTY;
    root.dataset.collapseSpeed = settings.collapseSpeed;
    root.dataset.gameplayTuning = latestDebugTuningEnabled ? "debug" : "default";
    arenaActions.hidden = false;
    inventoryActions.hidden = false;
    statStatus.hidden = false;
    telemetry.hidden = false;
    developerTelemetry?.setVisible(true);
    readyMessage.textContent = "3";
    arenaHost.setAttribute(
      "aria-label",
      `${settings.playerCount}명이 참가하는 바닥이 사라지는 술래잡기 아레나. WASD, 방향키, 마우스 드래그 또는 터치 조이스틱으로 이동하고 Q와 E로 시작 아이템을 사용해.`,
    );
    session.start(createConfig(settings), latestMasterSeed, latestGameplayTuning, {
      massFactor: getStartingMassFactor(settings.startingWeight),
      startingItems: settings.startingItems,
      upgradePlan: settings.upgradePlan,
    });
    arenaHost.focus();
  };

  startingWeight.addEventListener("input", renderSettingsSummary);
  initialItemCount.addEventListener("input", renderSettingsSummary);
  itemRespawn.addEventListener("input", renderSettingsSummary);

  form.addEventListener("change", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.name === "startingItem") {
      renderStartingItemSelection();
    }

    renderSettingsSummary();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    latestSettings = readSettings();
    latestDebugTuningEnabled = debugTuning?.enabled ?? false;
    latestGameplayTuning = latestDebugTuningEnabled
      ? (debugTuning?.read() ?? DEFAULT_GAMEPLAY_TUNING)
      : DEFAULT_GAMEPLAY_TUNING;
    setScreen("menu");
    startGameButton.focus();
  });

  startGameButton.addEventListener("click", () => startRound(latestSettings));

  openSettingsButton.addEventListener("click", () => {
    hydrateSettingsForm();
    setScreen("settings");
    requireElement(root, "#setup-title", HTMLElement).focus({ preventScroll: true });
  });

  openVersionHistoryButton.addEventListener("click", () => {
    setScreen("history");
    versionHistoryTitle.focus({ preventScroll: true });
  });

  const closeVersionHistory = (): void => {
    setScreen("menu");
    openVersionHistoryButton.focus();
  };

  closeVersionHistoryButton.addEventListener("click", closeVersionHistory);

  const handleVersionHistoryEscape = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && root.dataset.screen === "history") {
      event.preventDefault();
      closeVersionHistory();
    }
  };

  document.addEventListener("keydown", handleVersionHistoryEscape);

  cancelSettingsButton.addEventListener("click", () => {
    hydrateSettingsForm();
    setScreen("menu");
    startGameButton.focus();
  });

  restartButton.addEventListener("click", () => startRound(latestSettings));

  for (const button of addUpgradeButtons) {
    button.addEventListener("click", () => {
      const stat = button.dataset.addUpgrade;

      if (!isUpgradeStatId(stat)) {
        return;
      }

      draftUpgradePlan = [...normalizeUpgradePlan([...draftUpgradePlan, stat])];
      renderUpgradePlan();
      renderSettingsSummary();
    });
  }

  clearUpgradePlanButton.addEventListener("click", () => {
    draftUpgradePlan = [];
    renderUpgradePlan();
    renderSettingsSummary();
  });

  undoUpgradePlanButton.addEventListener("click", () => {
    draftUpgradePlan = draftUpgradePlan.slice(0, -1);
    renderUpgradePlan();
    renderSettingsSummary();
  });

  resetUpgradePlanButton.addEventListener("click", () => {
    draftUpgradePlan = [...DEFAULT_UPGRADE_PLAN];
    renderUpgradePlan();
    renderSettingsSummary();
  });

  for (const [slotIndex, button] of itemSlotButtons.entries()) {
    button.addEventListener("click", () => {
      session?.queueItemSlot(slotIndex === 0 ? 0 : 1);
      arenaHost.focus({ preventScroll: true });
    });
  }

  const copyRoundReport = async (): Promise<void> => {
    if (latestRoundReport === undefined) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText === undefined) {
        throw new Error("Clipboard API is unavailable.");
      }

      await navigator.clipboard.writeText(latestRoundReport);
      copyRoundReportButton.textContent = "복사됨";
      readyMessage.textContent = "개인정보 없는 라운드 기록을 복사했어.";
    } catch (error: unknown) {
      copyRoundReportButton.textContent = "복사 실패";
      readyMessage.textContent = "기록을 복사하지 못했어. 다시 시도해 줘.";
      console.error("Unable to copy the local playtest round report.", error);
    }
  };

  copyRoundReportButton.addEventListener("click", () => {
    void copyRoundReport();
  });

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
    latestRoundReport = undefined;
    copyRoundReportButton.hidden = true;
    setScreen("menu");
    delete root.dataset.round;
    arenaActions.hidden = true;
    inventoryActions.hidden = true;
    telemetry.hidden = true;
    developerTelemetry?.setVisible(false);
    rendererStatus.dataset.state = "ready";
    rendererStatus.textContent = "WebGL 준비됨";
    arenaHost.setAttribute("aria-label", "바닥이 사라지는 술래잡기 아레나");
    startGameButton.focus();
  });

  window.addEventListener(
    "pagehide",
    () => {
      session?.destroy();
      renderer?.destroy();
      audio?.destroy();
      debugTuning?.destroy();
      pointerControls?.destroy();
      document.removeEventListener("keydown", handleVersionHistoryEscape);

      if (import.meta.env.DEV) {
        window.removeEventListener("shovefall:diagnostic-fatal", handleDiagnosticFatal);
      }
    },
    { once: true },
  );

  renderSettingsSummary();
  renderStartingItemSelection();
  renderVersionHistory();
}
