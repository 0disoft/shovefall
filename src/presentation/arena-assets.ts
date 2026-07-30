import { Assets, Rectangle, Texture } from "pixi.js";
import { SKILL_DEFINITION_IDS } from "../content/skills";
import type { ItemDefinitionId, SkillDefinitionId } from "../simulation/contracts";
import type { CharacterAnimationState } from "./character-motion";

const CHARACTER_ATLAS_URL = new URL("../assets/generated/character-variants.png", import.meta.url)
  .href;
const CHARACTER_MOTION_ATLAS_URLS = Object.freeze([
  new URL("../assets/generated/character-motion-1.png", import.meta.url).href,
  new URL("../assets/generated/character-motion-2.png", import.meta.url).href,
  new URL("../assets/generated/character-motion-3.png", import.meta.url).href,
  new URL("../assets/generated/character-motion-4.png", import.meta.url).href,
]);
const ITEM_ATLAS_URL = new URL("../assets/generated/item-icons.png", import.meta.url).href;
const PIRATE_SHIP_URL = new URL("../assets/generated/pirate-ship-galleon.png", import.meta.url)
  .href;
const TREASURE_SHIP_URL = new URL("../assets/generated/treasure-ship.png", import.meta.url).href;
const CANNONBALL_URL = new URL("../assets/generated/cannonball-projectile.png", import.meta.url)
  .href;
const LETHAL_BOULDER_URL = new URL("../assets/generated/lethal-boulder.png", import.meta.url).href;
const IMPACT_EXPLOSION_URL = new URL("../assets/generated/impact-explosion.png", import.meta.url)
  .href;
const SEAWATER_IMPACT_URL = new URL("../assets/generated/seawater-impact.png", import.meta.url)
  .href;
const TERRAIN_ATLAS_URL = new URL("../assets/generated/island-terrain-atlas.png", import.meta.url)
  .href;
const TREE_OBSTACLE_URL = new URL("../assets/generated/tree-obstacle.png", import.meta.url).href;
const STUN_STATUS_URL = new URL("../assets/generated/status-stunned.png", import.meta.url).href;
const SKILL_EFFECT_TEXTURE_URLS: Readonly<Record<SkillDefinitionId, string>> = Object.freeze({
  "blink-step": new URL("../assets/generated/skill-vfx-blink-step.png", import.meta.url).href,
  "arc-bolt": new URL("../assets/generated/skill-vfx-arc-bolt.png", import.meta.url).href,
  "chain-bind": new URL("../assets/generated/skill-vfx-chain-bind.png", import.meta.url).href,
  "meteor-mark": new URL("../assets/generated/skill-vfx-meteor-mark.png", import.meta.url).href,
  "frost-field": new URL("../assets/generated/skill-vfx-frost-field.png", import.meta.url).href,
  aegis: new URL("../assets/generated/skill-vfx-aegis.png", import.meta.url).href,
});

type AtlasFrame = readonly [x: number, y: number, width: number, height: number];
const ATLAS_SOURCE_SCALE = 0.5;
const CHARACTER_MOTION_CELL_SIZE = 192;
const CHARACTER_MOTION_STATES = Object.freeze([
  "idle",
  "walk",
  "cast",
  "hit",
] as const satisfies readonly CharacterAnimationState[]);

function createAtlasFrame(x: number, y: number, width: number, height: number): AtlasFrame {
  return Object.freeze([x, y, width, height]);
}

const CHARACTER_ATLAS_FRAMES: readonly AtlasFrame[] = Object.freeze([
  [80, 47, 167, 203],
  [309, 47, 169, 202],
  [527, 45, 186, 204],
  [769, 47, 170, 202],
  [80, 279, 167, 199],
  [289, 278, 193, 201],
  [529, 278, 178, 201],
  [767, 279, 172, 200],
  [75, 508, 170, 252],
  [308, 509, 167, 251],
  [542, 508, 169, 252],
  [762, 509, 179, 251],
  [71, 720, 177, 220],
  [305, 720, 171, 220],
  [522, 720, 186, 220],
  [769, 720, 171, 220],
]);
const CHARACTER_DISPLAY_SCALES: readonly number[] = Object.freeze([
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  220 / 168,
  220 / 169,
  220 / 168,
  220 / 168,
]);

