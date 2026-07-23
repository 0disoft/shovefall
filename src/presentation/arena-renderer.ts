import { Application, Graphics } from "pixi.js";
import type {
  BombState,
  BrickWallState,
  ItemDefinitionId,
  ParticipantActionKind,
  RenderFrameV1,
  RenderItemV1,
  RenderParticipantV1,
  SimulationEventV1,
  SoapPatchState,
  TileState,
} from "../simulation/contracts";
import { clamp, type Vector2 } from "../simulation/math";
import {
  ARENA_CAMERA_ELEVATION_DEGREES,
  ARENA_DEPTH_SCALE,
  ARENA_SHADOW_OFFSET_SCALE,
  createArenaProjection,
  getProjectedArenaSize,
  projectArenaPoint,
  projectArenaVector,
  type ArenaProjection,
} from "./arena-projection";
import { SimulationEventLedger } from "./event-ledger";

export interface ArenaRenderer {
  consumeEvents(events: readonly SimulationEventV1[], frame: RenderFrameV1): void;
  destroy(): void;
  render(frame: RenderFrameV1, interpolationAlpha: number, humanActorId: number): void;
}

export interface ArenaRendererOptions {
  readonly onContextLost?: () => void;
  readonly onContextRestored?: () => void;
}

type VisualEffectKind =
  | "shove-hit"
  | "shove-missed"
  | "dodge-succeeded"
  | "falling-started"
  | "item-picked-up"
  | "item-used"
  | "wind-blast-hit"
  | "bomb-detonated"
  | "soap-placed"
  | "soap-triggered"
  | "grappling-hook-hit"
  | "sudden-death-pulse";

interface VisualEffect {
  readonly key: string;
  readonly kind: VisualEffectKind;
  readonly roundId: number;
  readonly startTick: number;
  readonly endTick: number;
  readonly position: Vector2;
  readonly vector: Vector2 | undefined;
  readonly itemDefinitionId: ItemDefinitionId | undefined;
}

const DEFAULT_RESOLUTION_CAP = 1.5;
const MAYHEM_RESOLUTION_CAP = 1;
const NORMAL_EFFECT_CAP = 36;
const MAYHEM_EFFECT_CAP = 14;
const BOT_COLORS = [0xb8c1bd, 0xd5aaa7, 0xc9bd91, 0xaab8d5, 0xc0a8cf];
const ACTION_COLORS: Readonly<Record<ParticipantActionKind, number>> = Object.freeze({
  Ready: 0xe8ecea,
  ShoveWindup: 0xffc857,
  ShoveActive: 0xff695c,
  ShoveRecovery: 0xc89f77,
  DodgeActive: 0x68d8d6,
  GrapplePull: 0xffc857,
  Stumbling: 0xd58bea,
  Anchored: 0x9ca5a1,
  Falling: 0x727b78,
  Eliminated: 0x727b78,
});
const ITEM_COLORS = Object.freeze({
  "iron-boots": 0x56626f,
  feather: 0xe9f5ff,
  "spring-glove": 0xff8f5c,
  "wind-blast": 0x68d8d6,
  "brick-bag": 0xb56f3f,
  boat: 0x4c9bd4,
  bomb: 0xff5c4d,
  soap: 0xd58bea,
  "grappling-hook": 0xffc857,
} as const);

function getArenaDimensions(frame: RenderFrameV1): { columns: number; rows: number } {
  return frame.tiles.reduce(
    (dimensions, tile) => ({
      columns: Math.max(dimensions.columns, tile.column + 1),
      rows: Math.max(dimensions.rows, tile.row + 1),
    }),
    { columns: 1, rows: 1 },
  );
}

function createCameraOffset(
  frame: RenderFrameV1,
  width: number,
  height: number,
  projection: ArenaProjection,
  humanActorId: number,
  interpolationAlpha: number,
): Vector2 {
  const { columns, rows } = getArenaDimensions(frame);
  const human = frame.participants.find(({ actorId }) => actorId === humanActorId);
  const focusX =
    human === undefined
      ? columns / 2
      : human.previousPosition.x +
        (human.position.x - human.previousPosition.x) * interpolationAlpha;
  const focusY =
    human === undefined
      ? rows / 2
      : human.previousPosition.y +
        (human.position.y - human.previousPosition.y) * interpolationAlpha;
  const worldSize = getProjectedArenaSize(columns, rows, projection);
  const focus = projectArenaPoint({ x: focusX, y: focusY }, projection);
  const oceanMargin = projection.tileWidth * 1.35;
  const unclampedX = width / 2 - focus.x;
  const unclampedY = height / 2 - focus.y;
  const minimumX = width - worldSize.width - oceanMargin;
  const maximumX = oceanMargin;
  const minimumY = height - worldSize.height - oceanMargin;
  const maximumY = oceanMargin;
  const x =
    minimumX > maximumX ? (width - worldSize.width) / 2 : clamp(unclampedX, minimumX, maximumX);
  const y =
    minimumY > maximumY ? (height - worldSize.height) / 2 : clamp(unclampedY, minimumY, maximumY);

  return Object.freeze({ x, y });
}

function getActionColor(action: ParticipantActionKind): number {
  return ACTION_COLORS[action];
}

