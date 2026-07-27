import {
  parseBalanceDashboardData,
  type BalanceAggregate,
  type BalanceCategory,
  type BalanceDashboardData,
  type BalancePhase,
  type BalancePhaseReport,
} from "./contract";
import latestSnapshot from "../../balance/latest.json";
import { ACTIVE_ITEM_DEFINITION_IDS } from "../content/items";
import "./styles.css";

const CATEGORY_LABELS: Readonly<Record<BalanceCategory, string>> = Object.freeze({
  attribute: "특성 배분",
  skill: "스킬",
  item: "시작 아이템",
  personality: "AI 성향",
  "skill-combination": "2스킬 조합",
});

const PHASE_NOTES: Readonly<Record<BalancePhase, string>> = Object.freeze({
  controlled:
    "맵 추가 아이템을 끄고 균등 특성·2스킬·시작 아이템·성향을 회전한 비교다. 시작 장비 차이에 가장 가까운 화면이다.",
  production:
    "실제 맵 아이템 8개와 7초 보급을 켠 결과다. 시작 아이템은 균등 배정했지만 추가 획득 기회는 관측치라 방향 확인에만 쓴다.",
});

let data: BalanceDashboardData;
let selectedPhase: BalancePhase = "production";
let selectedCategory: BalanceCategory = "skill";

function requireElement<T extends Element>(selector: string, constructor: { new (): T }): T {
  const element = document.querySelector(selector);
  if (!(element instanceof constructor)) {
    throw new Error(`Missing balance dashboard element ${selector}`);
  }
  return element;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function getPhase(): BalancePhaseReport {
  const phase = data.phases.find((candidate) => candidate.phase === selectedPhase);
  if (phase === undefined) {
    throw new Error(`Missing balance phase ${selectedPhase}`);
  }
  return phase;
}

function renderTabs(): void {
  const tabs = requireElement("#category-tabs", HTMLElement);
  tabs.replaceChildren(
    ...(["attribute", "skill", "item", "personality", "skill-combination"] as const).map(
      (category) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = CATEGORY_LABELS[category];
        button.setAttribute("aria-pressed", String(category === selectedCategory));
        button.addEventListener("click", () => {
          selectedCategory = category;
          renderTabs();
          renderComparison();
        });
        return button;
      },
    ),
  );
}

function createSignal(aggregate: BalanceAggregate): HTMLElement {
  const badge = document.createElement("span");
  badge.className = `signal signal--${aggregate.signal}`;
  badge.textContent =
    aggregate.signal === "buff-review"
      ? "상향 검토"
      : aggregate.signal === "nerf-review"
        ? "하향 검토"
        : "관찰";
  return badge;
}

function createCell(text: string): HTMLTableCellElement {
  const cell = document.createElement("td");
  cell.textContent = text;
  return cell;
}

function createAggregateRow(aggregate: BalanceAggregate): HTMLTableRowElement {
  const row = document.createElement("tr");
  const name = document.createElement("td");
  name.textContent = aggregate.label;
  const rank = document.createElement("td");
  rank.className = "rank-cell";
  const rankValue = document.createElement("strong");
  rankValue.textContent = `${formatNumber(aggregate.averageRank)}위`;
  const meter = document.createElement("meter");
  meter.min = 1;
  meter.max = data.methodology.participantCount;
  meter.value = data.methodology.participantCount + 1 - aggregate.averageRank;
  meter.title = `평균 ${formatNumber(aggregate.averageRank)}위`;
  rank.append(rankValue, meter);
  const signal = document.createElement("td");
  signal.append(createSignal(aggregate));
  row.append(
    name,
    createCell(aggregate.exposures.toLocaleString("ko-KR")),
    rank,
    createCell(formatPercent(aggregate.top10Rate)),
    createCell(formatPercent(aggregate.top5Rate)),
    createCell(
      `${formatPercent(aggregate.winRate)} · ${formatNumber(aggregate.winIndex, 2)}× · 슬롯 구간 ${formatPercent(aggregate.winRate95.lower)}–${formatPercent(aggregate.winRate95.upper)}`,
    ),
    createCell(`${formatNumber(aggregate.averageSurvivalSeconds)}초`),
    createCell(formatNumber(aggregate.eliminationsPerRound, 2)),
    createCell(formatNumber(aggregate.damageDealtPerRound)),
    createCell(
      aggregate.hitsPerUse === null
        ? formatNumber(aggregate.usesPerRound, 2)
        : `${formatNumber(aggregate.usesPerRound, 2)} · 적중 ${formatNumber(
            aggregate.hitsPerUse,
            2,
          )}`,
    ),
    signal,
  );
  return row;
}

function renderComparison(): void {
  const phase = getPhase();
  const activeItemIds = new Set<string>(ACTIVE_ITEM_DEFINITION_IDS);
  const rows = phase.aggregates
    .filter(
      ({ category, id }) =>
        category === selectedCategory && (category !== "item" || activeItemIds.has(id)),
    )
    .toSorted(
      (left, right) =>
        left.averageRank - right.averageRank ||
        right.winRate - left.winRate ||
        left.label.localeCompare(right.label, "ko"),
    );
  requireElement("#comparison-body", HTMLTableSectionElement).replaceChildren(
    ...rows.map(createAggregateRow),
  );
  requireElement("#comparison-caption", HTMLTableCaptionElement).textContent =
    `${selectedPhase === "controlled" ? "제어 실험" : "실제 규칙"} · ${CATEGORY_LABELS[selectedCategory]} · 평균 순위가 높은 순`;
  requireElement("#comparison-note", HTMLParagraphElement).textContent = PHASE_NOTES[selectedPhase];
}

