import type { ItemDefinitionId } from "../simulation/contracts";

export interface ItemDefinition {
  readonly definitionVersion: 2;
  readonly id: ItemDefinitionId;
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

export const ITEM_DEFINITION_IDS = [
  "iron-boots",
  "feather",
  "spring-glove",
  "wind-blast",
  "brick-bag",
  "boat",
  "bomb",
  "soap",
  "grappling-hook",
] as const;

export const MAP_ITEM_DEFINITION_IDS = ["iron-boots", "feather", "spring-glove"] as const;

export const ITEM_DEFINITIONS: Readonly<Record<ItemDefinitionId, ItemDefinition>> = Object.freeze({
  "iron-boots": Object.freeze({
    definitionVersion: 2,
    id: "iron-boots",
    visualKey: "item.iron-boots",
    audioKey: "item.pickup.heavy",
    loadoutKind: "passive",
    startingCharges: null,
    mapSpawnEligible: true,
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
    definitionVersion: 2,
    id: "feather",
    visualKey: "item.feather",
    audioKey: "item.pickup.light",
    loadoutKind: "passive",
    startingCharges: null,
    mapSpawnEligible: true,
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
    definitionVersion: 2,
    id: "spring-glove",
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
    shoveImpulseMultiplier: 1.25,
    shoveReachMultiplier: 1.12,
    aiTags: Object.freeze(["shove"] as const),
  }),
  "wind-blast": Object.freeze({
    definitionVersion: 2,
    id: "wind-blast",
    visualKey: "item.wind-blast",
    audioKey: "item.use.wind-blast",
    loadoutKind: "active",
    startingCharges: 2,
    mapSpawnEligible: false,
    durationTicks: null,
    consumePolicy: "inventory-charge",
    stackingPolicy: "refresh",
    massMultiplier: 1,
    dodgeSpeedMultiplier: 1,
    shoveImpulseMultiplier: 1,
    shoveReachMultiplier: 1,
    aiTags: Object.freeze(["projectile", "shove"] as const),
  }),
  "brick-bag": Object.freeze({
    definitionVersion: 2,
    id: "brick-bag",
    visualKey: "item.brick-bag",
    audioKey: "item.use.brick",
    loadoutKind: "active",
    startingCharges: 4,
    mapSpawnEligible: false,
    durationTicks: null,
    consumePolicy: "inventory-charge",
    stackingPolicy: "refresh",
    massMultiplier: 1,
    dodgeSpeedMultiplier: 1,
    shoveImpulseMultiplier: 1,
    shoveReachMultiplier: 1,
    aiTags: Object.freeze(["cover"] as const),
  }),
  boat: Object.freeze({
    definitionVersion: 2,
    id: "boat",
    visualKey: "item.boat",
    audioKey: "item.use.boat",
    loadoutKind: "active",
    startingCharges: 1,
    mapSpawnEligible: false,
    durationTicks: 300,
    consumePolicy: "inventory-charge",
    stackingPolicy: "refresh",
    massMultiplier: 1,
    dodgeSpeedMultiplier: 1,
    shoveImpulseMultiplier: 1,
    shoveReachMultiplier: 1,
    aiTags: Object.freeze(["water", "rescue"] as const),
  }),
  bomb: Object.freeze({
    definitionVersion: 2,
    id: "bomb",
    visualKey: "item.bomb",
    audioKey: "item.use.bomb",
    loadoutKind: "active",
    startingCharges: 2,
    mapSpawnEligible: false,
    durationTicks: null,
    consumePolicy: "inventory-charge",
    stackingPolicy: "refresh",
    massMultiplier: 1,
    dodgeSpeedMultiplier: 1,
    shoveImpulseMultiplier: 1,
    shoveReachMultiplier: 1,
    aiTags: Object.freeze(["area", "shove"] as const),
  }),
  soap: Object.freeze({
    definitionVersion: 2,
    id: "soap",
    visualKey: "item.soap",
    audioKey: "item.use.soap",
    loadoutKind: "active",
    startingCharges: 3,
    mapSpawnEligible: false,
    durationTicks: null,
    consumePolicy: "inventory-charge",
    stackingPolicy: "refresh",
    massMultiplier: 1,
    dodgeSpeedMultiplier: 1,
    shoveImpulseMultiplier: 1,
    shoveReachMultiplier: 1,
    aiTags: Object.freeze(["trap", "mobility"] as const),
  }),
  "grappling-hook": Object.freeze({
    definitionVersion: 2,
    id: "grappling-hook",
    visualKey: "item.grappling-hook",
    audioKey: "item.use.grappling-hook",
    loadoutKind: "active",
    startingCharges: 2,
    mapSpawnEligible: false,
    durationTicks: null,
    consumePolicy: "inventory-charge",
    stackingPolicy: "refresh",
    massMultiplier: 1,
    dodgeSpeedMultiplier: 1,
    shoveImpulseMultiplier: 1,
    shoveReachMultiplier: 1,
    aiTags: Object.freeze(["mobility", "rescue"] as const),
  }),
});

export function getItemDefinition(id: ItemDefinitionId): ItemDefinition {
  return ITEM_DEFINITIONS[id];
}