function getTileFillColor(tile: TileState): number {
  return tile.state === "Stable" ? 0x2c3431 : tile.state === "Warning" ? 0x8a5a1e : 0x6b2a24;
}

function drawTileCliff(
  graphics: Graphics,
  tile: TileState,
  projection: ArenaProjection,
  hasSouthernNeighbor: boolean,
): void {
  if (tile.state === "Void" || hasSouthernNeighbor) {
    return;
  }

  const x = projection.originX + tile.column * projection.pitch;
  const y = projection.originY + tile.row * projection.depthPitch;
  const frontY = y + projection.tileDepth;
  const color = tile.state === "Stable" ? 0x202724 : tile.state === "Warning" ? 0x5a3918 : 0x421d1b;

  graphics
    .poly([
      x,
      frontY,
      x + projection.tileWidth,
      frontY,
      x + projection.tileWidth,
      frontY + projection.cliffDepth,
      x,
      frontY + projection.cliffDepth,
    ])
    .fill({ color, alpha: tile.state === "Collapsing" ? 0.68 : 1 })
    .stroke({ color: 0x0d1210, width: 1 });
}

function drawTile(graphics: Graphics, tile: TileState, projection: ArenaProjection): void {
  if (tile.state === "Void") {
    return;
  }

  const x = projection.originX + tile.column * projection.pitch;
  const y = projection.originY + tile.row * projection.depthPitch;
  const radius = Math.max(2, projection.tileDepth * 0.08);
  const fillColor = getTileFillColor(tile);
  const strokeColor =
    tile.state === "Stable" ? 0x3d4743 : tile.state === "Warning" ? 0xffc857 : 0xff5c4d;

  graphics
    .roundRect(x, y, projection.tileWidth, projection.tileDepth, radius)
    .fill({ color: fillColor, alpha: tile.state === "Collapsing" ? 0.72 : 1 })
    .stroke({ color: strokeColor, width: tile.state === "Stable" ? 1 : 2 });

  graphics
    .moveTo(x + radius, y + 1)
    .lineTo(x + projection.tileWidth - radius, y + 1)
    .stroke({
      color: tile.state === "Stable" ? 0x59645f : strokeColor,
      width: 1,
      alpha: tile.state === "Stable" ? 0.42 : 0.72,
    });

  if (tile.state === "Warning") {
    const insetX = projection.tileWidth * 0.2;
    const insetY = projection.tileDepth * 0.2;
    graphics
      .moveTo(x + insetX, y + projection.tileDepth - insetY)
      .lineTo(x + projection.tileWidth - insetX, y + insetY)
      .stroke({ color: 0x2d2111, width: Math.max(2, projection.tileWidth * 0.055) });
  }

  if (tile.state === "Collapsing") {
    const insetX = projection.tileWidth * 0.18;
    const insetY = projection.tileDepth * 0.18;
    graphics
      .moveTo(x + insetX, y + insetY)
      .lineTo(x + projection.tileWidth - insetX, y + projection.tileDepth - insetY)
      .moveTo(x + projection.tileWidth - insetX, y + insetY)
      .lineTo(x + insetX, y + projection.tileDepth - insetY)
      .stroke({ color: 0x251414, width: Math.max(2, projection.tileWidth * 0.07) });
  }
}

function drawDirection(
  graphics: Graphics,
  participant: RenderParticipantV1,
  x: number,
  y: number,
  radius: number,
): void {
  const direction = projectArenaVector(participant.facing);
  const length =
    participant.action === "ShoveActive"
      ? radius * 2.05
      : participant.action === "ShoveWindup"
        ? radius * 1.18
        : radius * 1.45;
  const endX = x + direction.x * length;
  const endY = y + direction.y * length;
  graphics
    .moveTo(x, y)
    .lineTo(endX, endY)
    .stroke({
      color: getActionColor(participant.action),
      width: participant.action === "ShoveActive" ? Math.max(4, radius * 0.35) : 2,
      cap: "round",
    });

  if (participant.action === "ShoveActive") {
    graphics
      .circle(endX, endY, Math.max(3, radius * 0.2))
      .fill({ color: getActionColor(participant.action) })
      .stroke({ color: 0xf6f5ef, width: 1 });
  }
}

function drawMassMarker(
  graphics: Graphics,
  participant: RenderParticipantV1,
  x: number,
  y: number,
  radius: number,
): void {
  const markerY = y + radius * 1.55;
  const markerSize = Math.max(2.5, radius * 0.28);

  if (participant.massFactor < 0.9) {
    graphics
      .moveTo(x - markerSize, markerY - markerSize)
      .lineTo(x, markerY + markerSize)
      .lineTo(x + markerSize, markerY - markerSize)
      .stroke({ color: ITEM_COLORS.feather, width: 2, cap: "round" });
    return;
  }

  if (participant.massFactor > 1.1) {
    graphics
      .rect(x - markerSize, markerY - markerSize * 0.7, markerSize * 2, markerSize * 1.4)
      .fill({ color: ITEM_COLORS["iron-boots"] })
      .stroke({ color: 0xe2e8ec, width: 1 });
    return;
  }

  graphics.circle(x, markerY, markerSize * 0.55).fill({ color: 0xd5dbd8 });
}

