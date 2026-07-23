# Items and Effects

- Status: Implemented gray-box content contract
- Owner: Simulation and content boundaries

## Definitions

`src/content/items.ts` is the declarative source for nine loadout items: Iron Boots, Feather, Spring Glove, Wind Blast, Brick Bag, Boat, Bomb, Soap, and Grappling Hook. Each definition owns a stable ID, version, presentation keys, passive-or-active loadout kind, starting charges, map-spawn eligibility, duration or consumption policy, physical multipliers, and AI tags. No definition adds health, damage, invulnerability, rarity, or a shop.

The two-slot starting inventory is distinct from temporary map effects. Starting Iron Boots and Feather are permanent passives: Boots multiplies mass by 1.4 and dodge speed by 0.82; Feather multiplies mass by 0.8 and dodge speed by 1.18. The global effective mass range remains `0.8..1.4`. Starting Spring Glove is also permanent and raises hand reach by 1.12 and raw impulse by 1.25 without launching the attacker's body. A Spring Glove picked up on the map remains a next-shove temporary charge and is consumed on hit or miss.

Wind Blast starts with two charges and is implemented. Q/E, the third/fourth gamepad face buttons, or the two arena buttons request slots 0/1. Accepted use spends a charge on hit, miss, or dodge. A deterministic ray hits only the first circular body within 6.5 tiles; a dodging first target blocks the ray without being launched. Neutral mass and zero stats receive a `0.315` impulse, exactly three times the base hand shove before target mass, Power, and Stability modify it. Launched bodies can transfer motion through swept weak contacts, and the strongest same-tick offensive impulse owns elimination credit.

Brick Bag starts with four charges and is implemented through the same slot inputs. It quantizes the actor's facing to one cardinal neighbor, with horizontal direction winning an exact component tie. A successful proposal requires a non-Void tile with no existing wall, map item, or collidable participant. Competing proposals resolve by lower actor ID. All accepted walls commit before Wind Blast, block ray and hand-shove line of sight, stop swept participant motion without reflection, and disappear when their supporting tile becomes Void. Failed placement spends nothing and falls through to a simultaneous shove request.

Boat starts with one charge and is implemented through the same slot inputs. It adds a refreshable effect ending exactly 300 ticks after activation. Normal land support still wins; on water, Boat supports only when the participant center remains inside a tile ID that belongs to the generated arena. It never supports coordinates beyond the arena, changes no combat or mass value, and cannot reverse Falling. Brick proposals commit before Boat activation and Wind Blast resolves afterward.

Bomb starts with two charges, Soap with three, and Grappling Hook with two. Their activation mechanics remain separate implementation gates; until each gate lands it is represented in authoritative inventory state but not offered by the browser settings. All active loadout items remain excluded from map spawning and bot balance rankings. The human chooses exactly two distinct offered starting items. Bots receive no hidden starting grant.

## Deterministic Lifecycle

The `items` random stream alone chooses placement and definition. Initial items use `ceil(participants × 0.33)` unless a bounded setting overrides it. The absolute simultaneous cap is `ceil(participants × 0.5)` and shrinks with the remaining stable-tile ratio. When the cap shrinks, the oldest IDs are retained. A due spawn creates at most one item and advances its schedule even when no valid tile exists, preventing a per-tick retry storm.

New items require stable tiles, participant clearance, and item clearance. Candidate selection classifies the current stable footprint, including newly exposed collapse frontiers, then uses integer weights 3 for its outer ring, 2 for its second ring, and 1 for its interior. This preserves deterministic one-draw selection while making risky edge collection more common without forbidding interior rewards. Warning, collapsing, and void tiles are not new-spawn candidates. Existing items may remain on warning or collapsing tiles as visible risk, but void-tile items are removed. Pickup runs before collapse transitions in the same tick. Contestants are ordered by distance, and exact ties use the separate seeded tie-break stream rather than human identity.

Only Iron Boots, Feather, and Spring Glove are map-spawn eligible. Timed duplicate effects refresh. Permanent inventory passives and temporary effects with the same definition do not multiply twice; effective mass is recomputed from immutable base mass and the unique active modifier IDs, then clamped to the global range. Effects expiring at tick `T` are removed before movement and support at `T`; Boat therefore supports activation ticks `T..T+299` and ordinary unsupported grace begins at `T+300`. Falling clears temporary effects but does not rewrite the chosen inventory. Falling and eliminated participants cannot acquire map items.

## Presentation and AI

`RenderFrameV1` exposes immutable inventory slots, item instances, active effects, effective mass, and the active Spring Glove telegraph. Inventory slot index, definition, remaining charge count, and effect interval enter the deterministic state hash. PixiJS draws procedural activation and impact waves plus an owner-local Boat hull without mutating the world; optional Web Audio gives dedicated impact and Boat activation cues. The DOM reports the human's loadout, charges, and remaining Boat seconds and disables unusable slot buttons. Collector bots use the same delayed frame as every other bot and only apply a higher nearby-map-item utility; they cannot see future spawns or private collapse plans. Bot active-item use is not implemented and must not be inferred from the shared command field.
