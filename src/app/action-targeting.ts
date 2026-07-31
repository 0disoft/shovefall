import { GRAPPLING_HOOK_DEFINITION } from "../content/built-in-actions";
import { getItemDefinition } from "../content/items";
import { getSkillDefinition } from "../content/skills";
import type { ItemDefinitionId, SkillDefinitionId, SkillSlotIndex } from "../simulation/contracts";
import { type Vector2 } from "../simulation/math";

export type ActionTargetMode = "self" | "direction" | "ground";
export type TargetedActionKind = "skill" | "item" | "grapple";

export interface TargetedAction {
  readonly actionKind: TargetedActionKind;
  readonly slotIndex: SkillSlotIndex;
  readonly targetMode: ActionTargetMode;
  readonly castRange: number;
  readonly effectRadius: number;
  readonly visualKind: string;
  readonly target: Vector2;
}

interface ActionSource {
  readonly position: Vector2;
  readonly facing: Vector2;
}

interface TargetingSpecification {
  readonly actionKind: TargetedActionKind;
  readonly slotIndex: SkillSlotIndex;
  readonly targetMode: ActionTargetMode;
  readonly castRange: number;
  readonly effectRadius: number;
  readonly visualKind: string;
}

function getInitialTargetDistance(targetMode: ActionTargetMode, castRange: number): number {
  return targetMode === "self" ? 0 : Math.max(1, Math.min(castRange, 3));
}

function createTargetedAction(
  specification: TargetingSpecification,
  source: ActionSource,
): TargetedAction {
  const distance = getInitialTargetDistance(specification.targetMode, specification.castRange);
  return Object.freeze({
    ...specification,
    target: Object.freeze({
      x: source.position.x + source.facing.x * distance,
      y: source.position.y + source.facing.y * distance,
    }),
  });
}

export function createSkillTargetedAction(
  slotIndex: SkillSlotIndex,
  definitionId: SkillDefinitionId,
  source: ActionSource,
): TargetedAction {
  const definition = getSkillDefinition(definitionId);
  const targetMode: ActionTargetMode =
    definition.castKind === "self"
      ? "self"
      : definition.castKind === "zone"
        ? "ground"
        : "direction";
  return createTargetedAction(
    {
      actionKind: "skill",
      slotIndex,
      targetMode,
      castRange: definition.range,
      effectRadius:
        definition.radius > 0 ? definition.radius : definition.castKind === "melee" ? 0.75 : 0.45,
      visualKind: definition.id,
    },
    source,
  );
}

export function createItemTargetedAction(
  slotIndex: 0,
  definitionId: ItemDefinitionId,
  source: ActionSource,
): TargetedAction {
  const definition = getItemDefinition(definitionId);
  return createTargetedAction(
    {
      actionKind: "item",
      slotIndex,
      targetMode: definition.targetMode,
      castRange: definition.castRange,
      effectRadius: definition.effectRadius,
      visualKind: definition.id,
    },
    source,
  );
}

export function createGrappleTargetedAction(
  source: ActionSource,
  castRange = GRAPPLING_HOOK_DEFINITION.castRange,
): TargetedAction {
  return createTargetedAction(
    {
      actionKind: "grapple",
      slotIndex: 0,
      targetMode: "direction",
      castRange,
      effectRadius: GRAPPLING_HOOK_DEFINITION.effectRadius,
      visualKind: GRAPPLING_HOOK_DEFINITION.id,
    },
    source,
  );
}

export function isSameTargetedAction(
  current: TargetedAction | null,
  actionKind: TargetedActionKind,
  slotIndex: SkillSlotIndex,
): boolean {
  return current?.actionKind === actionKind && current.slotIndex === slotIndex;
}

export function mustApproachTarget(action: TargetedAction, distance: number): boolean {
  return (
    (action.targetMode === "ground" ||
      (action.targetMode === "direction" &&
        action.actionKind === "skill" &&
        action.visualKind !== "blink-step")) &&
    distance > action.castRange + 0.08
  );
}

export function moveAimTargetWithKeyboard(
  targetMode: ActionTargetMode,
  source: Vector2,
  currentTarget: Vector2,
  castRange: number,
  input: Vector2,
): Vector2 {
  if (input.x === 0 && input.y === 0) {
    return currentTarget;
  }
  if (targetMode === "self") {
    return source;
  }
  if (targetMode === "ground") {
    return Object.freeze({
      x: Math.floor(currentTarget.x) + 0.5 + Math.sign(input.x),
      y: Math.floor(currentTarget.y) + 0.5 + Math.sign(input.y),
    });
  }

  const inputLength = Math.hypot(input.x, input.y);
  const direction =
    inputLength <= 1
      ? input
      : Object.freeze({ x: input.x / inputLength, y: input.y / inputLength });
  const previewDistance = getInitialTargetDistance(targetMode, castRange);
  return Object.freeze({
    x: source.x + direction.x * previewDistance,
    y: source.y + direction.y * previewDistance,
  });
}