function drawItem(graphics: Graphics, item: RenderItemV1, projection: ArenaProjection): void {
  const { x, y } = projectArenaPoint(item.position, projection);
  const radius = Math.max(5, projection.tileWidth * 0.16);
  const color = ITEM_COLORS[item.definitionId];

  graphics
    .ellipse(x, y + radius * ARENA_SHADOW_OFFSET_SCALE, radius * 1.35, radius * 0.42)
    .fill({ color: 0x070a09, alpha: 0.48 });
  graphics.circle(x, y, radius * 1.36).fill({ color: 0x101514, alpha: 0.72 });

  if (item.definitionId === "iron-boots") {
    graphics
      .roundRect(x - radius * 0.72, y - radius * 0.9, radius * 0.58, radius * 1.5, 2)
      .roundRect(x + radius * 0.14, y - radius * 0.9, radius * 0.58, radius * 1.5, 2)
      .fill({ color })
      .stroke({ color: 0xe2e8ec, width: 1.5 });
  } else if (item.definitionId === "feather") {
    graphics
      .moveTo(x - radius * 0.65, y + radius * 0.72)
      .bezierCurveTo(
        x - radius * 0.15,
        y - radius * 0.95,
        x + radius * 0.9,
        y - radius * 0.72,
        x + radius * 0.48,
        y + radius * 0.3,
      )
      .lineTo(x - radius * 0.65, y + radius * 0.72)
      .fill({ color })
      .stroke({ color: 0x50708a, width: 1.5 });
  } else {
    graphics
      .circle(x, y, radius * 0.78)
      .stroke({ color, width: Math.max(2, radius * 0.3) })
      .circle(x, y, radius * 0.25)
      .fill({ color: 0xffd166 });
  }
}

function drawBrickWall(
  graphics: Graphics,
  wall: BrickWallState,
  projection: ArenaProjection,
): void {
  const tileX = projection.originX + wall.column * projection.pitch;
  const tileY = projection.originY + wall.row * projection.depthPitch;
  const insetX = projection.tileWidth * 0.08;
  const width = projection.tileWidth - insetX * 2;
  const height = Math.max(12, projection.tileWidth * 0.42);
  const capDepth = Math.max(4, projection.tileDepth * 0.28);
  const frontBottom = tileY + projection.tileDepth * 0.78;
  const frontTop = frontBottom - height;
  const x = tileX + insetX;
  const mortar = Math.max(1, projection.tileWidth * 0.025);

  graphics
    .ellipse(
      tileX + projection.tileWidth / 2,
      tileY + projection.tileDepth * 0.82,
      width * 0.54,
      Math.max(2, projection.tileDepth * 0.22),
    )
    .fill({ color: 0x050706, alpha: 0.42 });
  graphics
    .roundRect(x, frontTop, width, height, Math.max(2, projection.tileWidth * 0.05))
    .fill({ color: 0x8f4f32 })
    .stroke({ color: 0x3d2119, width: mortar * 1.4 });
  graphics
    .poly([
      x,
      frontTop,
      x + insetX,
      frontTop - capDepth,
      x + width + insetX,
      frontTop - capDepth,
      x + width,
      frontTop,
    ])
    .fill({ color: 0xc0784d })
    .stroke({ color: 0x4b2a1d, width: mortar });

  for (const ratio of [0.33, 0.66]) {
    const seamY = frontTop + height * ratio;
    graphics
      .moveTo(x, seamY)
      .lineTo(x + width, seamY)
      .stroke({ color: 0x5c3023, width: mortar });
  }

  graphics
    .moveTo(x + width * 0.5, frontTop)
    .lineTo(x + width * 0.5, frontTop + height * 0.33)
    .moveTo(x + width * 0.25, frontTop + height * 0.33)
    .lineTo(x + width * 0.25, frontTop + height * 0.66)
    .moveTo(x + width * 0.72, frontTop + height * 0.66)
    .lineTo(x + width * 0.72, frontBottom)
    .stroke({ color: 0x5c3023, width: mortar });
}

function drawBomb(
  graphics: Graphics,
  bomb: BombState,
  frameTick: number,
  projection: ArenaProjection,
  reducedMotion: boolean,
): void {
  const { x, y } = projectArenaPoint(bomb.position, projection);
  const discRadius = Math.max(6, projection.tileWidth * 0.18);
  const warningRadiusX = projection.pitch * 3;
  const warningRadiusY = projection.depthPitch * 3;
  const remainingSeconds = Math.min(
    5,
    Math.max(0, Math.ceil((bomb.detonateTick - frameTick) / 60)),
  );
  const pulse = reducedMotion ? 1 : 0.72 + ((frameTick % 30) / 30) * 0.28;

  graphics.ellipse(x, y, warningRadiusX, warningRadiusY).stroke({
    color: ITEM_COLORS.bomb,
    width: Math.max(2, projection.tileWidth * 0.055),
    alpha: 0.58 * pulse,
  });
  graphics
    .ellipse(x, y + discRadius * ARENA_SHADOW_OFFSET_SCALE, discRadius * 1.25, discRadius * 0.42)
    .fill({ color: 0x050706, alpha: 0.5 });
  graphics
    .circle(x, y, discRadius)
    .fill({ color: 0x202322 })
    .stroke({ color: ITEM_COLORS.bomb, width: Math.max(2, discRadius * 0.24) });
  graphics
    .moveTo(x + discRadius * 0.38, y - discRadius * 0.72)
    .lineTo(x + discRadius * 0.78, y - discRadius * 1.22)
    .stroke({ color: 0xffc857, width: Math.max(2, discRadius * 0.2), cap: "round" });

  const pipRadius = Math.max(2, discRadius * 0.2);
  const pipSpacing = pipRadius * 2.65;
  const pipStartX = x - (pipSpacing * (remainingSeconds - 1)) / 2;
  const pipY = y - discRadius * 1.75;

  for (let index = 0; index < remainingSeconds; index += 1) {
    graphics
      .circle(pipStartX + pipSpacing * index, pipY, pipRadius)
      .fill({ color: 0xffc857, alpha: reducedMotion ? 0.9 : pulse });
  }
}

