# Runtime Flow

- Status: Combat, collapse, result, and browser scheduler implemented
- Owner: Repository owner

## Round Start

1. The DOM setup model normalizes a supported preset or bounded custom settings.
2. The application creates one master seed and immutable `GameConfigV1`.
3. The world derives named PRNG streams, builds a connected island with an irregular coastline and enclosed lakes, and assigns supported spawn state.
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
7. Resolve overlapping and swept weak circular contacts.
8. Collect all shove contacts from the same pre-impulse state.
9. Sum and apply actor impulses as a batch.
10. Evaluate tile support, grace ticks, falling, and elimination.
11. Resolve items and timed effects.
12. Advance collapse warnings, tile state, and item spawns.
13. Decide round result.
14. Emit ordered events, an immutable render frame, and a quantized state hash.

All fourteen stages are implemented. Weak contact first resolves a swept circle intersection from `previousPosition` to the integrated position, then applies iterative overlap correction. Timed effects expire with action transitions before movement. Item pickup runs after support, so a valid pickup wins over a tile that begins collapsing later in the same tick. Collapse advances from the actual ocean and lake shoreline rather than the rectangular render bounds. A connected protected core equal to `ceil(initial playable land × 0.20)` is never scheduled, so pre-existing water never returns as land and collapse never crosses the 20% floor. Void-tile items are removed, the safe-area cap is enforced, and at most one due item is spawned on a stable clear tile using the 3/2/1 shoreline-ring weights. Collapse still cannot retroactively remove support earlier in the same tick. Later work cannot reorder the pipeline or change contact meaning without a simulation-version decision and regenerated replay evidence.

## Browser Scheduling

The application accumulates monotonic browser time and executes whole fixed ticks. It may interpolate presentation between the two latest render frames. It may not pass render delta into the simulation, skip authoritative ticks, or allow PixiJS callbacks to mutate the world.

When the browser cannot keep up, the application caps work per render frame and exposes backlog diagnostics. Normal play may slow temporarily instead of silently dropping rule steps. Focus loss clears held input and pauses or resumes through the application lifecycle contract.

Start and restart create and render the new tick-zero world immediately, then the same animation-frame scheduler advances a 1.5-second `3→2→1` countdown before accumulating simulation time. Human input and bot decisions remain closed during this state. Pause and renderer-loss paths update the reference timestamp without advancing countdown elapsed time, so hidden wall time never starts a round.

When the human enters irreversible falling, command input closes and accumulated browser time advances the same authoritative simulation at six times normal speed. Physics and bot rules do not change. Completion publishes the final frame before the DOM result so telemetry cannot overwrite result state, then stops scheduling until restart creates a new world.

## Replay Flow

Replay creation records only normalized human commands plus deterministic setup metadata and checkpoint hashes. Replay execution reconstructs the world, injects each command at its exact tick, supplies neutral input on absent ticks, verifies requested checkpoints, and rejects the run on the first mismatch.

Checked-in fixtures cover idle, cardinal, and diagonal inputs across 4- and 12-participant worlds. Regeneration is intentional and reviewable because a changed hash may represent either a planned simulation-version change or a regression.

## Failure and Recovery

- A command for the wrong tick or duplicate actor is a contract error.
- An unknown or inactive actor command emits an ordered ignored-command event.
- A step after a completed result or beyond the round limit is rejected.
- Invalid replay input never partially mutates a live application round; parsing and construction complete first.
- Renderer initialization failure shows a DOM error and leaves the setup path recoverable.
- Restart discards the completed world and creates a fresh round from normalized settings and a new or explicitly reused seed.
