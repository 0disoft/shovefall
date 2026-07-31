import type { ItemDefinitionId } from "../simulation/contracts";

export interface ItemDefinition {
  readonly definitionVersion: 5;
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
  readonly stunTicks: number;
  readonly slideMinimumSpeed: number;
  readonly slideMaximumSpeed: number;
  readonly slideDragPerTick: number;
  readonly ownerDamageMultiplier: number;
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
  | "definitionVersion"
  | "damage"
  | "fuseTicks"
  | "healing"
  | "stumbleTicks"
  | "stunTicks"
  | "slideMinimumSpeed"
  | "slideMaximumSpeed"
  | "slideDragPerTick"
  | "ownerDamageMultiplier"
> &
  Partial<
    Pick<
      ItemDefinition,
      | "damage"
      | "fuseTicks"
      | "healing"
      | "stumbleTicks"
      | "stunTicks"
      | "slideMinimumSpeed"
      | "slideMaximumSpeed"
      | "slideDragPerTick"
      | "ownerDamageMultiplier"
    >
  >;

export const ITEM_DEFINITION_IDS = [
  "iron-boots",
  "feather",
  "spring-glove",
  "soap",
  "brick-bag",
  "boat",
  "bomb",
] as const;

export const ACTIVE_ITEM_DEFINITION_IDS = [
  "soap",
  "brick-bag",
  "boat",
  "bomb",
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
    definitionVersion: 5,
    damage: 0,
    fuseTicks: 0,
    healing: 0,
    stumbleTicks: 0,
    stunTicks: 0,
    slideMinimumSpeed: 0,
    slideMaximumSpeed: 0,
    slideDragPerTick: 1,
    ownerDamageMultiplier: 0,
    ...input,
  });
}

function requireStartingCharges(item: ItemDefinition): string {
  return item.startingCharges === null || item.startingCharges === 0
    ? ""
    : `${formatNumber(item.startingCharges)}회 · `;
}

function formatGroundPlacement(item: ItemDefinition, objectLabel: string): string {
  return item.castRange > 0
    ? `내 위치에서 최대 ${formatNumber(item.castRange)}칸 떨어진 곳에 ${objectLabel} 설치`
    : `내 위치에 ${objectLabel} 설치`;
}

export function formatItemEffectDescription(item: ItemDefinition): string {
  switch (item.id) {
    case "soap": {
      const stumble =
        item.stumbleTicks > 0
          ? `밟은 상대는 진행하던 방향으로 ${formatNumber(item.stumbleTicks / 60)}초 동안 길게 미끄러짐`
          : undefined;
      const damage =
        item.damage > 0 ? `미끄러짐이 끝나면 피해 ${formatNumber(item.damage)}` : undefined;
      const stun =
        item.stunTicks > 0
          ? `피해를 받은 뒤 ${formatNumber(item.stunTicks / 60)}초 기절`
          : undefined;
      return [
        formatGroundPlacement(item, "비누"),
        stumble,
        damage,
        stun,
        "내가 설치한 비누에는 미끄러지지 않음",
      ]
        .filter((effect): effect is string => effect !== undefined)
        .join(" · ");
    }
    case "brick-bag": {
      const healing =
        item.healing > 0 ? `설치할 때 체력 ${formatNumber(item.healing)} 회복` : undefined;
      return [formatGroundPlacement(item, "벽"), "벽은 이동과 넉백을 막음", healing]
        .filter((effect): effect is string => effect !== undefined)
        .join(" · ");
    }
    case "boat": {
      const duration =
        item.durationTicks === null || item.durationTicks === 0
          ? ""
          : `${formatNumber(item.durationTicks / 60)}초간 `;
      return `물에 들어가면 자동 탑승 · ${duration}물 위 이동 · 육지 사용 불가 · 탑승 중 스킬·아이템 사용 불가 · 체력·마나 재생 중지`;
    }
    case "bomb": {
      const fuse =
        item.fuseTicks > 0 ? `${formatNumber(item.fuseTicks / 60)}초 뒤 폭발` : undefined;
      const radius =
        item.effectRadius > 0 ? `폭발 반경 ${formatNumber(item.effectRadius)}칸` : undefined;
      const damage = item.damage > 0 ? `피해 ${formatNumber(item.damage)}` : undefined;
      const ownerDamage =
        item.ownerDamageMultiplier > 0
          ? `설치자는 피해의 ${formatNumber(item.ownerDamageMultiplier * 100)}%를 받음`
          : "설치자는 폭발 피해를 받지 않음";
      return [formatGroundPlacement(item, "폭탄"), fuse, radius, damage, ownerDamage]
        .filter((effect): effect is string => effect !== undefined)
        .join(" · ");
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
    damage: 30,
    stumbleTicks: 120,
    stunTicks: 120,
    slideMinimumSpeed: 0.105,
    slideMaximumSpeed: 0.42,
    slideDragPerTick: 0.992,
    aiTags: Object.freeze(["trap", "mobility"] as const),
  }),
  "brick-bag": defineItem({
    id: "brick-bag",
    label: "벽돌 가방",
    visualKey: "item.brick-bag",
    audioKey: "item.use.brick",
    loadoutKind: "active",
    startingCharges: 3,
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
    healing: 7,
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
    durationTicks: 150,
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
    damage: 60,
    fuseTicks: 195,
    ownerDamageMultiplier: 0.25,
    aiTags: Object.freeze(["area", "shove"] as const),
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
