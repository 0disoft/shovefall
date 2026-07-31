import { Application, Container, Graphics, Sprite, Text } from "pixi.js";
import { SKILL_DEFINITION_IDS } from "../content/skills";
import type {
  BombState,
  BrickWallState,
  CannonShotState,
  GiftDeliveryState,
  ItemDefinitionId,
  ParticipantActionKind,
  RenderFrameV1,
  RenderItemV1,
  RenderParticipantV1,
  RockShotState,
  SimulationEventV1,
  SkillDefinitionId,
  SoapPatchState,
  TileState,
  TreeObstacleState,
  TreasureShipState,
  PirateShipState,
} from "../simulation/contracts";
import { clamp, subtractVectors, vectorLength, type Vector2 } from "../simulation/math";
import { FIXED_TICKS_PER_SECOND } from "../simulation/versions";
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
import {
  loadArenaVisualAssets,
  TERRAIN_INTERIOR_VARIANT_START,
  TERRAIN_DIAGONAL_VARIANT_COUNT,
  TERRAIN_DIAGONAL_VARIANT_START,
  TERRAIN_WATER_EAST,
  TERRAIN_WATER_NORTH,
  TERRAIN_WATER_SOUTH,
  TERRAIN_WATER_WEST,
  TERRAIN_WATER_NORTH_EAST,
  TERRAIN_WATER_SOUTH_EAST,
  TERRAIN_WATER_SOUTH_WEST,
  TERRAIN_WATER_NORTH_WEST,
  type ArenaVisualAssets,
} from "./arena-assets";
import { createActionFeedbackGeometry } from "./action-feedback";
import {
  createCharacterMotionPose,
  createCharacterSpriteMotionTransform,
  selectCharacterAnimationState,
} from "./character-motion";

const CAMERA_OCEAN_MARGIN_TILES = 7.25;

export interface ArenaRenderer {
  consumeEvents(events: readonly SimulationEventV1[], frame: RenderFrameV1): void;
  destroy(): void;
  panSpectatorByScreen(deltaX: number, deltaY: number): boolean;
  render(frame: RenderFrameV1, interpolationAlpha: number, humanActorId: number): void;
  resetSpectatorCamera(): void;
  screenToWorld(clientX: number, clientY: number): Vector2 | undefined;
  setAimPreview(preview: ArenaAimPreview | null): void;
}

export interface ArenaAimPreview {
  readonly targetMode: "self" | "direction" | "ground";
  readonly source: Vector2;
  readonly target: Vector2;
  readonly castRange: number;
  readonly effectRadius: number;
  readonly valid: boolean;
  readonly approaching: boolean;
  readonly visualKind: string;
}

export interface ArenaRendererOptions {
  readonly onContextLost?: () => void;
  readonly onContextRestored?: () => void;
}

export type VisualEffectKind =
  | "skill-used"
  | "skill-hit"
  | "shield-applied"
  | "status-applied"
  | "shove-hit"
  | "shove-missed"
  | "dodge-succeeded"
  | "falling-started"
  | "item-picked-up"
  | "item-used"
  | "soap-placed"
  | "soap-triggered"
  | "bomb-detonated"
  | "grappling-hook-hit"
  | "rock-impact"
  | "tile-void";

interface VisualEffect {
  readonly key: string;
  readonly kind: VisualEffectKind;
  readonly roundId: number;
  readonly startTick: number;
  readonly endTick: number;
  readonly position: Vector2;
  readonly originPosition: Vector2 | undefined;
  readonly travelEndTick: number | undefined;
  readonly vector: Vector2 | undefined;
  readonly itemDefinitionId: ItemDefinitionId | undefined;
  readonly skillDefinitionId: SimulationEventV1["skillDefinitionId"];
}

interface CharacterCastAnimation {
  readonly endTick: number;
  readonly roundId: number;
  readonly startTick: number;
}

interface CharacterHitAnimation {
  readonly endTick: number;
  readonly roundId: number;
}

const DEFAULT_RESOLUTION_CAP = 1.5;
const MAYHEM_RESOLUTION_CAP = 1;
const NORMAL_EFFECT_CAP = 36;
const MAYHEM_EFFECT_CAP = 14;
const SKILL_PROJECTILE_SPEED_TILES_PER_SECOND = 3;
const PROJECTILE_SKILL_EFFECTS: ReadonlySet<SkillDefinitionId> = new Set([
  "arc-bolt",
  "chain-bind",
]);
const GENERATED_SKILL_EFFECT_KINDS: ReadonlySet<VisualEffectKind> = new Set([
  "skill-used",
  "skill-hit",
  "status-applied",
  "shield-applied",
]);
const DIRECTIONAL_SKILL_EFFECTS: ReadonlySet<SkillDefinitionId> = new Set([
  "blink-step",
  "arc-bolt",
  "chain-bind",
]);
const SKILL_EFFECT_SIZE: Readonly<Record<SkillDefinitionId, number>> = Object.freeze({
  "blink-step": 2,
  "arc-bolt": 1.8,
  "chain-bind": 2.4,
  "meteor-mark": 3.6,
  "frost-field": 3.6,
  aegis: 2.6,
});
const BOT_COLORS = [0xb8c1bd, 0xd5aaa7, 0xc9bd91, 0xaab8d5, 0xc0a8cf];
const ACTION_COLORS: Readonly<Record<ParticipantActionKind, number>> = Object.freeze({
  Ready: 0xe8ecea,
  ShoveWindup: 0xffc857,
  ShoveActive: 0xff695c,
  ShoveRecovery: 0xc89f77,
  DodgeActive: 0x68d8d6,
  GrapplePull: 0xffc857,
  Stumbling: 0xd58bea,
  Slipping: 0x8be4ea,
  Anchored: 0x9ca5a1,
  Falling: 0x727b78,
  Eliminated: 0x727b78,
});
const ITEM_COLORS = Object.freeze({
  "iron-boots": 0x56626f,
  feather: 0xe9f5ff,
  "spring-glove": 0xff8f5c,
  soap: 0xd58bea,
  "brick-bag": 0xb56f3f,
  boat: 0x4c9bd4,
  bomb: 0xff5c4d,
} as const satisfies Readonly<Partial<Record<ItemDefinitionId, number>>>);
const GRAPPLING_HOOK_COLOR = 0xffc857;
const HUMAN_MARKER_COLOR = 0x3b8cff;
const PICKUP_MARKER_COLOR = 0xffd166;

export function shouldDrawProceduralWorldEffect(
  kind: VisualEffectKind,
  skillDefinitionId: SkillDefinitionId | undefined,
  hasGeneratedSkillTexture: boolean,
): boolean {
  return !(
    hasGeneratedSkillTexture &&
    skillDefinitionId !== undefined &&
    GENERATED_SKILL_EFFECT_KINDS.has(kind)
  );
}

export function getSkillProjectileTravelTicks(distanceTiles: number): number {
  if (!Number.isFinite(distanceTiles) || distanceTiles <= 0) {
    return 0;
  }

  return Math.max(
    1,
    Math.round((distanceTiles / SKILL_PROJECTILE_SPEED_TILES_PER_SECOND) * FIXED_TICKS_PER_SECOND),
  );
}

export function getSkillProjectilePosition(
  origin: Vector2,
  target: Vector2,
  startTick: number,
  travelEndTick: number,
  frameTick: number,
): Vector2 {
  const duration = Math.max(1, travelEndTick - startTick);
  const progress = clamp((frameTick - startTick) / duration, 0, 1);
  return Object.freeze({
    x: origin.x + (target.x - origin.x) * progress,
    y: origin.y + (target.y - origin.y) * progress,
  });
}

function getVisualEffectState(
  effect: VisualEffect,
  frameTick: number,
): { position: Vector2; progress: number } {
  if (effect.originPosition === undefined || effect.travelEndTick === undefined) {
    const duration = Math.max(1, effect.endTick - effect.startTick);
    return {
      position: effect.position,
      progress: clamp((frameTick - effect.startTick) / duration, 0, 1),
    };
  }

  if (frameTick < effect.travelEndTick) {
    return {
      position: getSkillProjectilePosition(
        effect.originPosition,
        effect.position,
        effect.startTick,
        effect.travelEndTick,
        frameTick,
      ),
      progress: 0,
    };
  }

  const impactDuration = Math.max(1, effect.endTick - effect.travelEndTick);
  return {
    position: effect.position,
    progress: clamp((frameTick - effect.travelEndTick) / impactDuration, 0, 1),
  };
}

function getItemColor(definitionId: ItemDefinitionId): number | undefined {
  const colors: Readonly<Partial<Record<ItemDefinitionId, number>>> = ITEM_COLORS;
  return colors[definitionId];
}

function getActorIdentityColor(actorId: number, humanActorId: number): number {
  if (actorId === humanActorId) {
    return HUMAN_MARKER_COLOR;
  }

  return BOT_COLORS[(actorId - 2) % BOT_COLORS.length] ?? 0xb8c1bd;
}

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
  const oceanMargin = projection.tileWidth * CAMERA_OCEAN_MARGIN_TILES;
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

function isSpectatorFrame(frame: RenderFrameV1, humanActorId: number): boolean {
  if (frame.round.status === "Completed") {
    return true;
  }

  const human = frame.participants.find(({ actorId }) => actorId === humanActorId);
  return (
    human === undefined ||
    !human.active ||
    human.action === "Falling" ||
    human.action === "Eliminated"
  );
}

function clampCameraOffset(
  frame: RenderFrameV1,
  width: number,
  height: number,
  projection: ArenaProjection,
  camera: Vector2,
): Vector2 {
  const { columns, rows } = getArenaDimensions(frame);
  const worldSize = getProjectedArenaSize(columns, rows, projection);
  const oceanMargin = projection.tileWidth * CAMERA_OCEAN_MARGIN_TILES;
  const minimumX = width - worldSize.width - oceanMargin;
  const maximumX = oceanMargin;
  const minimumY = height - worldSize.height - oceanMargin;
  const maximumY = oceanMargin;

  return Object.freeze({
    x: minimumX > maximumX ? (width - worldSize.width) / 2 : clamp(camera.x, minimumX, maximumX),
    y: minimumY > maximumY ? (height - worldSize.height) / 2 : clamp(camera.y, minimumY, maximumY),
  });
}

function getActionColor(action: ParticipantActionKind): number {
  return ACTION_COLORS[action];
}

function getTileTerrainVariant(tile: TileState): number {
  return Math.abs((tile.column * 73_856_093) ^ (tile.row * 19_349_663)) % 3;
}

function getTileFillColor(tile: TileState, isShore: boolean): number {
  const variant = getTileTerrainVariant(tile);
  const interiorColors = [0x2c3a31, 0x304036, 0x29372f] as const;
  const shoreColors = [0x514a35, 0x574d37, 0x49452f] as const;
  return (isShore ? shoreColors : interiorColors)[variant] ?? 0x2c3a31;
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
  const color = 0x202724;

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
    .fill({ color })
    .stroke({ color: 0x0d1210, width: 1 });
}

function drawTile(
  graphics: Graphics,
  tile: TileState,
  projection: ArenaProjection,
  isShore: boolean,
): void {
  if (tile.state === "Void") {
    return;
  }

  const x = projection.originX + tile.column * projection.pitch;
  const y = projection.originY + tile.row * projection.depthPitch;
  const radius = Math.max(2, projection.tileDepth * 0.08);
  const fillColor = getTileFillColor(tile, isShore);
  const strokeColor = isShore ? 0x8b7950 : 0x435249;

  graphics
    .roundRect(x, y, projection.tileWidth, projection.tileDepth, radius)
    .fill({ color: fillColor })
    .stroke({ color: strokeColor, width: 1 });

  graphics
    .moveTo(x + radius, y + 1)
    .lineTo(x + projection.tileWidth - radius, y + 1)
    .stroke({
      color: 0x59645f,
      width: 1,
      alpha: 0.42,
    });

  const variant = getTileTerrainVariant(tile);
  const markColor = isShore ? 0xb29a62 : 0x637b68;
  const markX = x + projection.tileWidth * (0.28 + variant * 0.18);
  const markY = y + projection.tileDepth * (0.38 + (variant % 2) * 0.2);
  const markSize = Math.max(1.5, projection.tileWidth * 0.035);

  if (isShore) {
    const inset = Math.max(2, projection.tileWidth * 0.075);
    graphics
      .roundRect(
        x + inset,
        y + inset * ARENA_DEPTH_SCALE,
        projection.tileWidth - inset * 2,
        projection.tileDepth - inset * ARENA_DEPTH_SCALE * 2,
        radius,
      )
      .fill({ color: 0x344238, alpha: 0.74 });
  }

  graphics
    .circle(markX, markY, markSize)
    .circle(markX + markSize * 2.4, markY - markSize * 0.8, markSize * 0.65)
    .fill({ color: markColor, alpha: isShore ? 0.42 : 0.28 });
}

