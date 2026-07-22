# ADR 0002: Fixed Ticks, Named Random Streams, and Replay Contracts

- Status: Accepted
- Date: 2026-07-22
- Owner: Repository owner

## Context

Shove, dodge, support grace, and simultaneous impacts change at tick boundaries. Variable render deltas, ambient randomness, or immediate pairwise impulse application would make outcomes depend on frame rate and array order. A seed alone cannot reproduce a round that includes human input, while full snapshots every tick would hide rule nondeterminism behind recorded state.

## Decision

Run authoritative rules at 60 integer ticks per second in a versioned system order. Use a versioned 32-bit PRNG with independently derived named streams. Store stable IDs and sort externally meaningful resolution where storage order could vary. Collect same-tick shove contacts before applying summed impulses.

Use `ReplayFixtureV1` for development reproduction. It records normalized config, versions, build ID, seed, one human's strictly ordered commands, checkpoints, and final quantized state hash. The JSON parser is bounded and strict. Unsupported format majors and simulation versions are rejected rather than inferred or automatically migrated.

## Consequences

- CI can replay exact bugs and visual changes cannot consume simulation randomness.
- Rule and PRNG changes require an intentional simulation-version and fixture decision.
- The guarantee is stable quantized state for the same build and supported JavaScript engine range, not cross-language bit-identical lockstep.
- Replay files are developer fixtures in the MVP, not a permanent user-facing exchange format.

## Revisit When

- Online lockstep, server authority, another language runtime, or durable user replay compatibility becomes approved scope.
- Supported Chromium builds cannot reproduce the same quantized hashes.
- The 60 Hz pipeline cannot meet the named baseline after profiling.