function svgElement<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS("http://www.w3.org/2000/svg", name);
}

function renderDurationChart(): void {
  const phase = getPhase();
  const host = requireElement("#duration-chart", HTMLDivElement);
  const svg = svgElement("svg");
  svg.setAttribute("viewBox", "0 0 1000 236");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `${phase.roundCount}판의 종료 시간. 평균 ${formatNumber(phase.durationSeconds.mean)}초, 95백분위 ${formatNumber(phase.durationSeconds.p95)}초.`,
  );
  const maximum = Math.max(1, phase.durationSeconds.maximum);
  const plotTop = 18;
  const plotBottom = 204;
  for (const marker of [0, 0.5, 1]) {
    const y = plotBottom - marker * (plotBottom - plotTop);
    const line = svgElement("line");
    line.setAttribute("x1", "42");
    line.setAttribute("x2", "988");
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    line.setAttribute("stroke", "#364f48");
    line.setAttribute("stroke-width", "1");
    const label = svgElement("text");
    label.setAttribute("x", "4");
    label.setAttribute("y", String(y + 4));
    label.textContent = `${Math.round(maximum * marker)}초`;
    svg.append(line, label);
  }
  phase.rounds.forEach((round, index) => {
    const circle = svgElement("circle");
    const x = 48 + (index / Math.max(1, phase.rounds.length - 1)) * 932;
    const y = plotBottom - (round.durationSeconds / maximum) * (plotBottom - plotTop);
    circle.setAttribute("cx", String(x));
    circle.setAttribute("cy", String(y));
    circle.setAttribute("r", phase.rounds.length > 100 ? "3" : "4");
    circle.setAttribute(
      "fill",
      round.reason === "time-limit"
        ? "#ff695c"
        : round.reason === "no-survivors"
          ? "#ffc857"
          : "#5fd6a6",
    );
    const title = svgElement("title");
    title.textContent = `#${round.index + 1} · ${round.durationSeconds}초 · ${round.reason}`;
    circle.append(title);
    svg.append(circle);
  });
  host.replaceChildren(svg);
}

function renderRoundTable(): void {
  const phase = getPhase();
  const rows = phase.rounds.map((round) => {
    const row = document.createElement("tr");
    row.append(
      createCell(String(round.index + 1)),
      createCell(`${round.seed} / ${round.assignmentPass + 1}`),
      createCell(`${round.durationSeconds}초`),
      createCell(round.reason),
      createCell(round.winnerPersonality ?? "공동 탈락"),
      createCell(round.stateHash),
    );
    return row;
  });
  requireElement("#round-body", HTMLTableSectionElement).replaceChildren(...rows);
}

function renderMethodology(): void {
  const container = requireElement("#methodology", HTMLDivElement);
  const method = document.createElement("article");
  const methodTitle = document.createElement("h3");
  methodTitle.textContent = "배정 방법";
  const methodText = document.createElement("p");
  methodText.textContent = data.methodology.assignment;
  const rankText = document.createElement("p");
  rankText.textContent = data.methodology.rankTiePolicy;
  method.append(methodTitle, methodText, rankText);
  const limits = document.createElement("article");
  const limitTitle = document.createElement("h3");
  limitTitle.textContent = "해석 금지선";
  const list = document.createElement("ul");
  list.append(
    ...data.methodology.limitations.map((limitation) => {
      const item = document.createElement("li");
      item.textContent = limitation;
      return item;
    }),
  );
  limits.append(limitTitle, list);
  container.replaceChildren(method, limits);
}

function renderPhase(): void {
  renderComparison();
  renderDurationChart();
  renderRoundTable();
}

function initialize(dashboard: BalanceDashboardData): void {
  const phaseFilter = requireElement("#phase-filter", HTMLSelectElement);
  for (const option of phaseFilter.options) {
    const phase = dashboard.phases.find((candidate) => candidate.phase === option.value);
    const roundCount = phase?.roundCount ?? 0;
    option.disabled = roundCount === 0;
    option.textContent = `${option.value === "controlled" ? "제어 실험" : "실제 규칙"} ${roundCount}판`;
  }
  selectedPhase = dashboard.phases.find(({ roundCount }) => roundCount > 0)?.phase ?? "production";
  phaseFilter.value = selectedPhase;
  phaseFilter.addEventListener("change", () => {
    selectedPhase = phaseFilter.value === "production" ? "production" : "controlled";
    renderPhase();
  });
  renderTabs();
  renderPhase();
  renderMethodology();
}

function loadDashboard(): void {
  data = parseBalanceDashboardData(latestSnapshot);
  initialize(data);
}

try {
  loadDashboard();
} catch (error: unknown) {
  const message = requireElement("#balance-error", HTMLParagraphElement);
  message.hidden = false;
  message.textContent = "통계 결과를 불러오지 못했다.";
  const note = requireElement("#comparison-note", HTMLParagraphElement);
  note.textContent = error instanceof Error ? error.message : "통계 결과를 불러오지 못했다.";
}
