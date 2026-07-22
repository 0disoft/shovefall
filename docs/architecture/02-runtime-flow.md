# Runtime Flow

- Status: Combat pipeline implemented; application scheduler pending
- Owner: Repository owner

## Round Start

1. The DOM setup model normalizes a supported preset or bounded custom settings.
2. The application creates one master seed and immutable `GameConfigV1`.
3. The world derives named PRNG streams and assigns stable actors, tiles, and spawn state.
4. Input adapters and bot controllers begin producing `ActorCommandV1` for the next integer tick.
5. PixiJS receives the initial read-only `RenderFrameV1`; it does not own simulation state.

## Fixed-tick Step

Each 60 Hz tick uses this versioned order:

1. Validate and collect commands; fill missing actor commands with neutral input.
2. Advance action-state transitions.
3. Convert movement commands into intent.
4. Apply dodge, stumble, and other active displacement.
5. Integrate positions and velocities.
6. Rebuild the spatial index.
7. Resolve weak circular contacts.
8. Collect all shove contacts from the same pre-impulse state.
9. Sum and apply actor impulses as a batch.
10. Evaluate tile support, grace ticks, falling, and elimination.
11. Resolve items and timed effects.
12. Advance collapse warnings, tile state, and item spawns.
13. Decide round result.
14. Emit ordered events, an immutable render frame, and a quantized state hash.

The combat checkpoint implements stages 1 through 10 and 14. Item, collapse, spawn, and round-result stages remain explicit no-op responsibilities until their slices are implemented. Later work cannot reorder the pipeline without a simulation-version decision and regenerated replay evidence.

## Browser Scheduling

The application accumulates monotonic browser time and executes whole fixed ticks. It may interpolate presentation between the two latest render frames. It may not pass render delta into the simulation, skip authoritative ticks, or allow PixiJS callbacks to mutate the world.

When the browser cannot keep up, the application caps work per render frame and exposes backlog diagnostics. Normal play may slow temporarily instead of silently dropping rule steps. Focus loss clears held input and pauses or resumes through the application lifecycle contract.

## Replay Flow

Replay creation records only normalized human commands plus deterministic setup metadata and checkpoint hashes. Replay execution reconstructs the world, injects each command at its exact tick, supplies neutral input on absent ticks, verifies requested checkpoints, and rejects the run on the first mismatch.

Checked-in fixtures cover idle, cardinal, and diagonal inputs across 4- and 12-participant worlds. Regeneration is intentional and reviewable because a changed hash may represent either a planned simulation-version change or a regression.

## Failure and Recovery

- A command for the wrong tick or duplicate actor is a contract error.
- An unknown or inactive actor command emits an ordered ignored-command event.
- A step beyond the round limit is rejected.
- Invalid replay input never partially mutates a live application round; parsing and construction complete first.
- Renderer initialization failure shows a DOM error and leaves the setup path recoverable.
- Restart discards the completed world and creates a fresh round from normalized settings and a new or explicitly reused seed.