function drawTileHazardMarker(
  graphics: Graphics,
  tile: TileState,
  critical: boolean,
  projection: ArenaProjection,
): void {
  const center = projectArenaPoint({ x: tile.column + 0.5, y: tile.row + 0.5 }, projection);
  const radius = Math.max(8, projection.tileWidth * 0.19);
  const color = critical ? 0xff5c4d : 0xffc857;

  graphics
    .circle(center.x, center.y, radius)
    .fill({ color: 0x101412, alpha: 0.7 })
    .stroke({ color, width: 2.5, alpha: 0.96 });

  if (!critical) {
    graphics
      .moveTo(center.x, center.y - radius * 0.52)
      .lineTo(center.x, center.y + radius * 0.12)
      .circle(center.x, center.y + radius * 0.48, Math.max(1.8, radius * 0.11))
      .stroke({ color, width: 3, alpha: 1, cap: "round" });
    return;
  }

  const skullY = center.y - radius * 0.1;
  graphics
    .circle(center.x, skullY, radius * 0.46)
    .roundRect(
      center.x - radius * 0.3,
      skullY + radius * 0.25,
      radius * 0.6,
      radius * 0.38,
      radius * 0.08,
    )
    .fill({ color, alpha: 0.98 })
    .circle(center.x - radius * 0.18, skullY - radius * 0.05, radius * 0.1)
    .circle(center.x + radius * 0.18, skullY - radius * 0.05, radius * 0.1)
    .fill({ color: 0x101412, alpha: 1 })
    .moveTo(center.x, skullY + radius * 0.08)
    .lineTo(center.x - radius * 0.08, skullY + radius * 0.2)
    .lineTo(center.x + radius * 0.08, skullY + radius * 0.2)
    .closePath()
    .fill({ color: 0x101412, alpha: 1 });
}

function getShotProgress(tick: number, launchTick: number, impactTick: number): number {
  return clamp((tick - launchTick) / Math.max(1, impactTick - launchTick), 0, 1);
}

function drawTargetWarning(
  graphics: Graphics,
  target: Vector2,
  critical: boolean,
  projection: ArenaProjection,
): void {
  const { x, y } = projectArenaPoint(target, projection);
  const radius = Math.max(8, projection.tileWidth * 0.2);
  const color = critical ? 0xff5c4d : 0xffc857;
  graphics.circle(x, y, radius).stroke({ color, width: 3, alpha: 0.94 });

  if (critical) {
    graphics
      .circle(x, y - radius * 0.12, radius * 0.42)
      .moveTo(x - radius * 0.2, y - radius * 0.15)
      .lineTo(x + radius * 0.2, y + radius * 0.18)
      .moveTo(x + radius * 0.2, y - radius * 0.15)
      .lineTo(x - radius * 0.2, y + radius * 0.18)
      .stroke({ color, width: 2.5, alpha: 0.96 });
  } else {
    graphics
      .moveTo(x, y - radius * 0.55)
      .lineTo(x, y + radius * 0.14)
      .circle(x, y + radius * 0.48, Math.max(1.8, radius * 0.1))
      .stroke({ color, width: 3, alpha: 0.96, cap: "round" });
  }
}

function drawCannonShot(
  graphics: Graphics,
  shot: CannonShotState,
  tick: number,
  projection: ArenaProjection,
  reducedMotion: boolean,
): void {
  const progress = getShotProgress(tick, shot.launchTick, shot.impactTick);
  const worldPosition = Object.freeze({
    x: shot.origin.x + (shot.target.x - shot.origin.x) * progress,
    y: shot.origin.y + (shot.target.y - shot.origin.y) * progress,
  });
  const projected = projectArenaPoint(worldPosition, projection);
  const arc = reducedMotion ? 0 : Math.sin(Math.PI * progress) * projection.tileWidth * 1.35;
  const radius = Math.max(3, projection.tileWidth * (0.07 + progress * 0.04));
  graphics
    .circle(projected.x, projected.y - arc, radius)
    .fill({ color: 0x252b29 })
    .stroke({ color: 0xff8f5c, width: 2 });
}

function drawRockShot(
  graphics: Graphics,
  shot: RockShotState,
  tick: number,
  projection: ArenaProjection,
  reducedMotion: boolean,
): void {
  const progress = getShotProgress(tick, shot.launchTick, shot.impactTick);
  const worldPosition = Object.freeze({
    x: shot.origin.x + (shot.target.x - shot.origin.x) * progress,
    y: shot.origin.y + (shot.target.y - shot.origin.y) * progress,
  });
  const projected = projectArenaPoint(worldPosition, projection);
  const target = projectArenaPoint(shot.target, projection);
  const arc = reducedMotion ? 0 : Math.sin(Math.PI * progress) * projection.tileWidth * 1.8;
  const radius = Math.max(5, projection.tileWidth * (0.12 + progress * 0.08));
  graphics
    .ellipse(
      target.x,
      target.y,
      projection.pitch * shot.blastRadius,
      projection.depthPitch * shot.blastRadius,
    )
    .fill({ color: 0x160f0e, alpha: 0.28 + progress * 0.3 })
    .stroke({ color: 0xff5c4d, width: 3, alpha: 0.72 + progress * 0.28 })
    .circle(projected.x, projected.y - arc, radius)
    .fill({ color: 0x3b3733 })
    .stroke({ color: 0xb56f3f, width: 2 });
  drawTargetWarning(graphics, shot.target, true, projection);
}

function drawPirateShip(
  graphics: Graphics,
  ship: PirateShipState,
  projection: ArenaProjection,
): void {
  const { x, y } = projectArenaPoint(ship.position, projection);
  const width = projection.tileWidth * 1.05;
  const height = projection.tileDepth * 1.7;
  graphics
    .poly([
      x,
      y - height * 0.68,
      x + width * 0.5,
      y + height * 0.22,
      x,
      y + height * 0.58,
      x - width * 0.5,
      y + height * 0.22,
    ])
    .fill({ color: 0x51362c })
    .stroke({ color: 0xb56f3f, width: 2 })
    .moveTo(x, y - height * 0.5)
    .lineTo(x, y + height * 0.1)
    .moveTo(x, y - height * 0.42)
    .lineTo(x + width * 0.38, y - height * 0.18)
    .lineTo(x, y + height * 0.02)
    .closePath()
    .fill({ color: 0x242a28, alpha: 0.94 });
}

function drawTreasureShip(
  graphics: Graphics,
  ship: TreasureShipState,
  projection: ArenaProjection,
): void {
  const { x, y } = projectArenaPoint(ship.position, projection);
  const width = projection.tileWidth * 1.14;
  const height = projection.tileDepth * 1.82;
  graphics
    .ellipse(x, y + height * 0.34, width * 0.62, height * 0.28)
    .fill({ color: 0x07100f, alpha: 0.42 })
    .poly([
      x,
      y - height * 0.68,
      x + width * 0.5,
      y + height * 0.2,
      x,
      y + height * 0.58,
      x - width * 0.5,
      y + height * 0.2,
    ])
    .fill({ color: 0x2f7f78 })
    .stroke({ color: 0xffd166, width: 3 })
    .moveTo(x, y - height * 0.52)
    .lineTo(x, y + height * 0.12)
    .moveTo(x, y - height * 0.44)
    .lineTo(x + width * 0.42, y - height * 0.18)
    .lineTo(x, y + height * 0.04)
    .closePath()
    .fill({ color: 0xffd166, alpha: 0.96 })
    .stroke({ color: 0x8a5a1e, width: 2 });

  const chestWidth = width * 0.26;
  const chestHeight = height * 0.16;
  graphics
    .roundRect(x - chestWidth / 2, y - height * 0.22, chestWidth, chestHeight, 3)
    .fill({ color: 0xb56f3f })
    .stroke({ color: 0xfff0a8, width: 1.5 });
}

function drawGiftDelivery(
  graphics: Graphics,
  delivery: GiftDeliveryState,
  tick: number,
  projection: ArenaProjection,
  reducedMotion: boolean,
): void {
  const progress = getShotProgress(tick, delivery.launchTick, delivery.impactTick);
  const worldPosition = Object.freeze({
    x: delivery.origin.x + (delivery.target.x - delivery.origin.x) * progress,
    y: delivery.origin.y + (delivery.target.y - delivery.origin.y) * progress,
  });
  const projected = projectArenaPoint(worldPosition, projection);
  const target = projectArenaPoint(delivery.target, projection);
  const arc = reducedMotion ? 0 : Math.sin(Math.PI * progress) * projection.tileWidth * 1.15;
  const size = clamp(projection.tileWidth * (0.28 + progress * 0.1), 14, 32);
  const boxX = projected.x;
  const boxY = projected.y - arc;

  graphics
    .ellipse(target.x, target.y, projection.pitch * 0.34, projection.depthPitch * 0.34)
    .fill({ color: 0xffd166, alpha: 0.1 + progress * 0.18 })
    .stroke({ color: 0xffd166, width: 2.5, alpha: 0.62 + progress * 0.28 })
    .roundRect(boxX - size / 2, boxY - size / 2, size, size, Math.max(2, size * 0.12))
    .fill({ color: 0xffd166 })
    .stroke({ color: 0x7b3f35, width: 2 })
    .rect(boxX - size * 0.09, boxY - size / 2, size * 0.18, size)
    .rect(boxX - size / 2, boxY - size * 0.09, size, size * 0.18)
    .fill({ color: 0xff5c4d });
}

function drawActionFeedback(
  graphics: Graphics,
  participant: RenderParticipantV1,
  x: number,
  y: number,
  radius: number,
  projection: ArenaProjection,
  reducedMotion: boolean,
  detailed: boolean,
  frameTick: number,
): void {
  const previousCenter = projectArenaPoint(participant.previousPosition, projection);
  const geometry = createActionFeedbackGeometry({
    action: participant.action,
    actorId: participant.actorId,
    center: Object.freeze({ x, y }),
    previousCenter,
    direction: projectArenaVector(participant.facing),
    velocity: projectArenaVector(participant.velocity),
    radius,
    frameTick,
    reducedMotion,
    detailed,
  });

  for (const feedbackCircle of geometry.circles) {
    graphics.circle(feedbackCircle.center.x, feedbackCircle.center.y, feedbackCircle.radius);
    graphics.fill({ color: feedbackCircle.color, alpha: feedbackCircle.alpha });

    if (feedbackCircle.outlineColor !== undefined && feedbackCircle.outlineWidth !== undefined) {
      graphics.stroke({
        color: feedbackCircle.outlineColor,
        width: feedbackCircle.outlineWidth,
      });
    }
  }

  for (const feedbackStroke of geometry.strokes) {
    const firstPoint = feedbackStroke.points[0];

    if (firstPoint === undefined) {
      continue;
    }

    graphics.moveTo(firstPoint.x, firstPoint.y);

    for (const point of feedbackStroke.points.slice(1)) {
      graphics.lineTo(point.x, point.y);
    }

    graphics.stroke({
      color: feedbackStroke.color,
      width: feedbackStroke.width,
      alpha: feedbackStroke.alpha,
      cap: "round",
      join: "round",
    });
  }
}

function drawFacingFeatures(
  graphics: Graphics,
  participant: RenderParticipantV1,
  x: number,
  y: number,
  radius: number,
  detailed: boolean,
): void {
  if (!detailed || participant.action === "Falling" || participant.action === "Eliminated") {
    return;
  }

  const direction = projectArenaVector(participant.facing);
  const length = Math.hypot(direction.x, direction.y);

  if (length <= Number.EPSILON || direction.y < -0.18) {
    return;
  }

  const normalized = { x: direction.x / length, y: direction.y / length };
  const faceY = y - radius * 1.28;
  const eyeRadius = Math.max(1.5, radius * 0.1);
  const eyeOffset = Math.max(2.5, radius * 0.24);
  const faceX = x + normalized.x * radius * 0.34;

  if (normalized.y > 0.35) {
    graphics
      .circle(faceX - eyeOffset, faceY, eyeRadius)
      .circle(faceX + eyeOffset, faceY, eyeRadius)
      .fill({ color: 0x161b19, alpha: 0.96 });
    return;
  }

  graphics
    .circle(faceX + Math.sign(normalized.x) * eyeOffset * 0.35, faceY, eyeRadius)
    .fill({ color: 0x161b19, alpha: 0.96 });
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
}

