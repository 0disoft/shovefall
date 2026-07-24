import type { ParticipantActionKind } from "../simulation/contracts";
import type { Vector2 } from "../simulation/math";

export interface ActionFeedbackStroke {
  readonly points: readonly Vector2[];
  readonly color: number;
  readonly width: number;
  readonly alpha: number;
}

export interface ActionFeedbackCircle {
  readonly center: Vector2;
  readonly radius: number;
  readonly color: number;
  readonly alpha: number;
  readonly outlineColor?: number;
  readonly outlineWidth?: number;
}

export interface ActionFeedbackGeometry {
  readonly strokes: readonly ActionFeedbackStroke[];
  readonly circles: readonly ActionFeedbackCircle[];
}

export interface ActionFeedbackInput {
  readonly action: ParticipantActionKind;
  readonly actorId: number;
  readonly center: Vector2;
  readonly previousCenter: Vector2;
  readonly direction: Vector2;
  readonly velocity: Vector2;
  readonly radius: number;
  readonly frameTick: number;
  readonly reducedMotion: boolean;
  readonly detailed: boolean;
}

const COLORS = Object.freeze({
  windup: 0xffc857,
  shove: 0xff695c,
  dodge: 0x68d8d6,
  stumble: 0xd58bea,
  falling: 0x727b78,
  neutral: 0xc9d0cd,
} as const);

function normalizeOrFallback(vector: Vector2, fallback: Vector2): Vector2 {
  const length = Math.hypot(vector.x, vector.y);

  if (length <= Number.EPSILON) {
    return fallback;
  }

  return Object.freeze({ x: vector.x / length, y: vector.y / length });
}

function pointFrom(origin: Vector2, direction: Vector2, distance: number): Vector2 {
  return Object.freeze({
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
  });
}

function offsetPoint(point: Vector2, perpendicular: Vector2, distance: number): Vector2 {
  return Object.freeze({
    x: point.x + perpendicular.x * distance,
    y: point.y + perpendicular.y * distance,
  });
}

function stroke(
  points: readonly Vector2[],
  color: number,
  width: number,
  alpha = 1,
): ActionFeedbackStroke {
  return Object.freeze({ points: Object.freeze([...points]), color, width, alpha });
}

function circle(
  center: Vector2,
  radius: number,
  color: number,
  alpha: number,
  outlineColor?: number,
  outlineWidth?: number,
): ActionFeedbackCircle {
  return Object.freeze({
    center,
    radius,
    color,
    alpha,
    ...(outlineColor === undefined ? {} : { outlineColor }),
    ...(outlineWidth === undefined ? {} : { outlineWidth }),
  });
}

function createBrokenRing(
  center: Vector2,
  radius: number,
  color: number,
  width: number,
): readonly ActionFeedbackStroke[] {
  const segments: ActionFeedbackStroke[] = [];
  const segmentCount = 8;

  for (let index = 0; index < segmentCount; index += 2) {
    const startAngle = (index / segmentCount) * Math.PI * 2;
    const endAngle = ((index + 1) / segmentCount) * Math.PI * 2;
    segments.push(
      stroke(
        [
          Object.freeze({
            x: center.x + Math.cos(startAngle) * radius,
            y: center.y + Math.sin(startAngle) * radius,
          }),
          Object.freeze({
            x: center.x + Math.cos(endAngle) * radius,
            y: center.y + Math.sin(endAngle) * radius,
          }),
        ],
        color,
        width,
        0.9,
      ),
    );
  }

  return Object.freeze(segments);
}

