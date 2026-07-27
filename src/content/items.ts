import type { ItemDefinitionId } from "../simulation/contracts";

export interface ItemDefinition {
  readonly definitionVersion: 3;
  readonly id: ItemDefinitionId;
  readonly label: string;
  readonly visualKey: string;
  readonly audioKey: string;
  readonly loadoutKind: "passive" | "active";
  readonly startingCharges: number | null;
  readonly mapSpawnEligible: boolean;
  readonly durationTicks: number | null;
  readonly consumePolicy: "timed" | "next-shove" | "inventory-charge";
  readonly stackingPolicy: "refresh";
  readonly massMultiplier: number;
  readonly dodgeSpeedMultiplier: number;
  readonly shoveImpulseMultiplier: number;
  readonly shoveReachMultiplier: number;
  readonly targetMode: "self" | "direction" | "ground";
  readonly castRange: number;
  readonly effectRadius: number;
  readonly damage: number;
  readonly fuseTicks: number;
  readonly healing: number;
  readonly stumbleTicks: number;
  readonly aiTags: readonly (
    | "mass"
    | "mobility"
    | "shove"
    | "projectile"
    | "cover"
    | "water"
    | "area"
    | "trap"
    | "rescue"
  )[];
}

type ItemDefinitionInput = Omit<
  ItemDefinition,
  "definitionVersion" | "damage" | "fuseTicks" | "healing" | "stumbleTicks"
> &
  Partial<Pick<ItemDefinition, "damage" | "fuseTicks" | "healing" | "stumbleTicks">>;

export const ITEM_DEFINITION_IDS = [
  "iron-boots",
  "feather",
  "spring-glove",
  "wind-blast",
  "brick-bag",
  "boat",
  "bomb",
  "soap",
] as const;

export const ACTIVE_ITEM_DEFINITION_IDS = [
  "wind-blast",
  "brick-bag",
  "boat",
  "bomb",
  "soap",
] as const satisfies readonly ItemDefinitionId[];

export const MAP_ITEM_DEFINITION_IDS = ["iron-boots", "feather", "spring-glove"] as const;
export const DROPPABLE_ITEM_DEFINITION_IDS = ACTIVE_ITEM_DEFINITION_IDS;

const ITEM_DEFINITION_ID_SET: ReadonlySet<string> = new Set(ITEM_DEFINITION_IDS);
const ACTIVE_ITEM_DEFINITION_ID_SET: ReadonlySet<string> = new Set(ACTIVE_ITEM_DEFINITION_IDS);

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function defineItem(input: ItemDefinitionInput): ItemDefinition {
  return Object.freeze({
    definitionVersion: 3,
    damage: 0,
    fuseTicks: 0,
    healing: 0,
    stumbleTicks: 0,
    ...input,
  });
}

function requireStartingCharges(item: ItemDefinition): string {
  return item.startingCharges === null || item.startingCharges === 0
    ? ""
    : `${formatNumber(item.startingCharges)}회 · `;
}

