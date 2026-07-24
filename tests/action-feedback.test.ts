import { describe, expect, it } from "vitest";
import { createActionFeedbackGeometry } from "../src/presentation/action-feedback";

const BASE_INPUT = Object.freeze({
  actorId: 1,
  center: Object.freeze({ x: 100, y: 100 }),
  previousCenter: Object.freeze({ x: 92, y: 100 }),
  direction: Object.freeze({ x: 1, y: 0 }),
  velocity: Object.freeze({ x: 0.3, y: 0 }),
  radius: 12,
  frameTick: 30,
  reducedMotion: false,
  detailed: true,
});

describe("action feedback geometry", () => {
  it("draws a readable windup fan before the shove becomes active", () => {
    const geometry = createActionFeedbackGeometry({ ...BASE_INPUT, action: "ShoveWindup" });

    expect(geometry.strokes).toHaveLength(3);
    expect(geometry.circles).toHaveLength(1);
    expect(new Set(geometry.strokes.map(({ color }) => color))).toEqual(new Set([0xffc857]));
  });

  it("draws three asymmetric shove tracks ending beyond the body radius", () => {
    const geometry = createActionFeedbackGeometry({ ...BASE_INPUT, action: "ShoveActive" });
    const mainTrack = geometry.strokes[0];
    const endpoint = mainTrack?.points.at(-1);

    expect(geometry.strokes).toHaveLength(3);
    expect(geometry.circles).toHaveLength(1);
    expect(endpoint?.x).toBeGreaterThan(BASE_INPUT.center.x + BASE_INPUT.radius * 2);
  });

  it("keeps a static dodge silhouette and direction wedge for reduced motion", () => {
    const geometry = createActionFeedbackGeometry({
      ...BASE_INPUT,
      action: "DodgeActive",
      reducedMotion: true,
    });

    expect(geometry.circles[0]?.center).toEqual(BASE_INPUT.previousCenter);
    expect(geometry.circles[0]?.alpha).toBe(0.12);
    expect(geometry.strokes).toHaveLength(2);
  });

  it("uses velocity-opposed trails for a launched stumbling actor", () => {
    const geometry = createActionFeedbackGeometry({
      ...BASE_INPUT,
      action: "Stumbling",
      velocity: Object.freeze({ x: 0.4, y: -0.2 }),
    });

    expect(geometry.strokes).toHaveLength(3);
    expect(geometry.strokes.every(({ color }) => color === 0xd58bea)).toBe(true);
    expect(geometry.strokes[0]?.points.at(-1)?.x).toBeLessThan(BASE_INPUT.center.x);
  });

  it("limits distant mayhem actors to one cheap direction stroke", () => {
    const geometry = createActionFeedbackGeometry({
      ...BASE_INPUT,
      action: "ShoveWindup",
      detailed: false,
    });

    expect(geometry.strokes).toHaveLength(1);
    expect(geometry.circles).toHaveLength(0);
  });
});
