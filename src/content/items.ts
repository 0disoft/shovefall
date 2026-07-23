import type { ItemDefinitionId } from "../simulation/contracts";

export interface ItemDefinition {
  readonly definitionVersion: 1;
  readonly id: ItemDefinitionId;
  readonly visualKey: string;
  readonly audioKey: string;
  readonly durationTicks: number | null;
  readonly consumePolicy: "timed" | "next-shove";
  readonly stackingPolicy: "refresh";
  readonly massMultiplier: number;
  readonly dodgeSpeedMultiplier: number;
  readonly shoveImpulseMultiplier: number;
  readonly shoveReachMultiplier: number;
  readonly aiTags: readonly ("mass" | "mobility" | "shove")[];
}

export const ITEM_DEFINITION_IDS = ["iron-boots", "feather", "spring-glove"] as const;

export const ITEM_DEFINITIONS: Readonly<Record<ItemDefinitionId, ItemDefinition>> = Object.freeze({
  "iron-boots": Object.freeze({
    definitionVersion: 1,
    id: "iron-boots",
    visualKey: "item.iron-boots",
    audioKey: "item.pickup.heavy",
    durationTicks: 480,
    consumePolicy: "timed",
    stackingPolicy: "refresh",
    massMultiplier: 1.4,
    dodgeSpeedMultiplier: 0.82,
    shoveImpulseMultiplier: 1,
    shoveReachMultiplier: 1,
    aiTags: Object.freeze(["mass"] as const),
  }),
  feather: Object.freeze({
    definitionVersion: 1,
    id: "feather",
    visualKey: "item.feather",
    audioKey: "item.pickup.light",
    durationTicks: 480,
    consumePolicy: "timed",
    stackingPolicy: "refresh",
    massMultiplier: 0.8,
    dodgeSpeedMultiplier: 1.18,
    shoveImpulseMultiplier: 1,
    shoveReachMultiplier: 1,
    aiTags: Object.freeze(["mobility"] as const),
  }),
  "spring-glove": Object.freeze({
    definitionVersion: 1,
    id: "spring-glove",
    visualKey: "item.spring-glove",
    audioKey: "item.pickup.spring",
    durationTicks: null,
    consumePolicy: "next-shove",
    stackingPolicy: "refresh",
    massMultiplier: 1,
    dodgeSpeedMultiplier: 1,
    shoveImpulseMultiplier: 1.45,
    shoveReachMultiplier: 1.22,
    aiTags: Object.freeze(["shove"] as const),
  }),
});

export function getItemDefinition(id: ItemDefinitionId): ItemDefinition {
  return ITEM_DEFINITIONS[id];
}
