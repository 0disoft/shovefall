import { Application, Graphics } from "pixi.js";
import type {
  ParticipantActionKind,
  RenderFrameV1,
  RenderParticipantV1,
  TileState,
} from "../simulation/contracts";
import { clamp } from "../simulation/math";

export interface ArenaRenderer {
  destroy(): void;
  render(frame: RenderFrameV1, interpolationAlpha: number, humanActorId: number): void;
}

interface ArenaTransform {
  readonly originX: number;
  readonly originY: number;
  readonly pitch: number;
  readonly tileSize: number;
}

const TILE_GAP = 4;
const DEFAULT_RESOLUTION_CAP = 1.5;
const MAYHEM_RESOLUTION_CAP = 1;
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

function getArenaDimensions(frame: RenderFrameV1): { columns: number; rows: number } {
  return frame.tiles.reduce(
    (dimensions, tile) => ({
      columns: Math.max(dimensions.columns, tile.column + 1),
      rows: Math.max(dimensions.rows, tile.row + 1),
    }),
    { columns: 1, rows: 1 },
  );
}

function createTransform(frame: RenderFrameV1, width: number, height: number): ArenaTransform {
  const { columns, rows } = getArenaDimensions(frame);
  const tileSize = Math.max(
    8,
    Math.min(
      (width * 0.88 - TILE_GAP * (columns - 1)) / columns,
      (height * 0.88 - TILE_GAP * (rows - 1)) / rows,
    ),
  );
  const pitch = tileSize + TILE_GAP;
  const arenaWidth = tileSize * columns + TILE_GAP * (columns - 1);
  const arenaHeight = tileSize * rows + TILE_GAP * (rows - 1);
  return Object.freeze({
    originX: (width - arenaWidth) / 2,
    originY: (height - arenaHeight) / 2,
    pitch,
    tileSize,
  });
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
    tile.state === "Stable" ? 0x46524e : tile.state === "Warning" ? 0xb9852c : 0x8f3f38;
  const strokeColor =
    tile.state === "Stable" ? 0x5b6863 : tile.state === "Warning" ? 0xffd278 : 0xff796e;

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
    participant.action === "ShoveActive" || participant.action === "ShoveWindup"
      ? radius * 2.4
      : radius * 1.45;
  graphics
    .moveTo(x, y)
    .lineTo(x + participant.facing.x * length, y + participant.facing.y * length)
    .stroke({
      color: getActionColor(participant.action),
      width: participant.action === "ShoveActive" ? 4 : 2,
      cap: "round",
    });
}

function drawParticipant(
  graphics: Graphics,
  participant: RenderParticipantV1,
  humanActorId: number,
  transform: ArenaTransform,
  interpolationAlpha: number,
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

  if (participant.action === "DodgeActive") {
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
    graphics
      .poly([x, y - visualRadius, x + visualRadius, y, x, y + visualRadius, x - visualRadius, y])
      .fill({ color: fillColor, alpha: participant.action === "Falling" ? 0.35 : 1 })
      .stroke({ color: 0x3b8cff, width: 3 });
  } else {
    graphics
      .circle(x, y, visualRadius)
      .fill({ color: fillColor, alpha: participant.action === "Falling" ? 0.35 : 1 })
      .stroke({ color: actionColor, width: 2 });
  }

  const massRingRadius = visualRadius + Math.max(3, transform.tileSize * 0.06);
  graphics.circle(x, y, massRingRadius).stroke({
    color: actionColor,
    width: Math.max(1, participant.massFactor * 1.6),
    alpha: 0.78,
  });

  drawDirection(graphics, participant, x, y, visualRadius);

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

export async function createArenaRenderer(host: HTMLElement): Promise<ArenaRenderer> {
  const application = new Application();

  await application.init({
    antialias: true,
    autoDensity: true,
    autoStart: false,
    background: "#101514",
    preference: "webgl",
    resolution: Math.min(window.devicePixelRatio, DEFAULT_RESOLUTION_CAP),
    resizeTo: host,
  });
  application.ticker.stop();
  application.canvas.className = "arena-canvas";
  application.canvas.setAttribute("aria-hidden", "true");
  application.canvas.tabIndex = -1;
  host.replaceChildren(application.canvas);

  const tiles = new Graphics();
  const participants = new Graphics();
  application.stage.addChild(tiles, participants);
  let latestFrame: RenderFrameV1 | undefined;
  let latestInterpolationAlpha = 0;
  let latestHumanActorId = 1;

  const draw = (): void => {
    if (latestFrame === undefined) {
      return;
    }

    const transform = createTransform(
      latestFrame,
      application.screen.width,
      application.screen.height,
    );
    tiles.clear();
    participants.clear();

    for (const tile of latestFrame.tiles) {
      drawTile(tiles, tile, transform);
    }

    for (const participant of latestFrame.participants) {
      drawParticipant(
        participants,
        participant,
        latestHumanActorId,
        transform,
        latestInterpolationAlpha,
      );
    }
  };

  application.renderer.on("resize", draw);

  return Object.freeze({
    destroy(): void {
      application.renderer.off("resize", draw);
      application.destroy(true, { children: true });
    },
    render(frame: RenderFrameV1, interpolationAlpha: number, humanActorId: number): void {
      const resolutionCap =
        frame.participants.length >= 25 ? MAYHEM_RESOLUTION_CAP : DEFAULT_RESOLUTION_CAP;
      const desiredResolution = Math.min(window.devicePixelRatio, resolutionCap);

      if (application.renderer.resolution !== desiredResolution) {
        application.renderer.resolution = desiredResolution;
        application.renderer.resize(host.clientWidth, host.clientHeight);
      }

      latestFrame = frame;
      latestInterpolationAlpha = clamp(interpolationAlpha, 0, 1);
      latestHumanActorId = humanActorId;
      draw();
    },
  });
}
