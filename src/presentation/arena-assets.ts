import { Assets, Rectangle, Texture } from "pixi.js";
import type { ItemDefinitionId } from "../simulation/contracts";

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
  [71, 760, 177, 168],
  [305, 760, 171, 169],
  [522, 760, 186, 168],
  [769, 760, 171, 168],
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
  "grappling-hook": Object.freeze([774, 560, 202, 174] as const),
});

const TERRAIN_ATLAS_FRAMES: readonly AtlasFrame[] = Object.freeze(
  [65, 345, 620, 895].flatMap((y, row) =>
    [55, 345, 615, 890].map((x, column) =>
      createAtlasFrame(x, y, [300, 290, 290, 300][column] ?? 290, [280, 270, 280, 285][row] ?? 280),
    ),
  ),
);

export interface ArenaVisualAssets {
  readonly characterTextures: readonly Texture[] | null;
  readonly itemTextures: Readonly<Record<ItemDefinitionId, Texture>> | null;
  readonly pirateShipTexture: Texture | null;
  readonly cannonballTexture: Texture | null;
  readonly lethalBoulderTexture: Texture | null;
  readonly impactExplosionTexture: Texture | null;
  readonly seawaterImpactTexture: Texture | null;
  readonly terrainTextures: readonly Texture[] | null;
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

function createTerrainTextures(atlas: Texture): readonly Texture[] {
  return Object.freeze(
    TERRAIN_ATLAS_FRAMES.map((frame, index) =>
      createAtlasTexture(atlas, frame, `generated-terrain-${index + 1}`, 1),
    ),
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
    "grappling-hook": createAtlasTexture(
      atlas,
      ITEM_ATLAS_FRAMES["grappling-hook"],
      "generated-item-grappling-hook",
    ),
  });
}

async function loadOptionalTexture(url: string): Promise<Texture | null> {
  try {
    return await Assets.load<Texture>(url);
  } catch {
    return null;
  }
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
  ] = await Promise.all([
    loadOptionalTexture(CHARACTER_ATLAS_URL),
    loadOptionalTexture(ITEM_ATLAS_URL),
    loadOptionalTexture(PIRATE_SHIP_URL),
    loadOptionalTexture(CANNONBALL_URL),
    loadOptionalTexture(LETHAL_BOULDER_URL),
    loadOptionalTexture(IMPACT_EXPLOSION_URL),
    loadOptionalTexture(SEAWATER_IMPACT_URL),
    loadOptionalTexture(TERRAIN_ATLAS_URL),
  ]);

  return Object.freeze({
    characterTextures: characterAtlas === null ? null : createCharacterTextures(characterAtlas),
    itemTextures: itemAtlas === null ? null : createItemTextures(itemAtlas),
    pirateShipTexture,
    cannonballTexture,
    lethalBoulderTexture,
    impactExplosionTexture,
    seawaterImpactTexture,
    terrainTextures: terrainAtlas === null ? null : createTerrainTextures(terrainAtlas),
  });
}