const ITEM_ATLAS_FRAMES = Object.freeze({
  "iron-boots": Object.freeze([46, 54, 234, 208] as const),
  feather: Object.freeze([280, 48, 214, 206] as const),
  "spring-glove": Object.freeze([536, 68, 190, 188] as const),
  "brick-bag": Object.freeze([774, 66, 216, 192] as const),
  soap: Object.freeze([304, 562, 192, 172] as const),
  boat: Object.freeze([766, 334, 218, 174] as const),
  bomb: Object.freeze([64, 536, 196, 210] as const),
} satisfies Readonly<Partial<Record<ItemDefinitionId, AtlasFrame>>>);

const TERRAIN_ATLAS_SOURCE_FRAMES: readonly AtlasFrame[] = Object.freeze(
  [65, 345, 620, 895].flatMap((y, row) =>
    [55, 345, 615, 890].map((x, column) =>
      createAtlasFrame(x, y, [300, 290, 290, 300][column] ?? 290, [280, 270, 280, 285][row] ?? 280),
    ),
  ),
);
const TERRAIN_SURFACE_FRAMES: readonly AtlasFrame[] = Object.freeze(
  TERRAIN_ATLAS_SOURCE_FRAMES.map(([x, y, width]) =>
    createAtlasFrame(x + 55, y + 45, width - 110, 145),
  ),
);
const OCEAN_ATLAS_FRAME = createAtlasFrame(400, 940, 180, 145);
const TERRAIN_AUTOTILE_WIDTH = 256;
const TERRAIN_AUTOTILE_HEIGHT = 192;

export const TERRAIN_WATER_NORTH = 1;
export const TERRAIN_WATER_EAST = 2;
export const TERRAIN_WATER_SOUTH = 4;
export const TERRAIN_WATER_WEST = 8;
export const TERRAIN_INTERIOR_VARIANT_START = 16;
export const TERRAIN_DIAGONAL_VARIANT_START = TERRAIN_INTERIOR_VARIANT_START + 2;
export const TERRAIN_DIAGONAL_VARIANT_COUNT = 15;

export const TERRAIN_WATER_NORTH_EAST = 1;
export const TERRAIN_WATER_SOUTH_EAST = 2;
export const TERRAIN_WATER_SOUTH_WEST = 4;
export const TERRAIN_WATER_NORTH_WEST = 8;

const TERRAIN_WATER_SIDES = Object.freeze([
  TERRAIN_WATER_NORTH,
  TERRAIN_WATER_EAST,
  TERRAIN_WATER_SOUTH,
  TERRAIN_WATER_WEST,
]);
const TERRAIN_CARDINAL_FRAME_INDICES = Object.freeze([4, 5, 6, 7]);
const TERRAIN_DIAGONAL_SIDE_PAIRS = Object.freeze([
  Object.freeze([0, 1] as const),
  Object.freeze([1, 2] as const),
  Object.freeze([2, 3] as const),
  Object.freeze([3, 0] as const),
]);
const TERRAIN_DIRECT_FRAME_BY_MASK: readonly (number | undefined)[] = Object.freeze([
  0,
  4,
  5,
  undefined,
  6,
  undefined,
  undefined,
  undefined,
  7,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
]);
const TERRAIN_FALLBACK_FRAME_BY_MASK = Object.freeze([
  0, 4, 5, 10, 6, 0, 8, 8, 7, 11, 0, 10, 9, 9, 8, 0,
]);

