import { clamp, type Vector2 } from "../simulation/math";

export const ARENA_CAMERA_ELEVATION_DEGREES = 58;
export const ARENA_DEPTH_SCALE = Math.sin((ARENA_CAMERA_ELEVATION_DEGREES * Math.PI) / 180);
export const ARENA_TILE_GAP = 4;
export const ARENA_SHADOW_OFFSET_SCALE = clamp((1 - ARENA_DEPTH_SCALE) * 4.5, 0.18, 0.55);

export interface ArenaProjection {
  readonly originX: number;
  readonly originY: number;
  readonly pitch: number;
  readonly depthPitch: number;
  readonly tileWidth: number;
  readonly tileDepth: number;
  readonly cliffDepth: number;
}

export function createArenaProjection(width: number, height: number): ArenaProjection {
  const compact = width <= 820;
  const visibleColumns = compact ? 10 : 18;
  const visibleRows = compact ? 12 : 11;
  const verticalBudget = visibleRows * ARENA_DEPTH_SCALE + 0.22;
  const pitch = clamp(Math.min(width / visibleColumns, height / verticalBudget), 28, 68);
  const tileWidth = pitch - ARENA_TILE_GAP;

  return Object.freeze({
    originX: 0,
    originY: 0,
    pitch,
    depthPitch: pitch * ARENA_DEPTH_SCALE,
    tileWidth,
    tileDepth: tileWidth * ARENA_DEPTH_SCALE,
    cliffDepth: clamp(tileWidth * 0.22, 6, 14),
  });
}

export function projectArenaPoint(position: Vector2, projection: ArenaProjection): Vector2 {
  return {
    x: projection.originX + position.x * projection.pitch - ARENA_TILE_GAP / 2,
    y:
      projection.originY +
      position.y * projection.depthPitch -
      (ARENA_TILE_GAP * ARENA_DEPTH_SCALE) / 2,
  };
}

export function projectArenaVector(vector: Vector2): Vector2 {
  return { x: vector.x, y: vector.y * ARENA_DEPTH_SCALE };
}

export function getProjectedArenaSize(
  columns: number,
  rows: number,
  projection: ArenaProjection,
): { readonly width: number; readonly height: number } {
  return {
    width: (columns - 1) * projection.pitch + projection.tileWidth,
    height: (rows - 1) * projection.depthPitch + projection.tileDepth + projection.cliffDepth,
  };
}
