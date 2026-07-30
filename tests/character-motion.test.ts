import { describe, expect, it } from "vitest";
import {
  createCharacterMotionPose,
  createCharacterSpriteMotionTransform,
  selectCharacterAnimationState,
} from "../src/presentation/character-motion";

describe("character motion presentation", () => {
  it("gives moving actors offset walk phases without synchronizing the whole crowd", () => {
    const first = createCharacterMotionPose({
      action: "Ready",
      actorId: 1,
      castProgress: null,
      facing: { x: 1, y: 0 },
      frameTick: 24,
      reducedMotion: false,
      velocity: { x: 2.4, y: 0 },
    });
    const second = createCharacterMotionPose({
      action: "Ready",
      actorId: 2,
      castProgress: null,
      facing: { x: 1, y: 0 },
      frameTick: 24,
      reducedMotion: false,
      velocity: { x: 2.4, y: 0 },
    });

    expect(first.moving).toBe(true);
    expect(first.liftRatio).toBeGreaterThan(0);
    expect(first.stridePhase).not.toBe(second.stridePhase);
  });

  it("adds a readable cast release without overriding reduced-motion preferences", () => {
    const cast = createCharacterMotionPose({
      action: "Ready",
      actorId: 1,
      castProgress: 0.62,
      facing: { x: 1, y: 0 },
      frameTick: 24,
      reducedMotion: false,
      velocity: { x: 0, y: 0 },
    });
    const reduced = createCharacterMotionPose({
      action: "Ready",
      actorId: 1,
      castProgress: 0.62,
      facing: { x: 1, y: 0 },
      frameTick: 24,
      reducedMotion: true,
      velocity: { x: 0, y: 0 },
    });

    expect(cast.scaleX).toBeGreaterThan(1);
    expect(cast.scaleY).toBeLessThan(1);
    expect(cast.rotation).toBeGreaterThan(0);
    expect(reduced).toMatchObject({
      liftRatio: 0,
      moving: false,
      offsetXRatio: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it("keeps stumble motion authoritative over walking and casting", () => {
    const pose = createCharacterMotionPose({
      action: "Stumbling",
      actorId: 3,
      castProgress: 0.7,
      facing: { x: -1, y: 0 },
      frameTick: 32,
      reducedMotion: false,
      velocity: { x: 2.4, y: 0 },
    });

    expect(pose.moving).toBe(false);
    expect(Math.abs(pose.rotation)).toBeGreaterThan(0.01);
  });

  it("selects semantic atlas frames without hiding hit or reduced-motion state", () => {
    const motionPose = createCharacterMotionPose({
      action: "Ready",
      actorId: 1,
      castProgress: null,
      facing: { x: 1, y: 0 },
      frameTick: 24,
      reducedMotion: false,
      velocity: { x: 2.4, y: 0 },
    });

    expect(
      selectCharacterAnimationState({
        action: "Ready",
        castProgress: null,
        hitActive: false,
        motionPose: { ...motionPose, stridePhase: 1 },
        reducedMotion: false,
      }),
    ).toBe("walk");
    expect(
      selectCharacterAnimationState({
        action: "Ready",
        castProgress: 0.5,
        hitActive: false,
        motionPose,
        reducedMotion: true,
      }),
    ).toBe("cast");
    expect(
      selectCharacterAnimationState({
        action: "Ready",
        castProgress: 0.5,
        hitActive: true,
        motionPose,
        reducedMotion: false,
      }),
    ).toBe("hit");
  });

  it("preserves visible walk motion when motion-atlas artwork is loaded", () => {
    const motionPose = createCharacterMotionPose({
      action: "Ready",
      actorId: 1,
      castProgress: null,
      facing: { x: 1, y: 0 },
      frameTick: 5,
      reducedMotion: false,
      velocity: { x: 2.4, y: 0 },
    });

    const transform = createCharacterSpriteMotionTransform(motionPose, true);

    expect(motionPose.moving).toBe(true);
    expect(transform.liftRatio).not.toBe(0);
    expect(transform.offsetXRatio).not.toBe(0);
    expect(transform.rotation).not.toBe(0);
    expect(transform.scaleX).not.toBe(1);
    expect(transform.scaleY).not.toBe(1);
  });
});
