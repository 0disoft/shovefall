import { Assets, Rectangle, Texture } from "pixi.js";
import { SKILL_DEFINITION_IDS } from "../content/skills";
import type { ItemDefinitionId, SkillDefinitionId } from "../simulation/contracts";

const CHARACTER_ATLAS_URL = new URL("../assets/generated/character-variants.png", import.meta.url)
  .href;
const ITEM_ATLAS_URL = new URL("../assets/generated/item-icons.png", import.meta.url).href;
const PIRATE_SHIP_URL = new URL("../assets/generated/pirate-ship-galleon.png", import.meta.url)
  .href;
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
const SKILL_EFFECT_TEXTURE_URLS: Readonly<Record<SkillDefinitionId, string>> = Object.freeze({
  "force-palm": new URL("../assets/generated/skill-vfx-force-palm.png", import.meta.url).href,
  "blink-step": new URL("../assets/generated/skill-vfx-blink-step.png", import.meta.url).href,
  "arc-bolt": new URL("../assets/generated/skill-vfx-arc-bolt.png", import.meta.url).href,
  "chain-bind": new URL("../assets/generated/skill-vfx-chain-bind.png", import.meta.url).href,
  "meteor-mark": new URL("../assets/generated/skill-vfx-meteor-mark.png", import.meta.url).href,
  "frost-field": new URL("../assets/generated/skill-vfx-frost-field.png", import.meta.url).href,
  "tidal-charge": new URL("../assets/generated/skill-vfx-tidal-charge.png", import.meta.url).href,
  aegis: new URL("../assets/generated/skill-vfx-aegis.png", import.meta.url).href,
});

type AtlasFrame = readonly [x: number, y: number, width: number, height: number];
const ATLAS_SOURCE_SCALE = 0.5;

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

const ITEM_ATLAS_FRAMES: Readonly<Record<ItemDefinitionId, AtlasFrame>> = Object.freeze({
  "iron-boots": Object.freeze([46, 54, 234, 208] as const),
  feather: Object.freeze([280, 48, 214, 206] as const),
  "spring-glove": Object.freeze([536, 68, 190, 188] as const),
  "brick-bag": Object.freeze([774, 66, 216, 192] as const),
  "wind-blast": Object.freeze([60, 312, 206, 196] as const),
  boat: Object.freeze([766, 334, 218, 174] as const),
  bomb: Object.freeze([64, 536, 196, 210] as const),
  soap: Object.freeze([304, 562, 192, 172] as const),
});

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

export interface ArenaVisualAssets {
  readonly characterTextures: readonly Texture[] | null;
  readonly characterDisplayScales: readonly number[];
  readonly itemTextures: Readonly<Record<ItemDefinitionId, Texture>> | null;
  readonly pirateShipTexture: Texture | null;
  readonly cannonballTexture: Texture | null;
  readonly lethalBoulderTexture: Texture | null;
  readonly impactExplosionTexture: Texture | null;
  readonly seawaterImpactTexture: Texture | null;
  readonly terrainTextures: readonly Texture[] | null;
  readonly oceanTexture: Texture | null;
  readonly treeTexture: Texture | null;
  readonly skillEffectTextures: Readonly<Partial<Record<SkillDefinitionId, Texture>>>;
}

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
    const isWater =
      alpha > 0 && blue >= 70 && blue - red >= 24 && green - red >= 14 && blue >= green * 0.92;

    if (!isWater) {
      continue;
    }

    pixels[index + 3] = 0;
    removedPixels += 1;
  }

  return removedPixels;
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

function createTerrainTextures(atlas: Texture): readonly Texture[] {
  return Object.freeze(
    TERRAIN_SURFACE_FRAMES.map((frame, index) => {
      const label = `generated-terrain-${index + 1}`;
      const isCoastFrame = index >= 4 && index <= 11;
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

function createItemTextures(atlas: Texture): Readonly<Record<ItemDefinitionId, Texture>> {
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
    "wind-blast": createAtlasTexture(
      atlas,
      ITEM_ATLAS_FRAMES["wind-blast"],
      "generated-item-wind-blast",
    ),
    "brick-bag": createAtlasTexture(
      atlas,
      ITEM_ATLAS_FRAMES["brick-bag"],
      "generated-item-brick-bag",
    ),
    boat: createAtlasTexture(atlas, ITEM_ATLAS_FRAMES.boat, "generated-item-boat"),
    bomb: createAtlasTexture(atlas, ITEM_ATLAS_FRAMES.bomb, "generated-item-bomb"),
    soap: createAtlasTexture(atlas, ITEM_ATLAS_FRAMES.soap, "generated-item-soap"),
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
    itemAtlas,
    pirateShipTexture,
    cannonballTexture,
    lethalBoulderTexture,
    impactExplosionTexture,
    seawaterImpactTexture,
    terrainAtlas,
    treeTexture,
    skillEffectTextures,
  ] = await Promise.all([
    loadOptionalTexture(CHARACTER_ATLAS_URL),
    loadOptionalTexture(ITEM_ATLAS_URL),
    loadOptionalTexture(PIRATE_SHIP_URL),
    loadOptionalTexture(CANNONBALL_URL),
    loadOptionalTexture(LETHAL_BOULDER_URL),
    loadOptionalTexture(IMPACT_EXPLOSION_URL),
    loadOptionalTexture(SEAWATER_IMPACT_URL),
    loadOptionalTexture(TERRAIN_ATLAS_URL),
    loadOptionalTexture(TREE_OBSTACLE_URL),
    loadSkillEffectTextures(),
  ]);

  return Object.freeze({
    characterTextures: characterAtlas === null ? null : createCharacterTextures(characterAtlas),
    characterDisplayScales: CHARACTER_DISPLAY_SCALES,
    itemTextures: itemAtlas === null ? null : createItemTextures(itemAtlas),
    pirateShipTexture,
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
    skillEffectTextures,
  });
}
