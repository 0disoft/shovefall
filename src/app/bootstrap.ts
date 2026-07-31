import {
  FORCED_BOT_DIFFICULTY,
  getArenaSize,
  normalizeSettings,
  PUBLIC_ROUND_LIMIT_SECONDS,
  type GameSettings,
} from "./settings";
import { createGameSession, type GameSession, type SessionTelemetry } from "./game-session";
import {
  createGrappleButtonViewModel,
  createItemButtonViewModel,
  createSkillButtonViewModel,
} from "./action-hud";
import {
  isFontScaleId,
  loadUserPreferences,
  normalizeUserPreferences,
  saveUserPreferences,
  type UserPreferences,
} from "./user-preferences";
import { createPointerControls, type PointerControls } from "./pointer-controls";
import {
  createPlaytestRoundReport,
  type HumanUpgradeSelection,
  serializePlaytestRoundReport,
} from "./round-report";
import { VERSION_HISTORY } from "./version-history";
import {
  createScoreboardEntry,
  loadScoreboard,
  saveScoreboardEntry,
  type ScoreboardEntry,
  type ScoreboardStorage,
} from "./scoreboard";
import type {
  RenderFrameV1,
  SimulationEventV1,
  StartingAttributeId,
  StartingAttributes,
  UpgradeStatId,
} from "../simulation/contracts";
import { normalizeGameConfig } from "../simulation/contracts";
import { DEFAULT_GAMEPLAY_TUNING } from "../simulation/tuning";
import {
  getMobilityMultiplier,
  getMobilityCooldownMultiplier,
  getMobilityManaCostMultiplier,
  getMobilityStumbleDurationMultiplier,
  getHealthRegenMultiplier,
  getFocusSkillDamageMultiplier,
  getDamageTakenMultiplier,
  getManaRegenMultiplier,
  getMaximumHealth,
  getMaximumMana,
  getPowerMassMultiplier,
  getPowerMultiplier,
  getReflexShieldMultiplier,
  getStabilityControlDurationMultiplier,
  getStabilityMultiplier,
  UPGRADE_EFFECTS,
  isUpgradeStatId,
  canSpendStatPoint,
  MAX_UPGRADE_LEVEL,
} from "../simulation/progression";
import { formatSkillDescription, getSkillDefinition, isSkillDefinitionId } from "../content/skills";
import {
  formatItemEffectDescription,
  getItemDefinition,
  isItemDefinitionId,
} from "../content/items";
import { createArenaRenderer, type ArenaRenderer } from "../presentation/arena-renderer";
import {
  createBackgroundMusic,
  createAudioFeedback,
  type AudioFeedback,
  type AudioFeedbackState,
  type BackgroundMusic,
  type BackgroundMusicState,
} from "../presentation/audio-feedback";
import { FIXED_TICKS_PER_SECOND, PRODUCT_VERSION } from "../simulation/versions";
import {
  getStartingAttributePointTotal,
  getStartingControlDurationMultiplier,
  getStartingCooldownMultiplier,
  getStartingDamageTakenMultiplier,
  getStartingHealthRegenMultiplier,
  getStartingIncomingImpulseMultiplier,
  getStartingManaRegenMultiplier,
  getStartingManaCostMultiplier,
  getStartingMassFactor,
  getStartingMaximumHealthBonus,
  getStartingMaximumManaBonus,
  getStartingMovementMultiplier,
  getStartingOutgoingMultiplier,
  getStartingShieldMultiplier,
  STARTING_ATTRIBUTE_IDS,
  STARTING_ATTRIBUTE_LIMITS,
  STARTING_ATTRIBUTE_POINT_TOTAL,
} from "../simulation/starting-attributes";

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
  Slipping: "미끄러짐",
  Anchored: "고정",
  Falling: "낙하",
  Eliminated: "탈락",
} as const);

const UPGRADE_LABELS: Readonly<Record<UpgradeStatId, string>> = Object.freeze({
  power: "완력",
  stability: "균형",
  mobility: "민첩",
  reflex: "의지",
  vitality: "체질",
  focus: "정신",
});

const STARTING_ATTRIBUTE_LABELS: Readonly<Record<StartingAttributeId, string>> = Object.freeze({
  strength: "완력",
  agility: "민첩",
  constitution: "체질",
  spirit: "정신",
  balance: "균형",
  willpower: "의지",
});

interface UpgradeEffectView {
  readonly label: string;
  readonly current: string;
  readonly next: string;
}

function formatSignedPercent(value: number): string {
  const percentage = Math.round(value * 1_000) / 10;
  return `${percentage > 0 ? "+" : ""}${percentage}%`;
}

function getUpgradeEffectViews(id: UpgradeStatId, rank: number): readonly UpgradeEffectView[] {
  const nextRank = Math.min(MAX_UPGRADE_LEVEL, rank + 1);
  switch (id) {
    case "power":
      return [
        {
          label: "무게 보정",
          current: formatSignedPercent(rank * UPGRADE_EFFECTS.powerMassPerLevel),
          next: formatSignedPercent(nextRank * UPGRADE_EFFECTS.powerMassPerLevel),
        },
        {
          label: "공격 위력",
          current: formatSignedPercent(rank * UPGRADE_EFFECTS.powerOutgoingPerLevel),
          next: formatSignedPercent(nextRank * UPGRADE_EFFECTS.powerOutgoingPerLevel),
        },
      ];
    case "stability":
      return [
        {
          label: "밀침 저항",
          current: formatSignedPercent(rank * UPGRADE_EFFECTS.stabilityImpulseReductionPerLevel),
          next: formatSignedPercent(nextRank * UPGRADE_EFFECTS.stabilityImpulseReductionPerLevel),
        },
        {
          label: "제어 시간",
          current: formatSignedPercent(-rank * UPGRADE_EFFECTS.stabilityControlReductionPerLevel),
          next: formatSignedPercent(-nextRank * UPGRADE_EFFECTS.stabilityControlReductionPerLevel),
        },
      ];
    case "mobility":
      return [
        {
          label: "이동 속도",
          current: formatSignedPercent(rank * UPGRADE_EFFECTS.mobilitySpeedPerLevel),
          next: formatSignedPercent(nextRank * UPGRADE_EFFECTS.mobilitySpeedPerLevel),
        },
        {
          label: "재사용 대기",
          current: formatSignedPercent(-rank * UPGRADE_EFFECTS.mobilityCooldownReductionPerLevel),
          next: formatSignedPercent(-nextRank * UPGRADE_EFFECTS.mobilityCooldownReductionPerLevel),
        },
        {
          label: "마나 소모",
          current: formatSignedPercent(-rank * UPGRADE_EFFECTS.mobilityManaCostReductionPerLevel),
          next: formatSignedPercent(-nextRank * UPGRADE_EFFECTS.mobilityManaCostReductionPerLevel),
        },
        {
          label: "휘청 시간",
          current: formatSignedPercent(-rank * UPGRADE_EFFECTS.mobilityStumbleReductionPerLevel),
          next: formatSignedPercent(-nextRank * UPGRADE_EFFECTS.mobilityStumbleReductionPerLevel),
        },
      ];
    case "reflex":
      return [
        {
          label: "받는 피해",
          current: formatSignedPercent(-rank * UPGRADE_EFFECTS.reflexDamageReductionPerLevel),
          next: formatSignedPercent(-nextRank * UPGRADE_EFFECTS.reflexDamageReductionPerLevel),
        },
        {
          label: "보호막",
          current: formatSignedPercent(rank * UPGRADE_EFFECTS.reflexShieldPerLevel),
          next: formatSignedPercent(nextRank * UPGRADE_EFFECTS.reflexShieldPerLevel),
        },
      ];
    case "vitality":
      return [
        {
          label: "최대 체력",
          current: String(100 + rank * UPGRADE_EFFECTS.vitalityHealthPerLevel),
          next: String(100 + nextRank * UPGRADE_EFFECTS.vitalityHealthPerLevel),
        },
        {
          label: "체력 재생",
          current: formatSignedPercent(rank * UPGRADE_EFFECTS.vitalityRegenPerLevel),
          next: formatSignedPercent(nextRank * UPGRADE_EFFECTS.vitalityRegenPerLevel),
        },
      ];
    case "focus":
      return [
        {
          label: "최대 마나",
          current: String(100 + rank * UPGRADE_EFFECTS.focusManaPerLevel),
          next: String(100 + nextRank * UPGRADE_EFFECTS.focusManaPerLevel),
        },
        {
          label: "마나 재생",
          current: formatSignedPercent(rank * UPGRADE_EFFECTS.focusRegenPerLevel),
          next: formatSignedPercent(nextRank * UPGRADE_EFFECTS.focusRegenPerLevel),
        },
        {
          label: "스킬 피해",
          current: formatSignedPercent(rank * UPGRADE_EFFECTS.focusSkillDamagePerLevel),
          next: formatSignedPercent(nextRank * UPGRADE_EFFECTS.focusSkillDamagePerLevel),
        },
      ];
  }
  return [];
}

function renderUpgradeEffectViews(
  container: HTMLElement,
  views: readonly UpgradeEffectView[],
): void {
  const rows = views.map(({ label, current, next }) => {
    const row = document.createElement("span");
    row.className = "trait-upgrade__delta-row";

    const name = document.createElement("span");
    name.className = "trait-upgrade__delta-label";
    name.textContent = label;

    const values = document.createElement("span");
    values.className = "trait-upgrade__delta-values";

    const currentValue = document.createElement("span");
    currentValue.textContent = current;

    const arrow = document.createElement("span");
    arrow.className = "trait-upgrade__delta-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";

    const nextValue = document.createElement("strong");
    nextValue.textContent = next;

    values.append(currentValue, arrow, nextValue);
    row.append(name, values);
    return row;
  });

  container.replaceChildren(...rows);
  container.setAttribute(
    "aria-label",
    views.map(({ label, current, next }) => `${label} ${current}에서 ${next}`).join(", "),
  );
}