export function createActionFeedbackGeometry(input: ActionFeedbackInput): ActionFeedbackGeometry {
  const direction = normalizeOrFallback(input.direction, Object.freeze({ x: 1, y: 0 }));
  const perpendicular = Object.freeze({ x: -direction.y, y: direction.x });
  const velocity = normalizeOrFallback(input.velocity, direction);
  const strokes: ActionFeedbackStroke[] = [];
  const circles: ActionFeedbackCircle[] = [];
  const pulse = input.reducedMotion
    ? 0
    : (Math.sin((input.frameTick + input.actorId * 3) * 0.72) + 1) * 0.5;

  if (!input.detailed) {
    const end = pointFrom(input.center, direction, input.radius * 1.35);
    strokes.push(
      stroke(
        [input.center, end],
        input.action === "ShoveActive" ? COLORS.shove : COLORS.neutral,
        input.action === "ShoveActive" ? Math.max(3, input.radius * 0.28) : 1.5,
        0.78,
      ),
    );

    if (input.action === "Stumbling" || input.action === "Falling") {
      const size = input.radius * 0.46;
      strokes.push(
        stroke(
          [
            Object.freeze({ x: input.center.x - size, y: input.center.y - size }),
            Object.freeze({ x: input.center.x + size, y: input.center.y + size }),
          ],
          input.action === "Stumbling" ? COLORS.stumble : COLORS.falling,
          2,
        ),
      );
    }

    return Object.freeze({ strokes: Object.freeze(strokes), circles: Object.freeze(circles) });
  }

  if (input.action === "ShoveWindup") {
    const fanLength = input.radius * (1.55 + pulse * 0.18);
    const fanEnd = pointFrom(input.center, direction, fanLength);
    const spread = input.radius * (0.56 - pulse * 0.12);
    strokes.push(
      stroke([input.center, fanEnd], COLORS.windup, Math.max(2, input.radius * 0.16), 0.98),
      stroke(
        [input.center, offsetPoint(fanEnd, perpendicular, spread)],
        COLORS.windup,
        Math.max(1.5, input.radius * 0.11),
        0.72,
      ),
      stroke(
        [input.center, offsetPoint(fanEnd, perpendicular, -spread)],
        COLORS.windup,
        Math.max(1.5, input.radius * 0.11),
        0.72,
      ),
    );
    circles.push(circle(fanEnd, Math.max(2.5, input.radius * 0.16), COLORS.windup, 0.82));
  } else if (input.action === "ShoveActive") {
    const start = pointFrom(input.center, direction, input.radius * 0.25);
    const end = pointFrom(input.center, direction, input.radius * 2.35);
    const spread = input.radius * 0.34;
    strokes.push(
      stroke([start, end], COLORS.shove, Math.max(4, input.radius * 0.34), 1),
      stroke(
        [offsetPoint(start, perpendicular, spread), offsetPoint(end, perpendicular, spread * 0.42)],
        COLORS.shove,
        Math.max(2, input.radius * 0.17),
        0.72,
      ),
      stroke(
        [
          offsetPoint(start, perpendicular, -spread),
          offsetPoint(end, perpendicular, -spread * 0.42),
        ],
        COLORS.shove,
        Math.max(2, input.radius * 0.17),
        0.72,
      ),
    );
    circles.push(circle(end, Math.max(3, input.radius * 0.23), COLORS.shove, 1, 0xf6f5ef, 1));
  } else if (input.action === "DodgeActive") {
    const displacement = Object.freeze({
      x: input.center.x - input.previousCenter.x,
      y: input.center.y - input.previousCenter.y,
    });
    const dodgeDirection = normalizeOrFallback(displacement, direction);
    const dodgePerpendicular = Object.freeze({ x: -dodgeDirection.y, y: dodgeDirection.x });
    const wedgeTip = pointFrom(input.center, dodgeDirection, input.radius * 1.45);
    const wedgeBack = pointFrom(input.center, dodgeDirection, -input.radius * 0.36);
    circles.push(
      circle(
        input.previousCenter,
        input.radius * 0.86,
        COLORS.dodge,
        input.reducedMotion ? 0.12 : 0.2,
      ),
    );
    strokes.push(
      stroke(
        [
          offsetPoint(wedgeBack, dodgePerpendicular, input.radius * 0.46),
          wedgeTip,
          offsetPoint(wedgeBack, dodgePerpendicular, -input.radius * 0.46),
        ],
        COLORS.dodge,
        Math.max(2, input.radius * 0.18),
        0.92,
      ),
      stroke(
        [input.previousCenter, input.center],
        COLORS.dodge,
        Math.max(2, input.radius * 0.14),
        0.48,
      ),
    );
  } else if (input.action === "Stumbling" || input.action === "GrapplePull") {
    const trailDirection = Object.freeze({ x: -velocity.x, y: -velocity.y });
    const color = input.action === "Stumbling" ? COLORS.stumble : COLORS.windup;

    for (const [index, offset] of [-0.42, 0, 0.42].entries()) {
      const start = offsetPoint(input.center, perpendicular, offset * input.radius);
      const end = pointFrom(start, trailDirection, input.radius * (1.15 + index * 0.32));
      strokes.push(
        stroke([start, end], color, Math.max(1.5, input.radius * (0.18 - index * 0.025)), 0.8),
      );
    }
  } else if (input.action === "Falling") {
    strokes.push(
      ...createBrokenRing(
        input.center,
        input.radius * (1.05 + pulse * 0.12),
        COLORS.falling,
        Math.max(2, input.radius * 0.16),
      ),
    );
    const chevronY = input.center.y + input.radius * 0.62;
    strokes.push(
      stroke(
        [
          Object.freeze({ x: input.center.x - input.radius * 0.35, y: chevronY }),
          Object.freeze({ x: input.center.x, y: chevronY + input.radius * 0.42 }),
          Object.freeze({ x: input.center.x + input.radius * 0.35, y: chevronY }),
        ],
        COLORS.falling,
        Math.max(2, input.radius * 0.17),
        0.9,
      ),
    );
  } else {
    const end = pointFrom(input.center, direction, input.radius * 1.45);
    strokes.push(stroke([input.center, end], COLORS.neutral, 2, 0.82));
  }

  return Object.freeze({ strokes: Object.freeze(strokes), circles: Object.freeze(circles) });
}