function drawSoapPatch(
  graphics: Graphics,
  patch: SoapPatchState,
  projection: ArenaProjection,
): void {
  const { x, y } = projectArenaPoint({ x: patch.column + 0.5, y: patch.row + 0.5 }, projection);
  const width = projection.tileWidth * 0.62;
  const height = Math.max(5, projection.tileDepth * 0.34);
  const radius = Math.max(3, height * 0.45);
  const grooveInset = width * 0.19;

  graphics
    .ellipse(x, y + height * 0.34, width * 0.58, height * 0.58)
    .fill({ color: 0x4b1f57, alpha: 0.5 });
  graphics
    .roundRect(x - width / 2, y - height / 2, width, height, radius)
    .fill({ color: 0xc37adf, alpha: 0.88 })
    .stroke({ color: 0xf2b8ff, width: Math.max(2, projection.tileWidth * 0.035) });
  graphics
    .moveTo(x - grooveInset, y - height * 0.08)
    .lineTo(x + grooveInset, y - height * 0.08)
    .moveTo(x - grooveInset * 0.72, y + height * 0.18)
    .lineTo(x + grooveInset * 0.72, y + height * 0.18)
    .stroke({ color: 0x5e276d, width: Math.max(1, projection.tileWidth * 0.022), cap: "round" });
  graphics
    .circle(x + width * 0.36, y - height * 0.64, Math.max(2, height * 0.2))
    .circle(x + width * 0.48, y - height * 0.88, Math.max(1.5, height * 0.13))
    .stroke({ color: 0xf2b8ff, width: 1.5, alpha: 0.9 });
}

