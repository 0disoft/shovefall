# Domain Model

- Status: Accepted combat, collapse, and round-result model
- Owner: Repository owner

## Identity and Time

- `RoundId`, `ActorId`, `TileId`, and integer `Tick` are stable identifiers.
- The simulation advances at exactly 60 integer ticks per game second.
- Actor arrays may be stored in any order, but externally meaningful resolution and hashes use stable identifiers.
- One actor may submit at most one `ActorCommandV1` per tick. Missing input is a neutral command.

## Round Configuration

`GameConfigV1` is normalized before world creation. It supports 4 through 50 participants, arenas from 7 through 48 columns and rows, a maximum 120-second replay horizon, slow, normal, or fast collapse, normal density, Easy/Normal/Hard bot difficulty, item policy version 2, a bounded initial item count, a participant-derived simultaneous cap, and a zero-to-thirty-second spawn interval. The same raw values normalize identically, and disabled items require zero initial and spawn values. Browser settings force 50 participants and Hard difficulty; smaller counts and other difficulty values remain simulation fixtures and diagnostic inputs.

The browser's public arena policy derives a 48×40 bound for 50 participants and presents it through a player-follow camera rather than shrinking it to the viewport. Smaller internal tiers retain bounded arena derivation for tests and controlled audits. The public island starts from exactly 60% of its rectangular bound and requires eight separated 6–10-tile lake cuts whose combined budget cannot exceed 72 tiles. Every cut preserves one connected landmass and the minimum land budget.

## Participant

A participant contains stable identity, human or scripted control ownership, an active flag, a circular body, two-slot starting inventory, temporary effects, progression, offensive credit, and an action state. Inventory slots preserve their index, item definition, and nullable charge count; `null` means a permanent passive. The body owns position, velocity, facing, radius, base and effective continuous `massFactor`, and integer unsupported ticks. Effective mass is clamped to `0.8..1.4`. Progression owns unspent points, credited eliminations, and bounded Power, Stability, Mobility, and Reflex levels. The compatibility-named `shoveCredit` state records attacker, hit tick, and impulse strength. Newer hits replace older hits; same-tick Wind Blast and shove claims choose greater strength, then lower attacker ID. Falling grants one point only when that hit is at most 180 ticks old.

Action kinds are `Ready`, `ShoveWindup`, `ShoveActive`, `ShoveRecovery`, `DodgeActive`, `GrapplePull`, `Stumbling`, `Anchored`, `Falling`, and `Eliminated`. Action transitions are tick-bounded. Executable requests use `dodge > active item > shove`; an invalid, passive, exhausted, or anchorless slot falls through to shove without consuming a charge. `GrapplePull` is a 12-tick, input-locked self-pull with `0.965` drag; a same-tick Bomb or Wind Blast hit replaces it with the existing Stumbling result. `Falling` is irreversible and later transitions to `Eliminated`.

The current tuning uses six shove-windup ticks, five hand-active ticks, fifteen recovery ticks, five dodge/evasion ticks, nine unsupported grace ticks, and twenty-four falling ticks. ShoveActive no longer forces forward body speed; it exposes a `0.28`-tile hand reach beyond the two body radii. The collapsed local debug lab may override bounded movement, mass-speed, hand-reach, and dodge values for the next round without changing production defaults.

## Tile

A tile has an integer grid location, stable `column:row` ID, and a `Stable`, `Warning`, `Collapsing`, or `Void` lifecycle. The private collapse plan orders outer layers before inner layers and shuffles only within a layer through the named collapse stream. Future plan data is not exposed in `RenderFrameV1`. Stable, warning, and collapsing tiles support a participant; void tiles do not. Support is decided at the participant center after collision and impulse resolution, followed by an integer grace window.

## Brick Wall

A brick wall owns its tile ID, integer location, placing actor, and placement tick. At most one wall can occupy a tile. Successful proposals are committed in actor-ID order before active-item rays, so command-array order and attacker IDs cannot change same-tick shielding. A wall occupies its entire tile as a static axis-aligned obstacle. Participant circles use swept point-versus-radius-expanded bounds before broad phase and an overlap-only projection after weak body contacts. Wind Blast and hand shove use unexpanded wall ray bounds, with exact corner contact and distance ties favoring the wall. A wall is removed only when its tile becomes `Void`; the `tile-void` event precedes `brick-wall-removed` in that tick.

## Grappling Anchor

A Grappling Hook anchor is resolved from current authoritative tile and Brick state, not presentation geometry. Its 4.5-tile facing ray ignores participant bodies and selects the farthest non-Void tile before the first Brick wall, or the wall itself, subject to a 1.25-tile minimum. Warning and Collapsing tiles are eligible; Void, water-only, and out-of-arena coordinates are not. The anchor is a same-tick value rather than a persistent world entity. An accepted pull changes only the user's velocity by `0.24 / massFactor` toward the anchor, capped at `0.30`; it neither teleports nor changes support or offensive credit. Subsequent normal wall and body collision remains authoritative and may transfer motion without creating Hook credit.

