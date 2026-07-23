import { Application, Graphics } from "pixi.js";
import type {
  ParticipantActionKind,
  RenderFrameV1,
  RenderItemV1,
  RenderParticipantV1,
  SimulationEventV1,
  TileState,
} from "../simulation/contracts";
import { clamp, type Vector2 } from "../simulation/math";
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

interface ArenaTransform {
  readonly originX: number;
  readonly originY: number;
  readonly pitch: number;
  readonly tileSize: number;
}

type VisualEffectKind =
  | "shove-hit"
  | "shove-missed"
  | "dodge-succeeded"
  | "falling-started"
  | "item-picked-up";

interface VisualEffect {
  readonly key: string;
  readonly kind: VisualEffectKind;
  readonly roundId: number;
  readonly startTick: number;
  readonly endTick: number;
  readonly position: Vector2;
  readonly vector: Vector2 | undefined;
}

const TILE_GAP = 4;
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
  Stumbling: 0xd58bea,
  Anchored: 0x9ca5a1,
  Falling: 0x727b78,
  Eliminated: 0x727b78,
});
const ITEM_COLORS = Object.freeze({
  "iron-boots": 0x56626f,
  feather: 0xe9f5ff,
  "spring-glove": 0xff8f5c,
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

function createTransform(width: number, height: number): ArenaTransform {
  const compact = width <= 820;
  const visibleColumns = compact ? 10 : 18;
  const visibleRows = compact ? 12 : 11;
  const pitch = clamp(Math.min(width / visibleColumns, height / visibleRows), 28, 68);
  const tileSize = pitch - TILE_GAP;
  return Object.freeze({ originX: 0, originY: 0, pitch, tileSize });
}

function createCameraOffset(
  frame: RenderFrameV1,
  width: number,
  height: number,
  transform: ArenaTransform,
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
  const worldWidth = (columns - 1) * transform.pitch + transform.tileSize;
  const worldHeight = (rows - 1) * transform.pitch + transform.tileSize;
  const oceanMargin = transform.tileSize * 1.35;
  const unclampedX = width / 2 - (focusX * transform.pitch - TILE_GAP / 2);
  const unclampedY = height / 2 - (focusY * transform.pitch - TILE_GAP / 2);
  const minimumX = width - worldWidth - oceanMargin;
  const maximumX = oceanMargin;
  const minimumY = height - worldHeight - oceanMargin;
  const maximumY = oceanMargin;
  const x = minimumX > maximumX ? (width - worldWidth) / 2 : clamp(unclampedX, minimumX, maximumX);
  const y =
    minimumY > maximumY ? (height - worldHeight) / 2 : clamp(unclampedY, minimumY, maximumY);

  return Object.freeze({ x, y });
}

function getActionColor(action: ParticipantActionKind): number {
  return ACTION_COLORS[action];
}

function drawTile(graphics: Graphics, tile: TileState, transform: ArenaTransform): void {
  if (tile.state === "Void") {
    return;
  }

  const x = transform.originX + tile.column * transform.pitch;
  const y = transform.originY + tile.row * transform.pitch;
  const radius = Math.max(2, transform.tileSize * 0.08);
  const fillColor =
    tile.state === "Stable" ? 0x2c3431 : tile.state === "Warning" ? 0x8a5a1e : 0x6b2a24;
  const strokeColor =
    tile.state === "Stable" ? 0x3d4743 : tile.state === "Warning" ? 0xffc857 : 0xff5c4d;

  graphics
    .roundRect(x, y, transform.tileSize, transform.tileSize, radius)
    .fill({ color: fillColor, alpha: tile.state === "Collapsing" ? 0.72 : 1 })
    .stroke({ color: strokeColor, width: tile.state === "Stable" ? 1 : 2 });

  if (tile.state === "Warning") {
    const inset = transform.tileSize * 0.2;
    graphics
      .moveTo(x + inset, y + transform.tileSize - inset)
      .lineTo(x + transform.tileSize - inset, y + inset)
      .stroke({ color: 0x2d2111, width: Math.max(2, transform.tileSize * 0.055) });
  }

  if (tile.state === "Collapsing") {
    const inset = transform.tileSize * 0.18;
    graphics
      .moveTo(x + inset, y + inset)
      .lineTo(x + transform.tileSize - inset, y + transform.tileSize - inset)
      .moveTo(x + transform.tileSize - inset, y + inset)
      .lineTo(x + inset, y + transform.tileSize - inset)
      .stroke({ color: 0x251414, width: Math.max(2, transform.tileSize * 0.07) });
  }
}

function drawDirection(
  graphics: Graphics,
  participant: RenderParticipantV1,
  x: number,
  y: number,
  radius: number,
): void {
  const length =
    participant.action === "ShoveActive"
      ? radius * 2.05
      : participant.action === "ShoveWindup"
        ? radius * 1.18
        : radius * 1.45;
  const endX = x + participant.facing.x * length;
  const endY = y + participant.facing.y * length;
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

function drawItem(graphics: Graphics, item: RenderItemV1, transform: ArenaTransform): void {
  const x = transform.originX + item.position.x * transform.pitch - TILE_GAP / 2;
  const y = transform.originY + item.position.y * transform.pitch - TILE_GAP / 2;
  const radius = Math.max(5, transform.tileSize * 0.16);
  const color = ITEM_COLORS[item.definitionId];

  graphics.circle(x, y, radius * 1.55).fill({ color: 0x101514, alpha: 0.72 });

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

function drawParticipant(
  graphics: Graphics,
  participant: RenderParticipantV1,
  humanActorId: number,
  transform: ArenaTransform,
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
  const x = transform.originX + worldX * transform.pitch - TILE_GAP / 2;
  const y = transform.originY + worldY * transform.pitch - TILE_GAP / 2;
  const collisionRadius = participant.radius * transform.pitch;
  const visualScale = 1 + (participant.massFactor - 1) * 0.16;
  const visualRadius = collisionRadius * visualScale;
  const isHuman = participant.actorId === humanActorId;
  const fillColor = isHuman
    ? 0xf6f5ef
    : (BOT_COLORS[(participant.actorId - 2) % BOT_COLORS.length] ?? 0xb8c1bd);
  const actionColor = getActionColor(participant.action);
  const hasIronBoots = participant.effects.some(
    ({ definitionId }) => definitionId === "iron-boots",
  );
  const hasFeather = participant.effects.some(({ definitionId }) => definitionId === "feather");
  const hasSpringGlove = participant.effects.some(
    ({ definitionId }) => definitionId === "spring-glove",
  );

  if (participant.action === "DodgeActive" && !reducedMotion && (!mayhem || isHuman)) {
    const previousX =
      transform.originX + participant.previousPosition.x * transform.pitch - TILE_GAP / 2;
    const previousY =
      transform.originY + participant.previousPosition.y * transform.pitch - TILE_GAP / 2;
    graphics.circle(previousX, previousY, visualRadius * 0.88).fill({
      color: actionColor,
      alpha: 0.2,
    });
  }

  graphics.circle(x, y, collisionRadius).stroke({
    color: 0x0a0d0c,
    width: Math.max(1, transform.tileSize * 0.035),
    alpha: 0.9,
  });

  if (isHuman) {
    const guardRadius = visualRadius + Math.max(5, transform.tileSize * 0.14);
    graphics.circle(x, y, guardRadius).stroke({
      color: 0x3b8cff,
      width: Math.max(2, transform.tileSize * 0.05),
      alpha: reducedMotion ? 0.4 : 0.55,
    });
    graphics
      .poly([x, y - visualRadius, x + visualRadius, y, x, y + visualRadius, x - visualRadius, y])
      .fill({ color: fillColor, alpha: participant.action === "Falling" ? 0.35 : 1 })
      .stroke({ color: 0x3b8cff, width: Math.max(3, transform.tileSize * 0.07) });
  } else {
    graphics
      .circle(x, y, visualRadius)
      .fill({ color: fillColor, alpha: participant.action === "Falling" ? 0.35 : 1 })
      .stroke({ color: actionColor, width: 2 });
  }

  const massRingRadius = visualRadius + Math.max(3, transform.tileSize * 0.06);
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
    const markerY = y - visualRadius - Math.max(6, transform.tileSize * 0.12);
    graphics.circle(x, markerY, Math.max(3, transform.tileSize * 0.07)).stroke({
      color: ITEM_COLORS["spring-glove"],
      width: participant.springBoosted ? 4 : 2,
    });
  }

  if (hasIronBoots || hasFeather) {
    const badgeX = x + visualRadius * 0.82;
    const badgeY = y - visualRadius * 0.82;
    const badgeSize = Math.max(2.5, transform.tileSize * 0.055);

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
  const actorId = event.kind === "shove-hit" ? event.targetActorId : event.actorId;
  return frame.participants.find((participant) => participant.actorId === actorId)?.position;
}

function isVisualEffectKind(kind: SimulationEventV1["kind"]): kind is VisualEffectKind {
  return (
    kind === "shove-hit" ||
    kind === "shove-missed" ||
    kind === "dodge-succeeded" ||
    kind === "falling-started" ||
    kind === "item-picked-up"
  );
}

function drawWorldEffect(
  graphics: Graphics,
  effect: VisualEffect,
  frameTick: number,
  transform: ArenaTransform,
  reducedMotion: boolean,
): void {
  const duration = Math.max(1, effect.endTick - effect.startTick);
  const progress = clamp((frameTick - effect.startTick) / duration, 0, 1);
  const x = transform.originX + effect.position.x * transform.pitch - TILE_GAP / 2;
  const y = transform.originY + effect.position.y * transform.pitch - TILE_GAP / 2;
  const baseRadius = Math.max(5, transform.tileSize * 0.14);
  const expansion = reducedMotion ? 1 : 1 + progress * 1.8;
  const alpha = Math.max(0, 1 - progress);

  if (effect.kind === "shove-hit") {
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
    const direction = effect.vector ?? { x: 1, y: 0 };
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

    const transform = createTransform(application.screen.width, application.screen.height);
    const camera = createCameraOffset(
      latestFrame,
      application.screen.width,
      application.screen.height,
      transform,
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
    items.clear();
    participants.clear();
    effectLayer.clear();
    const mayhem = latestFrame.participants.length >= 25;

    if (tileLayerDirty) {
      tiles.clear();

      for (const tile of latestFrame.tiles) {
        drawTile(tiles, tile, transform);
      }

      tileLayerDirty = false;
    }

    for (const item of latestFrame.items) {
      drawItem(items, item, transform);
    }

    for (const participant of latestFrame.participants) {
      drawParticipant(
        participants,
        participant,
        latestHumanActorId,
        transform,
        latestInterpolationAlpha,
        reducedMotion,
        mayhem,
      );
    }

    visualEffects = Object.freeze(
      visualEffects.filter(
        (effect) => effect.roundId === latestFrame?.roundId && effect.endTick >= latestFrame.tick,
      ),
    );

    for (const effect of visualEffects) {
      drawWorldEffect(effectLayer, effect, latestFrame.tick, transform, reducedMotion);
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
        if (!isVisualEffectKind(event.kind)) {
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
            endTick: event.tick + durationTicks,
            position,
            vector: event.vector,
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