export interface ArenaVisualAssets {
  readonly characterTextures: readonly Texture[] | null;
  readonly characterMotionTextures: readonly CharacterMotionTextures[] | null;
  readonly characterDisplayScales: readonly number[];
  readonly itemTextures: Readonly<Partial<Record<ItemDefinitionId, Texture>>> | null;
  readonly pirateShipTexture: Texture | null;
  readonly treasureShipTexture: Texture | null;
  readonly cannonballTexture: Texture | null;
  readonly lethalBoulderTexture: Texture | null;
  readonly impactExplosionTexture: Texture | null;
  readonly seawaterImpactTexture: Texture | null;
  readonly terrainTextures: readonly Texture[] | null;
  readonly oceanTexture: Texture | null;
  readonly treeTexture: Texture | null;
  readonly stunnedTexture: Texture | null;
  readonly skillEffectTextures: Readonly<Partial<Record<SkillDefinitionId, Texture>>>;
}

export function getTerrainDirectFrameIndex(waterMask: number): number | undefined {
  return TERRAIN_DIRECT_FRAME_BY_MASK[waterMask];
}

export type CharacterMotionTextures = Readonly<Record<CharacterAnimationState, Texture>>;

function createAtlasTexture(
  atlas: Texture,
  frame: AtlasFrame,
  label: string,
  sourceScale = ATLAS_SOURCE_SCALE,
): Texture {
  const [x, y, width, height] = frame;
  return new Texture({
    source: atlas.source,
    frame: new Rectangle(
      x * sourceScale,
      y * sourceScale,
      width * sourceScale,
      height * sourceScale,
    ),
    label,
  });
}

export function removeTerrainWaterPixels(pixels: Uint8ClampedArray): number {
  let removedPixels = 0;

  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const alpha = pixels[index + 3] ?? 0;
    const brightness = Math.max(red, green, blue);
    const darkness = Math.min(red, green, blue);
    const isBlueWater = blue >= 52 && blue - red >= 12 && green - red >= 7 && blue >= green - 14;
    const isWaterHighlight =
      brightness >= 150 && brightness - darkness <= 54 && blue >= red - 18 && green >= red - 18;
    const isWater = alpha > 0 && (isBlueWater || isWaterHighlight);

    if (!isWater) {
      continue;
    }

    pixels[index + 3] = 0;
    removedPixels += 1;
  }

  return removedPixels;
}

function getTerrainSideDistance(side: number, x: number, y: number): number {
  if (side === TERRAIN_WATER_NORTH) return y;
  if (side === TERRAIN_WATER_EAST) return 1 - x;
  if (side === TERRAIN_WATER_SOUTH) return 1 - y;
  return x;
}

export function composeTerrainAutotilePixels(
  basePixels: Uint8ClampedArray,
  coastPixels: readonly Uint8ClampedArray[],
  waterMask: number,
  width: number,
  height: number,
): Uint8ClampedArray {
  const expectedLength = width * height * 4;

  if (
    width < 1 ||
    height < 1 ||
    basePixels.length !== expectedLength ||
    coastPixels.length !== TERRAIN_WATER_SIDES.length ||
    coastPixels.some((pixels) => pixels.length !== expectedLength)
  ) {
    throw new RangeError("terrain autotile sources must share one positive RGBA extent");
  }

  const result = new Uint8ClampedArray(basePixels);
  const activeSideIndices = TERRAIN_WATER_SIDES.flatMap((side, index) =>
    (waterMask & side) === 0 ? [] : [index],
  );

  if (activeSideIndices.length === 0) {
    return result;
  }

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;

    if ((basePixels[offset + 3] ?? 0) === 0) {
      continue;
    }

    if (activeSideIndices.some((index) => (coastPixels[index]?.[offset + 3] ?? 0) === 0)) {
      result[offset] = 0;
      result[offset + 1] = 0;
      result[offset + 2] = 0;
      result[offset + 3] = 0;
      continue;
    }

    const x = ((pixel % width) + 0.5) / width;
    const y = (Math.floor(pixel / width) + 0.5) / height;
    const nearestSideIndex = activeSideIndices.reduce((nearest, candidate) => {
      const nearestSide = TERRAIN_WATER_SIDES[nearest] ?? TERRAIN_WATER_NORTH;
      const candidateSide = TERRAIN_WATER_SIDES[candidate] ?? TERRAIN_WATER_NORTH;
      return getTerrainSideDistance(candidateSide, x, y) < getTerrainSideDistance(nearestSide, x, y)
        ? candidate
        : nearest;
    });
    const source = coastPixels[nearestSideIndex] ?? basePixels;
    result[offset] = source[offset] ?? 0;
    result[offset + 1] = source[offset + 1] ?? 0;
    result[offset + 2] = source[offset + 2] ?? 0;
    result[offset + 3] = source[offset + 3] ?? 0;
  }

  return result;
}