## Bomb

A bomb owns its placing actor, snapped tile-center position, exact-center fallback direction, placement tick, and detonation tick. It is non-solid and does not move. `(ownerActorId, placedTick)` is its stable identity because one actor can issue at most one command per tick. Bombs are hashed in detonation-tick then actor-ID order and remain after owner elimination or tile flooding. Due bombs leave the frame only when their 300-tick fuse resolves; another explosion cannot shorten that fuse.

## Round Result

`RoundStateV1` is `Active` or `Completed`. A completed result records exactly one of `last-standing`, `no-survivors`, or `time-limit`, an optional winner, and the completion tick. The world becomes sealed after completion and rejects additional steps. Falling is already irreversible, so one grounded participant may win while the others are still completing their fall animation. A hard time limit with multiple standing participants does not invent a winner.

## Commands, Frames, and Events

- `ActorCommandV1` contains tick, actor ID, normalized movement, shove/dodge edge flags, an optional inventory slot `0|1`, and an optional stat-spend request.
- `RenderFrameV1` is an immutable presentation snapshot with current and previous positions, facing, mass, inventory slots, effects, Spring Glove telegraph, map items, brick walls, armed bombs, action, tiles, tick, and state hash.
- `SimulationEventV1` is a versioned, ordered fact stream for one-time presentation and diagnostics. Events do not drive authoritative physics.

Human input and bots must use the same command path. A bot cannot directly set position, velocity, cooldown, action state, or tile state.

## Randomness

The versioned XorShift32 generator is seeded from a master seed. Named streams isolate `arena`, `collapse`, `items`, `tie-break`, `bot-personality:<ActorId>`, and `bot-jitter:<ActorId>`. Consuming one stream cannot change another stream's sequence.

Randomness may select arena variants, content placement, bot personality data, and small decision jitter. It cannot randomly decide collision outcomes, shove success, dodge success, support, or mass response.

## Replay

`ReplayFixtureV2` stores format, product, simulation, and content versions; build ID; normalized config; master seed; human actor ID; required base mass and starting loadout; end tick; strictly increasing human commands; ordered hash checkpoints; and a final hash.

The current format accepts UTF-8 JSON up to 5 MiB and 7,200 ticks. Unknown replay majors, incompatible simulation versions, malformed booleans or numbers, commands for bots, duplicate or unordered ticks, range violations, and hash mismatches are errors. Compatibility is never guessed.

Simulation `6.0.0` adds command-driven stat spending, elimination credit, enlarged arena tiers, starting loadouts, hand-reach shove contacts, and the slower mass-sensitive movement contract. Content `4.0.0` changes Spring Glove from attacker speed to hand reach and retains the 3/2/1 risky-placement weights. Product `0.20.0` reports loadout, tuning, and final human progression in playtest record schema v3. These contract changes regenerated replay fixtures rather than inheriting older hashes.

Product `0.21.0` adds browser input adapters and public presentation changes without changing command, simulation, content, or replay-format semantics. Replay fixtures carry the new product version but retain their simulation hashes.

Product `0.22.0` and simulation `7.0.0` replace the full rectangular land sheet with deterministic connected islands, smoothed seeded coastlines, and enclosed lakes. The 8/16/24/32 tiers use `16×13`, `20×16`, `24×19`, and `28×22` bounding grids; only generated land is playable. Collapse measures layers from the real shoreline and protects one connected core of `ceil(initial playable land × 0.20)` tiles. Item bands and bots read current stable-tile shore depth instead of rectangular canvas distance. This changes tick-zero tiles, spawns, AI choices, collapse schedules, and state hashes, so replay fixtures are regenerated under simulation `7.0.0`; content remains `4.0.0`.

Product `0.23.0` and simulation `8.0.0` enlarge the browser tiers to `22×17`, `25×20`, `28×23`, and `31×26`. The coastline generator ranks seeded radial scores into a fixed 58% pre-lake land budget, preserving irregular shapes while guaranteeing that each larger preset has more playable land than the previous tier despite independent seeds. The browser presents that world through a human-follow camera rather than a fit-to-screen transform. Tick-zero tiles, spawns, AI choices, collapse schedules, and hashes change, so replay fixtures are regenerated; content remains `4.0.0`.

