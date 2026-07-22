# Bot AI

- Status: Accepted automated baseline; playtest tuning pending
- Owner: Repository owner

## Boundary

`BotDirector` is headless application policy outside the authoritative simulation. It consumes only immutable `RenderFrameV1` data and produces `ActorCommandV1`. It cannot import PixiJS or browser globals, inspect human key state, read unannounced future collapse state, or mutate participant bodies, actions, cooldowns, items, or tiles.

The repository architecture check applies the same renderer, DOM, wall-clock, and ambient-randomness restrictions to `src/ai` and `src/simulation`.

## Perception and Scheduling

Normal bots perceive public state ten ticks late and reconsider intent every twelve ticks. Initial decision ticks are staggered by stable actor ID so all bots do not spike one frame. Between decisions, a bot preserves its movement intent and emits no repeated shove or dodge edge. A bot may inspect its own current position and currently visible tile state for immediate edge or unstable-tile recovery; it cannot inspect the private future collapse plan or use current opponent positions to bypass delayed perception.

Perception contains participant positions, velocities, facing, visible action state, mass, active state, and public cooldown readiness from a prior render frame. At most six nearest active candidates enter utility scoring.

## Personalities

`Aggressor`, `Survivor`, `Opportunist`, `Disruptor`, and `Collector` are weight records over one decision implementation. They adjust approach, edge opportunity, stumbling opportunity, self-safety, heavy-target penalty, shove distance, and small aim jitter. They do not own separate state machines or physical advantages. `Collector` retains a conservative combat profile until items add an approved collection utility.

Personality selection and decision jitter use `bot-personality:<ActorId>` and `bot-jitter:<ActorId>` streams. Randomness breaks near-equal directions but never changes collision, dodge, mass, support, or action results.

## Utility Order

1. Current self tile emergency moves toward the nearest stable tile, then an edge emergency moves toward arena center; neither attacks.
2. A perceived nearby actor facing and advancing toward the bot can trigger a perpendicular dodge if the bot is ready.
3. Remaining perceived candidates are scored by distance, edge exposure, stumble state, and mass mismatch.
4. Self safety blends the target direction toward center near an edge.
5. A ready bot shoves only when the perceived target falls within its personality's shove distance.

Actor control type and human identity are not fields in the perception participant contract, so targeting cannot special-case the human. Stable actor ID is used only as a deterministic tie-break.

## Known Limits

- Ten-tick perception is longer than the six-tick shove windup, so normal bots primarily dodge dangerous approach trajectories rather than reading every shove start perfectly.
- The current arena has collapse but no items, so `Collector` cannot yet demonstrate its intended priority.
- Utility weights have automated invariants but no external evidence of fun, aggression balance, or personality readability.
- Explicit coordination is limited to incidental target geometry; side-pressure and anti-dogpile rules remain future tuning.