export function composeTerrainDiagonalAutotilePixels(
  basePixels: Uint8ClampedArray,
  coastPixels: readonly Uint8ClampedArray[],
  diagonalWaterMask: number,
  width: number,
  height: number,
): Uint8ClampedArray {
  const expectedLength = width * height * 4;

  if (
    width < 1 ||
    height < 1 ||
    basePixels.length !== expectedLength ||
    coastPixels.length !== TERRAIN_WATER_SIDES.length ||
    coastPixels.some((pixels) => pixels.length !== expectedLength)
  ) {
    throw new RangeError("terrain diagonal sources must share one positive RGBA extent");
  }

  const result = new Uint8ClampedArray(basePixels);
  const activePairs = TERRAIN_DIAGONAL_SIDE_PAIRS.filter(
    (_, index) => (diagonalWaterMask & (1 << index)) !== 0,
  );

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    let edgeSource: Uint8ClampedArray | undefined;
    let transparent = false;

    for (const [firstIndex, secondIndex] of activePairs) {
      const first = coastPixels[firstIndex];
      const second = coastPixels[secondIndex];
      const firstOpaque = (first?.[offset + 3] ?? 0) !== 0;
      const secondOpaque = (second?.[offset + 3] ?? 0) !== 0;

      if (!firstOpaque && !secondOpaque) {
        transparent = true;
        break;
      }

      if (firstOpaque !== secondOpaque) {
        edgeSource = firstOpaque ? first : second;
      }
    }

    if (transparent) {
      result[offset] = 0;
      result[offset + 1] = 0;
      result[offset + 2] = 0;
      result[offset + 3] = 0;
      continue;
    }

    if (edgeSource !== undefined) {
      result[offset] = edgeSource[offset] ?? 0;
      result[offset + 1] = edgeSource[offset + 1] ?? 0;
      result[offset + 2] = edgeSource[offset + 2] ?? 0;
      result[offset + 3] = edgeSource[offset + 3] ?? 0;
    }
  }

  return result;
}

function isCanvasImageSource(value: unknown): value is CanvasImageSource {
  return (
    (typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap) ||
    (typeof HTMLImageElement !== "undefined" && value instanceof HTMLImageElement) ||
    (typeof HTMLCanvasElement !== "undefined" && value instanceof HTMLCanvasElement) ||
    (typeof SVGImageElement !== "undefined" && value instanceof SVGImageElement) ||
    (typeof HTMLVideoElement !== "undefined" && value instanceof HTMLVideoElement) ||
    (typeof OffscreenCanvas !== "undefined" && value instanceof OffscreenCanvas) ||
    (typeof VideoFrame !== "undefined" && value instanceof VideoFrame)
  );
}

function createTerrainCutoutTexture(
  atlas: Texture,
  frame: AtlasFrame,
  label: string,
): Texture | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }

  const [x, y, width, height] = frame;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (context === null) {
    return undefined;
  }

  const resource: unknown = atlas.source.resource;
  if (!isCanvasImageSource(resource)) {
    return undefined;
  }

  try {
    context.drawImage(resource, x, y, width, height, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    if (removeTerrainWaterPixels(imageData.data) === 0) {
      return undefined;
    }

    context.putImageData(imageData, 0, 0);
    const texture = Texture.from(canvas, true);
    texture.label = label;
    return texture;
  } catch {
    return undefined;
  }
}

