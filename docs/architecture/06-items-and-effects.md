# Items and Effects

- Status: Implemented gray-box content contract
- Owner: Simulation and content boundaries

## Definitions

`src/content/items.ts` is the declarative source for nine loadout items: Iron Boots, Feather, Spring Glove, Wind Blast, Brick Bag, Boat, Bomb, Soap, and Grappling Hook. Each definition owns a stable ID, version, presentation keys, passive-or-active loadout kind, starting charges, map-spawn eligibility, duration or consumption policy, physical multipliers, and AI tags. No definition adds health, damage, invulnerability, rarity, or a shop.

The two-slot starting inventory is distinct from temporary map effects. Starting Iron Boots and Feather are permanent passives: Boots multiplies mass by 1.4 and dodge speed by 0.82; Feather multiplies mass by 0.8 and dodge speed by 1.18. The global effective mass range remains `0.8..1.4`. Starting Spring Glove is also permanent and raises hand reach by 1.12 and raw impulse by 1.25 without launching the attacker's body. A Spring Glove picked up on the map remains a next-shove temporary charge and is consumed on hit or miss.

Wind Blast starts with two charges, Brick Bag with four, Boat with one, Bomb with two, Soap with three, and Grappling Hook with two. Their activation commands and world mechanics are a separate implementation gate; until that gate lands they are represented in authoritative inventory state but excluded from map spawning and balance rankings. The human chooses exactly two distinct starting items. Bots receive no hidden starting grant.

## Deterministic Lifecycle

The `items` random stream alone chooses placement and definition. Initial items use `ceil(participants × 0.33)` unless a bounded setting overrides it. The absolute simultaneous cap is `ceil(participants × 0.5)` and shrinks with the remaining stable-tile ratio. When the cap shrinks, the oldest IDs are retained. A due spawn creates at most one item and advances its schedule even when no valid tile exists, preventing a per-tick retry storm.

New items require stable tiles, participant clearance, and item clearance. Candidate selection classifies the current stable footprint, including newly exposed collapse frontiers, then uses integer weights 3 for its outer ring, 2 for its second ring, and 1 for its interior. This preserves deterministic one-draw selection while making risky edge collection more common without forbidding interior rewards. Warning, collapsing, and void tiles are not new-spawn candidates. Existing items may remain on warning or collapsing tiles as visible risk, but void-tile items are removed. Pickup runs before collapse transitions in the same tick. Contestants are ordered by distance, and exact ties use the separate seeded tie-break stream rather than human identity.

Only Iron Boots, Feather, and Spring Glove are map-spawn eligible. Timed duplicate effects refresh. Permanent inventory passives and temporary effects with the same definition do not multiply twice; effective mass is recomputed from immutable base mass and the unique active modifier IDs, then clamped to the global range. Effects expiring at tick `T` are removed before movement and collision at `T`. Falling clears temporary effects but does not rewrite the chosen inventory. Falling and eliminated participants cannot acquire map items.

## Presentation and AI

`RenderFrameV1` exposes immutable inventory slots, item instances, active effects, effective mass, and the active Spring Glove telegraph. Inventory slot index, definition, and remaining charge count enter the deterministic state hash; an empty inventory preserves the previous replay canonical form. PixiJS draws procedural markers and never mutates the world. The DOM reports the human's qualitative mass, loadout, charges, and temporary effect names. Collector bots use the same delayed frame as every other bot and only apply a higher nearby-item utility; they cannot see future spawns or private collapse plans.
