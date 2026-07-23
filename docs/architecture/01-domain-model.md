# Domain Model

- Status: Accepted combat, collapse, and round-result model
- Owner: Repository owner

## Identity and Time

- `RoundId`, `ActorId`, `TileId`, and integer `Tick` are stable identifiers.
- The simulation advances at exactly 60 integer ticks per game second.
- Actor arrays may be stored in any order, but externally meaningful resolution and hashes use stable identifiers.
- One actor may submit at most one `ActorCommandV1` per tick. Missing input is a neutral command.

## Round Configuration

`GameConfigV1` is normalized before world creation. It supports 4 through 32 participants, arenas from 7 through 31 columns and rows, a maximum 120-second replay horizon, slow, normal, or fast collapse, normal density, Easy/Normal/Hard bot difficulty, item policy version 2, a bounded initial item count, a participant-derived simultaneous cap, and a zero-to-thirty-second spawn interval. The same raw values normalize identically, and disabled items require zero initial and spawn values. The raw contract defaults to the browser's 16-participant 12×10 normal configuration and Normal bot difficulty.

The browser's normal-density arena policy derives 10×8 tiles for 4–8 participants, 12×10 for 9–16, 16×12 for 17–24, and 17×13 for 25–32. The final Mayhem tier grows only one row and column because adding more world area there would shrink actors and telegraphs further on the fixed canvas. This policy increases first-contact distance for smaller tiers without modifying combat strength.

## Participant

A participant contains stable identity, human or scripted control ownership, an active flag, a circular body, effects, progression, shove credit, and an action state. The body owns position, velocity, facing, radius, base and effective continuous `massFactor`, and integer unsupported ticks. Effective mass is clamped to `0.8..1.4`. Progression owns unspent points, credited eliminations, and bounded Power, Stability, Mobility, and Reflex levels. Shove credit records the deterministic last attacker and hit tick; falling grants one point only when that hit is at most 180 ticks old.

Action kinds are `Ready`, `ShoveWindup`, `ShoveActive`, `ShoveRecovery`, `DodgeActive`, `Stumbling`, `Anchored`, `Falling`, and `Eliminated`. Action transitions are tick-bounded. If shove and dodge edges arrive together while both are ready, dodge has deterministic priority. `Falling` is irreversible and later transitions to `Eliminated`.

The current tuning uses six shove-windup ticks, five hand-active ticks, fifteen recovery ticks, five dodge/evasion ticks, nine unsupported grace ticks, and twenty-four falling ticks. ShoveActive no longer forces forward body speed; it exposes a `0.28`-tile hand reach beyond the two body radii. The collapsed local debug lab may override bounded movement, mass-speed, hand-reach, and dodge values for the next round without changing production defaults.

## Tile

A tile has an integer grid location, stable `column:row` ID, and a `Stable`, `Warning`, `Collapsing`, or `Void` lifecycle. The private collapse plan orders outer layers before inner layers and shuffles only within a layer through the named collapse stream. Future plan data is not exposed in `RenderFrameV1`. Stable, warning, and collapsing tiles support a participant; void tiles do not. Support is decided at the participant center after collision and impulse resolution, followed by an integer grace window.

## Round Result

`RoundStateV1` is `Active` or `Completed`. A completed result records exactly one of `last-standing`, `no-survivors`, or `time-limit`, an optional winner, and the completion tick. The world becomes sealed after completion and rejects additional steps. Falling is already irreversible, so one grounded participant may win while the others are still completing their fall animation. A hard time limit with multiple standing participants does not invent a winner.

## Commands, Frames, and Events

- `ActorCommandV1` contains tick, actor ID, normalized movement, shove/dodge edge flags, and an optional stat-spend request.
- `RenderFrameV1` is an immutable presentation snapshot with current and previous positions, facing, mass, effects, Spring Glove telegraph, items, action, tiles, tick, and state hash.
- `SimulationEventV1` is a versioned, ordered fact stream for one-time presentation and diagnostics. Events do not drive authoritative physics.

Human input and bots must use the same command path. A bot cannot directly set position, velocity, cooldown, action state, or tile state.

## Randomness

The versioned XorShift32 generator is seeded from a master seed. Named streams isolate `arena`, `collapse`, `items`, `tie-break`, `bot-personality:<ActorId>`, and `bot-jitter:<ActorId>`. Consuming one stream cannot change another stream's sequence.

Randomness may select arena variants, content placement, bot personality data, and small decision jitter. It cannot randomly decide collision outcomes, shove success, dodge success, support, or mass response.

## Replay

`ReplayFixtureV1` stores format, product, simulation, and content versions; build ID; normalized config; master seed; human actor ID; end tick; strictly increasing human commands; ordered hash checkpoints; and a final hash.

The current format accepts UTF-8 JSON up to 5 MiB and 7,200 ticks. Unknown replay majors, incompatible simulation versions, malformed booleans or numbers, commands for bots, duplicate or unordered ticks, range violations, and hash mismatches are errors. Compatibility is never guessed.

Simulation `6.0.0` adds command-driven stat spending, elimination credit, enlarged arena tiers, starting loadouts, hand-reach shove contacts, and the slower mass-sensitive movement contract. Content `4.0.0` changes Spring Glove from attacker speed to hand reach and retains the 3/2/1 risky-placement weights. Product `0.20.0` reports loadout, tuning, and final human progression in playtest record schema v3. These contract changes regenerated replay fixtures rather than inheriting older hashes.

Product `0.21.0` adds browser input adapters and public presentation changes without changing command, simulation, content, or replay-format semantics. Replay fixtures carry the new product version but retain their simulation hashes.

## Version Ownership

- Product version: `package.json` and `PRODUCT_VERSION`.
- Simulation and content versions: `src/simulation/versions.ts`.
- Replay format major: `REPLAY_FORMAT_VERSION` and `ReplayFixtureV1`.
- System order: `SYSTEM_ORDER`; changing meaning or ordering requires a simulation version decision and regenerated replay fixtures.
