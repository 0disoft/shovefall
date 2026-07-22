# Domain Model

- Status: Accepted combat model; collapse states staged
- Owner: Repository owner

## Identity and Time

- `RoundId`, `ActorId`, `TileId`, and integer `Tick` are stable identifiers.
- The simulation advances at exactly 60 integer ticks per game second.
- Actor arrays may be stored in any order, but externally meaningful resolution and hashes use stable identifiers.
- One actor may submit at most one `ActorCommandV1` per tick. Missing input is a neutral command.

## Round Configuration

`GameConfigV1` is normalized before world creation. The current foundation supports 4 through 32 participants, arenas from 7 through 31 columns and rows, a maximum 120-second replay horizon, normal density and difficulty, and no active items. Later schema versions must add settings explicitly rather than interpreting unknown fields.

## Participant

A participant contains stable identity, human or scripted control ownership, an active flag, a circular body, and an action state. The body owns position, velocity, facing, radius, continuous `massFactor`, and integer unsupported ticks.

Action kinds are `Ready`, `ShoveWindup`, `ShoveActive`, `ShoveRecovery`, `DodgeActive`, `Stumbling`, `Anchored`, `Falling`, and `Eliminated`. Action transitions are tick-bounded. If shove and dodge edges arrive together while both are ready, dodge has deterministic priority. `Falling` is irreversible and later transitions to `Eliminated`.

The initial tuning uses six shove-windup ticks, seven active ticks, fifteen recovery ticks, eight dodge ticks with five evasion ticks, nine unsupported grace ticks, and twenty-four falling ticks. `src/simulation/tuning.ts` owns exact numeric values. Product settings cannot expose these internals.

## Tile

A tile has an integer grid location, stable `column:row` ID, and a lifecycle. The foundation implements `Stable`; later gameplay adds `Warning`, `Collapsing`, and `Void`. Participant support is decided from the tile state at the participant center after collision and impulse resolution, followed by an integer grace window.

## Commands, Frames, and Events

- `ActorCommandV1` contains tick, actor ID, normalized movement, and shove/dodge edge flags.
- `RenderFrameV1` is an immutable presentation snapshot with current and previous positions, facing, mass, action, tiles, tick, and state hash.
- `SimulationEventV1` is a versioned, ordered fact stream for one-time presentation and diagnostics. Events do not drive authoritative physics.

Human input and bots must use the same command path. A bot cannot directly set position, velocity, cooldown, action state, or tile state.

## Randomness

The versioned XorShift32 generator is seeded from a master seed. Named streams isolate `arena`, `collapse`, `items`, `tie-break`, `bot-personality:<ActorId>`, and `bot-jitter:<ActorId>`. Consuming one stream cannot change another stream's sequence.

Randomness may select arena variants, content placement, bot personality data, and small decision jitter. It cannot randomly decide collision outcomes, shove success, dodge success, support, or mass response.

## Replay

`ReplayFixtureV1` stores format, product, simulation, and content versions; build ID; normalized config; master seed; human actor ID; end tick; strictly increasing human commands; ordered hash checkpoints; and a final hash.

The current format accepts UTF-8 JSON up to 5 MiB and 7,200 ticks. Unknown replay majors, incompatible simulation versions, malformed booleans or numbers, commands for bots, duplicate or unordered ticks, range violations, and hash mismatches are errors. Compatibility is never guessed.

Simulation version `2.0.0` owns the first combat semantics. Replay fixtures generated under `1.0.0` are intentionally incompatible because movement, action state, cooldowns, previous positions, support, and collision response became authoritative hash inputs.

## Version Ownership

- Product version: `package.json` and `PRODUCT_VERSION`.
- Simulation and content versions: `src/simulation/versions.ts`.
- Replay format major: `REPLAY_FORMAT_VERSION` and `ReplayFixtureV1`.
- System order: `SYSTEM_ORDER`; changing meaning or ordering requires a simulation version decision and regenerated replay fixtures.