function drawItem(graphics: Graphics, item: RenderItemV1, projection: ArenaProjection): void {
  const { x, y } = projectArenaPoint(item.position, projection);
  const radius = Math.max(5, projection.tileWidth * 0.16);
  const color = getItemColor(item.definitionId);

  if (color === undefined) {
    return;
  }

  graphics
    .ellipse(x, y + radius * ARENA_SHADOW_OFFSET_SCALE, radius * 1.35, radius * 0.42)
    .fill({ color: 0x070a09, alpha: 0.48 });
  graphics.circle(x, y, radius * 1.36).fill({ color: 0x101514, alpha: 0.72 });
  const pickupMarkerY = y - radius * 1.78;
  const pickupMarkerSize = Math.max(3, radius * 0.42);
  graphics
    .moveTo(x, pickupMarkerY - pickupMarkerSize)
    .lineTo(x, pickupMarkerY + pickupMarkerSize)
    .moveTo(x - pickupMarkerSize, pickupMarkerY)
    .lineTo(x + pickupMarkerSize, pickupMarkerY)
    .stroke({ color: PICKUP_MARKER_COLOR, width: Math.max(1.5, radius * 0.18), alpha: 0.96 });

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

function removeStaleSprites<Key extends string | number>(
  layer: Container,
  sprites: Map<Key, Sprite>,
  visibleKeys: ReadonlySet<Key>,
): void {
  for (const [key, sprite] of sprites) {
    if (visibleKeys.has(key)) {
      continue;
    }

    layer.removeChild(sprite);
    sprite.destroy();
    sprites.delete(key);
  }
}

export function getTerrainTextureIndex(
  tile: TileState,
  supportedTileIds: ReadonlySet<string>,
): number {
  const north = !supportedTileIds.has(`${tile.column}:${tile.row - 1}`);
  const east = !supportedTileIds.has(`${tile.column + 1}:${tile.row}`);
  const south = !supportedTileIds.has(`${tile.column}:${tile.row + 1}`);
  const west = !supportedTileIds.has(`${tile.column - 1}:${tile.row}`);

  const waterMask =
    (north ? TERRAIN_WATER_NORTH : 0) |
    (east ? TERRAIN_WATER_EAST : 0) |
    (south ? TERRAIN_WATER_SOUTH : 0) |
    (west ? TERRAIN_WATER_WEST : 0);

  if (waterMask !== 0) {
    return waterMask;
  }

  const diagonalWaterMask =
    (!supportedTileIds.has(`${tile.column + 1}:${tile.row - 1}`) ? TERRAIN_WATER_NORTH_EAST : 0) |
    (!supportedTileIds.has(`${tile.column + 1}:${tile.row + 1}`) ? TERRAIN_WATER_SOUTH_EAST : 0) |
    (!supportedTileIds.has(`${tile.column - 1}:${tile.row + 1}`) ? TERRAIN_WATER_SOUTH_WEST : 0) |
    (!supportedTileIds.has(`${tile.column - 1}:${tile.row - 1}`) ? TERRAIN_WATER_NORTH_WEST : 0);

  if (diagonalWaterMask !== 0) {
    return TERRAIN_DIAGONAL_VARIANT_START + diagonalWaterMask - 1;
  }

  const variant = getTileTerrainVariant(tile);
  return variant === 0 ? 0 : TERRAIN_INTERIOR_VARIANT_START + variant - 1;
}

function syncTerrainSprites(
  layer: Container,
  sprites: Map<string, Sprite>,
  frame: RenderFrameV1,
  projection: ArenaProjection,
  assets: ArenaVisualAssets,
  camera: Vector2,
  viewportWidth: number,
  viewportHeight: number,
): number {
  const textures = assets.terrainTextures;

  if (
    textures === null ||
    textures.length < TERRAIN_DIAGONAL_VARIANT_START + TERRAIN_DIAGONAL_VARIANT_COUNT
  ) {
    removeStaleSprites(layer, sprites, new Set<string>());
    return 0;
  }

  const supportedTileIds = new Set(
    frame.tiles.filter(({ state }) => state !== "Void").map(({ tileId }) => tileId),
  );
  const visibleTileIds = new Set<string>();
  const cullMarginX = projection.pitch * 2;
  const cullMarginY = (projection.tileDepth + projection.cliffDepth) * 2;

  for (const tile of frame.tiles) {
    if (tile.state === "Void") {
      continue;
    }

    const textureIndex = getTerrainTextureIndex(tile, supportedTileIds);

    const texture = textures[textureIndex];

    if (texture === undefined) {
      continue;
    }

    const x = projection.originX + tile.column * projection.pitch;
    const y = projection.originY + tile.row * projection.depthPitch;
    const screenX = x + projection.tileWidth * 0.5 + camera.x;
    const screenY = y + (projection.tileDepth + projection.cliffDepth) * 0.5 + camera.y;

    if (
      screenX < -cullMarginX ||
      screenX > viewportWidth + cullMarginX ||
      screenY < -cullMarginY ||
      screenY > viewportHeight + cullMarginY
    ) {
      continue;
    }

    visibleTileIds.add(tile.tileId);
    let sprite = sprites.get(tile.tileId);

    if (sprite === undefined) {
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprites.set(tile.tileId, sprite);
      layer.addChild(sprite);
    }

    sprite.texture = texture;
    sprite.position.set(x + projection.tileWidth * 0.5, y + projection.tileDepth * 0.5);
    const overscan = textureIndex >= TERRAIN_DIAGONAL_VARIANT_START ? 1 : 1.055;
    sprite.width = projection.tileWidth * overscan;
    sprite.height = projection.tileDepth * overscan;
    sprite.alpha = 1;
    sprite.tint = 0xffffff;
    sprite.zIndex = tile.row * 10_000 + tile.column;
  }

  removeStaleSprites(layer, sprites, visibleTileIds);
  return sprites.size;
}

function syncTreeSprites(
  layer: Container,
  sprites: Map<string, Sprite>,
  frame: RenderFrameV1,
  projection: ArenaProjection,
  assets: ArenaVisualAssets,
): void {
  const texture = assets.treeTexture;

  if (texture === null) {
    removeStaleSprites(layer, sprites, new Set<string>());
    return;
  }

  const visibleTileIds = new Set<string>();

  for (const tree of frame.trees) {
    visibleTileIds.add(tree.tileId);
    let sprite = sprites.get(tree.tileId);

    if (sprite === undefined) {
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.92);
      sprites.set(tree.tileId, sprite);
      layer.addChild(sprite);
    }

    const point = projectArenaPoint({ x: tree.column + 0.5, y: tree.row + 0.5 }, projection);
    const targetHeight = clamp(projection.tileWidth * 2.4, 68, 152);
    sprite.position.set(point.x, point.y + projection.tileDepth * 0.42);
    sprite.height = targetHeight;
    sprite.width = targetHeight * (texture.width / texture.height);
    sprite.zIndex = Math.round((tree.row + 0.62) * 1_000);
    sprite.visible = true;
  }

  removeStaleSprites(layer, sprites, visibleTileIds);
}

function drawTreeObstacle(
  graphics: Graphics,
  tree: TreeObstacleState,
  projection: ArenaProjection,
): void {
  const point = projectArenaPoint({ x: tree.column + 0.5, y: tree.row + 0.5 }, projection);
  const trunkWidth = Math.max(5, projection.tileWidth * 0.13);
  const trunkHeight = Math.max(14, projection.tileWidth * 0.48);
  const canopyRadius = Math.max(14, projection.tileWidth * 0.42);
  graphics
    .ellipse(point.x, point.y + projection.tileDepth * 0.42, canopyRadius * 0.72, 4)
    .fill({ color: 0x050706, alpha: 0.35 })
    .roundRect(point.x - trunkWidth / 2, point.y - trunkHeight * 0.58, trunkWidth, trunkHeight, 2)
    .fill({ color: 0x735036 })
    .circle(point.x, point.y - trunkHeight * 0.72, canopyRadius)
    .fill({ color: 0x2f7445 })
    .circle(point.x - canopyRadius * 0.52, point.y - trunkHeight * 0.62, canopyRadius * 0.68)
    .fill({ color: 0x3d8f52 })
    .circle(point.x + canopyRadius * 0.5, point.y - trunkHeight * 0.6, canopyRadius * 0.64)
    .fill({ color: 0x28623e });
}

function syncItemSprites(
  layer: Container,
  sprites: Map<number, Sprite>,
  frame: RenderFrameV1,
  projection: ArenaProjection,
  assets: ArenaVisualAssets,
): void {
  const itemTextures = assets.itemTextures;

  if (itemTextures === null) {
    removeStaleSprites(layer, sprites, new Set<number>());
    return;
  }

  const visibleItemIds = new Set<number>();

  for (const item of frame.items) {
    const texture = itemTextures[item.definitionId];

    if (texture === undefined) {
      continue;
    }

    visibleItemIds.add(item.itemId);
    let sprite = sprites.get(item.itemId);

    if (sprite === undefined) {
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.9);
      sprites.set(item.itemId, sprite);
      layer.addChild(sprite);
    } else if (sprite.texture !== texture) {
      sprite.texture = texture;
    }

    const point = projectArenaPoint(item.position, projection);
    const targetHeight = Math.max(24, projection.tileWidth * 0.72);
    sprite.position.set(point.x, point.y + projection.tileDepth * 0.34);
    sprite.height = targetHeight;
    sprite.width = targetHeight * (sprite.texture.width / sprite.texture.height);
    sprite.visible = true;
  }

  removeStaleSprites(layer, sprites, visibleItemIds);
}

function syncPirateShipSprites(
  layer: Container,
  sprites: Map<number, Sprite>,
  frame: RenderFrameV1,
  projection: ArenaProjection,
  assets: ArenaVisualAssets,
): void {
  const pirateShipTexture = assets.pirateShipTexture;

  if (pirateShipTexture === null) {
    removeStaleSprites(layer, sprites, new Set<number>());
    return;
  }

  const visibleShipIds = new Set<number>();

  for (const ship of frame.pirateShips) {
    visibleShipIds.add(ship.shipId);
    let sprite = sprites.get(ship.shipId);

    if (sprite === undefined) {
      sprite = new Sprite(pirateShipTexture);
      sprite.anchor.set(0.5, 0.78);
      sprites.set(ship.shipId, sprite);
      layer.addChild(sprite);
    }

    const point = projectArenaPoint(ship.position, projection);
    const variantScale = 0.9 + (ship.shipId % 4) * 0.035;
    const targetHeight = clamp(projection.tileWidth * 3.2 * variantScale, 86, 154);
    sprite.position.set(point.x, point.y + projection.tileDepth * 0.45);
    sprite.height = targetHeight;
    sprite.width = targetHeight * (pirateShipTexture.width / pirateShipTexture.height);
    sprite.rotation = 0;
    sprite.alpha = 1;
    sprite.visible = true;
  }

  for (const [shipId, sprite] of sprites) {
    sprite.visible = visibleShipIds.has(shipId);
  }
}

function getTreasureShipSpriteHeight(projection: ArenaProjection): number {
  return clamp(projection.tileWidth * 3.7, 104, 176);
}

function syncTreasureShipSprite(
  layer: Container,
  currentSprite: Sprite | undefined,
  ship: TreasureShipState,
  projection: ArenaProjection,
  assets: ArenaVisualAssets,
): Sprite | undefined {
  const texture = assets.treasureShipTexture;

  if (texture === null) {
    if (currentSprite !== undefined) {
      currentSprite.visible = false;
    }
    return currentSprite;
  }

  const sprite = currentSprite ?? new Sprite(texture);
  if (currentSprite === undefined) {
    sprite.anchor.set(0.5, 0.78);
    layer.addChild(sprite);
  } else if (sprite.texture !== texture) {
    sprite.texture = texture;
  }

  const point = projectArenaPoint(ship.position, projection);
  const targetHeight = getTreasureShipSpriteHeight(projection);
  sprite.position.set(point.x, point.y + projection.tileDepth * 0.45);
  sprite.height = targetHeight;
  sprite.width = targetHeight * (texture.width / texture.height);
  sprite.alpha = 1;
  sprite.visible = true;
  return sprite;
}

function syncTreasureShipSprites(
  layer: Container,
  spritesByShipId: Map<number, Sprite>,
  ships: readonly TreasureShipState[],
  projection: ArenaProjection,
  assets: ArenaVisualAssets,
): void {
  const visibleShipIds = new Set<number>();

  for (const ship of ships) {
    visibleShipIds.add(ship.shipId);
    const sprite = syncTreasureShipSprite(
      layer,
      spritesByShipId.get(ship.shipId),
      ship,
      projection,
      assets,
    );
    if (sprite !== undefined) {
      spritesByShipId.set(ship.shipId, sprite);
    }
  }

  for (const [shipId, sprite] of spritesByShipId) {
    sprite.visible = visibleShipIds.has(shipId);
  }
}