function drawParticipant(
  graphics: Graphics,
  participant: RenderParticipantV1,
  humanActorId: number,
  projection: ArenaProjection,
  interpolationAlpha: number,
  reducedMotion: boolean,
  mayhem: boolean,
): void {
  if (!participant.active && participant.action === "Eliminated") {
    return;
  }

  const worldX =
    participant.previousPosition.x +
    (participant.position.x - participant.previousPosition.x) * interpolationAlpha;
  const worldY =
    participant.previousPosition.y +
    (participant.position.y - participant.previousPosition.y) * interpolationAlpha;
  const { x, y } = projectArenaPoint({ x: worldX, y: worldY }, projection);
  const collisionRadius = participant.radius * projection.pitch;
  const visualScale = 1 + (participant.massFactor - 1) * 0.16;
  const visualRadius = collisionRadius * visualScale;
  const isHuman = participant.actorId === humanActorId;
  const fillColor = isHuman
    ? 0xf6f5ef
    : (BOT_COLORS[(participant.actorId - 2) % BOT_COLORS.length] ?? 0xb8c1bd);
  const actionColor = getActionColor(participant.action);
  const hasBoat = participant.effects.some(({ definitionId }) => definitionId === "boat");

  if (hasBoat) {
    const hullWidth = visualRadius * 2.6;
    const hullHeight = Math.max(4, visualRadius * 0.72);
    const hullY = y + visualRadius * 0.5;
    graphics
      .ellipse(x, hullY + hullHeight * 0.45, hullWidth * 0.58, hullHeight * 0.72)
      .fill({ color: 0x173e59, alpha: participant.action === "Falling" ? 0.28 : 0.78 })
      .stroke({ color: ITEM_COLORS.boat, width: Math.max(2, projection.tileWidth * 0.045) });
    graphics
      .moveTo(x - hullWidth * 0.42, hullY + hullHeight * 0.45)
      .lineTo(x, hullY + hullHeight * 0.82)
      .lineTo(x + hullWidth * 0.42, hullY + hullHeight * 0.45)
      .stroke({ color: 0x9ad8f5, width: Math.max(1, projection.tileWidth * 0.025), alpha: 0.7 });
  }

  if (mayhem && !isHuman) {
    graphics
      .circle(x, y, visualRadius)
      .fill({ color: fillColor, alpha: participant.action === "Falling" ? 0.35 : 1 })
      .stroke({
        color: actionColor,
        width: Math.max(1.5, participant.massFactor * 1.4),
      });
    drawDirection(graphics, participant, x, y, visualRadius);

    if (participant.action === "Stumbling" || participant.action === "Falling") {
      const markerSize = visualRadius * 0.48;
      graphics
        .moveTo(x - markerSize, y - markerSize)
        .lineTo(x + markerSize, y + markerSize)
        .moveTo(x + markerSize, y - markerSize)
        .lineTo(x - markerSize, y + markerSize)
        .stroke({ color: actionColor, width: 2, cap: "round" });
    }

    return;
  }

  const equippedAndActiveEffects = [...participant.inventory, ...participant.effects];
  const hasIronBoots = equippedAndActiveEffects.some(
    ({ definitionId }) => definitionId === "iron-boots",
  );
  const hasFeather = equippedAndActiveEffects.some(
    ({ definitionId }) => definitionId === "feather",
  );
  const hasSpringGlove = equippedAndActiveEffects.some(
    ({ definitionId }) => definitionId === "spring-glove",
  );

  if (participant.action === "DodgeActive" && !reducedMotion && (!mayhem || isHuman)) {
    const { x: previousX, y: previousY } = projectArenaPoint(
      participant.previousPosition,
      projection,
    );
    graphics.circle(previousX, previousY, visualRadius * 0.88).fill({
      color: actionColor,
      alpha: 0.2,
    });
  }

  graphics
    .ellipse(
      x,
      y + visualRadius * ARENA_SHADOW_OFFSET_SCALE,
      visualRadius * 0.9,
      Math.max(2, visualRadius * 0.24),
    )
    .fill({ color: 0x050706, alpha: participant.action === "Falling" ? 0.16 : 0.38 });

  graphics.circle(x, y, collisionRadius).stroke({
    color: 0x0a0d0c,
    width: Math.max(1, projection.tileWidth * 0.035),
    alpha: 0.9,
  });

  if (isHuman) {
    const guardRadius = visualRadius + Math.max(5, projection.tileWidth * 0.14);
    graphics.circle(x, y, guardRadius).stroke({
      color: 0x3b8cff,
      width: Math.max(2, projection.tileWidth * 0.05),
      alpha: reducedMotion ? 0.4 : 0.55,
    });
    graphics
      .poly([x, y - visualRadius, x + visualRadius, y, x, y + visualRadius, x - visualRadius, y])
      .fill({ color: fillColor, alpha: participant.action === "Falling" ? 0.35 : 1 })
      .stroke({ color: 0x3b8cff, width: Math.max(3, projection.tileWidth * 0.07) });
  } else {
    graphics
      .circle(x, y, visualRadius)
      .fill({ color: fillColor, alpha: participant.action === "Falling" ? 0.35 : 1 })
      .stroke({ color: actionColor, width: 2 });
  }

  const massRingRadius = visualRadius + Math.max(3, projection.tileWidth * 0.06);
  graphics.circle(x, y, massRingRadius).stroke({
    color: hasIronBoots
      ? ITEM_COLORS["iron-boots"]
      : hasFeather
        ? ITEM_COLORS.feather
        : actionColor,
    width: Math.max(1, participant.massFactor * 1.6),
    alpha: 0.78,
  });

  drawDirection(graphics, participant, x, y, visualRadius);
  drawMassMarker(graphics, participant, x, y, visualRadius);

  if (hasSpringGlove || participant.springBoosted) {
    const markerY = y - visualRadius - Math.max(6, projection.tileWidth * 0.12);
    graphics.circle(x, markerY, Math.max(3, projection.tileWidth * 0.07)).stroke({
      color: ITEM_COLORS["spring-glove"],
      width: participant.springBoosted ? 4 : 2,
    });
  }

  if (hasIronBoots || hasFeather) {
    const badgeX = x + visualRadius * 0.82;
    const badgeY = y - visualRadius * 0.82;
    const badgeSize = Math.max(2.5, projection.tileWidth * 0.055);

    if (hasIronBoots) {
      graphics
        .rect(badgeX - badgeSize, badgeY - badgeSize, badgeSize * 2, badgeSize * 2)
        .fill({ color: ITEM_COLORS["iron-boots"] })
        .stroke({ color: 0xf3f5f4, width: 1 });
    }

    if (hasFeather) {
      graphics
        .moveTo(badgeX - badgeSize, badgeY + badgeSize)
        .lineTo(badgeX + badgeSize, badgeY - badgeSize)
        .stroke({ color: ITEM_COLORS.feather, width: 2, cap: "round" });
    }
  }

  if (participant.action === "Stumbling" || participant.action === "Falling") {
    const markerSize = visualRadius * 0.55;
    graphics
      .moveTo(x - markerSize, y - markerSize)
      .lineTo(x + markerSize, y + markerSize)
      .moveTo(x + markerSize, y - markerSize)
      .lineTo(x - markerSize, y + markerSize)
      .stroke({ color: actionColor, width: 3, cap: "round" });
  }
}

function getEffectPosition(event: SimulationEventV1, frame: RenderFrameV1): Vector2 | undefined {
  if (event.position !== undefined) {
    return event.position;
  }

  if (
    (event.kind === "soap-placed" || event.kind === "soap-triggered") &&
    event.tileId !== undefined
  ) {
    const tile = frame.tiles.find(({ tileId }) => tileId === event.tileId);

    if (tile !== undefined) {
      return Object.freeze({ x: tile.column + 0.5, y: tile.row + 0.5 });
    }
  }

  const actorId =
    event.kind === "shove-hit" || event.kind === "wind-blast-hit" || event.kind === "soap-triggered"
      ? event.targetActorId
      : event.actorId;
  return frame.participants.find((participant) => participant.actorId === actorId)?.position;
}

