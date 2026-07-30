import type { ParticipantActionKind } from "../simulation/contracts";
import { clamp, type Vector2 } from "../simulation/math";

export interface CharacterMotionInput {
  readonly action: ParticipantActionKind;
  readonly actorId: number;
  readonly castProgress: number | null;
  readonly facing: Vector2;
  readonly frameTick: number;
  readonly reducedMotion: boolean;
  readonly velocity: Vector2;
}

export interface CharacterMotionPose {
  readonly liftRatio: number;
  readonly moving: boolean;
  readonly offsetXRatio: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly stridePhase: number;
}

export type CharacterAnimationState = "idle" | "walk" | "cast" | "hit";

export interface CharacterAnimationStateInput {
  readonly action: ParticipantActionKind;
  readonly castProgress: number | null;
  readonly hitActive: boolean;
  readonly motionPose: CharacterMotionPose;
  readonly reducedMotion: boolean;
}

const MOVEMENT_ACTIONS = new Set<ParticipantActionKind>(["Ready", "ShoveRecovery"]);

export function createCharacterMotionPose(input: CharacterMotionInput): CharacterMotionPose {
  const speed = Math.hypot(input.velocity.x, input.velocity.y);
  const moving = !input.reducedMotion && speed > 0.05 && MOVEMENT_ACTIONS.has(input.action);
  const stridePhase = moving ? Math.sin(input.frameTick * 0.31 + input.actorId * 1.73) : 0;
  const footfall = moving ? Math.abs(Math.cos(input.frameTick * 0.31 + input.actorId * 1.73)) : 0;
  const horizontalDirection = speed > Number.EPSILON ? input.velocity.x / speed : input.facing.x;

  let scaleX = 1 + footfall * 0.025;
  let scaleY = 1 - footfall * 0.02;
  let liftRatio = footfall * 0.12;
  let offsetXRatio = stridePhase * 0.045;
  let rotation = stridePhase * 0.025 + horizontalDirection * (moving ? 0.035 : 0);

  if (!input.reducedMotion && input.castProgress !== null && input.action === "Ready") {
    const progress = clamp(input.castProgress, 0, 1);
    const anticipation = clamp(progress / 0.35, 0, 1);
    const release = Math.sin(clamp((progress - 0.35) / 0.65, 0, 1) * Math.PI);
    scaleX *= 1 - anticipation * 0.055 + release * 0.14;
    scaleY *= 1 + anticipation * 0.07 - release * 0.1;
    liftRatio += release * 0.1;
    offsetXRatio += input.facing.x * release * 0.055;
    rotation += input.facing.x * (-anticipation * 0.065 + release * 0.1);
  }

  const actionPhase = ((input.frameTick + input.actorId * 5) % 18) / 18;

  if (input.action === "ShoveWindup") {
    scaleX = 0.92;
    scaleY = 1.06;
    liftRatio = 0;
    rotation = input.reducedMotion ? 0 : -input.facing.x * 0.055;
  } else if (input.action === "ShoveActive") {
    scaleX = 1.12;
    scaleY = 0.92;
    liftRatio = 0;
    rotation = input.reducedMotion ? 0 : input.facing.x * 0.075;
  } else if (input.action === "DodgeActive") {
    scaleX = 1.18;
    scaleY = 0.88;
    liftRatio = input.reducedMotion ? 0 : Math.sin(actionPhase * Math.PI) * 0.36;
    rotation = input.reducedMotion ? 0 : horizontalDirection * 0.06;
  } else if (input.action === "Stumbling") {
    liftRatio = 0;
    rotation = input.reducedMotion ? 0 : Math.sin(actionPhase * Math.PI * 2) * 0.13;
  } else if (input.action === "GrapplePull") {
    scaleX = 1.08;
    scaleY = 0.94;
    liftRatio = input.reducedMotion ? 0 : footfall * 0.05;
    rotation = input.reducedMotion ? 0 : horizontalDirection * 0.08;
  } else if (input.action === "Falling") {
    scaleX = 1;
    scaleY = Math.max(0.58, 1 - actionPhase * 0.26);
    liftRatio = 0;
    rotation = input.reducedMotion ? 0 : actionPhase * 0.32;
  }

  return Object.freeze({
    liftRatio,
    moving,
    offsetXRatio,
    rotation,
    scaleX,
    scaleY,
    stridePhase,
  });
}

export function selectCharacterAnimationState(
  input: CharacterAnimationStateInput,
): CharacterAnimationState {
  if (input.hitActive || input.action === "Stumbling" || input.action === "Falling") {
    return "hit";
  }
  if (
    input.castProgress !== null ||
    input.action === "ShoveWindup" ||
    input.action === "ShoveActive"
  ) {
    return "cast";
  }
  if (input.reducedMotion) {
    return "idle";
  }
  if (input.motionPose.moving || input.action === "DodgeActive" || input.action === "GrapplePull") {
    return input.motionPose.stridePhase >= 0 ? "walk" : "idle";
  }
  return "idle";
}