function syncProjectileSprites(
  layer: Container,
  cannonSprites: Map<number, Sprite>,
  rockSprites: Map<number, Sprite>,
  frame: RenderFrameV1,
  projection: ArenaProjection,
  reducedMotion: boolean,
  assets: ArenaVisualAssets,
): void {
  const visibleCannonShotIds = new Set<number>();
  const visibleRockShotIds = new Set<number>();
  const cannonballTexture = assets.cannonballTexture;
  const lethalBoulderTexture = assets.lethalBoulderTexture;

  if (cannonballTexture !== null) {
    for (const shot of frame.cannonShots) {
      visibleCannonShotIds.add(shot.shotId);
      let sprite = cannonSprites.get(shot.shotId);

      if (sprite === undefined) {
        sprite = new Sprite(cannonballTexture);
        sprite.anchor.set(0.5, 0.5);
        cannonSprites.set(shot.shotId, sprite);
        layer.addChild(sprite);
      }

      const progress = getShotProgress(frame.tick, shot.launchTick, shot.impactTick);
      const projected = projectArenaPoint(
        {
          x: shot.origin.x + (shot.target.x - shot.origin.x) * progress,
          y: shot.origin.y + (shot.target.y - shot.origin.y) * progress,
        },
        projection,
      );
      const direction = projectArenaVector({
        x: shot.target.x - shot.origin.x,
        y: shot.target.y - shot.origin.y,
      });
      const arc = reducedMotion ? 0 : Math.sin(Math.PI * progress) * projection.tileWidth * 1.35;
      const size = clamp(projection.tileWidth * (0.9 + progress * 0.48), 34, 88);
      sprite.position.set(projected.x, projected.y - arc);
      sprite.width = size;
      sprite.height = size;
      sprite.rotation = Math.atan2(direction.y, direction.x) - Math.PI / 4;
      sprite.visible = true;
    }
  }

  if (lethalBoulderTexture !== null) {
    for (const shot of frame.rockShots) {
      visibleRockShotIds.add(shot.shotId);
      let sprite = rockSprites.get(shot.shotId);

      if (sprite === undefined) {
        sprite = new Sprite(lethalBoulderTexture);
        sprite.anchor.set(0.5, 0.5);
        rockSprites.set(shot.shotId, sprite);
        layer.addChild(sprite);
      }

      const progress = getShotProgress(frame.tick, shot.launchTick, shot.impactTick);
      const projected = projectArenaPoint(
        {
          x: shot.origin.x + (shot.target.x - shot.origin.x) * progress,
          y: shot.origin.y + (shot.target.y - shot.origin.y) * progress,
        },
        projection,
      );
      const arc = reducedMotion ? 0 : Math.sin(Math.PI * progress) * projection.tileWidth * 1.8;
      const size = clamp(projection.tileWidth * (1 + progress * 0.62), 42, 108);
      sprite.position.set(projected.x, projected.y - arc);
      sprite.width = size;
      sprite.height = size;
      sprite.rotation = progress * Math.PI * 1.5 + shot.shotId * 0.37;
      sprite.visible = true;
    }
  }

  removeStaleSprites(layer, cannonSprites, visibleCannonShotIds);
  removeStaleSprites(layer, rockSprites, visibleRockShotIds);
}

function syncImpactSprites(
  layer: Container,
  sprites: Map<string, Sprite>,
  effects: readonly VisualEffect[],
  frameTick: number,
  projection: ArenaProjection,
  reducedMotion: boolean,
  assets: ArenaVisualAssets,
): void {
  const visibleEffectKeys = new Set<string>();

  for (const effect of effects) {
    const isWaterImpact = effect.kind === "tile-void";
    const isExplosion = effect.kind === "rock-impact" || effect.kind === "bomb-detonated";

    if (!isWaterImpact && !isExplosion) {
      continue;
    }

    visibleEffectKeys.add(effect.key);
    const texture = isWaterImpact ? assets.seawaterImpactTexture : assets.impactExplosionTexture;

    if (texture === null) {
      continue;
    }
    let sprite = sprites.get(effect.key);

    if (sprite === undefined) {
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      sprites.set(effect.key, sprite);
      layer.addChild(sprite);
    } else if (sprite.texture !== texture) {
      sprite.texture = texture;
    }

    const effectState = getVisualEffectState(effect, frameTick);
    const progress = effectState.progress;
    const point = projectArenaPoint(effectState.position, projection);
    const baseSize = projection.tileWidth * (isWaterImpact ? 2.25 : 2.85);
    const scale = reducedMotion ? 1 : 0.72 + progress * 0.48;
    const size = clamp(baseSize * scale, isWaterImpact ? 54 : 68, isWaterImpact ? 142 : 176);
    sprite.position.set(point.x, point.y);
    sprite.width = size;
    sprite.height = size;
    sprite.alpha = Math.max(0, 1 - progress * (isWaterImpact ? 0.7 : 0.9));
    sprite.visible = true;
  }

  removeStaleSprites(layer, sprites, visibleEffectKeys);
}

function syncSkillEffectSprites(
  layer: Container,
  sprites: Map<string, Sprite>,
  effects: readonly VisualEffect[],
  frameTick: number,
  projection: ArenaProjection,
  reducedMotion: boolean,
  assets: ArenaVisualAssets,
): void {
  const visibleEffectKeys = new Set<string>();

  for (const effect of effects) {
    const definitionId = effect.skillDefinitionId;
    const texture =
      definitionId === undefined ? undefined : assets.skillEffectTextures[definitionId];
    const isSkillEffect =
      effect.kind === "skill-used" ||
      effect.kind === "skill-hit" ||
      effect.kind === "status-applied" ||
      effect.kind === "shield-applied";

    if (!isSkillEffect || definitionId === undefined || texture === undefined) {
      continue;
    }

    visibleEffectKeys.add(effect.key);
    let sprite = sprites.get(effect.key);

    if (sprite === undefined) {
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprites.set(effect.key, sprite);
      layer.addChild(sprite);
    } else if (sprite.texture !== texture) {
      sprite.texture = texture;
    }

    const effectState = getVisualEffectState(effect, frameTick);
    const progress = effectState.progress;
    const point = projectArenaPoint(effectState.position, projection);
    const baseSize = projection.tileWidth * SKILL_EFFECT_SIZE[definitionId];
    const hitScale = effect.kind === "skill-hit" || effect.kind === "status-applied" ? 0.82 : 1;
    const animatedScale = reducedMotion ? 0.9 : 0.7 + progress * 0.48;
    const size = clamp(baseSize * hitScale * animatedScale, 42, 280);
    const direction = projectArenaVector(effect.vector ?? { x: 1, y: 0 });
    sprite.position.set(point.x, point.y);
    sprite.width = size;
    sprite.height = size;
    sprite.rotation = DIRECTIONAL_SKILL_EFFECTS.has(definitionId)
      ? Math.atan2(direction.y, direction.x)
      : definitionId === "frost-field" && !reducedMotion
        ? progress * 0.18
        : 0;
    sprite.alpha = Math.max(0, 0.94 * (1 - progress * 0.86));
    sprite.visible = true;
  }

  removeStaleSprites(layer, sprites, visibleEffectKeys);
}

function syncSkillZoneSprites(
  layer: Container,
  sprites: Map<number, Sprite>,
  frame: RenderFrameV1,
  projection: ArenaProjection,
  reducedMotion: boolean,
  assets: ArenaVisualAssets,
): void {
  const visibleZoneIds = new Set<number>();

  for (const zone of frame.skillZones) {
    const texture = assets.skillEffectTextures[zone.skillDefinitionId];
    if (texture === undefined) {
      continue;
    }

    visibleZoneIds.add(zone.zoneId);
    let sprite = sprites.get(zone.zoneId);
    if (sprite === undefined) {
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprites.set(zone.zoneId, sprite);
      layer.addChild(sprite);
    } else if (sprite.texture !== texture) {
      sprite.texture = texture;
    }

    const point = projectArenaPoint(zone.position, projection);
    const pending = frame.tick < zone.activateTick;
    const pulse = reducedMotion ? 1 : 1 + Math.sin(frame.tick * 0.09 + zone.zoneId) * 0.035;
    const width = clamp(zone.radius * projection.pitch * 2.25 * pulse, 72, 330);
    const heightMultiplier = 0.66;
    sprite.position.set(point.x, point.y);
    sprite.width = width;
    sprite.height = width * heightMultiplier;
    sprite.alpha = pending ? 0.38 : 0.58;
    sprite.rotation = zone.kind === "frost" && !reducedMotion ? frame.tick * 0.0018 : 0;
    sprite.visible = true;
  }

  removeStaleSprites(layer, sprites, visibleZoneIds);
}

function syncAegisSprites(
  layer: Container,
  sprites: Map<number, Sprite>,
  frame: RenderFrameV1,
  projection: ArenaProjection,
  interpolationAlpha: number,
  reducedMotion: boolean,
  assets: ArenaVisualAssets,
): void {
  const texture = assets.skillEffectTextures.aegis;
  const visibleActorIds = new Set<number>();

  if (texture === undefined) {
    removeStaleSprites(layer, sprites, visibleActorIds);
    return;
  }

  for (const participant of frame.participants) {
    if (!participant.active || participant.combat.shield <= 0) {
      continue;
    }

    visibleActorIds.add(participant.actorId);
    let sprite = sprites.get(participant.actorId);
    if (sprite === undefined) {
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprites.set(participant.actorId, sprite);
      layer.addChild(sprite);
    }

    const worldX =
      participant.previousPosition.x +
      (participant.position.x - participant.previousPosition.x) * interpolationAlpha;
    const worldY =
      participant.previousPosition.y +
      (participant.position.y - participant.previousPosition.y) * interpolationAlpha;
    const point = projectArenaPoint({ x: worldX, y: worldY }, projection);
    const pulse = reducedMotion ? 1 : 1 + Math.sin(frame.tick * 0.12 + participant.actorId) * 0.045;
    const size = clamp(participant.radius * projection.pitch * 4.8 * pulse, 48, 112);
    sprite.position.set(point.x, point.y - size * 0.05);
    sprite.width = size;
    sprite.height = size;
    sprite.alpha = 0.58;
    sprite.rotation = reducedMotion
      ? 0
      : Math.sin(frame.tick * 0.025 + participant.actorId) * 0.025;
    sprite.zIndex = worldY * 1000 + participant.actorId - 0.5;
    sprite.visible = true;
  }

  removeStaleSprites(layer, sprites, visibleActorIds);
}

function syncStunnedSprites(
  layer: Container,
  sprites: Map<number, Sprite>,
  frame: RenderFrameV1,
  projection: ArenaProjection,
  interpolationAlpha: number,
  reducedMotion: boolean,
  assets: ArenaVisualAssets,
): void {
  const texture = assets.stunnedTexture;
  const visibleActorIds = new Set<number>();

  if (texture === null) {
    removeStaleSprites(layer, sprites, visibleActorIds);
    return;
  }

  for (const participant of frame.participants) {
    if (
      !participant.active ||
      participant.action === "Falling" ||
      participant.combat.stunnedUntilTick <= frame.tick
    ) {
      continue;
    }

    visibleActorIds.add(participant.actorId);
    let sprite = sprites.get(participant.actorId);
    if (sprite === undefined) {
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprites.set(participant.actorId, sprite);
      layer.addChild(sprite);
    }

    const worldX =
      participant.previousPosition.x +
      (participant.position.x - participant.previousPosition.x) * interpolationAlpha;
    const worldY =
      participant.previousPosition.y +
      (participant.position.y - participant.previousPosition.y) * interpolationAlpha;
    const point = projectArenaPoint({ x: worldX, y: worldY }, projection);
    const collisionRadius = participant.radius * projection.pitch;
    const width = clamp(collisionRadius * 4.2, 52, 104);
    const bob = reducedMotion ? 0 : Math.sin(frame.tick * 0.18 + participant.actorId) * 2.5;
    sprite.position.set(point.x, point.y - collisionRadius * 2.85 + bob);
    sprite.width = width;
    sprite.height = width;
    sprite.alpha = 0.98;
    sprite.rotation = reducedMotion ? 0 : frame.tick * 0.025;
    sprite.zIndex = Math.round(worldY * 1_000) + participant.actorId + 2;
    sprite.visible = true;
  }

  removeStaleSprites(layer, sprites, visibleActorIds);
}