function readTerrainFramePixels(
  resource: CanvasImageSource,
  frame: AtlasFrame,
  removeWater: boolean,
): Uint8ClampedArray | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }

  const [x, y, width, height] = frame;
  const canvas = document.createElement("canvas");
  canvas.width = TERRAIN_AUTOTILE_WIDTH;
  canvas.height = TERRAIN_AUTOTILE_HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (context === null) {
    return undefined;
  }

  try {
    context.drawImage(
      resource,
      x,
      y,
      width,
      height,
      0,
      0,
      TERRAIN_AUTOTILE_WIDTH,
      TERRAIN_AUTOTILE_HEIGHT,
    );
    const pixels = context.getImageData(0, 0, TERRAIN_AUTOTILE_WIDTH, TERRAIN_AUTOTILE_HEIGHT).data;

    if (removeWater) {
      removeTerrainWaterPixels(pixels);
    }

    return pixels;
  } catch {
    return undefined;
  }
}

function createTerrainAutotileTextures(atlas: Texture): readonly Texture[] | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }

  const resource: unknown = atlas.source.resource;
  if (!isCanvasImageSource(resource)) {
    return undefined;
  }

  const baseFrames = [0, 1, 2].map((frameIndex) => TERRAIN_SURFACE_FRAMES[frameIndex]);
  if (baseFrames.some((frame) => frame === undefined)) {
    return undefined;
  }

  const basePixels = baseFrames.map((frame) =>
    frame === undefined ? undefined : readTerrainFramePixels(resource, frame, false),
  );
  const coastPixels = TERRAIN_CARDINAL_FRAME_INDICES.map((frameIndex) => {
    const frame = TERRAIN_SURFACE_FRAMES[frameIndex];
    return frame === undefined ? undefined : readTerrainFramePixels(resource, frame, true);
  });

  if (
    basePixels.some((pixels) => pixels === undefined) ||
    coastPixels.some((pixels) => pixels === undefined)
  ) {
    return undefined;
  }

  const completeBasePixels = basePixels.filter(
    (pixels): pixels is Uint8ClampedArray => pixels !== undefined,
  );
  const completeCoastPixels = coastPixels.filter(
    (pixels): pixels is Uint8ClampedArray => pixels !== undefined,
  );
  const primaryBasePixels = completeBasePixels[0];

  if (primaryBasePixels === undefined) {
    return undefined;
  }

  const directMaskPixels = TERRAIN_DIRECT_FRAME_BY_MASK.map((frameIndex) => {
    if (frameIndex === undefined) {
      return undefined;
    }

    const frame = TERRAIN_SURFACE_FRAMES[frameIndex];
    return frame === undefined
      ? undefined
      : readTerrainFramePixels(resource, frame, frameIndex >= 4 && frameIndex <= 11);
  });

  try {
    const pixelSets = [
      ...Array.from({ length: 16 }, (_, waterMask) =>
        waterMask === 0
          ? primaryBasePixels
          : (directMaskPixels[waterMask] ??
            composeTerrainAutotilePixels(
              primaryBasePixels,
              completeCoastPixels,
              waterMask,
              TERRAIN_AUTOTILE_WIDTH,
              TERRAIN_AUTOTILE_HEIGHT,
            )),
      ),
      ...completeBasePixels.slice(1),
      ...Array.from({ length: TERRAIN_DIAGONAL_VARIANT_COUNT }, (_, index) =>
        composeTerrainDiagonalAutotilePixels(
          primaryBasePixels,
          completeCoastPixels,
          index + 1,
          TERRAIN_AUTOTILE_WIDTH,
          TERRAIN_AUTOTILE_HEIGHT,
        ),
      ),
    ];

    return Object.freeze(
      pixelSets.map((pixels, textureIndex) => {
        const canvas = document.createElement("canvas");
        canvas.width = TERRAIN_AUTOTILE_WIDTH;
        canvas.height = TERRAIN_AUTOTILE_HEIGHT;
        const context = canvas.getContext("2d");

        if (context === null) {
          throw new Error("terrain autotile canvas is unavailable");
        }

        const imageData = context.createImageData(TERRAIN_AUTOTILE_WIDTH, TERRAIN_AUTOTILE_HEIGHT);
        imageData.data.set(pixels);
        context.putImageData(imageData, 0, 0);
        const texture = Texture.from(canvas, true);
        texture.label =
          textureIndex < TERRAIN_INTERIOR_VARIANT_START
            ? `generated-terrain-autotile-${textureIndex.toString(16)}`
            : textureIndex < TERRAIN_DIAGONAL_VARIANT_START
              ? `generated-terrain-interior-${textureIndex - TERRAIN_INTERIOR_VARIANT_START + 2}`
              : `generated-terrain-diagonal-${textureIndex - TERRAIN_DIAGONAL_VARIANT_START + 1}`;
        return texture;
      }),
    );
  } catch {
    return undefined;
  }
}

