import { describe, expect, it } from "vitest";
import { getSkillDefinition } from "../src/content/skills";
import {
  createGrappleTargetedAction,
  createItemTargetedAction,
  createSkillTargetedAction,
  isSameTargetedAction,
  moveAimTargetWithKeyboard,
  mustApproachTarget,
} from "../src/app/action-targeting";

const SOURCE = Object.freeze({
  position: Object.freeze({ x: 5, y: 6 }),
  facing: Object.freeze({ x: 1, y: 0 }),
});

describe("action targeting registry", () => {
  it("derives skill target modes and previews from the skill SSOT", () => {
    const self = createSkillTargetedAction(0, "aegis", SOURCE);
    const ground = createSkillTargetedAction(0, "meteor-mark", SOURCE);
    const direction = createSkillTargetedAction(1, "arc-bolt", SOURCE);

    expect(self).toMatchObject({ targetMode: "self", target: SOURCE.position });
    expect(ground).toMatchObject({
      actionKind: "skill",
      targetMode: "ground",
      castRange: getSkillDefinition("meteor-mark").range,
      effectRadius: getSkillDefinition("meteor-mark").radius,
      target: { x: 8, y: 6 },
    });
    expect(direction).toMatchObject({
      slotIndex: 1,
      targetMode: "direction",
      castRange: 3.5,
      target: { x: 8, y: 6 },
    });
  });

  it("derives item and built-in action previews without UI-specific switches", () => {
    expect(createItemTargetedAction(0, "bomb", SOURCE)).toMatchObject({
      actionKind: "item",
      targetMode: "ground",
      effectRadius: 3,
      visualKind: "bomb",
    });
    expect(createItemTargetedAction(0, "boat", SOURCE)).toMatchObject({
      targetMode: "self",
      target: SOURCE.position,
    });
    expect(createGrappleTargetedAction(SOURCE, 7)).toMatchObject({
      actionKind: "grapple",
      castRange: 7,
      effectRadius: 0.35,
      target: { x: 8, y: 6 },
    });
  });

  it("keeps repeat confirmation and approach policy in one pure rule", () => {
    const line = createSkillTargetedAction(0, "arc-bolt", SOURCE);
    const dash = createSkillTargetedAction(0, "blink-step", SOURCE);
    const ground = createItemTargetedAction(0, "brick-bag", SOURCE);

    expect(isSameTargetedAction(line, "skill", 0)).toBe(true);
    expect(isSameTargetedAction(line, "skill", 1)).toBe(false);
    expect(mustApproachTarget(line, 4)).toBe(true);
    expect(mustApproachTarget(dash, 10)).toBe(false);
    expect(mustApproachTarget(ground, 4)).toBe(true);
  });

  it("moves keyboard aim consistently for direction, ground, and self targets", () => {
    expect(
      moveAimTargetWithKeyboard("direction", SOURCE.position, { x: 8, y: 6 }, 5, { x: 0, y: 1 }),
    ).toEqual({ x: 5, y: 9 });
    expect(
      moveAimTargetWithKeyboard("ground", SOURCE.position, { x: 7.2, y: 6.8 }, 5, {
        x: 1,
        y: 0,
      }),
    ).toEqual({ x: 8.5, y: 6.5 });
    expect(
      moveAimTargetWithKeyboard("self", SOURCE.position, { x: 8, y: 8 }, 0, { x: 1, y: 0 }),
    ).toBe(SOURCE.position);
  });
});