function syncParticipantSprites(
  layer: Container,
  sprites: Map<number, Sprite>,
  boatSprites: Map<number, Sprite>,
  frame: RenderFrameV1,
  projection: ArenaProjection,
  interpolationAlpha: number,
  reducedMotion: boolean,
  assets: ArenaVisualAssets,
  castAnimations: ReadonlyMap<number, CharacterCastAnimation>,
  hitAnimations: ReadonlyMap<number, CharacterHitAnimation>,
): void {
  const characterTextures = assets.characterTextures;
  const characterMotionTextures = assets.characterMotionTextures;

  if (
    (characterTextures === null || characterTextures.length === 0) &&
    (characterMotionTextures === null || characterMotionTextures.length === 0)
  ) {
    removeStaleSprites(layer, sprites, new Set<number>());
    removeStaleSprites(layer, boatSprites, new Set<number>());
    return;
  }

  const visibleActorIds = new Set<number>();
  const visibleBoatActorIds = new Set<number>();

  for (const participant of frame.participants) {
    if (!participant.active && participant.action === "Eliminated") {
      continue;
    }

    visibleActorIds.add(participant.actorId);
    const textureCount = characterMotionTextures?.length ?? characterTextures?.length ?? 0;
    const textureIndex = (participant.actorId - 1) % textureCount;

    const worldX =
      participant.previousPosition.x +
      (participant.position.x - participant.previousPosition.x) * interpolationAlpha;
    const worldY =
      participant.previousPosition.y +
      (participant.position.y - participant.previousPosition.y) * interpolationAlpha;
    const point = projectArenaPoint({ x: worldX, y: worldY }, projection);
    const collisionRadius = participant.radius * projection.pitch;
    const visualScale = 1 + (participant.massFactor - 1) * 0.16;
    const castAnimation = castAnimations.get(participant.actorId);
    const castProgress =
      castAnimation !== undefined &&
      castAnimation.roundId === frame.roundId &&
      frame.tick <= castAnimation.endTick
        ? clamp(
            (frame.tick - castAnimation.startTick) /
              Math.max(1, castAnimation.endTick - castAnimation.startTick),
            0,
            1,
          )
        : null;
    const motionPose = createCharacterMotionPose({
      action: participant.action,
      actorId: participant.actorId,
      castProgress,
      facing: projectArenaVector(participant.facing),
      frameTick: frame.tick,
      reducedMotion,
      velocity: projectArenaVector(participant.velocity),
    });
    const hitAnimation = hitAnimations.get(participant.actorId);
    const animationState = selectCharacterAnimationState({
      action: participant.action,
      castProgress,
      hitActive:
        hitAnimation !== undefined &&
        hitAnimation.roundId === frame.roundId &&
        frame.tick <= hitAnimation.endTick,
      motionPose,
      reducedMotion,
    });
    const animatedTexture = characterMotionTextures?.[textureIndex]?.[animationState];
    const texture = animatedTexture ?? characterTextures?.[textureIndex];

    if (texture === undefined) {
      continue;
    }

    let sprite = sprites.get(participant.actorId);

    if (sprite === undefined) {
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.96);
      sprites.set(participant.actorId, sprite);
      layer.addChild(sprite);
    } else if (sprite.texture !== texture) {
      sprite.texture = texture;
    }

    const frameDisplayScale =
      animatedTexture === undefined ? (assets.characterDisplayScales[textureIndex] ?? 1) : 1;
    const targetHeight = Math.max(28, collisionRadius * visualScale * 3.45) * frameDisplayScale;
    const baseWidth = targetHeight * (texture.width / texture.height);
    const spriteMotion = createCharacterSpriteMotionTransform(
      motionPose,
      animatedTexture !== undefined,
    );
    sprite.position.set(
      point.x + collisionRadius * spriteMotion.offsetXRatio,
      point.y + collisionRadius * 0.82 - collisionRadius * spriteMotion.liftRatio,
    );
    sprite.width = baseWidth * spriteMotion.scaleX;
    sprite.height = targetHeight * spriteMotion.scaleY;
    sprite.alpha = participant.action === "Falling" ? 0.42 : 1;
    sprite.rotation = spriteMotion.rotation;
    sprite.zIndex = Math.round(worldY * 1_000) + participant.actorId;
    sprite.visible = true;

    const hasBoat = participant.effects.some(({ definitionId }) => definitionId === "boat");
    const boatTexture = assets.itemTextures?.boat;

    if (hasBoat && boatTexture !== undefined) {
      visibleBoatActorIds.add(participant.actorId);
      let boatSprite = boatSprites.get(participant.actorId);

      if (boatSprite === undefined) {
        boatSprite = new Sprite(boatTexture);
        boatSprite.anchor.set(0.5, 0.55);
        boatSprites.set(participant.actorId, boatSprite);
        layer.addChild(boatSprite);
      }

      const boatWidth = visualScale * collisionRadius * 3.55;
      const boatBob = reducedMotion
        ? 0
        : Math.sin((frame.tick + participant.actorId * 5) * 0.18) * collisionRadius * 0.08;
      boatSprite.position.set(point.x, point.y + collisionRadius * 1.1 + boatBob);
      boatSprite.width = boatWidth;
      boatSprite.height = boatWidth * (boatTexture.height / boatTexture.width);
      boatSprite.alpha = participant.action === "Falling" ? 0.32 : 0.92;
      boatSprite.rotation = reducedMotion
        ? 0
        : Math.sin((frame.tick + participant.actorId * 5) * 0.18) * 0.025;
      boatSprite.zIndex = sprite.zIndex - 1;
      boatSprite.visible = true;
    }
  }

  for (const [actorId, sprite] of sprites) {
    sprite.visible = visibleActorIds.has(actorId);
  }

  removeStaleSprites(layer, boatSprites, visibleBoatActorIds);
}