function createTerrainTextures(atlas: Texture): readonly Texture[] {
  const autotiles = createTerrainAutotileTextures(atlas);

  if (autotiles !== undefined) {
    return autotiles;
  }

  return Object.freeze(
    [
      ...TERRAIN_FALLBACK_FRAME_BY_MASK,
      1,
      2,
      ...Array.from({ length: TERRAIN_DIAGONAL_VARIANT_COUNT }, () => 0),
    ].map((frameIndex, textureIndex) => {
      const frame = TERRAIN_SURFACE_FRAMES[frameIndex] ?? TERRAIN_SURFACE_FRAMES[0];

      if (frame === undefined) {
        return Texture.EMPTY;
      }

      const label = `generated-terrain-fallback-${textureIndex.toString(16)}`;
      const isCoastFrame = frameIndex >= 4 && frameIndex <= 11;
      return (
        (isCoastFrame ? createTerrainCutoutTexture(atlas, frame, label) : undefined) ??
        createAtlasTexture(atlas, frame, label, 1)
      );
    }),
  );
}

function createCharacterTextures(atlas: Texture): readonly Texture[] {
  return Object.freeze(
    CHARACTER_ATLAS_FRAMES.map((frame, index) =>
      createAtlasTexture(atlas, frame, `generated-character-${index + 1}`),
    ),
  );
}

export function getCharacterMotionAtlasFrame(
  variantIndex: number,
  state: CharacterAnimationState,
): AtlasFrame {
  if (!Number.isSafeInteger(variantIndex) || variantIndex < 0 || variantIndex >= 16) {
    throw new RangeError("character motion variant index must be inside 0..15");
  }
  const column = variantIndex % 4;
  const row = CHARACTER_MOTION_STATES.indexOf(state);
  return createAtlasFrame(
    column * CHARACTER_MOTION_CELL_SIZE,
    row * CHARACTER_MOTION_CELL_SIZE,
    CHARACTER_MOTION_CELL_SIZE,
    CHARACTER_MOTION_CELL_SIZE,
  );
}

function createCharacterMotionTextures(
  atlases: readonly Texture[],
): readonly CharacterMotionTextures[] {
  if (atlases.length !== 4) {
    return Object.freeze([]);
  }

  return Object.freeze(
    Array.from({ length: 16 }, (_, variantIndex) => {
      const atlas = atlases[Math.floor(variantIndex / 4)];
      if (atlas === undefined) {
        throw new RangeError(`missing character motion atlas for variant ${variantIndex}`);
      }
      const createStateTexture = (state: CharacterAnimationState): Texture =>
        createAtlasTexture(
          atlas,
          getCharacterMotionAtlasFrame(variantIndex, state),
          `generated-character-motion-${variantIndex + 1}-${state}`,
          1,
        );
      return Object.freeze({
        idle: createStateTexture("idle"),
        walk: createStateTexture("walk"),
        cast: createStateTexture("cast"),
        hit: createStateTexture("hit"),
      } satisfies CharacterMotionTextures);
    }),
  );
}

function areAllTextures(textures: readonly (Texture | null)[]): textures is readonly Texture[] {
  return textures.every((texture) => texture !== null);
}