export function formatItemEffectDescription(item: ItemDefinition): string {
  switch (item.id) {
    case "wind-blast": {
      const range = item.castRange > 0 ? `사거리 ${formatNumber(item.castRange)}칸 · ` : "";
      const stumble = item.stumbleTicks > 0 ? `${formatNumber(item.stumbleTicks / 60)}초 휘청` : "";
      return `${range}첫 적을 강하게 밀고 ${stumble}`;
    }
    case "brick-bag": {
      const range = item.castRange > 0 ? `${formatNumber(item.castRange)}칸 안의 ` : "";
      const healing =
        item.healing > 0 ? ` · 설치할 때 체력 ${formatNumber(item.healing)} 회복` : "";
      return `${range}지정 타일 · 이동·넉백 차단 벽${healing}`;
    }
    case "boat": {
      const duration =
        item.durationTicks === null || item.durationTicks === 0
          ? ""
          : `${formatNumber(item.durationTicks / 60)}초간 `;
      return `${duration}물 위 이동 · 탑승 중 스킬·아이템 사용 불가 · 체력·마나 재생 중지`;
    }
    case "bomb": {
      const radius = item.effectRadius > 0 ? ` 반경 ${formatNumber(item.effectRadius)}칸` : "";
      const fuse = item.fuseTicks > 0 ? `${formatNumber(item.fuseTicks / 60)}초 뒤` : "";
      const damage = item.damage > 0 ? ` ${formatNumber(item.damage)} 피해` : "";
      return `지정 타일 · ${fuse}${radius}${damage} · 설치자는 피해 없음`;
    }
    case "soap": {
      const range = item.castRange > 0 ? `${formatNumber(item.castRange)}칸 안의 ` : "";
      const stumble =
        item.stumbleTicks > 0 ? `${formatNumber(item.stumbleTicks / 60)}초 미끄러짐` : "";
      return `${range}지정 타일 · ${stumble} · 설치자는 미끄러지지 않음`;
    }
    case "iron-boots": {
      const duration =
        item.durationTicks === null || item.durationTicks === 0
          ? ""
          : `${formatNumber(item.durationTicks / 60)}초간 `;
      const mass = Math.round((item.massMultiplier - 1) * 10_000) / 100;
      const dodge = Math.round((1 - item.dodgeSpeedMultiplier) * 10_000) / 100;
      const effects = [
        mass !== 0 ? `몸무게 ${mass > 0 ? "+" : ""}${formatNumber(mass)}%` : undefined,
        dodge !== 0 ? `회피 ${dodge > 0 ? "-" : "+"}${formatNumber(Math.abs(dodge))}%` : undefined,
      ].filter((effect): effect is string => effect !== undefined);
      return `${duration}${effects.join(", ")}`;
    }
    case "feather": {
      const duration =
        item.durationTicks === null || item.durationTicks === 0
          ? ""
          : `${formatNumber(item.durationTicks / 60)}초간 `;
      const mass = Math.round((1 - item.massMultiplier) * 10_000) / 100;
      const dodge = Math.round((item.dodgeSpeedMultiplier - 1) * 10_000) / 100;
      const effects = [
        mass !== 0 ? `몸무게 ${mass > 0 ? "-" : "+"}${formatNumber(Math.abs(mass))}%` : undefined,
        dodge !== 0 ? `회피 ${dodge > 0 ? "+" : "-"}${formatNumber(Math.abs(dodge))}%` : undefined,
      ].filter((effect): effect is string => effect !== undefined);
      return `${duration}${effects.join(", ")}`;
    }
    case "spring-glove": {
      const impulse = Math.round((item.shoveImpulseMultiplier - 1) * 10_000) / 100;
      const reach = Math.round((item.shoveReachMultiplier - 1) * 10_000) / 100;
      const effects = [
        impulse !== 0
          ? `다음 갈고리 속도 ${impulse > 0 ? "+" : ""}${formatNumber(impulse)}%`
          : undefined,
        reach !== 0 ? `사거리 ${reach > 0 ? "+" : ""}${formatNumber(reach)}%` : undefined,
      ].filter((effect): effect is string => effect !== undefined);
      return effects.join(", ");
    }
  }

  throw new Error("Unsupported item definition");
}

export function formatItemDescription(item: ItemDefinition): string {
  return `${requireStartingCharges(item)}${formatItemEffectDescription(item)}`;
}

