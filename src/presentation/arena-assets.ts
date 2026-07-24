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

type AtlasFrame = readonly [x: number, y: number, width: number, height: number];

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

export interface ArenaVisualAssets {
  readonly characterTextures: readonly Texture[];
  readonly itemTextures: Readonly<Record<ItemDefinitionId, Texture>>;
  readonly pirateShipTexture: Texture;
  readonly cannonballTexture: Texture;
  readonly lethalBoulderTexture: Texture;
  readonly impactExplosionTexture: Texture;
  readonly seawaterImpactTexture: Texture;
}

function createAtlasTexture(atlas: Texture, frame: AtlasFrame, label: string): Texture {
  return new Texture({
    source: atlas.source,
    frame: new Rectangle(...frame),
    label,
  });
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

export async function loadArenaVisualAssets(): Promise<ArenaVisualAssets | null> {
  try {
    const [
      characterAtlas,
      itemAtlas,
      pirateShipTexture,
      cannonballTexture,
      lethalBoulderTexture,
      impactExplosionTexture,
      seawaterImpactTexture,
    ] = await Promise.all([
      Assets.load<Texture>(CHARACTER_ATLAS_URL),
      Assets.load<Texture>(ITEM_ATLAS_URL),
      Assets.load<Texture>(PIRATE_SHIP_URL),
      Assets.load<Texture>(CANNONBALL_URL),
      Assets.load<Texture>(LETHAL_BOULDER_URL),
      Assets.load<Texture>(IMPACT_EXPLOSION_URL),
      Assets.load<Texture>(SEAWATER_IMPACT_URL),
    ]);

    return Object.freeze({
      characterTextures: createCharacterTextures(characterAtlas),
      itemTextures: createItemTextures(itemAtlas),
      pirateShipTexture,
      cannonballTexture,
      lethalBoulderTexture,
      impactExplosionTexture,
      seawaterImpactTexture,
    });
  } catch {
    return null;
  }
}