function syncPlacedItemSprites(
  layer: Container,
  bombSprites: Map<string, Sprite>,
  frame: RenderFrameV1,
  projection: ArenaProjection,
  reducedMotion: boolean,
  assets: ArenaVisualAssets,
): void {
  const itemTextures = assets.itemTextures;
  const bombTexture = itemTextures?.bomb;

  if (bombTexture === undefined) {
    removeStaleSprites(layer, bombSprites, new Set<string>());
    return;
  }

  const visibleBombIds = new Set<string>();

  for (const bomb of frame.bombs) {
    const bombKey = `${bomb.ownerActorId}:${bomb.placedTick}`;
    visibleBombIds.add(bombKey);
    let sprite = bombSprites.get(bombKey);

    if (sprite === undefined) {
      sprite = new Sprite(bombTexture);
      sprite.anchor.set(0.5, 0.82);
      bombSprites.set(bombKey, sprite);
      layer.addChild(sprite);
    }

    const point = projectArenaPoint(bomb.position, projection);
    const remainingTicks = Math.max(0, bomb.detonateTick - frame.tick);
    const urgency = 1 - Math.min(1, remainingTicks / (5 * 60));
    const pulse = reducedMotion ? 1 : 1 + Math.sin(frame.tick * 0.42) * 0.06 * urgency;
    const height = clamp(projection.tileWidth * 0.92 * pulse, 30, 68);
    sprite.position.set(point.x, point.y + projection.tileDepth * 0.28);
    sprite.height = height;
    sprite.width = height * (sprite.texture.width / sprite.texture.height);
    sprite.rotation = reducedMotion ? 0 : Math.sin(frame.tick * 0.34) * 0.035 * urgency;
    sprite.alpha = 1;
    sprite.visible = true;
  }

  removeStaleSprites(layer, bombSprites, visibleBombIds);
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

function drawSoapPatch(
  graphics: Graphics,
  patch: SoapPatchState,
  projection: ArenaProjection,
  humanActorId: number,
): void {
  const { x, y } = projectArenaPoint({ x: patch.column + 0.5, y: patch.row + 0.5 }, projection);
  const width = projection.tileWidth * 0.76;
  const height = Math.max(8, projection.tileDepth * 0.5);
  const ownerColor = getActorIdentityColor(patch.ownerActorId, humanActorId);

  // A delivered pickup keeps the upright soap sprite and yellow plus marker.
  // A placed trap is deliberately flat, translucent, and hazard-marked.
  graphics
    .ellipse(x, y, width * 0.5, height * 0.5)
    .fill({ color: 0xa8edf2, alpha: 0.38 })
    .stroke({ color: ownerColor, width: Math.max(2, projection.tileWidth * 0.04), alpha: 0.92 });
  graphics
    .ellipse(x - width * 0.2, y + height * 0.02, width * 0.2, height * 0.26)
    .ellipse(x + width * 0.18, y - height * 0.04, width * 0.24, height * 0.3)
    .fill({ color: 0xe9fbff, alpha: 0.42 });

  const bubbleRadius = Math.max(2, height * 0.13);
  for (const [offsetX, offsetY, scale] of [
    [-0.28, -0.42, 0.8],
    [0.04, -0.56, 1],
    [0.32, -0.34, 0.65],
  ] as const) {
    graphics
      .circle(x + width * offsetX, y + height * offsetY, bubbleRadius * scale)
      .stroke({ color: 0xf4ffff, width: 1.5, alpha: 0.9 });
  }

  const markerRadius = Math.max(5, height * 0.3);
  graphics
    .circle(x, y, markerRadius)
    .fill({ color: 0x15383d, alpha: 0.82 })
    .stroke({ color: 0xf4ffff, width: 1.5, alpha: 0.92 });
  graphics
    .moveTo(x, y - markerRadius * 0.5)
    .lineTo(x, y + markerRadius * 0.16)
    .stroke({ color: 0xf4ffff, width: Math.max(2, markerRadius * 0.18), cap: "round" });
  graphics.circle(x, y + markerRadius * 0.48, Math.max(1.5, markerRadius * 0.11)).fill({
    color: 0xf4ffff,
    alpha: 0.96,
  });
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

function drawParticipant(
  graphics: Graphics,
  participant: RenderParticipantV1,
  humanActorId: number,
  projection: ArenaProjection,
  interpolationAlpha: number,
  reducedMotion: boolean,
  mayhem: boolean,
  frameTick: number,
  hasCharacterArtwork: boolean,
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
  const motionPose = createCharacterMotionPose({
    action: participant.action,
    actorId: participant.actorId,
    castProgress: null,
    facing: projectArenaVector(participant.facing),
    frameTick,
    reducedMotion,
    velocity: projectArenaVector(participant.velocity),
  });

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

  graphics
    .ellipse(
      x,
      y + visualRadius * ARENA_SHADOW_OFFSET_SCALE,
      visualRadius * 0.9,
      Math.max(2, visualRadius * 0.24),
    )
    .fill({ color: 0x050706, alpha: participant.action === "Falling" ? 0.16 : 0.38 });

  if (mayhem && !isHuman && !hasCharacterArtwork) {
    graphics
      .circle(x, y, visualRadius)
      .fill({ color: fillColor, alpha: participant.action === "Falling" ? 0.35 : 1 })
      .stroke({
        color: actionColor,
        width: Math.max(1.5, participant.massFactor * 1.4),
      });
    if (
      participant.action === "Stumbling" ||
      participant.action === "Slipping" ||
      participant.action === "Falling"
    ) {
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

  if (motionPose.moving && !hasBoat) {
    const velocity = projectArenaVector(participant.velocity);
    const speed = Math.hypot(velocity.x, velocity.y);

    if (speed > Number.EPSILON) {
      const direction = { x: velocity.x / speed, y: velocity.y / speed };
      const perpendicular = { x: -direction.y, y: direction.x };
      const footSpacing = visualRadius * 0.34;
      const stride = motionPose.stridePhase * visualRadius * 0.22;

      for (const side of [-1, 1]) {
        const footX = x + perpendicular.x * footSpacing * side + direction.x * stride * side;
        const footY =
          y +
          visualRadius * 0.62 +
          perpendicular.y * footSpacing * side +
          direction.y * stride * side;
        const alpha = side === Math.sign(motionPose.stridePhase || 1) ? 0.42 : 0.2;
        graphics
          .ellipse(footX, footY, visualRadius * 0.22, Math.max(1.5, visualRadius * 0.08))
          .fill({ color: 0xd8c28f, alpha });
      }
    }
  }

  if (!hasCharacterArtwork) {
    graphics.circle(x, y, collisionRadius).stroke({
      color: 0x0a0d0c,
      width: Math.max(1, projection.tileWidth * 0.035),
      alpha: 0.9,
    });

    if (isHuman) {
      graphics
        .poly([x, y - visualRadius, x + visualRadius, y, x, y + visualRadius, x - visualRadius, y])
        .fill({ color: fillColor, alpha: participant.action === "Falling" ? 0.35 : 1 })
        .stroke({ color: HUMAN_MARKER_COLOR, width: Math.max(3, projection.tileWidth * 0.07) });
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
  } else if (isHuman) {
    const markerY = y + visualRadius * 1.12;
    const markerWidth = visualRadius * 0.46;
    const markerDepth = Math.max(3, visualRadius * 0.24);
    graphics
      .moveTo(x - markerWidth, markerY)
      .lineTo(x, markerY + markerDepth)
      .lineTo(x + markerWidth, markerY)
      .stroke({
        color: HUMAN_MARKER_COLOR,
        width: Math.max(2, projection.tileWidth * 0.04),
        alpha: 0.92,
        cap: "round",
      });
  }

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

  if (
    participant.action === "Stumbling" ||
    participant.action === "Slipping" ||
    participant.action === "Falling"
  ) {
    const markerSize = visualRadius * 0.55;
    graphics
      .moveTo(x - markerSize, y - markerSize)
      .lineTo(x + markerSize, y + markerSize)
      .moveTo(x + markerSize, y - markerSize)
      .lineTo(x - markerSize, y + markerSize)
      .stroke({ color: actionColor, width: 3, cap: "round" });
  }
}

function drawCombatBars(
  graphics: Graphics,
  participant: RenderParticipantV1,
  x: number,
  y: number,
  projection: ArenaProjection,
  isHuman: boolean,
): void {
  if (!participant.active || participant.action === "Falling") {
    return;
  }

  const width = Math.max(isHuman ? 58 : 32, projection.tileWidth * (isHuman ? 1.05 : 0.62));
  const height = Math.max(3, projection.tileWidth * 0.055);
  const gap = Math.max(2, height * 0.65);
  const top = y - Math.max(26, participant.radius * projection.pitch * 3.4);
  const healthRatio = clamp(participant.combat.health / participant.combat.maximumHealth, 0, 1);
  const manaRatio = clamp(participant.combat.mana / participant.combat.maximumMana, 0, 1);

  graphics
    .roundRect(x - width / 2, top, width, height, height / 2)
    .fill({ color: 0x090b0a, alpha: 0.82 })
    .roundRect(x - width / 2, top, width * healthRatio, height, height / 2)
    .fill({ color: healthRatio <= 0.3 ? 0xff5c4d : 0x5fd67a, alpha: 0.96 })
    .roundRect(x - width / 2, top + height + gap, width, height, height / 2)
    .fill({ color: 0x090b0a, alpha: 0.82 })
    .roundRect(x - width / 2, top + height + gap, width * manaRatio, height, height / 2)
    .fill({ color: 0x4ca6ff, alpha: 0.94 });

  if (participant.combat.shield > 0 && participant.combat.shieldEndsTick > 0) {
    const shieldRatio = clamp(participant.combat.shield / participant.combat.maximumHealth, 0, 1);
    graphics
      .roundRect(x - width / 2, top - gap - height, width * shieldRatio, height, height / 2)
      .fill({ color: 0x8ee7ff, alpha: 0.88 });
  }
}

function drawSkillZone(
  graphics: Graphics,
  zone: RenderFrameV1["skillZones"][number],
  frameTick: number,
  projection: ArenaProjection,
): void {
  const point = projectArenaPoint(zone.position, projection);
  const radiusX = zone.radius * projection.pitch;
  const radiusY = zone.radius * projection.depthPitch;
  const pending = frameTick < zone.activateTick;
  const color = zone.kind === "frost" ? 0x72d8ff : 0xff695c;
  const alpha = pending ? 0.2 : 0.24;
  graphics
    .ellipse(point.x, point.y, radiusX, radiusY)
    .fill({ color, alpha })
    .stroke({ color, width: pending ? 3 : 4, alpha: 0.9 });
  if (pending) {
    const progress = clamp(
      1 - (zone.activateTick - frameTick) / Math.max(1, zone.activateTick - zone.placedTick),
      0,
      1,
    );
    graphics
      .ellipse(point.x, point.y, radiusX * progress, radiusY * progress)
      .stroke({ color: 0xffc857, width: 3, alpha: 0.95 });
  }
}

function getEffectPosition(event: SimulationEventV1, frame: RenderFrameV1): Vector2 | undefined {
  if (event.position !== undefined) {
    return event.position;
  }

  if (
    (event.kind === "tile-void" ||
      event.kind === "soap-placed" ||
      event.kind === "soap-triggered") &&
    event.tileId !== undefined
  ) {
    const tile = frame.tiles.find(({ tileId }) => tileId === event.tileId);

    if (tile !== undefined) {
      return Object.freeze({ x: tile.column + 0.5, y: tile.row + 0.5 });
    }
  }

  const actorId =
    event.kind === "shove-hit" ||
    event.kind === "soap-triggered" ||
    event.kind === "skill-hit" ||
    event.kind === "status-applied"
      ? event.targetActorId
      : event.actorId;
  return frame.participants.find((participant) => participant.actorId === actorId)?.position;
}

function isVisualEffectKind(kind: SimulationEventV1["kind"]): kind is VisualEffectKind {
  return (
    kind === "skill-used" ||
    kind === "skill-hit" ||
    kind === "shield-applied" ||
    kind === "status-applied" ||
    kind === "shove-hit" ||
    kind === "shove-missed" ||
    kind === "dodge-succeeded" ||
    kind === "falling-started" ||
    kind === "item-picked-up" ||
    kind === "item-used" ||
    kind === "soap-placed" ||
    kind === "soap-triggered" ||
    kind === "bomb-detonated" ||
    kind === "grappling-hook-hit" ||
    kind === "rock-impact" ||
    kind === "tile-void"
  );
}

function drawSkillEffect(
  graphics: Graphics,
  effect: VisualEffect,
  x: number,
  y: number,
  baseRadius: number,
  progress: number,
  alpha: number,
): void {
  const direction = projectArenaVector(effect.vector ?? { x: 1, y: 0 });
  const perpendicular = { x: -direction.y, y: direction.x };
  const radius = baseRadius * (1.15 + progress * 1.8);
  const color = effect.kind === "skill-hit" ? 0xffc857 : 0x72d8ff;

  switch (effect.skillDefinitionId) {
    case "blink-step":
      for (let index = 0; index < 3; index += 1) {
        const offset = index * radius * 0.85;
        graphics
          .moveTo(
            x - direction.x * offset - perpendicular.x * radius,
            y - direction.y * offset - perpendicular.y * radius,
          )
          .lineTo(x - direction.x * (offset + radius), y - direction.y * (offset + radius))
          .lineTo(
            x - direction.x * offset + perpendicular.x * radius,
            y - direction.y * offset + perpendicular.y * radius,
          );
      }
      graphics.stroke({ color: 0x74f1e6, width: 3, alpha, cap: "round" });
      break;
    case "arc-bolt": {
      const length = radius * 5.5;
      graphics.moveTo(x - direction.x * length, y - direction.y * length);
      for (let index = 1; index <= 6; index += 1) {
        const ratio = index / 6;
        const jitter = index % 2 === 0 ? -radius * 0.55 : radius * 0.55;
        graphics.lineTo(
          x - direction.x * length * (1 - ratio) + perpendicular.x * jitter,
          y - direction.y * length * (1 - ratio) + perpendicular.y * jitter,
        );
      }
      graphics.stroke({ color: 0x62e7ff, width: 6, alpha, cap: "round", join: "round" });
      break;
    }
    case "chain-bind":
      for (let index = 0; index < 4; index += 1) {
        const offset = radius * index * 1.25;
        graphics.ellipse(
          x - direction.x * offset,
          y - direction.y * offset,
          radius * 0.62,
          radius * 0.34,
        );
      }
      graphics.stroke({ color: 0xc9d2da, width: 3, alpha });
      break;
    case "meteor-mark":
      for (let index = 0; index < 8; index += 1) {
        const angle = (Math.PI * 2 * index) / 8;
        graphics
          .moveTo(x + Math.cos(angle) * radius * 0.55, y + Math.sin(angle) * radius * 0.32)
          .lineTo(x + Math.cos(angle) * radius * 2.2, y + Math.sin(angle) * radius * 1.25);
      }
      graphics.stroke({ color: 0xff784e, width: 4, alpha, cap: "round" });
      graphics.circle(x, y, radius * 0.72).fill({ color: 0xffb13b, alpha: alpha * 0.4 });
      break;
    case "frost-field":
      for (let index = 0; index < 6; index += 1) {
        const angle = (Math.PI * index) / 3;
        graphics
          .moveTo(x - Math.cos(angle) * radius * 1.8, y - Math.sin(angle) * radius)
          .lineTo(x + Math.cos(angle) * radius * 1.8, y + Math.sin(angle) * radius);
      }
      graphics.stroke({ color: 0xa9f1ff, width: 3, alpha, cap: "round" });
      break;
    case "aegis":
      graphics
        .regularPoly(x, y, radius * 1.8, 6, Math.PI / 6)
        .fill({ color: 0x55d7ff, alpha: alpha * 0.16 })
        .stroke({ color: 0xb9f2ff, width: 4, alpha });
      break;
    default:
      graphics.circle(x, y, radius).stroke({ color, width: 4, alpha });
  }
}

function drawWorldEffect(
  graphics: Graphics,
  effect: VisualEffect,
  frameTick: number,
  projection: ArenaProjection,
  reducedMotion: boolean,
): void {
  const effectState = getVisualEffectState(effect, frameTick);
  const progress = effectState.progress;
  const { x, y } = projectArenaPoint(effectState.position, projection);
  const baseRadius = Math.max(5, projection.tileWidth * 0.14);
  const expansion = reducedMotion ? 1 : 1 + progress * 1.8;
  const alpha = Math.max(0, 1 - progress);

  if (effect.kind === "tile-void") {
    const waveScale = reducedMotion ? 0.9 : 0.65 + progress * 1.25;
    graphics
      .ellipse(x, y, projection.pitch * waveScale, projection.depthPitch * waveScale)
      .stroke({ color: 0x72d8ff, width: 4, alpha });
    graphics
      .ellipse(x, y, projection.pitch * waveScale * 0.72, projection.depthPitch * waveScale * 0.72)
      .stroke({ color: 0xdaf7ff, width: 2, alpha: alpha * 0.8 });
  } else if (effect.kind === "skill-used") {
    drawSkillEffect(graphics, effect, x, y, baseRadius, reducedMotion ? 0.25 : progress, alpha);
  } else if (effect.kind === "skill-hit") {
    drawSkillEffect(graphics, effect, x, y, baseRadius, reducedMotion ? 0.25 : progress, alpha);
  } else if (effect.kind === "shield-applied") {
    graphics
      .circle(x, y, baseRadius * (reducedMotion ? 2 : 2 + progress))
      .stroke({ color: 0x8ee7ff, width: 5, alpha });
  } else if (effect.kind === "status-applied") {
    graphics.circle(x, y, baseRadius * 1.6).stroke({ color: 0xd58bea, width: 3, alpha });
  } else if (effect.kind === "rock-impact") {
    const burst = baseRadius * (reducedMotion ? 2.4 : 1.4 + progress * 4.8);
    graphics.circle(x, y, burst).stroke({ color: 0xff5c4d, width: 5, alpha });
    graphics.circle(x, y, burst * 0.65).fill({ color: 0x4b2f27, alpha: alpha * 0.42 });
  } else if (effect.kind === "grappling-hook-hit") {
    const cableAlpha = alpha;
    const anchorVector = effect.vector ?? { x: 0, y: 0 };
    const anchor = projectArenaPoint(
      { x: effect.position.x + anchorVector.x, y: effect.position.y + anchorVector.y },
      projection,
    );
    const hookSize = Math.max(5, projection.tileWidth * 0.13);
    graphics.moveTo(x, y).lineTo(anchor.x, anchor.y).stroke({
      color: GRAPPLING_HOOK_COLOR,
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
        color: GRAPPLING_HOOK_COLOR,
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
    graphics
      .ellipse(x, y, baseRadius * expansion * 1.8, baseRadius * 0.55)
      .stroke({ color: ITEM_COLORS.soap, width: 4, alpha });
  } else if (effect.kind === "soap-placed") {
    graphics.circle(x, y, baseRadius * expansion).stroke({
      color: ITEM_COLORS.soap,
      width: 3,
      alpha,
    });
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
      .stroke({
        color: getItemColor(effect.itemDefinitionId ?? "soap") ?? 0x68d8d6,
        width: 3,
        alpha,
        cap: "round",
      });
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

function drawAimPreview(
  graphics: Graphics,
  preview: ArenaAimPreview,
  projection: ArenaProjection,
): void {
  const source = projectArenaPoint(preview.source, projection);
  const target = projectArenaPoint(preview.target, projection);
  const color = preview.valid ? (preview.approaching ? 0xffc857 : 0x50d9ff) : 0xff625f;
  const fillAlpha = preview.valid ? 0.13 : 0.09;
  const lineAlpha = preview.approaching ? 0.92 : 0.78;
  const radius = Math.max(0.35, preview.effectRadius);

  if (preview.targetMode === "direction") {
    const deltaX = target.x - source.x;
    const deltaY = target.y - source.y;
    const length = Math.max(1, Math.hypot(deltaX, deltaY));
    const normalX = -deltaY / length;
    const normalY = deltaX / length;
    const halfWidth = Math.max(5, projection.tileWidth * Math.max(0.12, radius * 0.18));
    graphics
      .moveTo(source.x + normalX * halfWidth, source.y + normalY * halfWidth)
      .lineTo(target.x + normalX * halfWidth, target.y + normalY * halfWidth)
      .lineTo(target.x - normalX * halfWidth, target.y - normalY * halfWidth)
      .lineTo(source.x - normalX * halfWidth, source.y - normalY * halfWidth)
      .closePath()
      .fill({ color, alpha: fillAlpha })
      .stroke({ color, width: 2.5, alpha: lineAlpha });
    graphics
      .moveTo(target.x - normalX * halfWidth * 1.8, target.y - normalY * halfWidth * 1.8)
      .lineTo(target.x, target.y)
      .lineTo(
        target.x - (deltaX / length) * halfWidth * 2 + normalX * halfWidth * 1.8,
        target.y - (deltaY / length) * halfWidth * 2 + normalY * halfWidth * 1.8,
      )
      .stroke({ color, width: 4, alpha: lineAlpha, cap: "round" });
  } else {
    graphics
      .ellipse(target.x, target.y, projection.pitch * radius, projection.depthPitch * radius)
      .fill({ color, alpha: fillAlpha })
      .stroke({ color, width: 3, alpha: lineAlpha });
  }

  const markerSize = Math.max(8, projection.tileWidth * 0.2);
  if (preview.visualKind === "bomb") {
    graphics
      .circle(target.x, target.y - markerSize * 0.18, markerSize * 0.55)
      .fill({ color: 0x1a2024, alpha: 0.72 })
      .stroke({ color, width: 3, alpha: lineAlpha })
      .moveTo(target.x + markerSize * 0.28, target.y - markerSize * 0.62)
      .quadraticCurveTo(
        target.x + markerSize * 0.72,
        target.y - markerSize * 1.05,
        target.x + markerSize * 0.95,
        target.y - markerSize * 0.72,
      )
      .stroke({ color: 0xffc857, width: 3, alpha: lineAlpha, cap: "round" });
  } else if (preview.targetMode !== "direction") {
    graphics
      .moveTo(target.x - markerSize, target.y)
      .lineTo(target.x + markerSize, target.y)
      .moveTo(target.x, target.y - markerSize * ARENA_DEPTH_SCALE)
      .lineTo(target.x, target.y + markerSize * ARENA_DEPTH_SCALE)
      .stroke({ color, width: 2.5, alpha: lineAlpha, cap: "round" });
  }

  if (preview.castRange > 0 && preview.targetMode === "ground") {
    graphics
      .ellipse(
        source.x,
        source.y,
        projection.pitch * preview.castRange,
        projection.depthPitch * preview.castRange,
      )
      .stroke({ color, width: 1.5, alpha: 0.28 });
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
    background: "#0c2830",
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

  let visualAssets: ArenaVisualAssets | null = null;
  host.dataset.visualAssets = "loading";

  const oceanLayer = new Container();
  const tiles = new Graphics();
  const terrainSprites = new Container();
  terrainSprites.sortableChildren = true;
  const artillery = new Graphics();
  const pirateShipSprites = new Container();
  const projectileSprites = new Container();
  const items = new Graphics();
  const itemSprites = new Container();
  const skillZoneSprites = new Container();
  const participants = new Graphics();
  const participantSprites = new Container();
  const actionFeedback = new Graphics();
  const effectLayer = new Graphics();
  const skillEffectSprites = new Container();
  const aimingLayer = new Graphics();
  const impactSprites = new Container();
  const artilleryLabels = new Container();
  const artilleryLabelsByShip = new Map<number, Text>();
  participantSprites.sortableChildren = true;
  application.stage.addChild(
    oceanLayer,
    tiles,
    terrainSprites,
    artillery,
    pirateShipSprites,
    projectileSprites,
    items,
    itemSprites,
    skillZoneSprites,
    participants,
    participantSprites,
    actionFeedback,
    effectLayer,
    skillEffectSprites,
    aimingLayer,
    impactSprites,
    artilleryLabels,
  );
  const itemSpritesById = new Map<number, Sprite>();
  const terrainSpritesByTileId = new Map<string, Sprite>();
  const treeSpritesByTileId = new Map<string, Sprite>();
  const bombSpritesByKey = new Map<string, Sprite>();
  const pirateShipSpritesById = new Map<number, Sprite>();
  const treasureShipSpritesById = new Map<number, Sprite>();
  const cannonSpritesByShotId = new Map<number, Sprite>();
  const rockSpritesByShotId = new Map<number, Sprite>();
  const participantSpritesByActorId = new Map<number, Sprite>();
  const boatSpritesByActorId = new Map<number, Sprite>();
  const aegisSpritesByActorId = new Map<number, Sprite>();
  const stunnedSpritesByActorId = new Map<number, Sprite>();
  const impactSpritesByEffectKey = new Map<string, Sprite>();
  const skillEffectSpritesByKey = new Map<string, Sprite>();
  const skillZoneSpritesById = new Map<number, Sprite>();
  const eventLedger = new SimulationEventLedger();
  const castAnimationsByActorId = new Map<number, CharacterCastAnimation>();
  const hitAnimationsByActorId = new Map<number, CharacterHitAnimation>();
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionPreference.matches;
  let visualEffects: readonly VisualEffect[] = Object.freeze([]);
  let latestFrame: RenderFrameV1 | undefined;
  let latestInterpolationAlpha = 0;
  let latestHumanActorId = 1;
  let latestAimPreview: ArenaAimPreview | null = null;
  let spectatorCamera: Vector2 | undefined;
  let spectatorRoundId: number | undefined;
  let tileLayerDirty = true;
  let oceanSprite: Sprite | undefined;

  const getPresentationCamera = (projection: ArenaProjection): Vector2 => {
    if (latestFrame === undefined) {
      return Object.freeze({ x: 0, y: 0 });
    }
    const camera = createCameraOffset(
      latestFrame,
      application.screen.width,
      application.screen.height,
      projection,
      latestHumanActorId,
      latestInterpolationAlpha,
    );
    if (!isSpectatorFrame(latestFrame, latestHumanActorId)) {
      spectatorCamera = undefined;
      return camera;
    }

    spectatorCamera = clampCameraOffset(
      latestFrame,
      application.screen.width,
      application.screen.height,
      projection,
      spectatorCamera ?? camera,
    );
    return spectatorCamera;
  };

  const draw = (): void => {
    if (latestFrame === undefined) {
      return;
    }

    const projection = createArenaProjection(application.screen.width, application.screen.height);
    const presentationCamera = getPresentationCamera(projection);

    if (visualAssets?.oceanTexture !== null && visualAssets?.oceanTexture !== undefined) {
      if (oceanSprite === undefined) {
        oceanSprite = new Sprite(visualAssets.oceanTexture);
        oceanLayer.addChild(oceanSprite);
      }

      oceanSprite.width = application.screen.width;
      oceanSprite.height = application.screen.height;
      oceanSprite.alpha = 0.92;
    }

    for (const layer of [
      tiles,
      terrainSprites,
      artillery,
      pirateShipSprites,
      projectileSprites,
      items,
      itemSprites,
      skillZoneSprites,
      participants,
      participantSprites,
      actionFeedback,
      effectLayer,
      skillEffectSprites,
      aimingLayer,
      impactSprites,
      artilleryLabels,
    ]) {
      layer.x = presentationCamera.x;
      layer.y = presentationCamera.y;
    }
    host.dataset.cameraX = presentationCamera.x.toFixed(2);
    host.dataset.cameraY = presentationCamera.y.toFixed(2);
    host.dataset.cameraMode = isSpectatorFrame(latestFrame, latestHumanActorId)
      ? "spectator"
      : "follow";
    host.dataset.cameraShake = "0.00";
    host.dataset.projectionAngle = ARENA_CAMERA_ELEVATION_DEGREES.toString();
    host.dataset.projectionScaleY = ARENA_DEPTH_SCALE.toFixed(4);
    host.dataset.cliffDepth = projection.cliffDepth.toFixed(2);
    items.clear();
    artillery.clear();
    participants.clear();
    actionFeedback.clear();
    effectLayer.clear();
    aimingLayer.clear();
    const mayhem = latestFrame.participants.length >= 25;

    if (tileLayerDirty) {
      tiles.clear();
      const supportedTileIds = new Set<string>(
        latestFrame.tiles.filter(({ state }) => state !== "Void").map(({ tileId }) => tileId),
      );

      const hasGeneratedTerrain =
        visualAssets?.terrainTextures !== null && visualAssets?.terrainTextures !== undefined;

      if (!hasGeneratedTerrain) {
        for (const tile of latestFrame.tiles) {
          drawTileCliff(
            tiles,
            tile,
            projection,
            supportedTileIds.has(`${tile.column}:${tile.row + 1}`),
          );
        }
      }

      for (const tile of latestFrame.tiles) {
        if (hasGeneratedTerrain) {
          continue;
        }

        const isShore =
          !supportedTileIds.has(`${tile.column - 1}:${tile.row}`) ||
          !supportedTileIds.has(`${tile.column + 1}:${tile.row}`) ||
          !supportedTileIds.has(`${tile.column}:${tile.row - 1}`) ||
          !supportedTileIds.has(`${tile.column}:${tile.row + 1}`);
        drawTile(tiles, tile, projection, isShore);
      }

      tileLayerDirty = false;
    }

    if (visualAssets !== null) {
      host.dataset.terrainSprites = syncTerrainSprites(
        terrainSprites,
        terrainSpritesByTileId,
        latestFrame,
        projection,
        visualAssets,
        presentationCamera,
        application.screen.width,
        application.screen.height,
      ).toString();
    }

    const frameTick = latestFrame.tick;
    const dangerousCannonTargets = new Set(
      latestFrame.cannonShots
        .filter(({ dangerTick }) => frameTick >= dangerTick)
        .map(({ targetTileId }) => targetTileId),
    );

    for (const tile of latestFrame.tiles) {
      if (tile.state !== "Warning" && tile.state !== "Collapsing") {
        continue;
      }

      drawTileHazardMarker(
        artillery,
        tile,
        tile.state === "Collapsing" || dangerousCannonTargets.has(tile.tileId),
        projection,
      );
    }

    for (const ship of latestFrame.pirateShips) {
      if (visualAssets?.pirateShipTexture === null || visualAssets === null) {
        drawPirateShip(artillery, ship, projection);
      }
    }

    for (const treasureShip of latestFrame.treasureShips) {
      if (visualAssets?.treasureShipTexture === null || visualAssets === null) {
        drawTreasureShip(artillery, treasureShip, projection);
      }
      const treasureShipPoint = projectArenaPoint(treasureShip.position, projection);
      const labelId = -1_000 - treasureShip.shipId;
      let treasureShipLabel = artilleryLabelsByShip.get(labelId);

      if (treasureShipLabel === undefined) {
        treasureShipLabel = new Text({
          text: "보물선",
          style: {
            fill: 0xffd166,
            fontFamily: "system-ui, sans-serif",
            fontSize: Math.max(12, projection.tileWidth * 0.22),
            fontWeight: "900",
            stroke: { color: 0x0f0c0e, width: 4 },
          },
        });
        treasureShipLabel.anchor.set(0.5, 1);
        artilleryLabelsByShip.set(labelId, treasureShipLabel);
        artilleryLabels.addChild(treasureShipLabel);
      }

      treasureShipLabel.style.fontSize = Math.max(12, projection.tileWidth * 0.22);
      treasureShipLabel.position.set(
        treasureShipPoint.x,
        treasureShipPoint.y -
          Math.max(projection.tileDepth * 1.35, getTreasureShipSpriteHeight(projection) * 0.62),
      );
    }

    if (visualAssets !== null) {
      syncPirateShipSprites(
        pirateShipSprites,
        pirateShipSpritesById,
        latestFrame,
        projection,
        visualAssets,
      );
      syncTreasureShipSprites(
        pirateShipSprites,
        treasureShipSpritesById,
        latestFrame.treasureShips,
        projection,
        visualAssets,
      );
    }

    for (const shot of latestFrame.cannonShots) {
      drawCannonShot(artillery, shot, latestFrame.tick, projection, reducedMotion);
    }

    for (const shot of latestFrame.rockShots) {
      drawRockShot(artillery, shot, latestFrame.tick, projection, reducedMotion);
    }

    for (const delivery of latestFrame.giftDeliveries) {
      drawGiftDelivery(artillery, delivery, latestFrame.tick, projection, reducedMotion);
    }

    if (visualAssets !== null) {
      syncProjectileSprites(
        projectileSprites,
        cannonSpritesByShotId,
        rockSpritesByShotId,
        latestFrame,
        projection,
        reducedMotion,
        visualAssets,
      );
    }

    for (const item of latestFrame.items) {
      drawItem(items, item, projection);
    }

    if (visualAssets !== null) {
      syncItemSprites(itemSprites, itemSpritesById, latestFrame, projection, visualAssets);
    }

    for (const bomb of latestFrame.bombs) {
      drawBomb(items, bomb, latestFrame.tick, projection, reducedMotion);
    }

    for (const patch of latestFrame.soapPatches) {
      drawSoapPatch(items, patch, projection, latestHumanActorId);
    }

    for (const zone of latestFrame.skillZones) {
      drawSkillZone(items, zone, latestFrame.tick, projection);
    }

    if (visualAssets !== null) {
      syncSkillZoneSprites(
        skillZoneSprites,
        skillZoneSpritesById,
        latestFrame,
        projection,
        reducedMotion,
        visualAssets,
      );
      syncPlacedItemSprites(
        itemSprites,
        bombSpritesByKey,
        latestFrame,
        projection,
        reducedMotion,
        visualAssets,
      );
    }

    const depthEntries = [
      ...latestFrame.participants.map((participant) => ({
        kind: "participant" as const,
        depth:
          participant.previousPosition.y +
          (participant.position.y - participant.previousPosition.y) * latestInterpolationAlpha +
          (participant.action === "Anchored" ? 0.45 : 0),
        sortKey: `participant:${participant.actorId.toString().padStart(4, "0")}`,
        participant,
      })),
      ...latestFrame.brickWalls.map((wall) => ({
        kind: "brick-wall" as const,
        depth: wall.row + 0.72,
        sortKey: `wall:${wall.tileId}`,
        wall,
      })),
      ...latestFrame.trees.map((tree) => ({
        kind: "tree" as const,
        depth: tree.row + 0.62,
        sortKey: `tree:${tree.tileId}`,
        tree,
      })),
    ].toSorted(
      (left, right) => left.depth - right.depth || left.sortKey.localeCompare(right.sortKey),
    );
    const humanParticipant = latestFrame.participants.find(
      ({ actorId }) => actorId === latestHumanActorId,
    );
    const hasCharacterArtwork =
      visualAssets !== null &&
      ((visualAssets.characterTextures?.length ?? 0) > 0 ||
        (visualAssets.characterMotionTextures?.length ?? 0) > 0);

    for (const entry of depthEntries) {
      if (entry.kind === "brick-wall") {
        drawBrickWall(participants, entry.wall, projection);
      } else if (entry.kind === "tree") {
        if (visualAssets?.treeTexture === null || visualAssets === null) {
          drawTreeObstacle(participants, entry.tree, projection);
        }
      } else {
        drawParticipant(
          participants,
          entry.participant,
          latestHumanActorId,
          projection,
          latestInterpolationAlpha,
          reducedMotion,
          mayhem,
          latestFrame.tick,
          hasCharacterArtwork,
        );
      }
    }

    if (visualAssets !== null) {
      syncTreeSprites(
        participantSprites,
        treeSpritesByTileId,
        latestFrame,
        projection,
        visualAssets,
      );
      syncParticipantSprites(
        participantSprites,
        participantSpritesByActorId,
        boatSpritesByActorId,
        latestFrame,
        projection,
        latestInterpolationAlpha,
        reducedMotion,
        visualAssets,
        castAnimationsByActorId,
        hitAnimationsByActorId,
      );
      syncAegisSprites(
        participantSprites,
        aegisSpritesByActorId,
        latestFrame,
        projection,
        latestInterpolationAlpha,
        reducedMotion,
        visualAssets,
      );
      syncStunnedSprites(
        participantSprites,
        stunnedSpritesByActorId,
        latestFrame,
        projection,
        latestInterpolationAlpha,
        reducedMotion,
        visualAssets,
      );
    }

    for (const participant of latestFrame.participants) {
      if (!participant.active && participant.action === "Eliminated") {
        continue;
      }

      const worldX =
        participant.previousPosition.x +
        (participant.position.x - participant.previousPosition.x) * latestInterpolationAlpha;
      const worldY =
        participant.previousPosition.y +
        (participant.position.y - participant.previousPosition.y) * latestInterpolationAlpha;
      const point = projectArenaPoint({ x: worldX, y: worldY }, projection);
      const collisionRadius = participant.radius * projection.pitch;
      const visualRadius = collisionRadius * (1 + (participant.massFactor - 1) * 0.16);
      const distanceFromHuman =
        humanParticipant === undefined
          ? Number.POSITIVE_INFINITY
          : Math.hypot(
              participant.position.x - humanParticipant.position.x,
              participant.position.y - humanParticipant.position.y,
            );
      drawActionFeedback(
        actionFeedback,
        participant,
        point.x,
        point.y,
        visualRadius,
        projection,
        reducedMotion,
        !mayhem || participant.actorId === latestHumanActorId || distanceFromHuman <= 8,
        latestFrame.tick,
      );
      if (participant.actorId === latestHumanActorId || distanceFromHuman <= 5) {
        drawCombatBars(
          actionFeedback,
          participant,
          point.x,
          point.y,
          projection,
          participant.actorId === latestHumanActorId,
        );
      }
      drawFacingFeatures(
        actionFeedback,
        participant,
        point.x,
        point.y,
        visualRadius,
        !mayhem || participant.actorId === latestHumanActorId || distanceFromHuman <= 8,
      );
    }

    visualEffects = Object.freeze(
      visualEffects.filter(
        (effect) => effect.roundId === latestFrame?.roundId && effect.endTick >= latestFrame.tick,
      ),
    );

    for (const effect of visualEffects) {
      const hasGeneratedSkillTexture =
        visualAssets !== null &&
        effect.skillDefinitionId !== undefined &&
        visualAssets.skillEffectTextures[effect.skillDefinitionId] !== undefined;
      if (
        shouldDrawProceduralWorldEffect(
          effect.kind,
          effect.skillDefinitionId,
          hasGeneratedSkillTexture,
        )
      ) {
        drawWorldEffect(effectLayer, effect, latestFrame.tick, projection, reducedMotion);
      }
    }

    if (visualAssets !== null) {
      syncSkillEffectSprites(
        skillEffectSprites,
        skillEffectSpritesByKey,
        visualEffects,
        latestFrame.tick,
        projection,
        reducedMotion,
        visualAssets,
      );
    }

    if (latestAimPreview !== null) {
      drawAimPreview(aimingLayer, latestAimPreview, projection);
    }

    if (visualAssets !== null) {
      syncImpactSprites(
        impactSprites,
        impactSpritesByEffectKey,
        visualEffects,
        latestFrame.tick,
        projection,
        reducedMotion,
        visualAssets,
      );
    }
  };

  const present = (): void => {
    if (destroyed || rendererLost || latestFrame === undefined) {
      return;
    }
    draw();
    application.render();
  };

  let destroyed = false;
  let rendererLost = false;
  let scheduledPresentationId: number | undefined;
  const invalidatePresentation = (): void => {
    if (
      destroyed ||
      rendererLost ||
      latestFrame === undefined ||
      scheduledPresentationId !== undefined
    ) {
      return;
    }
    scheduledPresentationId = window.requestAnimationFrame(() => {
      scheduledPresentationId = undefined;
      present();
    });
  };

  void loadArenaVisualAssets()
    .then((loadedAssets) => {
      if (destroyed) {
        return undefined;
      }
      visualAssets = loadedAssets;
      const loadedAssetCount = [
        loadedAssets.characterTextures,
        loadedAssets.characterMotionTextures,
        loadedAssets.itemTextures,
        loadedAssets.pirateShipTexture,
        loadedAssets.treasureShipTexture,
        loadedAssets.cannonballTexture,
        loadedAssets.lethalBoulderTexture,
        loadedAssets.impactExplosionTexture,
        loadedAssets.seawaterImpactTexture,
        loadedAssets.terrainTextures,
        loadedAssets.treeTexture,
        loadedAssets.stunnedTexture,
        Object.keys(loadedAssets.skillEffectTextures).length === SKILL_DEFINITION_IDS.length
          ? loadedAssets.skillEffectTextures
          : null,
      ].filter((asset) => asset !== null).length;
      host.dataset.skillEffectAssets = Object.keys(
        loadedAssets.skillEffectTextures,
      ).length.toString();
      host.dataset.visualAssets =
        loadedAssetCount === 0
          ? "procedural-fallback"
          : loadedAssetCount === 13
            ? "generated"
            : "partial";

      tileLayerDirty = true;
      invalidatePresentation();
      return undefined;
    })
    .catch(() => {
      if (!destroyed) {
        visualAssets = null;
        host.dataset.visualAssets = "procedural-fallback";
        invalidatePresentation();
      }
      return undefined;
    });

  const handleMotionPreference = (event: MediaQueryListEvent): void => {
    reducedMotion = event.matches;
    host.dataset.motion = reducedMotion ? "reduced" : "full";
    invalidatePresentation();
  };
  const handleResize = (): void => {
    tileLayerDirty = true;
    invalidatePresentation();
  };
  const handleContextLost = (event: Event): void => {
    event.preventDefault();
    rendererLost = true;
    host.dataset.renderer = "lost";
    options.onContextLost?.();
  };
  const handleContextRestored = (): void => {
    rendererLost = false;
    host.dataset.renderer = "ready";
    invalidatePresentation();
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
      for (const event of accepted) {
        if (event.kind === "skill-used" && event.actorId !== undefined) {
          castAnimationsByActorId.set(
            event.actorId,
            Object.freeze({
              endTick: event.tick + (reducedMotion ? 3 : 14),
              roundId: event.roundId,
              startTick: event.tick,
            }),
          );
        }
        if (
          event.kind === "damage-applied" &&
          event.targetActorId !== undefined &&
          (event.amount ?? 0) > 0
        ) {
          hitAnimationsByActorId.set(
            event.targetActorId,
            Object.freeze({
              endTick: event.tick + (reducedMotion ? 3 : 10),
              roundId: event.roundId,
            }),
          );
        }
      }
      for (const [actorId, animation] of castAnimationsByActorId) {
        if (animation.roundId !== frame.roundId || animation.endTick < frame.tick) {
          castAnimationsByActorId.delete(actorId);
        }
      }
      for (const [actorId, animation] of hitAnimationsByActorId) {
        if (animation.roundId !== frame.roundId || animation.endTick < frame.tick) {
          hitAnimationsByActorId.delete(actorId);
        }
      }
      tileLayerDirty ||= accepted.some(
        ({ kind }) => kind === "tile-warning" || kind === "tile-collapsing" || kind === "tile-void",
      );
      const durationTicks = reducedMotion ? 3 : frame.participants.length >= 25 ? 7 : 12;
      const cap = frame.participants.length >= 25 ? MAYHEM_EFFECT_CAP : NORMAL_EFFECT_CAP;
      const appended = accepted.flatMap((event): readonly VisualEffect[] => {
        if (!isVisualEffectKind(event.kind)) {
          return [];
        }

        if (
          event.kind === "status-applied" &&
          event.skillDefinitionId !== undefined &&
          PROJECTILE_SKILL_EFFECTS.has(event.skillDefinitionId)
        ) {
          return [];
        }

        const position = getEffectPosition(event, frame);

        if (position === undefined) {
          return [];
        }

        const actorPosition = frame.participants.find(
          ({ actorId }) => actorId === event.actorId,
        )?.position;
        const travelsAsProjectile =
          !reducedMotion &&
          event.kind === "skill-hit" &&
          event.skillDefinitionId !== undefined &&
          PROJECTILE_SKILL_EFFECTS.has(event.skillDefinitionId) &&
          actorPosition !== undefined;
        const travelTicks = travelsAsProjectile
          ? getSkillProjectileTravelTicks(vectorLength(subtractVectors(position, actorPosition)))
          : 0;
        const travelEndTick = travelsAsProjectile ? event.tick + travelTicks : undefined;
        const impactDuration =
          event.kind === "tile-void" || event.kind === "rock-impact"
            ? reducedMotion
              ? 5
              : 18
            : event.kind === "grappling-hook-hit"
              ? 10
              : durationTicks;

        return [
          Object.freeze({
            key: `${event.roundId}:${event.tick}:${event.sequence}`,
            kind: event.kind,
            roundId: event.roundId,
            startTick: event.tick,
            endTick: (travelEndTick ?? event.tick) + impactDuration,
            position,
            originPosition: travelsAsProjectile ? actorPosition : undefined,
            travelEndTick,
            vector: event.vector,
            itemDefinitionId: event.itemDefinitionId,
            skillDefinitionId: event.skillDefinitionId,
          }),
        ];
      });
      visualEffects = Object.freeze([...visualEffects, ...appended].slice(-cap));
    },
    destroy(): void {
      destroyed = true;
      if (scheduledPresentationId !== undefined) {
        window.cancelAnimationFrame(scheduledPresentationId);
        scheduledPresentationId = undefined;
      }
      application.renderer.off("resize", handleResize);
      motionPreference.removeEventListener("change", handleMotionPreference);
      application.canvas.removeEventListener("webglcontextlost", handleContextLost);
      application.canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      application.destroy(true, { children: true });
    },
    panSpectatorByScreen(deltaX: number, deltaY: number): boolean {
      if (
        latestFrame === undefined ||
        !isSpectatorFrame(latestFrame, latestHumanActorId) ||
        !Number.isFinite(deltaX) ||
        !Number.isFinite(deltaY)
      ) {
        return false;
      }

      const projection = createArenaProjection(application.screen.width, application.screen.height);
      const currentCamera = getPresentationCamera(projection);
      const requestedCamera = Object.freeze({
        x: currentCamera.x + deltaX,
        y: currentCamera.y + deltaY,
      });
      const camera = clampCameraOffset(
        latestFrame,
        application.screen.width,
        application.screen.height,
        projection,
        requestedCamera,
      );
      const moved =
        Math.abs(camera.x - currentCamera.x) > 0.01 || Math.abs(camera.y - currentCamera.y) > 0.01;
      spectatorCamera = camera;
      if (!moved) {
        return false;
      }
      invalidatePresentation();
      return true;
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

      const roundChanged = latestFrame?.roundId !== frame.roundId;
      tileLayerDirty ||= roundChanged;
      if (roundChanged || spectatorRoundId !== frame.roundId) {
        spectatorCamera = undefined;
        spectatorRoundId = frame.roundId;
      }
      latestFrame = frame;
      visualEffects = Object.freeze(
        visualEffects.filter((effect) => effect.roundId === frame.roundId),
      );
      latestInterpolationAlpha = clamp(interpolationAlpha, 0, 1);
      latestHumanActorId = humanActorId;
      if (scheduledPresentationId !== undefined) {
        window.cancelAnimationFrame(scheduledPresentationId);
        scheduledPresentationId = undefined;
      }
      present();
    },
    resetSpectatorCamera(): void {
      spectatorCamera = undefined;
      invalidatePresentation();
    },
    screenToWorld(clientX: number, clientY: number): Vector2 | undefined {
      if (latestFrame === undefined) {
        return undefined;
      }
      const bounds = host.getBoundingClientRect();
      if (
        bounds.width <= 0 ||
        bounds.height <= 0 ||
        clientX < bounds.left ||
        clientX > bounds.right ||
        clientY < bounds.top ||
        clientY > bounds.bottom
      ) {
        return undefined;
      }
      const projection = createArenaProjection(application.screen.width, application.screen.height);
      const camera = getPresentationCamera(projection);
      return Object.freeze({
        x: (clientX - bounds.left - camera.x - projection.originX) / projection.pitch,
        y: (clientY - bounds.top - camera.y - projection.originY) / projection.depthPitch,
      });
    },
    setAimPreview(preview: ArenaAimPreview | null): void {
      latestAimPreview = preview;
      if (preview === null) {
        host.removeAttribute("data-targeting");
      } else {
        host.dataset.targeting = preview.valid ? "valid" : "invalid";
      }
    },
  });
}