function isVisualEffectKind(kind: SimulationEventV1["kind"]): kind is VisualEffectKind {
  return (
    kind === "shove-hit" ||
    kind === "shove-missed" ||
    kind === "dodge-succeeded" ||
    kind === "falling-started" ||
    kind === "item-picked-up" ||
    kind === "item-used" ||
    kind === "wind-blast-hit" ||
    kind === "bomb-detonated" ||
    kind === "soap-placed" ||
    kind === "soap-triggered" ||
    kind === "grappling-hook-hit" ||
    kind === "sudden-death-pulse"
  );
}

function drawWorldEffect(
  graphics: Graphics,
  effect: VisualEffect,
  frameTick: number,
  projection: ArenaProjection,
  reducedMotion: boolean,
): void {
  const duration = Math.max(1, effect.endTick - effect.startTick);
  const progress = clamp((frameTick - effect.startTick) / duration, 0, 1);
  const { x, y } = projectArenaPoint(effect.position, projection);
  const baseRadius = Math.max(5, projection.tileWidth * 0.14);
  const expansion = reducedMotion ? 1 : 1 + progress * 1.8;
  const alpha = Math.max(0, 1 - progress);

  if (effect.kind === "sudden-death-pulse") {
    const waveScale = reducedMotion ? 1.8 : 1.2 + progress * 7.5;
    graphics
      .ellipse(x, y, projection.pitch * waveScale, projection.depthPitch * waveScale)
      .stroke({ color: 0x72d8ff, width: 5, alpha });
    graphics
      .ellipse(x, y, projection.pitch * waveScale * 0.72, projection.depthPitch * waveScale * 0.72)
      .stroke({ color: 0xdaf7ff, width: 2, alpha: alpha * 0.8 });
  } else if (effect.kind === "grappling-hook-hit") {
    const cableAlpha = alpha;
    const anchorVector = effect.vector ?? { x: 0, y: 0 };
    const anchor = projectArenaPoint(
      { x: effect.position.x + anchorVector.x, y: effect.position.y + anchorVector.y },
      projection,
    );
    const hookSize = Math.max(5, projection.tileWidth * 0.13);
    graphics.moveTo(x, y).lineTo(anchor.x, anchor.y).stroke({
      color: ITEM_COLORS["grappling-hook"],
      width: 3,
      alpha: cableAlpha,
      cap: "round",
    });
    graphics
      .circle(anchor.x, anchor.y, hookSize * 0.34)
      .moveTo(anchor.x - hookSize, anchor.y - hookSize * 0.55)
      .lineTo(anchor.x, anchor.y)
      .lineTo(anchor.x + hookSize, anchor.y - hookSize * 0.55)
      .stroke({
        color: ITEM_COLORS["grappling-hook"],
        width: 3,
        alpha: cableAlpha,
        cap: "round",
      });
  } else if (effect.kind === "bomb-detonated") {
    const explosionScale = reducedMotion ? 1 : 0.72 + progress * 0.28;
    const radiusX = projection.pitch * 3 * explosionScale;
    const radiusY = projection.depthPitch * 3 * explosionScale;
    graphics.ellipse(x, y, radiusX, radiusY).stroke({ color: ITEM_COLORS.bomb, width: 5, alpha });
  } else if (effect.kind === "soap-triggered") {
    const slipWidth = baseRadius * (reducedMotion ? 2.4 : 2.4 + progress * 1.8);
    const slipHeight = baseRadius * 0.48;
    graphics.ellipse(x, y, slipWidth, slipHeight).stroke({ color: 0xf2b8ff, width: 4, alpha });
    graphics
      .moveTo(x - slipWidth * 0.38, y - slipHeight * 0.7)
      .lineTo(x - slipWidth * 0.06, y + slipHeight * 0.7)
      .moveTo(x + slipWidth * 0.06, y - slipHeight * 0.7)
      .lineTo(x + slipWidth * 0.38, y + slipHeight * 0.7)
      .stroke({ color: 0xc37adf, width: 3, alpha, cap: "round" });
  } else if (effect.kind === "soap-placed") {
    const placementRadius = baseRadius * (reducedMotion ? 1 : 0.75 + progress * 0.5);
    graphics.circle(x, y, placementRadius).stroke({ color: 0xc37adf, width: 3, alpha });
  } else if (effect.kind === "wind-blast-hit") {
    graphics
      .circle(x, y, baseRadius * expansion * 1.35)
      .stroke({ color: ITEM_COLORS["wind-blast"], width: 4, alpha });
  } else if (effect.kind === "item-used" && effect.itemDefinitionId === "brick-bag") {
    const size = baseRadius * (reducedMotion ? 1 : 1 + progress * 0.6);
    graphics
      .roundRect(x - size, y - size, size * 2, size * 2, 2)
      .stroke({ color: ITEM_COLORS["brick-bag"], width: 3, alpha });
  } else if (effect.kind === "item-used" && effect.itemDefinitionId === "bomb") {
    graphics
      .circle(x, y, baseRadius * (reducedMotion ? 1 : 0.8 + progress * 0.2))
      .stroke({ color: ITEM_COLORS.bomb, width: 3, alpha });
  } else if (effect.kind === "item-used") {
    const direction = projectArenaVector(effect.vector ?? { x: 1, y: 0 });
    const length = baseRadius * (reducedMotion ? 2.2 : 2.2 + progress * 3.2);
    const spread = baseRadius * 0.8;
    graphics
      .moveTo(x, y)
      .lineTo(
        x + direction.x * length - direction.y * spread,
        y + direction.y * length + direction.x * spread,
      )
      .moveTo(x, y)
      .lineTo(
        x + direction.x * length + direction.y * spread,
        y + direction.y * length - direction.x * spread,
      )
      .stroke({ color: ITEM_COLORS["wind-blast"], width: 3, alpha, cap: "round" });
  } else if (effect.kind === "shove-hit") {
    graphics.circle(x, y, baseRadius * expansion).stroke({ color: 0xff695c, width: 3, alpha });
  } else if (effect.kind === "dodge-succeeded") {
    graphics
      .circle(x, y, baseRadius * (reducedMotion ? 1.2 : 1.3 + progress))
      .stroke({ color: 0x68d8d6, width: 2, alpha });
  } else if (effect.kind === "item-picked-up") {
    const size = baseRadius * (reducedMotion ? 0.8 : 0.8 + progress * 0.7);
    graphics
      .moveTo(x - size, y)
      .lineTo(x + size, y)
      .moveTo(x, y - size)
      .lineTo(x, y + size)
      .stroke({ color: 0xffd166, width: 2, alpha, cap: "round" });
  } else {
    const direction = projectArenaVector(effect.vector ?? { x: 1, y: 0 });
    const length = baseRadius * (reducedMotion ? 1.4 : 1.4 + progress * 1.6);
    graphics
      .moveTo(x, y)
      .lineTo(x + direction.x * length, y + direction.y * length)
      .stroke({
        color: effect.kind === "falling-started" ? 0x727b78 : 0xd58bea,
        width: 3,
        alpha,
        cap: "round",
      });
  }
}