export const ITEM_DEFINITIONS: Readonly<Record<ItemDefinitionId, ItemDefinition>> = Object.freeze({
  "iron-boots": defineItem({
    id: "iron-boots",
    label: "철 장화",
    visualKey: "item.iron-boots",
    audioKey: "item.pickup.heavy",
    loadoutKind: "passive",
    startingCharges: null,
    mapSpawnEligible: true,
    durationTicks: 480,
    consumePolicy: "timed",
    stackingPolicy: "refresh",
    massMultiplier: 1.1,
    dodgeSpeedMultiplier: 0.62,
    shoveImpulseMultiplier: 1,
    shoveReachMultiplier: 1,
    targetMode: "self",
    castRange: 0,
    effectRadius: 0,
    aiTags: Object.freeze(["mass"] as const),
  }),
  feather: defineItem({
    id: "feather",
    label: "깃털",
    visualKey: "item.feather",
    audioKey: "item.pickup.light",
    loadoutKind: "passive",
    startingCharges: null,
    mapSpawnEligible: true,
    durationTicks: 480,
    consumePolicy: "timed",
    stackingPolicy: "refresh",
    massMultiplier: 0.85,
    dodgeSpeedMultiplier: 1.45,
    shoveImpulseMultiplier: 1,
    shoveReachMultiplier: 1,
    targetMode: "self",
    castRange: 0,
    effectRadius: 0,
    aiTags: Object.freeze(["mobility"] as const),
  }),
  "spring-glove": defineItem({
    id: "spring-glove",
    label: "스프링 장갑",
    visualKey: "item.spring-glove",
    audioKey: "item.pickup.spring",
    loadoutKind: "passive",
    startingCharges: null,
    mapSpawnEligible: true,
    durationTicks: null,
    consumePolicy: "next-shove",
    stackingPolicy: "refresh",
    massMultiplier: 1,
    dodgeSpeedMultiplier: 1,
    shoveImpulseMultiplier: 1.45,
    shoveReachMultiplier: 1.25,
    targetMode: "self",
    castRange: 0,
    effectRadius: 0,
    aiTags: Object.freeze(["shove"] as const),
  }),
  "wind-blast": defineItem({
    id: "wind-blast",
    label: "장풍",
    visualKey: "item.wind-blast",
    audioKey: "item.use.wind-blast",
    loadoutKind: "active",
    startingCharges: 2,
    mapSpawnEligible: true,
    durationTicks: null,
    consumePolicy: "inventory-charge",
    stackingPolicy: "refresh",
    massMultiplier: 1,
    dodgeSpeedMultiplier: 1,
    shoveImpulseMultiplier: 1,
    shoveReachMultiplier: 1,
    targetMode: "direction",
    castRange: 3.5,
    effectRadius: 0.55,
    stumbleTicks: 30,
    aiTags: Object.freeze(["projectile", "shove"] as const),
  }),
  "brick-bag": defineItem({
    id: "brick-bag",
    label: "벽돌 가방",
    visualKey: "item.brick-bag",
    audioKey: "item.use.brick",
    loadoutKind: "active",
    startingCharges: 4,
    mapSpawnEligible: true,
    durationTicks: null,
    consumePolicy: "inventory-charge",
    stackingPolicy: "refresh",
    massMultiplier: 1,
    dodgeSpeedMultiplier: 1,
    shoveImpulseMultiplier: 1,
    shoveReachMultiplier: 1,
    targetMode: "ground",
    castRange: 2,
    effectRadius: 0.5,
    healing: 20,
    aiTags: Object.freeze(["cover"] as const),
  }),
  boat: defineItem({
    id: "boat",
    label: "배",
    visualKey: "item.boat",
    audioKey: "item.use.boat",
    loadoutKind: "active",
    startingCharges: 1,
    mapSpawnEligible: true,
    durationTicks: 180,
    consumePolicy: "inventory-charge",
    stackingPolicy: "refresh",
    massMultiplier: 1,
    dodgeSpeedMultiplier: 1,
    shoveImpulseMultiplier: 1,
    shoveReachMultiplier: 1,
    targetMode: "self",
    castRange: 0,
    effectRadius: 0,
    aiTags: Object.freeze(["water", "rescue"] as const),
  }),
  bomb: defineItem({
    id: "bomb",
    label: "시한폭탄",
    visualKey: "item.bomb",
    audioKey: "item.use.bomb",
    loadoutKind: "active",
    startingCharges: 2,
    mapSpawnEligible: true,
    durationTicks: null,
    consumePolicy: "inventory-charge",
    stackingPolicy: "refresh",
    massMultiplier: 1,
    dodgeSpeedMultiplier: 1,
    shoveImpulseMultiplier: 1,
    shoveReachMultiplier: 1,
    targetMode: "ground",
    castRange: 0.75,
    effectRadius: 3,
    damage: 80,
    fuseTicks: 210,
    aiTags: Object.freeze(["area", "shove"] as const),
  }),
  soap: defineItem({
    id: "soap",
    label: "비누",
    visualKey: "item.soap",
    audioKey: "item.use.soap",
    loadoutKind: "active",
    startingCharges: 4,
    mapSpawnEligible: true,
    durationTicks: null,
    consumePolicy: "inventory-charge",
    stackingPolicy: "refresh",
    massMultiplier: 1,
    dodgeSpeedMultiplier: 1,
    shoveImpulseMultiplier: 1,
    shoveReachMultiplier: 1,
    targetMode: "ground",
    castRange: 3,
    effectRadius: 0.5,
    stumbleTicks: 60,
    aiTags: Object.freeze(["trap", "mobility"] as const),
  }),
});

export function getItemDefinition(id: ItemDefinitionId): ItemDefinition {
  return ITEM_DEFINITIONS[id];
}

export function isItemDefinitionId(value: unknown): value is ItemDefinitionId {
  return typeof value === "string" && ITEM_DEFINITION_ID_SET.has(value);
}

export function isActiveItemDefinitionId(value: unknown): value is ItemDefinitionId {
  return typeof value === "string" && ACTIVE_ITEM_DEFINITION_ID_SET.has(value);
}