Product `0.24.0` keeps simulation `8.0.0` and content `4.0.0`. A pure presentation projection maps the top-down world to a fixed 58-degree camera elevation, adds bounded cliff fronts and upright shadows, orders participants by interpolated depth, and computes camera clamps from projected bounds. The projection cannot enter simulation state or hashes; replay fixtures change only because the product version is recorded in their envelope.

Product `0.25.0` keeps simulation `8.0.0` and content `4.0.0`. `VERSION_HISTORY` is immutable product metadata owned by the application layer; its newest record must equal `PRODUCT_VERSION`. The DOM shell derives a static history screen from it without adding simulation state, persistence, URL state, network calls, or replay behavior. Replay fixtures change only because their product-version envelope advances.

Product `0.26.0`, simulation `9.0.0`, and content `5.0.0` raise authoritative participant and arena bounds to 50 and 48, add the 44×36 public-island policy with five bounded lake attempts, expand the registered starting-item catalog, force the browser to 50 Hard-AI participants, and replace categorical starting mass with the deterministic 50–100 weight input. Counts below 50 remain valid only for fixtures and focused diagnostics. Replay fixtures advance their version envelope; existing sub-40 deterministic hashes remain unchanged because the new lake branch begins at 40 participants.

Product `0.27.0` and simulation `10.0.0` add the `active-items` system stage, two deterministic inventory-slot command edges, Wind Blast first-hit ray targeting, launch-speed weak-contact transfer, and strength-based offensive-credit arbitration. Replay format v2 makes human base mass and starting loadout required setup so charged item commands reproduce honestly. Content remains `5.0.0` because the registered item definition and charge count do not change.

Product `0.28.0` and simulation `11.0.0` add deterministic Brick Bag proposals, hashed static-wall state, swept wall contacts, post-body overlap projection, attack line-of-sight blocking, Void-tile removal, and participant/wall depth sorting. Content remains `5.0.0` and replay remains v2 because Brick Bag's registered definition and the existing slot command wire format do not change.

Product `0.29.0`, simulation `12.0.0`, and content `6.0.0` add Boat's 300-tick charged effect and bounded in-arena Void support. The stable arena-tile ID set is created once per world and never follows collapse state, while the current non-Void support set remains tick-local. Boat effect and charge state already enter the participant hash; replay remains v2 because the existing effect and slot command wire shapes are sufficient.

Product `0.30.0`, simulation `13.0.0`, and content `7.0.0` add Bomb placement, independent hashed fuse entities, deterministic radial impulse falloff, owner vulnerability, same-tick Dodge, flooding persistence, and Bomb-plus-Wind impulse batching. Replay remains v2 because loadout IDs and slot commands already carry Bomb use; simulation-version rejection and regenerated checkpoints protect the new world state.

Product `0.31.0`, simulation `14.0.0`, and content `8.0.0` add Soap placement, canonical one-use patch entities, actor-ID placement and trigger arbitration, post-contact slip state, external-credit preservation on self-trigger, Void removal, and symmetric Brick/Bomb/Soap occupancy. Replay remains v2 because the existing loadout IDs and slot commands already carry Soap use; regenerated simulation-version checkpoints protect the added hashed world state.

Product `0.32.0`, simulation `15.0.0`, and content `9.0.0` add the human-only static-anchor Grappling Hook, deterministic tile-versus-Brick acquisition, mass-sensitive capped self-pull, and the 12-tick `GrapplePull` action. Replay remains v2 and local reports remain v4 because the existing loadout IDs, slot commands, action state, and version rejection carry the new use without a persistent tether entity; regenerated simulation-version checkpoints protect the changed action and velocity outcomes.

Product `0.32.1` removes release-only diagnostic markup without changing simulation or content. The developer telemetry controller is a DEV presentation object created after the match-readable HUD and is absent from production HTML and runtime state. Scheduler round ID and tick remain non-authoritative DOM observability attributes; neither enters the world hash nor exposes the master seed or state hash. Simulation remains `15.0.0`, content remains `9.0.0`, replay remains v2, and reports remain v4.

Product `0.33.0` and simulation `16.0.0` widen the public island to 48×40, require eight separated lakes under a 72-tile budget, and select item risk bands at a fixed 3:2:1 ratio before choosing a tile within the selected band. The generated world, item placement, collapse order, and state hash change for the public 50-participant configuration. Content remains `9.0.0`, replay remains v2, and reports remain v4; checked-in fixtures advance their simulation envelope even where their small-tier hashes remain unchanged.

## Version Ownership

- Product version: `package.json` and `PRODUCT_VERSION`.
- Simulation and content versions: `src/simulation/versions.ts`.
- Replay format major: `REPLAY_FORMAT_VERSION` and `ReplayFixtureV2`.
- System order: `SYSTEM_ORDER`; changing meaning or ordering requires a simulation version decision and regenerated replay fixtures.