const SKILL_SLOT_INDICES = Object.freeze([0, 1] as const);
const ITEM_SLOT_INDICES = Object.freeze([0] as const);
const SETTINGS_TAB_IDS = Object.freeze(["attributes", "skills", "items", "preferences"] as const);
type SettingsTabId = (typeof SETTINGS_TAB_IDS)[number];
const BASE_STARTING_HEALTH = 100;
const BASE_STARTING_MANA = 100;
const EMPTY_STARTING_ATTRIBUTES: StartingAttributes = Object.freeze({
  strength: 0,
  agility: 0,
  constitution: 0,
  spirit: 0,
  balance: 0,
  willpower: 0,
});

function formatPercentDelta(multiplier: number): string {
  const percentage = Math.round((multiplier - 1) * 1_000) / 10;
  if (percentage === 0) {
    return "0%";
  }
  return `${percentage > 0 ? "+" : ""}${percentage}%`;
}

function formatResistance(multiplier: number): string {
  const percentage = Math.round((1 - multiplier) * 1_000) / 10;
  if (percentage === 0) {
    return "0%";
  }
  return `${percentage > 0 ? "+" : ""}${percentage}%`;
}

function formatBaselineAdjustment(multiplier: number): string {
  const adjustment = formatPercentDelta(multiplier);
  return adjustment === "0%" ? "기본" : adjustment;
}

function isStartingAttributeId(value: unknown): value is StartingAttributeId {
  return STARTING_ATTRIBUTE_IDS.some((id) => id === value);
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

function renderMetricChips(container: HTMLElement, labels: readonly string[]): void {
  const chips = labels.map((label) => {
    const chip = document.createElement("span");
    chip.textContent = label;
    return chip;
  });
  container.replaceChildren(...chips);
}

function renderCardEffectRows(
  container: HTMLElement,
  description: string,
  separator: RegExp,
): void {
  const rows = description
    .split(separator)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const row = document.createElement("span");
      row.className = "loadout-card__effect-row";
      row.setAttribute("role", "listitem");
      row.textContent = part;
      return row;
    });

  container.setAttribute("role", "list");
  container.replaceChildren(...rows);
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
    roundLimitSeconds: PUBLIC_ROUND_LIMIT_SECONDS,
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
    case "skill-used":
      return event.actorId === 1 && event.skillDefinitionId !== undefined
        ? `${getSkillDefinition(event.skillDefinitionId).label}!`
        : undefined;
    case "skill-hit":
      return event.actorId === 1 ? `적중 · ${Math.round(event.amount ?? 0)} 피해` : undefined;
    case "shield-applied":
      return event.actorId === 1 ? `보호막 ${Math.round(event.amount ?? 0)}` : undefined;
    case "status-applied":
      return event.targetActorId === 1
        ? event.statusKind === "stun"
          ? "기절했어!"
          : event.statusKind === "root"
            ? "움직일 수 없어!"
            : "느려졌어!"
        : undefined;
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
        ? `${getItemDefinition(event.itemDefinitionId).label} 획득!`
        : undefined;
    case "item-used":
      return event.actorId !== 1
        ? undefined
        : event.itemDefinitionId === "soap"
          ? "비누를 설치했어."
          : event.itemDefinitionId === "brick-bag"
            ? "벽돌을 세웠어."
            : event.itemDefinitionId === "boat"
              ? `배를 띄웠어. ${(getItemDefinition("boat").durationTicks ?? 0) / 60}초 동안 물을 건널 수 있어.`
              : event.itemDefinitionId === "bomb"
                ? `폭탄을 놨어. ${getItemDefinition("bomb").fuseTicks / 60}초 뒤 터져.`
                : undefined;
    case "soap-triggered":
      return event.actorId === 1 ? "비누 함정 적중!" : undefined;
    case "bomb-detonated":
      return event.actorId === 1 ? "폭탄 폭발!" : undefined;
    case "grappling-hook-hit":
      return event.actorId === 1 ? "갈고리가 걸렸어." : undefined;
    case "stat-point-earned":
      return event.actorId === 1 ? "처치 성공! 특성 포인트 1 획득." : undefined;
    case "stat-upgraded":
      return event.actorId === 1
        ? event.upgradeSkillSlot === undefined
          ? "전투 성장을 올렸어."
          : "스킬을 강화했어."
        : undefined;
    default:
      return undefined;
  }
}