function createItemTextures(atlas: Texture): Readonly<Partial<Record<ItemDefinitionId, Texture>>> {
  return Object.freeze({
    "iron-boots": createAtlasTexture(
      atlas,
      ITEM_ATLAS_FRAMES["iron-boots"],
      "generated-item-iron-boots",
    ),
    feather: createAtlasTexture(atlas, ITEM_ATLAS_FRAMES.feather, "generated-item-feather"),
    "spring-glove": createAtlasTexture(
      atlas,
      ITEM_ATLAS_FRAMES["spring-glove"],
      "generated-item-spring-glove",
    ),
    soap: createAtlasTexture(atlas, ITEM_ATLAS_FRAMES.soap, "generated-item-soap"),
    "brick-bag": createAtlasTexture(
      atlas,
      ITEM_ATLAS_FRAMES["brick-bag"],
      "generated-item-brick-bag",
    ),
    boat: createAtlasTexture(atlas, ITEM_ATLAS_FRAMES.boat, "generated-item-boat"),
    bomb: createAtlasTexture(atlas, ITEM_ATLAS_FRAMES.bomb, "generated-item-bomb"),
  });
}

async function loadOptionalTexture(url: string): Promise<Texture | null> {
  try {
    return await Assets.load<Texture>(url);
  } catch {
    return null;
  }
}

async function loadSkillEffectTextures(): Promise<
  Readonly<Partial<Record<SkillDefinitionId, Texture>>>
> {
  const entries = await Promise.all(
    SKILL_DEFINITION_IDS.map(async (definitionId) =>
      Object.freeze([
        definitionId,
        await loadOptionalTexture(SKILL_EFFECT_TEXTURE_URLS[definitionId]),
      ] as const),
    ),
  );

  return Object.freeze(
    Object.fromEntries(
      entries.filter((entry): entry is readonly [SkillDefinitionId, Texture] => entry[1] !== null),
    ),
  );
}

export async function loadArenaVisualAssets(): Promise<ArenaVisualAssets> {
  const [
    characterAtlas,
    characterMotionAtlases,
    itemAtlas,
    pirateShipTexture,
    treasureShipTexture,
    cannonballTexture,
    lethalBoulderTexture,
    impactExplosionTexture,
    seawaterImpactTexture,
    terrainAtlas,
    treeTexture,
    stunnedTexture,
    skillEffectTextures,
  ] = await Promise.all([
    loadOptionalTexture(CHARACTER_ATLAS_URL),
    Promise.all(CHARACTER_MOTION_ATLAS_URLS.map(loadOptionalTexture)),
    loadOptionalTexture(ITEM_ATLAS_URL),
    loadOptionalTexture(PIRATE_SHIP_URL),
    loadOptionalTexture(TREASURE_SHIP_URL),
    loadOptionalTexture(CANNONBALL_URL),
    loadOptionalTexture(LETHAL_BOULDER_URL),
    loadOptionalTexture(IMPACT_EXPLOSION_URL),
    loadOptionalTexture(SEAWATER_IMPACT_URL),
    loadOptionalTexture(TERRAIN_ATLAS_URL),
    loadOptionalTexture(TREE_OBSTACLE_URL),
    loadOptionalTexture(STUN_STATUS_URL),
    loadSkillEffectTextures(),
  ]);

  return Object.freeze({
    characterTextures: characterAtlas === null ? null : createCharacterTextures(characterAtlas),
    characterMotionTextures: areAllTextures(characterMotionAtlases)
      ? createCharacterMotionTextures(characterMotionAtlases)
      : null,
    characterDisplayScales: CHARACTER_DISPLAY_SCALES,
    itemTextures: itemAtlas === null ? null : createItemTextures(itemAtlas),
    pirateShipTexture,
    treasureShipTexture,
    cannonballTexture,
    lethalBoulderTexture,
    impactExplosionTexture,
    seawaterImpactTexture,
    terrainTextures: terrainAtlas === null ? null : createTerrainTextures(terrainAtlas),
    oceanTexture:
      terrainAtlas === null
        ? null
        : createAtlasTexture(terrainAtlas, OCEAN_ATLAS_FRAME, "generated-ocean", 1),
    treeTexture,
    stunnedTexture,
    skillEffectTextures,
  });
}
