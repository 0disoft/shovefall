# Items and Effects

- Status: Implemented gray-box content contract
- Owner: Simulation and content boundaries

## Definitions

`src/content/items.ts` is the declarative source for Iron Boots, Feather, and Spring Glove. Each definition owns a stable ID, version, presentation keys, duration or consumption policy, refresh-only stacking policy, physical multipliers, and AI tags. No definition adds health, damage, invulnerability, rarity, inventory slots, or a shop.

Iron Boots lasts 480 ticks, multiplies mass by 1.42, and reduces dodge speed to 0.82. Existing mass-based movement curves also reduce acceleration and maximum speed. Feather lasts 480 ticks, multiplies mass by 0.72, and increases dodge speed to 1.18 while amplifying received impulse and missed-shove exposure through the same mass equations. Spring Glove is one held charge. Shove start consumes it, stores the boost on that action, raises active speed by 1.22 and raw impulse by 1.45, and applies to all valid contacts in that single active window. Missing still consumes the charge and its stronger forward momentum.

## Deterministic Lifecycle

The `items` random stream alone chooses placement and definition. Initial items use `ceil(participants × 0.33)` unless a bounded setting overrides it. The absolute simultaneous cap is `ceil(participants × 0.5)` and shrinks with the remaining stable-tile ratio. When the cap shrinks, the oldest IDs are retained. A due spawn creates at most one item and advances its schedule even when no valid tile exists, preventing a per-tick retry storm.

New items require stable interior tiles, participant clearance, and item clearance. Existing items may remain on warning or collapsing tiles as visible risk, but void-tile items are removed. Pickup runs before collapse transitions in the same tick. Contestants are ordered by distance, and exact ties use the separate seeded tie-break stream rather than human identity.

Timed duplicate effects refresh. Iron Boots and Feather may coexist; effective mass is recomputed from immutable base mass and clamped to the global range. Effects expiring at tick `T` are removed before movement and collision at `T`. Falling and eliminated participants cannot acquire items.

## Presentation and AI

`RenderFrameV1` exposes immutable item instances, active effects, effective mass, and the active Spring Glove telegraph. PixiJS draws procedural markers and never mutates the world. The DOM reports the human's qualitative mass and effect names. Collector bots use the same delayed frame as every other bot and only apply a higher nearby-item utility; they cannot see future spawns or private collapse plans.