export async function bootstrapApplication(root: HTMLElement): Promise<void> {
  const skipLink = requireElement(document, ".skip-link", HTMLAnchorElement);
  const startGameButton = requireElement(root, "#start-game", HTMLButtonElement);
  const openSettingsButton = requireElement(root, "#open-settings", HTMLButtonElement);
  const setupRequiredDialog = requireElement(root, "#setup-required-dialog", HTMLDialogElement);
  const goToRequiredSettingsButton = requireElement(
    root,
    "#go-to-required-settings",
    HTMLButtonElement,
  );
  const closeSetupRequiredButton = requireElement(root, "#close-setup-required", HTMLButtonElement);
  const roundBriefingDialog = requireElement(root, "#round-briefing-dialog", HTMLDialogElement);
  const roundBriefingStatus = requireElement(root, "#round-briefing-status", HTMLElement);
  const confirmRoundBriefingButton = requireElement(
    root,
    "#confirm-round-briefing",
    HTMLButtonElement,
  );
  const openScoreboardButton = requireElement(root, "#open-scoreboard", HTMLButtonElement);
  const closeScoreboardButton = requireElement(root, "#close-scoreboard", HTMLButtonElement);
  const scoreboardTitle = requireElement(root, "#scoreboard-title", HTMLElement);
  const scoreboardSummary = requireElement(root, "#scoreboard-summary", HTMLOutputElement);
  const scoreboardEmpty = requireElement(root, "#scoreboard-empty", HTMLElement);
  const scoreboardList = requireElement(root, "#scoreboard-list", HTMLOListElement);
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
  const settingsTabButtons = new Map(
    SETTINGS_TAB_IDS.map((id) => [
      id,
      requireElement(form, `[data-settings-tab="${id}"]`, HTMLButtonElement),
    ]),
  );
  const settingsPanels = new Map(
    SETTINGS_TAB_IDS.map((id) => [
      id,
      requireElement(form, `[data-settings-panel="${id}"]`, HTMLElement),
    ]),
  );
  const startingAttributeRemaining = requireElement(
    root,
    "#starting-attribute-remaining",
    HTMLOutputElement,
  );
  const startingAttributeRows = new Map(
    STARTING_ATTRIBUTE_IDS.map((id) => {
      const row = requireElement(root, `[data-starting-attribute="${id}"]`, HTMLElement);
      return [
        id,
        Object.freeze({
          row,
          output: requireElement(row, `#starting-attribute-${id}`, HTMLOutputElement),
          decrement: requireElement(row, '[data-attribute-step="-1"]', HTMLButtonElement),
          increment: requireElement(row, '[data-attribute-step="1"]', HTMLButtonElement),
          meter: requireElement(row, ".starting-attribute__meter > span", HTMLElement),
        }),
      ] as const;
    }),
  );
  const getStartingAttributeControls = (id: StartingAttributeId) => {
    const controls = startingAttributeRows.get(id);
    if (controls === undefined) {
      throw new Error(`Missing starting attribute controls for ${id}.`);
    }
    return controls;
  };
  const startingTotalMeters = [...root.querySelectorAll<HTMLElement>("[data-combat-stat]")].map(
    (card) => {
      const id = card.dataset.combatStat;
      if (!isStartingAttributeId(id)) {
        throw new Error(`Unsupported combat stat meter source ${id ?? "missing"}.`);
      }
      return Object.freeze({
        card,
        id,
        fill: requireElement(card, ".combat-stat-meter > span", HTMLElement),
      });
    },
  );
  const startingTotalOutputs = Object.freeze({
    mass: requireElement(root, "#starting-total-mass", HTMLOutputElement),
    health: requireElement(root, "#starting-total-health", HTMLOutputElement),
    mana: requireElement(root, "#starting-total-mana", HTMLOutputElement),
    movement: requireElement(root, "#starting-total-movement", HTMLOutputElement),
    cooldown: requireElement(root, "#starting-total-cooldown", HTMLOutputElement),
    power: requireElement(root, "#starting-total-power", HTMLOutputElement),
    resistance: requireElement(root, "#starting-total-resistance", HTMLOutputElement),
    control: requireElement(root, "#starting-total-control", HTMLOutputElement),
    damageTaken: requireElement(root, "#starting-total-damage-taken", HTMLOutputElement),
    shield: requireElement(root, "#starting-total-shield", HTMLOutputElement),
    healthRegen: requireElement(root, "#starting-total-health-regen", HTMLOutputElement),
    manaRegen: requireElement(root, "#starting-total-mana-regen", HTMLOutputElement),
  });
  const saveSettingsButton = requireElement(form, 'button[type="submit"]', HTMLButtonElement);
  const startingItemCount = requireElement(root, "#starting-item-count", HTMLOutputElement);
  const startingSkillCount = requireElement(root, "#starting-skill-count", HTMLOutputElement);
  const fontScaleInputs = [...form.querySelectorAll<HTMLInputElement>('input[name="fontScale"]')];
  const soundEffectsVolume = requireElement(form, "#sound-effects-volume", HTMLInputElement);
  const soundEffectsVolumeValue = requireElement(
    form,
    "#sound-effects-volume-value",
    HTMLOutputElement,
  );
  const backgroundMusicVolume = requireElement(form, "#background-music-volume", HTMLInputElement);
  const backgroundMusicVolumeValue = requireElement(
    form,
    "#background-music-volume-value",
    HTMLOutputElement,
  );
  const startingItemInputs = [
    ...form.querySelectorAll<HTMLInputElement>('input[name="startingItem"]'),
  ];
  const startingSkillInputs = [
    ...form.querySelectorAll<HTMLInputElement>('input[name="startingSkill"]'),
  ];

  for (const input of startingSkillInputs) {
    if (!isSkillDefinitionId(input.value)) {
      throw new Error(`Unknown starting skill definition: ${input.value}`);
    }
    const card = requireElement(input.closest("label") ?? form, "span:last-child", HTMLSpanElement);
    const definition = getSkillDefinition(input.value);
    requireElement(card, "strong", HTMLElement).textContent = definition.label;
    renderMetricChips(requireElement(card, ".skill-card__meta", HTMLElement), [
      `마나 ${definition.manaCost}`,
      `재사용 ${definition.cooldownTicks / 60}초`,
    ]);
    renderCardEffectRows(
      requireElement(card, ".skill-card__effect", HTMLElement),
      formatSkillDescription(definition),
      /,\s+/u,
    );
  }

  for (const input of startingItemInputs) {
    if (!isItemDefinitionId(input.value)) {
      throw new Error(`Unknown starting item definition: ${input.value}`);
    }
    const card = requireElement(input.closest("label") ?? form, "span:last-child", HTMLSpanElement);
    const definition = getItemDefinition(input.value);
    requireElement(card, "strong", HTMLElement).textContent = definition.label;
    renderMetricChips(requireElement(card, ".item-card__meta", HTMLElement), [
      definition.startingCharges === null ? "상시" : `${definition.startingCharges}회`,
      definition.targetMode === "self"
        ? "즉시 사용"
        : definition.targetMode === "direction"
          ? "방향 지정"
          : "설치 위치 선택",
    ]);
    renderCardEffectRows(
      requireElement(card, ".item-card__effect", HTMLElement),
      formatItemEffectDescription(definition),
      /\s+·\s+/u,
    );
  }
  const arenaActions = requireElement(root, "#arena-actions", HTMLElement);
  const readyMessage = requireElement(root, "#round-message", HTMLElement);
  const targetingHelp = requireElement(root, "#targeting-help", HTMLElement);
  const pauseMenu = requireElement(root, "#pause-menu", HTMLElement);
  const pauseMenuTitle = requireElement(root, "#pause-menu-title", HTMLElement);
  const pauseRoundButton = requireElement(root, "#pause-round", HTMLButtonElement);
  const resumeRoundButton = requireElement(root, "#resume-round", HTMLButtonElement);
  const viewFinishedMapButton = requireElement(root, "#view-finished-map", HTMLButtonElement);
  const restartButton = requireElement(root, "#restart-round", HTMLButtonElement);
  const backButton = requireElement(root, "#back-to-settings", HTMLButtonElement);
  const copyRoundReportButton = requireElement(root, "#copy-round-report", HTMLButtonElement);
  const soundButton = requireElement(root, "#toggle-sound", HTMLButtonElement);
  const arenaHost = requireElement(root, "#arena-host", HTMLElement);
  const damageFlash = requireElement(root, "#damage-flash", HTMLElement);
  const killFlash = requireElement(root, "#kill-flash", HTMLElement);
  const upgradeFlash = requireElement(root, "#upgrade-flash", HTMLElement);
  const pointerJoystick = requireElement(root, "#pointer-joystick", HTMLElement);
  const pointerJoystickKnob = requireElement(root, "#pointer-joystick-knob", HTMLElement);
  const touchSkillButtons = Object.freeze([
    requireElement(root, "#touch-skill-0", HTMLButtonElement),
    requireElement(root, "#touch-skill-1", HTMLButtonElement),
  ] as const);
  const touchGrappleButton = requireElement(root, "#touch-grapple", HTMLButtonElement);
  const touchItemButtons = Object.freeze([
    requireElement(root, "#touch-item-0", HTMLButtonElement),
  ] as const);
  const skillActions = requireElement(root, "#skill-actions", HTMLElement);
  const inventoryActions = requireElement(root, "#inventory-actions", HTMLElement);
  const statStatus = requireElement(root, "#stat-status", HTMLElement);
  const statUpgradeOverlay = requireElement(root, "#stat-upgrade-overlay", HTMLElement);
  const statUpgradeForm = requireElement(root, "#stat-upgrade-form", HTMLFormElement);
  const saveTraitUpgradeButton = requireElement(root, "#save-trait-upgrade", HTMLButtonElement);
  const itemSlotButtons = Object.freeze([
    requireElement(root, "#use-item-slot-0", HTMLButtonElement),
  ] as const);
  const skillSlotButtons = Object.freeze([
    requireElement(root, "#use-skill-slot-0", HTMLButtonElement),
    requireElement(root, "#use-skill-slot-1", HTMLButtonElement),
  ] as const);
  const grappleButton = requireElement(root, "#use-grapple", HTMLButtonElement);
  const traitRankOutputs: Readonly<Record<UpgradeStatId, HTMLOutputElement>> = Object.freeze({
    power: requireElement(root, "#trait-rank-power", HTMLOutputElement),
    stability: requireElement(root, "#trait-rank-stability", HTMLOutputElement),
    mobility: requireElement(root, "#trait-rank-mobility", HTMLOutputElement),
    reflex: requireElement(root, "#trait-rank-reflex", HTMLOutputElement),
    vitality: requireElement(root, "#trait-rank-vitality", HTMLOutputElement),
    focus: requireElement(root, "#trait-rank-focus", HTMLOutputElement),
  });
  const traitUpgradeChoices = new Map(
    Object.keys(traitRankOutputs).map((id) => {
      if (!isUpgradeStatId(id)) {
        throw new Error(`Unsupported upgrade trait ${id}.`);
      }
      const choice = requireElement(root, `[data-trait-choice="${id}"]`, HTMLElement);
      return [
        id,
        Object.freeze({
          choice,
          effects: requireElement(choice, `[data-upgrade-effects="${id}"]`, HTMLElement),
          meter: requireElement(choice, ".trait-upgrade__meter > span", HTMLElement),
        }),
      ] as const;
    }),
  );
  for (const [id, traitChoice] of traitUpgradeChoices) {
    traitChoice.meter.style.setProperty("--meter-current", "0");
    traitChoice.meter.style.setProperty("--meter-next", String(1 / MAX_UPGRADE_LEVEL));
    renderUpgradeEffectViews(traitChoice.effects, getUpgradeEffectViews(id, 0));
  }
  const rendererStatus = requireElement(root, "#renderer-status", HTMLElement);
  const telemetry = requireElement(root, "#game-telemetry", HTMLElement);
  const developerTelemetry = import.meta.env.DEV ? createDeveloperTelemetry(telemetry) : undefined;
  const actionValue = requireElement(root, "#action-value", HTMLOutputElement);
  const massValue = requireElement(root, "#mass-value", HTMLOutputElement);
  const effectValue = requireElement(root, "#effect-value", HTMLOutputElement);
  const itemValue = requireElement(root, "#item-value", HTMLOutputElement);
  const survivorValue = requireElement(root, "#survivor-value", HTMLOutputElement);
  const roundDistanceMoved = requireElement(root, "#round-distance-moved", HTMLOutputElement);
  const roundElapsedTime = requireElement(root, "#round-elapsed-time", HTMLOutputElement);
  const roundCurrentRank = requireElement(root, "#round-current-rank", HTMLOutputElement);
  const roundEliminations = requireElement(root, "#round-eliminations", HTMLOutputElement);
  const roundLandRemaining = requireElement(root, "#round-land-remaining", HTMLOutputElement);
  const roundDamageDealt = requireElement(root, "#round-damage-dealt", HTMLOutputElement);
  const roundDamageTaken = requireElement(root, "#round-damage-taken", HTMLOutputElement);
  const roundDamageBlocked = requireElement(root, "#round-damage-blocked", HTMLOutputElement);
  const roundSlowedTime = requireElement(root, "#round-slowed-time", HTMLOutputElement);
  const roundSkillHits = requireElement(root, "#round-skill-hits", HTMLOutputElement);
  const roundItemUses = requireElement(root, "#round-item-uses", HTMLOutputElement);
  const roundSkillUses = requireElement(root, "#round-skill-uses", HTMLUListElement);
  const healthValue = requireElement(root, "#health-value", HTMLOutputElement);
  const manaValue = requireElement(root, "#mana-value", HTMLOutputElement);
  const statBonusOutputs: Readonly<Record<UpgradeStatId, HTMLOutputElement>> = Object.freeze({
    power: requireElement(root, "#power-bonus", HTMLOutputElement),
    stability: requireElement(root, "#stability-bonus", HTMLOutputElement),
    mobility: requireElement(root, "#mobility-bonus", HTMLOutputElement),
    reflex: requireElement(root, "#reflex-bonus", HTMLOutputElement),
    vitality: requireElement(root, "#vitality-bonus", HTMLOutputElement),
    focus: requireElement(root, "#focus-bonus", HTMLOutputElement),
  });

  let renderer: ArenaRenderer | undefined;
  let session: GameSession | undefined;
  let roundPreparationId = 0;
  let preparedRoundId: number | undefined;
  let audio: AudioFeedback | undefined;
  let backgroundMusic: BackgroundMusic | undefined;
  let pointerControls: PointerControls | undefined;
  let latestSettings: GameSettings | undefined;
  let draftStartingAttributes: StartingAttributes = EMPTY_STARTING_ATTRIBUTES;
  let latestMasterSeed: string | undefined;
  let latestRoundReport: string | undefined;
  let latestHumanUpgradeSelections: HumanUpgradeSelection[] = [];
  let latestHumanFinalRank: number | undefined;
  let latestHumanSurvivalTick: number | undefined;
  let latestScoreSaved = false;
  let latestInitialLandTileCount: number | undefined;
  let roundSkillSignature = "";
  const roundSkillUseOutputs = new Map<string, HTMLOutputElement>();

  const scoreboardStorage: ScoreboardStorage | undefined = (() => {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  })();
  let userPreferences: UserPreferences = loadUserPreferences(scoreboardStorage);

  root.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  const applyUserPreferences = (preferences: UserPreferences): void => {
    userPreferences = normalizeUserPreferences(preferences);
    document.documentElement.dataset.fontScale = userPreferences.fontScale;
    audio?.setVolume(userPreferences.soundEffectsVolume);
    backgroundMusic?.setVolume(userPreferences.backgroundMusicVolume);
    soundEffectsVolume.value = String(userPreferences.soundEffectsVolume);
    soundEffectsVolumeValue.value = String(userPreferences.soundEffectsVolume);
    backgroundMusicVolume.value = String(userPreferences.backgroundMusicVolume);
    backgroundMusicVolumeValue.value = String(userPreferences.backgroundMusicVolume);
    for (const input of fontScaleInputs) {
      input.checked = input.value === userPreferences.fontScale;
    }
  };

  const persistUserPreferences = (preferences: UserPreferences): void => {
    applyUserPreferences(preferences);
    saveUserPreferences(scoreboardStorage, userPreferences);
  };

  const setScreen = (screen: "menu" | "settings" | "scoreboard" | "history" | "arena"): void => {
    root.dataset.screen = screen;
    document.body.classList.toggle("game-screen-active", screen === "arena");
    const target =
      screen === "menu"
        ? "#main-menu-title"
        : screen === "settings"
          ? "#setup-title"
          : screen === "scoreboard"
            ? "#scoreboard-title"
            : screen === "history"
              ? "#version-history-title"
              : "#arena-host";
    skipLink.href = target;
    skipLink.textContent =
      screen === "menu"
        ? "메뉴로 이동"
        : screen === "settings"
          ? "게임 설정으로 이동"
          : screen === "scoreboard"
            ? "점수표로 이동"
            : screen === "history"
              ? "버전 기록으로 이동"
              : "아레나로 이동";
  };

  const setPauseMenu = (
    visible: boolean,
    options: {
      readonly title?: string;
      readonly resumable?: boolean;
      readonly mapViewAvailable?: boolean;
      readonly mode?: "paused" | "completed" | "fatal";
    } = {},
  ): void => {
    const resumable = options.resumable !== false;
    pauseMenu.hidden = !visible;
    pauseRoundButton.setAttribute("aria-expanded", String(visible));
    resumeRoundButton.hidden = !resumable;
    resumeRoundButton.disabled = !resumable;
    viewFinishedMapButton.hidden = options.mapViewAvailable !== true;
    pauseMenu.dataset.mode =
      options.mode ??
      (root.dataset.round === "completed" ? "completed" : resumable ? "paused" : "fatal");

    if (options.title !== undefined) {
      pauseMenuTitle.textContent = options.title;
    }

    if (visible) {
      root.dataset.pauseMenu = "open";
    } else {
      delete root.dataset.pauseMenu;
    }
  };

  const getSettingsTabButton = (id: SettingsTabId): HTMLButtonElement => {
    const button = settingsTabButtons.get(id);
    if (button === undefined) {
      throw new Error(`Missing settings tab button for ${id}.`);
    }
    return button;
  };

  const getSettingsPanel = (id: SettingsTabId): HTMLElement => {
    const panel = settingsPanels.get(id);
    if (panel === undefined) {
      throw new Error(`Missing settings panel for ${id}.`);
    }
    return panel;
  };

  const getAvailableSettingsTabIds = (): readonly SettingsTabId[] =>
    SETTINGS_TAB_IDS.filter((id) => !getSettingsTabButton(id).hidden);

  const activateSettingsTab = (id: SettingsTabId, moveFocus = false): void => {
    const availableIds = getAvailableSettingsTabIds();
    const activeId = availableIds.includes(id) ? id : "attributes";
    for (const candidateId of SETTINGS_TAB_IDS) {
      const button = getSettingsTabButton(candidateId);
      const active = candidateId === activeId;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      getSettingsPanel(candidateId).hidden = !active;
    }
    root.dataset.settingsTab = activeId;
    if (moveFocus) {
      getSettingsTabButton(activeId).focus({ preventScroll: true });
    }
  };

  for (const id of SETTINGS_TAB_IDS) {
    const button = getSettingsTabButton(id);
    button.addEventListener("click", () => activateSettingsTab(id));
    button.addEventListener("keydown", (event) => {
      const availableIds = getAvailableSettingsTabIds();
      const currentIndex = availableIds.indexOf(id);
      const nextId =
        event.key === "Home"
          ? availableIds[0]
          : event.key === "End"
            ? availableIds.at(-1)
            : event.key === "ArrowRight" || event.key === "ArrowDown"
              ? availableIds[(currentIndex + 1) % availableIds.length]
              : event.key === "ArrowLeft" || event.key === "ArrowUp"
                ? availableIds[(currentIndex - 1 + availableIds.length) % availableIds.length]
                : undefined;
      if (nextId === undefined) {
        return;
      }
      event.preventDefault();
      activateSettingsTab(nextId, true);
    });
  }

  const renderScoreboard = (): void => {
    const entries = loadScoreboard(scoreboardStorage);
    scoreboardEmpty.hidden = entries.length > 0;
    scoreboardList.hidden = entries.length === 0;

    if (entries.length === 0) {
      scoreboardSummary.value = "아직 기록 없음";
      scoreboardList.replaceChildren();
      return;
    }

    const bestScore = Math.max(...entries.map(({ score }) => score));
    const bestRank = Math.min(...entries.map(({ rank }) => rank));
    scoreboardSummary.value = `${entries.length}판 · 최고 ${bestRank}위 · ${bestScore.toLocaleString("ko-KR")}점`;
    const fragment = document.createDocumentFragment();
    const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    for (const entry of entries) {
      const item = document.createElement("li");
      const article = document.createElement("article");
      const header = document.createElement("header");
      const placement = document.createElement("strong");
      const playedAt = document.createElement("time");
      const stats = document.createElement("dl");
      const values: readonly [string, string][] = [
        ["점수", entry.score.toLocaleString("ko-KR")],
        ["처치", `${entry.eliminations}명`],
        ["생존", `${entry.survivalSeconds}초`],
        ["참가", `${entry.participantCount}명`],
      ];

      header.className = "scoreboard__entry-header";
      placement.textContent = `${entry.rank}위`;
      playedAt.dateTime = entry.playedAt;
      playedAt.textContent = dateTimeFormatter.format(new Date(entry.playedAt));
      header.append(placement, playedAt);
      stats.className = "scoreboard__stats";

      for (const [label, value] of values) {
        const row = document.createElement("div");
        const term = document.createElement("dt");
        const description = document.createElement("dd");
        term.textContent = label;
        description.textContent = value;
        row.append(term, description);
        stats.append(row);
      }

      article.dataset.outcome = entry.outcome;
      article.append(header, stats);
      item.append(article);
      fragment.append(item);
    }

    scoreboardList.replaceChildren(fragment);
  };

  const recordCompletedRound = (frame: RenderFrameV1): ScoreboardEntry | undefined => {
    if (latestScoreSaved) {
      return undefined;
    }

    const human = frame.participants.find(({ actorId }) => actorId === 1);
    if (human === undefined) {
      return undefined;
    }

    const standingOpponents = frame.participants.filter(
      ({ actorId, active, action }) =>
        actorId !== 1 && active && action !== "Falling" && action !== "Eliminated",
    ).length;
    const rank =
      latestHumanFinalRank ?? (frame.round.winnerActorId === 1 ? 1 : standingOpponents + 1);
    const outcome =
      frame.round.winnerActorId === 1
        ? "victory"
        : frame.round.winnerActorId === null
          ? "draw"
          : "defeat";
    const entry = createScoreboardEntry({
      playedAt: new Date(),
      roundId: frame.roundId,
      rank,
      participantCount: frame.participants.length,
      eliminations: human.progression.creditedEliminations,
      survivalSeconds: (latestHumanSurvivalTick ?? frame.tick) / FIXED_TICKS_PER_SECOND,
      outcome,
    });
    saveScoreboardEntry(scoreboardStorage, entry);
    latestScoreSaved = true;
    return entry;
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

  let audioState: AudioFeedbackState = "locked";
  let backgroundMusicState: BackgroundMusicState = "locked";

  const updateSoundControl = (): void => {
    root.dataset.audio = audioState;
    root.dataset.backgroundMusic = backgroundMusicState;
    const effectsUnavailable = audioState === "unavailable" || audioState === "closed";
    const musicUnavailable =
      backgroundMusicState === "unavailable" || backgroundMusicState === "closed";
    const unavailable = effectsUnavailable && musicUnavailable;
    const muted = audio?.muted === true && backgroundMusic?.muted === true;
    soundButton.disabled = unavailable;
    soundButton.textContent = unavailable ? "무음" : muted ? "소리 켜기" : "소리 끄기";
    soundButton.setAttribute("aria-pressed", String(muted));
  };

  backgroundMusic = createBackgroundMusic(undefined, (state) => {
    backgroundMusicState = state;
    updateSoundControl();
  });
  audio = createAudioFeedback(
    undefined,
    (state) => {
      audioState = state;
      updateSoundControl();
    },
    (durationMilliseconds) => backgroundMusic?.duck(durationMilliseconds),
  );
  applyUserPreferences(userPreferences);
  updateSoundControl();

  const removeAudioGestureListeners = (): void => {
    document.removeEventListener("pointerdown", handleAudioGesture, true);
    document.removeEventListener("keydown", handleAudioGesture, true);
  };

  const unlockAudio = async (): Promise<void> => {
    await Promise.all([audio?.unlock(), backgroundMusic?.unlock()]);
    updateSoundControl();
    if (audioState !== "locked" && backgroundMusicState !== "locked") {
      removeAudioGestureListeners();
    }
  };

  function handleAudioGesture(): void {
    void unlockAudio();
  }

  const handleUiButtonClick = (event: MouseEvent): void => {
    const target = event.target;
    const button = target instanceof Element ? target.closest("button") : null;

    if (
      !(button instanceof HTMLButtonElement) ||
      button.disabled ||
      button.closest(".action-hud, .touch-actions") !== null
    ) {
      return;
    }

    void unlockAudio().then(() => audio?.playUiClick());
  };

  document.addEventListener("pointerdown", handleAudioGesture, true);
  document.addEventListener("keydown", handleAudioGesture, true);
  root.addEventListener("click", handleUiButtonClick);

  const getSelectedStartingItems = (): readonly string[] =>
    startingItemInputs.filter(({ checked }) => checked).map(({ value }) => value);

  const getSelectedStartingSkills = (): readonly string[] =>
    startingSkillInputs.filter(({ checked }) => checked).map(({ value }) => value);

  const isSettingsDraftComplete = (): boolean =>
    getStartingAttributePointTotal(draftStartingAttributes) === STARTING_ATTRIBUTE_POINT_TOTAL &&
    getSelectedStartingItems().length === 1 &&
    getSelectedStartingSkills().length === 2;

  const updateSettingsValidity = (): void => {
    saveSettingsButton.disabled = !isSettingsDraftComplete();
  };

  const readSettings = (): GameSettings => {
    if (!isSettingsDraftComplete()) {
      throw new Error("Starting attributes, skills, and item must be selected before saving.");
    }
    const data = new FormData(form);
    return normalizeSettings({
      startingAttributes: draftStartingAttributes,
      startingItems: data
        .getAll("startingItem")
        .filter((value): value is string => typeof value === "string"),
      startingSkills: data
        .getAll("startingSkill")
        .filter((value): value is string => typeof value === "string"),
    });
  };

  const renderStartingAttributes = (): void => {
    const allocated = getStartingAttributePointTotal(draftStartingAttributes);
    const remaining = STARTING_ATTRIBUTE_POINT_TOTAL - allocated;
    startingAttributeRemaining.value = String(remaining);
    startingAttributeRemaining.dataset.state = remaining === 0 ? "complete" : "incomplete";
    startingTotalOutputs.mass.value = formatBaselineAdjustment(
      getStartingMassFactor(draftStartingAttributes),
    );
    startingTotalOutputs.health.value = String(
      BASE_STARTING_HEALTH + getStartingMaximumHealthBonus(draftStartingAttributes),
    );
    startingTotalOutputs.mana.value = String(
      BASE_STARTING_MANA + getStartingMaximumManaBonus(draftStartingAttributes),
    );
    startingTotalOutputs.movement.value = formatPercentDelta(
      getStartingMovementMultiplier(draftStartingAttributes),
    );
    startingTotalOutputs.cooldown.value = `대기 ${formatPercentDelta(
      getStartingCooldownMultiplier(draftStartingAttributes),
    )} · 마나 ${formatPercentDelta(getStartingManaCostMultiplier(draftStartingAttributes))}`;
    startingTotalOutputs.power.value = formatPercentDelta(
      getStartingOutgoingMultiplier(draftStartingAttributes),
    );
    startingTotalOutputs.resistance.value = formatResistance(
      getStartingIncomingImpulseMultiplier(draftStartingAttributes),
    );
    startingTotalOutputs.control.value = formatPercentDelta(
      getStartingControlDurationMultiplier(draftStartingAttributes),
    );
    startingTotalOutputs.damageTaken.value = formatPercentDelta(
      getStartingDamageTakenMultiplier(draftStartingAttributes),
    );
    startingTotalOutputs.shield.value = formatPercentDelta(
      getStartingShieldMultiplier(draftStartingAttributes),
    );
    startingTotalOutputs.healthRegen.value = formatPercentDelta(
      getStartingHealthRegenMultiplier(draftStartingAttributes),
    );
    startingTotalOutputs.manaRegen.value = formatPercentDelta(
      getStartingManaRegenMultiplier(draftStartingAttributes),
    );

    for (const { card, id, fill } of startingTotalMeters) {
      const value = draftStartingAttributes[id];
      const ratio = value / STARTING_ATTRIBUTE_POINT_TOTAL;
      fill.style.setProperty("--meter-value", String(ratio));
      card.dataset.active = value > 0 ? "true" : "false";
    }

    for (const id of STARTING_ATTRIBUTE_IDS) {
      const controls = getStartingAttributeControls(id);
      const value = draftStartingAttributes[id];
      controls.output.value = String(value);
      controls.decrement.disabled = value <= STARTING_ATTRIBUTE_LIMITS.minimum;
      controls.increment.disabled = value >= STARTING_ATTRIBUTE_LIMITS.maximum || remaining <= 0;
      controls.meter.style.setProperty(
        "--meter-value",
        String(value / STARTING_ATTRIBUTE_POINT_TOTAL),
      );
      controls.row.dataset.active = value > 0 ? "true" : "false";
      controls.row.setAttribute(
        "aria-label",
        `${STARTING_ATTRIBUTE_LABELS[id]} ${value}, 총 ${STARTING_ATTRIBUTE_POINT_TOTAL}포인트 중`,
      );
    }
    updateSettingsValidity();
  };

  const changeStartingAttribute = (id: StartingAttributeId, delta: number): void => {
    const current = draftStartingAttributes[id];
    const allocated = getStartingAttributePointTotal(draftStartingAttributes);
    const remaining = STARTING_ATTRIBUTE_POINT_TOTAL - allocated;
    const clampedDelta =
      delta > 0
        ? Math.min(delta, remaining, STARTING_ATTRIBUTE_LIMITS.maximum - current)
        : Math.max(delta, STARTING_ATTRIBUTE_LIMITS.minimum - current);
    if (clampedDelta === 0) {
      return;
    }
    draftStartingAttributes = Object.freeze({
      ...draftStartingAttributes,
      [id]: current + clampedDelta,
    });
    renderStartingAttributes();
  };

  const renderStartingItemSelection = (): void => {
    const selectedCount = startingItemInputs.filter(({ checked }) => checked).length;
    startingItemCount.value = String(selectedCount);
    updateSettingsValidity();
  };

  const renderStartingSkillSelection = (): void => {
    const selectedCount = startingSkillInputs.filter(({ checked }) => checked).length;

    for (const input of startingSkillInputs) {
      input.disabled = selectedCount >= 2 && !input.checked;
    }
    startingSkillCount.value = String(selectedCount);
    updateSettingsValidity();
  };

  activateSettingsTab("attributes");

  const hydrateSettingsForm = (): void => {
    activateSettingsTab("attributes");
    draftStartingAttributes = Object.freeze({
      ...(latestSettings?.startingAttributes ?? EMPTY_STARTING_ATTRIBUTES),
    });

    for (const input of startingItemInputs) {
      input.checked = latestSettings?.startingItems.some((item) => item === input.value) ?? false;
    }

    for (const input of startingSkillInputs) {
      input.checked =
        latestSettings?.startingSkills.some((skill) => skill === input.value) ?? false;
    }

    applyUserPreferences(userPreferences);
    renderStartingItemSelection();
    renderStartingSkillSelection();
    renderStartingAttributes();
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
    const actionHudContext = Object.freeze({
      tick: current.frame.tick,
      countdownActive: current.countdown !== null,
      roundActive: current.frame.round.status === "Active",
    });
    const grappleModel = createGrappleButtonViewModel(human, actionHudContext);
    grappleButton.dataset.state = grappleModel.state;
    grappleButton.textContent = grappleModel.text;
    grappleButton.disabled = grappleModel.disabled;
    grappleButton.setAttribute("aria-label", grappleModel.ariaLabel ?? grappleModel.text);
    touchGrappleButton.dataset.state = grappleModel.state;
    touchGrappleButton.textContent =
      grappleModel.state === "cooldown"
        ? `E · ${grappleModel.text.split(" · ").at(-1) ?? "대기"}`
        : "E";
    touchGrappleButton.disabled = grappleModel.disabled;
    touchGrappleButton.setAttribute("aria-label", grappleModel.ariaLabel ?? grappleModel.text);
    for (const slotIndex of SKILL_SLOT_INDICES) {
      const button = skillSlotButtons[slotIndex];
      const model = createSkillButtonViewModel(human, slotIndex, actionHudContext);
      button.dataset.state = model.state;
      button.textContent = model.text;
      button.disabled = model.state === "blocked";
      button.setAttribute("aria-disabled", model.disabled ? "true" : "false");
    }
    massValue.value =
      human.massFactor < 0.9 ? "가벼움" : human.massFactor > 1.1 ? "무거움" : "보통";
    const inventoryLabel = human.inventory
      .map(({ definitionId, charges }) =>
        charges === null
          ? getItemDefinition(definitionId).label
          : `${getItemDefinition(definitionId).label} ${charges}`,
      )
      .join(" · ");
    const effectLabel = human.effects
      .map(({ definitionId, endsTick }) =>
        definitionId === "boat" && endsTick !== null
          ? `배 ${Math.max(0, Math.ceil((endsTick - current.frame.tick) / 60))}초`
          : getItemDefinition(definitionId).label,
      )
      .join(" · ");
    effectValue.value =
      [inventoryLabel, effectLabel].filter((label) => label.length > 0).join(" · ") ||
      (human.springBoosted ? "스프링 발동" : "없음");
    itemValue.value = String(current.frame.items.length);
    for (const slotIndex of ITEM_SLOT_INDICES) {
      const button = itemSlotButtons[slotIndex];
      const model = createItemButtonViewModel(human, slotIndex, actionHudContext);
      button.dataset.state = model.state;
      button.textContent = model.text;
      button.setAttribute("aria-label", model.ariaLabel ?? model.text);
      button.disabled = model.disabled;
    }
    let standingParticipantCount = 0;
    for (const participant of current.frame.participants) {
      if (
        participant.active &&
        participant.action !== "Falling" &&
        participant.action !== "Eliminated"
      ) {
        standingParticipantCount += 1;
      }
    }
    survivorValue.value = String(standingParticipantCount);
    if (latestInitialLandTileCount === undefined) {
      let initialLandTileCount = 0;
      for (const tile of current.frame.tiles) {
        if (tile.state !== "Void") {
          initialLandTileCount += 1;
        }
      }
      latestInitialLandTileCount = initialLandTileCount;
    }
    let currentLandTileCount = 0;
    for (const tile of current.frame.tiles) {
      if (tile.state !== "Void") {
        currentLandTileCount += 1;
      }
    }
    const statistics = current.roundStatistics;
    const elapsedSeconds = Math.floor(current.frame.tick / FIXED_TICKS_PER_SECOND);
    roundElapsedTime.value = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
    roundCurrentRank.value =
      latestHumanFinalRank === undefined
        ? `${standingParticipantCount}명 생존`
        : `${latestHumanFinalRank}위`;
    roundEliminations.value = String(human.progression.creditedEliminations);
    roundLandRemaining.value = `${Math.round(
      (currentLandTileCount / Math.max(1, latestInitialLandTileCount)) * 100,
    )}%`;
    roundDistanceMoved.value = `${statistics.distanceMoved.toFixed(1)}칸`;
    roundDamageDealt.value = statistics.damageDealt.toFixed(1);
    roundDamageTaken.value = statistics.damageTaken.toFixed(1);
    const attemptedDamage = statistics.damageTaken + statistics.damageBlocked;
    const blockedPercent =
      attemptedDamage <= 0 ? 0 : Math.round((statistics.damageBlocked / attemptedDamage) * 100);
    roundDamageBlocked.value = `${statistics.damageBlocked.toFixed(1)} · ${blockedPercent}%`;
    roundSlowedTime.value = `${(statistics.slowedTicks / FIXED_TICKS_PER_SECOND).toFixed(1)}초`;
    roundSkillHits.value = `${Object.values(statistics.skillHits).reduce((sum, hits) => sum + hits, 0)}회`;
    roundItemUses.value = `${statistics.itemUses}회`;
    const skillSignature = human.skills.map(({ definitionId }) => definitionId).join("|");
    if (skillSignature !== roundSkillSignature) {
      roundSkillSignature = skillSignature;
      roundSkillUseOutputs.clear();
      roundSkillUses.replaceChildren(
        ...human.skills.map(({ definitionId }) => {
          const item = document.createElement("li");
          const label = document.createElement("span");
          const output = document.createElement("output");
          label.textContent = getSkillDefinition(definitionId).label;
          output.value = "0회";
          item.append(label, output);
          roundSkillUseOutputs.set(definitionId, output);
          return item;
        }),
      );
    }
    for (const { definitionId } of human.skills) {
      const output = roundSkillUseOutputs.get(definitionId);
      if (output !== undefined) {
        output.value = `${statistics.skillUses[definitionId]}회`;
      }
    }
    developerTelemetry?.update({
      tick: current.frame.tick,
      rate: current.simulationRate,
      position: `${human.position.x.toFixed(2)}, ${human.position.y.toFixed(2)}`,
      seed: current.masterSeed,
      stateHash: current.frame.stateHash,
    });
    const { stats } = human.progression;
    healthValue.value = `${Math.ceil(human.combat.health)} / ${human.combat.maximumHealth}`;
    manaValue.value = `${Math.floor(human.combat.mana)} / ${human.combat.maximumMana}`;
    statBonusOutputs.power.value = `무게 +${Math.round((getPowerMassMultiplier(stats) - 1) * 100)}% · 위력 +${Math.round((getPowerMultiplier(stats) - 1) * 100)}%`;
    statBonusOutputs.stability.value = `밀침 +${Math.round((1 - getStabilityMultiplier(stats)) * 100)}% · 제어 -${Math.round((1 - getStabilityControlDurationMultiplier(stats)) * 100)}%`;
    statBonusOutputs.mobility.value = `이동 +${Math.round((getMobilityMultiplier(stats) - 1) * 100)}% · 재사용 -${Math.round((1 - getMobilityCooldownMultiplier(stats)) * 100)}% · 마나 -${Math.round((1 - getMobilityManaCostMultiplier(stats)) * 100)}% · 휘청 -${Math.round((1 - getMobilityStumbleDurationMultiplier(stats)) * 100)}%`;
    statBonusOutputs.reflex.value = `피해 -${Math.round((1 - getDamageTakenMultiplier(stats)) * 100)}% · 보호막 +${Math.round((getReflexShieldMultiplier(stats) - 1) * 100)}%`;
    statBonusOutputs.vitality.value = `+${getMaximumHealth(stats) - 100} · 재생 +${Math.round(
      (getHealthRegenMultiplier(stats) - 1) * 100,
    )}%`;
    statBonusOutputs.focus.value = `+${getMaximumMana(stats) - 100} · 재생 +${Math.round(
      (getManaRegenMultiplier(stats) - 1) * 100,
    )}% · 피해 +${Math.round((getFocusSkillDamageMultiplier(stats) - 1) * 100)}%`;
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
        if (roundBriefingDialog.open) {
          roundBriefingDialog.dataset.state = "loading";
          roundBriefingStatus.textContent = "그래픽 연결을 다시 기다리는 중…";
          confirmRoundBriefingButton.textContent = "게임 불러오는 중…";
          confirmRoundBriefingButton.disabled = true;
        }
      },
      onContextRestored(): void {
        session?.setRendererAvailable(true);
        if (roundBriefingDialog.open && preparedRoundId !== undefined) {
          roundBriefingDialog.dataset.state = "ready";
          roundBriefingStatus.textContent = "준비 끝. 버튼을 누르면 시작해.";
          confirmRoundBriefingButton.textContent = "알겠다요 ㅇㅅㅇ";
          confirmRoundBriefingButton.disabled = false;
          confirmRoundBriefingButton.focus({ preventScroll: true });
        }
        const countingDown = root.dataset.round === "countdown";
        rendererStatus.dataset.state =
          session?.active === true
            ? session.paused
              ? "paused"
              : countingDown
                ? "countdown"
                : "playing"
            : "ready";
        rendererStatus.textContent =
          session?.active === true
            ? session.paused
              ? "일시 정지"
              : countingDown
                ? "다시 준비"
                : "플레이 중"
            : "WebGL 준비됨";
      },
    });
    session = createGameSession(renderer, {
      onTelemetry: updateTelemetry,
      onEvents(events): void {
        audio?.consumeEvents(events);

        let humanDown = false;
        let nearbyKill = false;
        for (const event of events) {
          if (
            event.kind === "stat-upgraded" &&
            event.actorId === 1 &&
            (event.upgradeStat !== undefined || event.upgradeSkillSlot !== undefined)
          ) {
            latestHumanUpgradeSelections.push(
              event.upgradeSkillSlot === undefined
                ? Object.freeze({ tick: event.tick, stat: event.upgradeStat! })
                : Object.freeze({ tick: event.tick, skillSlot: event.upgradeSkillSlot }),
            );
          }
          if (
            event.kind === "damage-applied" &&
            event.targetActorId === 1 &&
            (event.amount ?? 0) > 0
          ) {
            damageFlash.classList.remove("is-active");
            void damageFlash.offsetWidth;
            damageFlash.classList.add("is-active");
          }
          if (event.kind === "eliminated") {
            if (event.actorId === 1) {
              humanDown = true;
            } else if (!humanDown) {
              nearbyKill = true;
            }
          }
        }
        if (humanDown) {
          killFlash.classList.remove("is-active");
          void killFlash.offsetWidth;
          killFlash.classList.add("is-down");
        } else if (nearbyKill) {
          killFlash.classList.remove("is-down");
          void killFlash.offsetWidth;
          killFlash.classList.add("is-active");
        }

        const message = events
          .toReversed()
          .map(getEventMessage)
          .find((value) => value !== undefined);

        if (message !== undefined) {
          readyMessage.textContent = message;
        }
      },
      onHumanEliminated(frame): void {
        latestHumanFinalRank =
          frame.participants.filter(
            ({ actorId, active, action }) =>
              actorId !== 1 && active && action !== "Falling" && action !== "Eliminated",
          ).length + 1;
        latestHumanSurvivalTick = frame.tick;
        roundCurrentRank.value = `${latestHumanFinalRank}위`;
        root.dataset.humanEliminated = "true";
        readyMessage.textContent = "탈락했어. 방향키나 드래그로 맵을 둘러볼 수 있어.";
        arenaHost.setAttribute(
          "aria-label",
          "관전 중인 아레나. 방향키 또는 마우스 드래그로 맵을 둘러볼 수 있어.",
        );
      },
      onHumanUpgradeRequested(frame): void {
        const human = frame.participants.find(({ actorId }) => actorId === 1);

        if (human === undefined) {
          return;
        }

        for (const input of statUpgradeForm.querySelectorAll<HTMLInputElement>(
          'input[name="upgradeChoice"]',
        )) {
          input.checked = false;
          const id = input.value;
          if (!isUpgradeStatId(id)) {
            input.disabled = true;
            continue;
          }

          const ownedRank = human.progression.stats[id];
          input.disabled = !canSpendStatPoint(human.progression, id);
          traitRankOutputs[id].value = `${ownedRank}/${MAX_UPGRADE_LEVEL}`;
          const traitChoice = traitUpgradeChoices.get(id);
          if (traitChoice !== undefined) {
            traitChoice.choice.dataset.state = input.disabled ? "capped" : "available";
            traitChoice.choice.dataset.owned = ownedRank > 0 ? "true" : "false";
            traitChoice.choice.setAttribute("aria-disabled", input.disabled ? "true" : "false");
            traitChoice.meter.style.setProperty(
              "--meter-current",
              String(ownedRank / MAX_UPGRADE_LEVEL),
            );
            traitChoice.meter.style.setProperty(
              "--meter-next",
              String(Math.min(MAX_UPGRADE_LEVEL, ownedRank + 1) / MAX_UPGRADE_LEVEL),
            );
            renderUpgradeEffectViews(traitChoice.effects, getUpgradeEffectViews(id, ownedRank));
          }
        }

        const selectedInput = statUpgradeForm.querySelector<HTMLInputElement>(
          'input[name="upgradeChoice"]:checked:not(:disabled)',
        );
        const firstAvailableInput = statUpgradeForm.querySelector<HTMLInputElement>(
          'input[name="upgradeChoice"]:not(:disabled)',
        );
        const focusInput = selectedInput ?? firstAvailableInput;
        saveTraitUpgradeButton.disabled = true;

        statUpgradeOverlay.hidden = false;
        pointerControls?.interrupt();
        setPauseMenu(false);
        root.dataset.upgrade = "pending";
        rendererStatus.dataset.state = "paused";
        rendererStatus.textContent = "전투 특성 선택 중";
        readyMessage.textContent = "처치 보상으로 전투 특성 하나를 골라.";
        focusInput?.focus({ preventScroll: true });
      },
      onRoundCompleted(frame): void {
        const { round } = frame;

        if (latestMasterSeed === undefined) {
          throw new Error("Completed round is missing its master seed.");
        }

        if (latestSettings === undefined) {
          throw new Error("Completed round is missing its saved settings.");
        }
        latestRoundReport = serializePlaytestRoundReport(
          createPlaytestRoundReport(
            latestSettings,
            latestMasterSeed,
            frame,
            DEFAULT_GAMEPLAY_TUNING,
            latestHumanUpgradeSelections,
          ),
        );
        const scoreEntry = recordCompletedRound(frame);
        roundCurrentRank.value = `${scoreEntry?.rank ?? latestHumanFinalRank ?? 1}위`;
        root.dataset.round = "completed";
        statUpgradeOverlay.hidden = true;
        delete root.dataset.upgrade;
        copyRoundReportButton.hidden = false;
        rendererStatus.dataset.state = round.winnerActorId === 1 ? "victory" : "completed";
        rendererStatus.textContent = round.winnerActorId === 1 ? "승리" : "라운드 종료";
        readyMessage.textContent =
          round.winnerActorId === 1
            ? `끝까지 남았어. ${scoreEntry?.score.toLocaleString("ko-KR") ?? 0}점!`
            : round.winnerActorId === null
              ? `마지막 순간에 모두 떨어졌어. ${scoreEntry?.rank ?? 1}위.`
              : `${scoreEntry?.rank ?? 1}위 · ${scoreEntry?.score.toLocaleString("ko-KR") ?? 0}점`;
        setPauseMenu(true, {
          title: "라운드 종료",
          resumable: false,
          mapViewAvailable: true,
          mode: "completed",
        });
        if (round.winnerActorId === 1) {
          upgradeFlash.classList.remove("is-active");
          void upgradeFlash.offsetWidth;
          upgradeFlash.classList.add("is-active");
        }
        restartButton.focus();
      },
      onPauseChanged(paused): void {
        if (paused) {
          readyMessage.textContent = "잠시 멈췄어.";
          if (root.dataset.upgrade !== "pending" && root.dataset.screen === "arena") {
            setPauseMenu(true, { title: "일시정지", resumable: true, mode: "paused" });
            resumeRoundButton.focus({ preventScroll: true });
          }
        } else if (session?.active === true && root.dataset.round !== "countdown") {
          readyMessage.textContent = "계속";
          setPauseMenu(false);
          arenaHost.focus({ preventScroll: true });
        } else {
          setPauseMenu(false);
        }
      },
      onTargetingChanged(targeting): void {
        targetingHelp.hidden = !targeting;
      },
      onActionRejected(message): void {
        readyMessage.textContent = message;
      },
      onFatalError(error): void {
        latestRoundReport = undefined;
        copyRoundReportButton.hidden = true;
        root.dataset.round = "fatal";
        statUpgradeOverlay.hidden = true;
        delete root.dataset.upgrade;
        rendererStatus.dataset.state = "error";
        rendererStatus.textContent = "라운드를 멈췄어";
        readyMessage.textContent = "문제가 생겼어. 다시 시작해 줘.";
        setPauseMenu(true, { title: "게임 중단", resumable: false, mode: "fatal" });
        restartButton.focus();
        console.error("The Shovefall round stopped at its error boundary.", error);
      },
    });
    pointerControls = createPointerControls({
      arena: arenaHost,
      joystick: pointerJoystick,
      joystickKnob: pointerJoystickKnob,
      grappleButton: touchGrappleButton,
      actionButtons: [
        ...SKILL_SLOT_INDICES.map((slotIndex) => ({
          button: touchSkillButtons[slotIndex],
          activate: () => session?.queueSkillSlot(slotIndex),
        })),
        ...touchItemButtons.map((button) => ({
          button,
          activate: () => session?.queueItemSlot(0),
        })),
      ],
      isActive: () =>
        session?.active === true &&
        !session.paused &&
        root.dataset.round === "active" &&
        root.dataset.humanEliminated !== "true",
      isMovementActive: () =>
        session?.active === true &&
        !session.paused &&
        (root.dataset.round === "active" || root.dataset.round === "countdown") &&
        root.dataset.humanEliminated !== "true",
      isSpectating: () =>
        root.dataset.screen === "arena" &&
        (root.dataset.humanEliminated === "true" || root.dataset.round === "completed"),
      isTargetApproaching: () => session?.targetApproachPending === true,
      isTargeting: () => session?.targeting === true,
      onMove: (x, y) => session?.setPointerMovement(x, y),
      onMoveTo: (clientX, clientY) => session?.moveTo(clientX, clientY),
      onSpectatorPan: (deltaX, deltaY) => {
        renderer?.panSpectatorByScreen(deltaX, deltaY);
      },
      onGrapple: () => session?.queueGrapple(),
      onTargetHover: (clientX, clientY) => session?.updateTargeting(clientX, clientY),
      onTargetConfirm: (clientX, clientY) => session?.confirmTargeting(clientX, clientY),
      onTargetCancel: () => session?.cancelTargeting(),
      spectatorSurface: pauseMenu,
    });
    rendererStatus.dataset.state = "ready";
    rendererStatus.textContent = "WebGL 준비됨";
  } catch (error: unknown) {
    reportRendererFailure(rendererStatus);
    startGameButton.disabled = true;
    requireElement(form, "button[type='submit']", HTMLButtonElement).disabled = true;
    console.error("Unable to initialize the PixiJS renderer.", error);
  }

  const startRound = (
    settings: GameSettings,
    options: { readonly deferPresentation?: boolean } = {},
  ): boolean => {
    if (session === undefined) {
      return false;
    }

    latestSettings = settings;
    latestMasterSeed = createRoundSeed();
    latestRoundReport = undefined;
    latestHumanUpgradeSelections = [];
    latestHumanFinalRank = undefined;
    latestHumanSurvivalTick = undefined;
    latestScoreSaved = false;
    latestInitialLandTileCount = undefined;
    copyRoundReportButton.hidden = true;
    copyRoundReportButton.textContent = "기록 복사";
    void unlockAudio();
    if (options.deferPresentation !== true) {
      setScreen("arena");
      root.dataset.round = "countdown";
    } else {
      root.dataset.round = "preparing";
    }
    statUpgradeOverlay.hidden = true;
    setPauseMenu(false);
    delete root.dataset.upgrade;
    delete root.dataset.humanEliminated;
    renderer?.resetSpectatorCamera();
    root.dataset.initialItems = String(settings.initialItemCount);
    root.dataset.botDifficulty = FORCED_BOT_DIFFICULTY;
    root.dataset.collapseSpeed = settings.collapseSpeed;
    root.dataset.gameplayTuning = "default";
    arenaActions.hidden = false;
    pauseRoundButton.hidden = false;
    inventoryActions.hidden = false;
    skillActions.hidden = false;
    statStatus.hidden = false;
    telemetry.hidden = false;
    developerTelemetry?.setVisible(true);
    readyMessage.textContent = "3";
    arenaHost.setAttribute(
      "aria-label",
      `${settings.playerCount}명이 참가하는 바닥이 사라지는 술래잡기 아레나. 방향키, 땅 우클릭 또는 터치 조이스틱으로 이동해. Q와 W는 스킬, D는 아이템 조준을 시작하고, 방향키나 마우스로 조준한 뒤 같은 키, Enter 또는 좌클릭으로 확정해.`,
    );
    try {
      session.start(createConfig(settings), latestMasterSeed, DEFAULT_GAMEPLAY_TUNING, {
        startingAttributes: settings.startingAttributes,
        startingItems: settings.startingItems,
        startingSkills: settings.startingSkills,
      });
      if (options.deferPresentation === true) {
        session.setPaused(true);
        root.dataset.round = "prepared";
      } else {
        arenaHost.focus();
      }
      return true;
    } catch (error: unknown) {
      if (roundBriefingDialog.open) {
        roundBriefingDialog.close();
      }
      setScreen("arena");
      latestRoundReport = undefined;
      copyRoundReportButton.hidden = true;
      root.dataset.round = "fatal";
      rendererStatus.dataset.state = "error";
      rendererStatus.textContent = "라운드를 시작하지 못했어";
      readyMessage.textContent = "설정을 확인하고 다시 시작해 줘.";
      setPauseMenu(true, { title: "게임 시작 실패", resumable: false, mode: "fatal" });
      restartButton.focus();
      console.error("The Shovefall round failed during startup.", error);
      return false;
    }
  };

  const prepareRoundBehindBriefing = async (settings: GameSettings): Promise<void> => {
    const preparationId = ++roundPreparationId;
    preparedRoundId = undefined;
    roundBriefingDialog.dataset.state = "loading";
    roundBriefingStatus.textContent = "섬을 불러오는 중…";
    confirmRoundBriefingButton.disabled = true;
    confirmRoundBriefingButton.textContent = "게임 불러오는 중…";
    roundBriefingDialog.showModal();
    roundBriefingDialog.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });

    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.addEventListener(
        "message",
        () => {
          channel.port1.close();
          channel.port2.close();
          resolve();
        },
        { once: true },
      );
      channel.port1.start();
      channel.port2.postMessage(undefined);
    });
    if (preparationId !== roundPreparationId) {
      return;
    }

    if (!startRound(settings, { deferPresentation: true })) {
      return;
    }

    preparedRoundId = preparationId;
    if (arenaHost.dataset.renderer === "lost") {
      roundBriefingDialog.dataset.state = "loading";
      roundBriefingStatus.textContent = "그래픽 연결을 다시 기다리는 중…";
      confirmRoundBriefingButton.textContent = "게임 불러오는 중…";
      confirmRoundBriefingButton.disabled = true;
    } else {
      roundBriefingDialog.dataset.state = "ready";
      roundBriefingStatus.textContent = "준비 끝. 버튼을 누르면 시작해.";
      confirmRoundBriefingButton.textContent = "알겠다요 ㅇㅅㅇ";
      confirmRoundBriefingButton.disabled = false;
      confirmRoundBriefingButton.focus({ preventScroll: true });
    }
  };

  const revealPreparedRound = (): void => {
    if (
      preparedRoundId === undefined ||
      preparedRoundId !== roundPreparationId ||
      session?.active !== true ||
      arenaHost.dataset.renderer === "lost"
    ) {
      return;
    }

    preparedRoundId = undefined;
    roundBriefingDialog.close();
    setScreen("arena");
    root.dataset.round = "countdown";
    readyMessage.textContent = "3";
    rendererStatus.dataset.state = "countdown";
    rendererStatus.textContent = "시작까지 3";
    session.setPaused(false);
    arenaHost.focus({ preventScroll: true });
  };

  for (const id of STARTING_ATTRIBUTE_IDS) {
    const dec = getStartingAttributeControls(id).decrement;
    const inc = getStartingAttributeControls(id).increment;
    dec.addEventListener("click", (event) => changeStartingAttribute(id, event.ctrlKey ? -5 : -1));
    inc.addEventListener("click", (event) => changeStartingAttribute(id, event.ctrlKey ? 5 : 1));
  }

  form.addEventListener("change", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.name === "startingItem") {
      renderStartingItemSelection();
    } else if (target.name === "startingSkill") {
      renderStartingSkillSelection();
    } else if (target.name === "fontScale") {
      if (!isFontScaleId(target.value)) {
        return;
      }
      persistUserPreferences({
        ...userPreferences,
        fontScale: target.value,
      });
    }
  });

  soundEffectsVolume.addEventListener("input", () => {
    persistUserPreferences({
      ...userPreferences,
      soundEffectsVolume: Number(soundEffectsVolume.value),
    });
  });

  backgroundMusicVolume.addEventListener("input", () => {
    persistUserPreferences({
      ...userPreferences,
      backgroundMusicVolume: Number(backgroundMusicVolume.value),
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!isSettingsDraftComplete()) {
      return;
    }
    latestSettings = readSettings();
    setScreen("menu");
    startGameButton.focus();
  });

  const openSettings = (): void => {
    hydrateSettingsForm();
    setScreen("settings");
    requireElement(root, "#setup-title", HTMLElement).focus({ preventScroll: true });
  };

  startGameButton.addEventListener("click", () => {
    if (latestSettings === undefined) {
      setupRequiredDialog.showModal();
      return;
    }
    void prepareRoundBehindBriefing(latestSettings);
  });

  roundBriefingDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
  });

  confirmRoundBriefingButton.addEventListener("click", revealPreparedRound);

  openSettingsButton.addEventListener("click", openSettings);

  goToRequiredSettingsButton.addEventListener("click", () => {
    setupRequiredDialog.close();
    openSettings();
  });

  closeSetupRequiredButton.addEventListener("click", () => {
    setupRequiredDialog.close();
    startGameButton.focus({ preventScroll: true });
  });

  openVersionHistoryButton.addEventListener("click", () => {
    setScreen("history");
    versionHistoryTitle.focus({ preventScroll: true });
  });

  openScoreboardButton.addEventListener("click", () => {
    renderScoreboard();
    setScreen("scoreboard");
    scoreboardTitle.focus({ preventScroll: true });
  });

  const closeScoreboard = (): void => {
    setScreen("menu");
    openScoreboardButton.focus();
  };

  closeScoreboardButton.addEventListener("click", closeScoreboard);

  const closeVersionHistory = (): void => {
    setScreen("menu");
    openVersionHistoryButton.focus();
  };

  closeVersionHistoryButton.addEventListener("click", closeVersionHistory);

  const handleGlobalKeyboard = (event: KeyboardEvent): void => {
    if (event.key === "Tab" && root.dataset.upgrade === "pending") {
      const focusable = statUpgradeOverlay.querySelectorAll<HTMLElement>(
        'input[name="upgradeChoice"]:not(:disabled), button:not(:disabled)',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !statUpgradeOverlay.contains(active)) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else if (active === last || !statUpgradeOverlay.contains(active)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
      return;
    }

    const spectatorCameraActive =
      root.dataset.screen === "arena" &&
      (root.dataset.humanEliminated === "true" || root.dataset.round === "completed");
    const spectatorPanFocused = event.target === arenaHost || event.target === pauseMenu;
    if (spectatorCameraActive && spectatorPanFocused && event.code.startsWith("Arrow")) {
      const cameraStep = event.repeat ? 28 : 44;
      const moved = renderer?.panSpectatorByScreen(
        event.code === "ArrowLeft" ? cameraStep : event.code === "ArrowRight" ? -cameraStep : 0,
        event.code === "ArrowUp" ? cameraStep : event.code === "ArrowDown" ? -cameraStep : 0,
      );
      if (moved === true) {
        event.preventDefault();
      }
      return;
    }

    const isPauseKey = event.code === "KeyP";
    if (
      isPauseKey &&
      !event.repeat &&
      root.dataset.screen === "arena" &&
      root.dataset.round === "completed"
    ) {
      event.preventDefault();
      if (pauseMenu.hidden) {
        setPauseMenu(true, {
          title: "라운드 종료",
          resumable: false,
          mapViewAvailable: true,
          mode: "completed",
        });
        restartButton.focus({ preventScroll: true });
      } else {
        setPauseMenu(false);
        arenaHost.focus({ preventScroll: true });
      }
      return;
    }
    if (
      isPauseKey &&
      !event.repeat &&
      root.dataset.screen === "arena" &&
      root.dataset.upgrade !== "pending" &&
      session?.active === true
    ) {
      event.preventDefault();
      session.setPaused(!session.paused);
      return;
    }

    if (event.key !== "Escape") {
      return;
    }

    if (root.dataset.screen === "scoreboard") {
      event.preventDefault();
      closeScoreboard();
    } else if (root.dataset.screen === "history") {
      event.preventDefault();
      closeVersionHistory();
    } else if (
      root.dataset.screen === "arena" &&
      !pauseMenu.hidden &&
      root.dataset.upgrade !== "pending" &&
      session?.active === true
    ) {
      event.preventDefault();
      session.setPaused(false);
    }
  };

  document.addEventListener("keydown", handleGlobalKeyboard);

  cancelSettingsButton.addEventListener("click", () => {
    hydrateSettingsForm();
    setScreen("menu");
    startGameButton.focus();
  });

  restartButton.addEventListener("click", () => {
    if (latestSettings !== undefined) {
      startRound(latestSettings);
    }
  });

  pauseRoundButton.addEventListener("click", () => {
    if (root.dataset.round === "completed") {
      setPauseMenu(true, {
        title: "라운드 종료",
        resumable: false,
        mapViewAvailable: true,
        mode: "completed",
      });
      restartButton.focus({ preventScroll: true });
    } else if (session?.active === true && root.dataset.upgrade !== "pending") {
      session.setPaused(!session.paused);
    }
  });

  resumeRoundButton.addEventListener("click", () => {
    if (session?.active === true && session.paused) {
      session.setPaused(false);
    }
  });

  viewFinishedMapButton.addEventListener("click", () => {
    if (root.dataset.round !== "completed") {
      return;
    }
    setPauseMenu(false);
    arenaHost.focus({ preventScroll: true });
  });

  statUpgradeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const choice = new FormData(statUpgradeForm).get("upgradeChoice");
    if (typeof choice !== "string" || !isUpgradeStatId(choice)) {
      return;
    }
    const accepted = session?.chooseUpgrade({ stat: choice }) === true;

    if (!accepted) {
      return;
    }

    statUpgradeOverlay.hidden = true;
    setPauseMenu(false);
    delete root.dataset.upgrade;
    rendererStatus.dataset.state = "playing";
    rendererStatus.textContent = "플레이 중";
    readyMessage.textContent = `${UPGRADE_LABELS[choice]} 상승!`;
    upgradeFlash.classList.remove("is-active");
    void upgradeFlash.offsetWidth;
    upgradeFlash.classList.add("is-active");
    arenaHost.focus({ preventScroll: true });
  });

  statUpgradeForm.addEventListener("change", () => {
    saveTraitUpgradeButton.disabled =
      statUpgradeForm.querySelector('input[name="upgradeChoice"]:checked:not(:disabled)') === null;
  });

  for (const [_slotIndex, button] of itemSlotButtons.entries()) {
    button.addEventListener("click", () => {
      session?.queueItemSlot(0);
      arenaHost.focus({ preventScroll: true });
    });
  }

  for (const slotIndex of SKILL_SLOT_INDICES) {
    const button = skillSlotButtons[slotIndex];
    button.addEventListener("click", () => {
      session?.queueSkillSlot(slotIndex);
      arenaHost.focus({ preventScroll: true });
    });
  }

  grappleButton.addEventListener("click", () => {
    session?.queueGrapple();
    arenaHost.focus({ preventScroll: true });
  });

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
    if (audio === undefined || backgroundMusic === undefined) {
      return;
    }

    const nextMuted = !(audio.muted && backgroundMusic.muted);
    audio.setMuted(nextMuted);
    backgroundMusic.setMuted(nextMuted);
    updateSoundControl();

    if (!nextMuted) {
      void unlockAudio();
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
    setPauseMenu(false);
    pauseRoundButton.hidden = true;
    arenaActions.hidden = true;
    inventoryActions.hidden = true;
    skillActions.hidden = true;
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
      backgroundMusic?.destroy();
      pointerControls?.destroy();
      removeAudioGestureListeners();
      document.removeEventListener("keydown", handleGlobalKeyboard);
      root.removeEventListener("click", handleUiButtonClick);

      if (import.meta.env.DEV) {
        window.removeEventListener("shovefall:diagnostic-fatal", handleDiagnosticFatal);
      }
    },
    { once: true },
  );

  renderStartingAttributes();
  renderStartingItemSelection();
  renderStartingSkillSelection();
  renderVersionHistory();
  renderScoreboard();
}
