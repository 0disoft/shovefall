# Domain Model

- Status: Accepted combat, collapse, and round-result model
- Owner: Repository owner

## Identity and Time

- `RoundId`, `ActorId`, `TileId`, and integer `Tick` are stable identifiers.
- The simulation advances at exactly 60 integer ticks per game second.
- Actor arrays may be stored in any order, but externally meaningful resolution and hashes use stable identifiers.
- One actor may submit at most one `ActorCommandV1` per tick. Missing input is a neutral command.

## Round Configuration

`GameConfigV1` is normalized before world creation. It supports 4 through 32 participants, arenas from 7 through 31 columns and rows, a maximum 120-second replay horizon, slow, normal, or fast collapse, normal density and difficulty, item policy version 1, a bounded initial item count, a participant-derived simultaneous cap, and a zero-to-thirty-second spawn interval. The same raw values normalize identically, and disabled items require zero initial and spawn values.

## Participant

A participant contains stable identity, human or scripted control ownership, an active flag, a circular body, effects, and an action state. The body owns position, velocity, facing, radius, base and effective continuous `massFactor`, and integer unsupported ticks. Timed Iron Boots and Feather effects refresh rather than stack duplicates; opposite effects may coexist and their product is clamped to the global mass range. Spring Glove is one held charge consumed when a shove starts.

Action kinds are `Ready`, `ShoveWindup`, `ShoveActive`, `ShoveRecovery`, `DodgeActive`, `Stumbling`, `Anchored`, `Falling`, and `Eliminated`. Action transitions are tick-bounded. If shove and dodge edges arrive together while both are ready, dodge has deterministic priority. `Falling` is irreversible and later transitions to `Eliminated`.

The initial tuning uses six shove-windup ticks, seven active ticks, fifteen recovery ticks, eight dodge ticks with five evasion ticks, nine unsupported grace ticks, and twenty-four falling ticks. `src/simulation/tuning.ts` owns exact numeric values. Product settings cannot expose these internals.

## Tile

A tile has an integer grid location, stable `column:row` ID, and a `Stable`, `Warning`, `Collapsing`, or `Void` lifecycle. The private collapse plan orders outer layers before inner layers and shuffles only within a layer through the named collapse stream. Future plan data is not exposed in `RenderFrameV1`. Stable, warning, and collapsing tiles support a participant; void tiles do not. Support is decided at the participant center after collision and impulse resolution, followed by an integer grace window.

## Round Result

`RoundStateV1` is `Active` or `Completed`. A completed result records exactly one of `last-standing`, `no-survivors`, or `time-limit`, an optional winner, and the completion tick. The world becomes sealed after completion and rejects additional steps. Falling is already irreversible, so one grounded participant may win while the others are still completing their fall animation. A hard time limit with multiple standing participants does not invent a winner.

## Commands, Frames, and Events

- `ActorCommandV1` contains tick, actor ID, normalized movement, and shove/dodge edge flags.
- `RenderFrameV1` is an immutable presentation snapshot with current and previous positions, facing, mass, effects, Spring Glove telegraph, items, action, tiles, tick, and state hash.
- `SimulationEventV1` is a versioned, ordered fact stream for one-time presentation and diagnostics. Events do not drive authoritative physics.

Human input and bots must use the same command path. A bot cannot directly set position, velocity, cooldown, action state, or tile state.

## Randomness

The versioned XorShift32 generator is seeded from a master seed. Named streams isolate `arena`, `collapse`, `items`, `tie-break`, `bot-personality:<ActorId>`, and `bot-jitter:<ActorId>`. Consuming one stream cannot change another stream's sequence.

Randomness may select arena variants, content placement, bot personality data, and small decision jitter. It cannot randomly decide collision outcomes, shove success, dodge success, support, or mass response.

## Replay

`ReplayFixtureV1` stores format, product, simulation, and content versions; build ID; normalized config; master seed; human actor ID; end tick; strictly increasing human commands; ordered hash checkpoints; and a final hash.

The current format accepts UTF-8 JSON up to 5 MiB and 7,200 ticks. Unknown replay majors, incompatible simulation versions, malformed booleans or numbers, commands for bots, duplicate or unordered ticks, range violations, and hash mismatches are errors. Compatibility is never guessed.

Simulation version `4.0.0` adds item instances, timed effects, effective mass, Spring Glove shove state, item cursors, and item events to authoritative state. Content version `3.0.0` owns the three item definitions and placement constants. Replay fixtures from simulation `3.0.0` are intentionally incompatible rather than silently receiving item semantics.

## Version Ownership

- Product version: `package.json` and `PRODUCT_VERSION`.
- Simulation and content versions: `src/simulation/versions.ts`.
- Replay format major: `REPLAY_FORMAT_VERSION` and `ReplayFixtureV1`.
- System order: `SYSTEM_ORDER`; changing meaning or ordering requires a simulation version decision and regenerated replay fixtures.