export async function createArenaRenderer(
  host: HTMLElement,
  options: ArenaRendererOptions = {},
): Promise<ArenaRenderer> {
  const application = new Application();

  await application.init({
    antialias: true,
    autoDensity: true,
    autoStart: false,
    background: "#141816",
    preference: "webgl",
    resolution: Math.min(window.devicePixelRatio, DEFAULT_RESOLUTION_CAP),
    resizeTo: host,
  });
  application.ticker.stop();
  application.canvas.className = "arena-canvas";
  application.canvas.setAttribute("aria-hidden", "true");
  application.canvas.tabIndex = -1;
  host.replaceChildren(application.canvas);
  host.dataset.renderer = "ready";

  const tiles = new Graphics();
  const items = new Graphics();
  const participants = new Graphics();
  const effectLayer = new Graphics();
  application.stage.addChild(tiles, items, participants, effectLayer);
  const eventLedger = new SimulationEventLedger();
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionPreference.matches;
  let visualEffects: readonly VisualEffect[] = Object.freeze([]);
  let latestFrame: RenderFrameV1 | undefined;
  let latestInterpolationAlpha = 0;
  let latestHumanActorId = 1;
  let tileLayerDirty = true;

  const draw = (): void => {
    if (latestFrame === undefined) {
      return;
    }

    const projection = createArenaProjection(application.screen.width, application.screen.height);
    const camera = createCameraOffset(
      latestFrame,
      application.screen.width,
      application.screen.height,
      projection,
      latestHumanActorId,
      latestInterpolationAlpha,
    );
    tiles.x = camera.x;
    tiles.y = camera.y;
    items.x = camera.x;
    items.y = camera.y;
    participants.x = camera.x;
    participants.y = camera.y;
    effectLayer.x = camera.x;
    effectLayer.y = camera.y;
    host.dataset.cameraX = camera.x.toFixed(2);
    host.dataset.cameraY = camera.y.toFixed(2);
    host.dataset.projectionAngle = ARENA_CAMERA_ELEVATION_DEGREES.toString();
    host.dataset.projectionScaleY = ARENA_DEPTH_SCALE.toFixed(4);
    host.dataset.cliffDepth = projection.cliffDepth.toFixed(2);
    items.clear();
    participants.clear();
    effectLayer.clear();
    const mayhem = latestFrame.participants.length >= 25;

    if (tileLayerDirty) {
      tiles.clear();
      const supportedTileIds = new Set<string>(
        latestFrame.tiles.filter(({ state }) => state !== "Void").map(({ tileId }) => tileId),
      );

      for (const tile of latestFrame.tiles) {
        drawTileCliff(
          tiles,
          tile,
          projection,
          supportedTileIds.has(`${tile.column}:${tile.row + 1}`),
        );
      }

      for (const tile of latestFrame.tiles) {
        drawTile(tiles, tile, projection);
      }

      tileLayerDirty = false;
    }

    for (const item of latestFrame.items) {
      drawItem(items, item, projection);
    }

    for (const bomb of latestFrame.bombs) {
      drawBomb(items, bomb, latestFrame.tick, projection, reducedMotion);
    }

    for (const patch of latestFrame.soapPatches) {
      drawSoapPatch(items, patch, projection);
    }

    const depthEntries = [
      ...latestFrame.participants.map((participant) => ({
        kind: "participant" as const,
        depth:
          participant.previousPosition.y +
          (participant.position.y - participant.previousPosition.y) * latestInterpolationAlpha,
        sortKey: `participant:${participant.actorId.toString().padStart(4, "0")}`,
        participant,
      })),
      ...latestFrame.brickWalls.map((wall) => ({
        kind: "brick-wall" as const,
        depth: wall.row + 0.72,
        sortKey: `wall:${wall.tileId}`,
        wall,
      })),
    ].toSorted(
      (left, right) => left.depth - right.depth || left.sortKey.localeCompare(right.sortKey),
    );

    for (const entry of depthEntries) {
      if (entry.kind === "brick-wall") {
        drawBrickWall(participants, entry.wall, projection);
      } else {
        drawParticipant(
          participants,
          entry.participant,
          latestHumanActorId,
          projection,
          latestInterpolationAlpha,
          reducedMotion,
          mayhem,
        );
      }
    }

    visualEffects = Object.freeze(
      visualEffects.filter(
        (effect) => effect.roundId === latestFrame?.roundId && effect.endTick >= latestFrame.tick,
      ),
    );

    for (const effect of visualEffects) {
      drawWorldEffect(effectLayer, effect, latestFrame.tick, projection, reducedMotion);
    }
  };

  const present = (): void => {
    draw();
    application.render();
  };

  const handleMotionPreference = (event: MediaQueryListEvent): void => {
    reducedMotion = event.matches;
    host.dataset.motion = reducedMotion ? "reduced" : "full";
    present();
  };
  const handleResize = (): void => {
    tileLayerDirty = true;
    draw();
  };
  const handleContextLost = (event: Event): void => {
    event.preventDefault();
    host.dataset.renderer = "lost";
    options.onContextLost?.();
  };
  const handleContextRestored = (): void => {
    host.dataset.renderer = "ready";
    present();
    options.onContextRestored?.();
  };

  application.renderer.on("resize", handleResize);
  motionPreference.addEventListener("change", handleMotionPreference);
  application.canvas.addEventListener("webglcontextlost", handleContextLost);
  application.canvas.addEventListener("webglcontextrestored", handleContextRestored);
  host.dataset.motion = reducedMotion ? "reduced" : "full";

  return Object.freeze({
    consumeEvents(events: readonly SimulationEventV1[], frame: RenderFrameV1): void {
      const accepted = eventLedger.consume(events);
      tileLayerDirty ||= accepted.some(
        ({ kind }) => kind === "tile-warning" || kind === "tile-collapsing" || kind === "tile-void",
      );
      const durationTicks = reducedMotion ? 3 : frame.participants.length >= 25 ? 7 : 12;
      const cap = frame.participants.length >= 25 ? MAYHEM_EFFECT_CAP : NORMAL_EFFECT_CAP;
      const appended = accepted.flatMap((event): readonly VisualEffect[] => {
        if (
          !isVisualEffectKind(event.kind) ||
          (event.kind === "item-used" &&
            (event.itemDefinitionId === "soap" || event.itemDefinitionId === "grappling-hook"))
        ) {
          return [];
        }

        const position = getEffectPosition(event, frame);

        if (position === undefined) {
          return [];
        }

        return [
          Object.freeze({
            key: `${event.roundId}:${event.tick}:${event.sequence}`,
            kind: event.kind,
            roundId: event.roundId,
            startTick: event.tick,
            endTick:
              event.tick +
              (event.kind === "sudden-death-pulse"
                ? reducedMotion
                  ? 5
                  : 24
                : event.kind === "grappling-hook-hit"
                  ? 10
                  : durationTicks),
            position,
            vector: event.vector,
            itemDefinitionId: event.itemDefinitionId,
          }),
        ];
      });
      visualEffects = Object.freeze([...visualEffects, ...appended].slice(-cap));
    },
    destroy(): void {
      application.renderer.off("resize", handleResize);
      motionPreference.removeEventListener("change", handleMotionPreference);
      application.canvas.removeEventListener("webglcontextlost", handleContextLost);
      application.canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      application.destroy(true, { children: true });
    },
    render(frame: RenderFrameV1, interpolationAlpha: number, humanActorId: number): void {
      const resolutionCap =
        frame.participants.length >= 25 ? MAYHEM_RESOLUTION_CAP : DEFAULT_RESOLUTION_CAP;
      const desiredResolution = Math.min(window.devicePixelRatio, resolutionCap);

      const hostWidth = Math.max(1, host.clientWidth);
      const hostHeight = Math.max(1, host.clientHeight);
      const sizeChanged =
        application.screen.width !== hostWidth || application.screen.height !== hostHeight;
      const resolutionChanged = application.renderer.resolution !== desiredResolution;

      if (resolutionChanged) {
        application.renderer.resolution = desiredResolution;
      }

      if (sizeChanged || resolutionChanged) {
        application.renderer.resize(hostWidth, hostHeight);
        tileLayerDirty = true;
      }

      tileLayerDirty ||= latestFrame?.roundId !== frame.roundId;
      latestFrame = frame;
      visualEffects = Object.freeze(
        visualEffects.filter((effect) => effect.roundId === frame.roundId),
      );
      latestInterpolationAlpha = clamp(interpolationAlpha, 0, 1);
      latestHumanActorId = humanActorId;
      present();
    },
  });
}
