# Scale and Performance

- Status: Accepted local automated baseline; physical and cross-browser evidence pending
- Owner: Repository owner

## Semantics Boundary

The simulation builds one participant spatial hash after position integration. The 1.7-world-unit cell is approximately 2.5 participant diameters. Same-cell and adjacent-cell candidates are emitted in stable `(leftActorId, rightActorId)` order. Weak-contact iterations and directed shove checks preserve the previous ActorId order; the index may remove impossible comparisons but cannot choose a collision result.

Boundary, negative-coordinate, identical-position, and full-scan distance-filter equivalence tests protect candidate completeness. All checked-in replay hashes stayed unchanged after broad-phase adoption. `SimulationStepDiagnostics` reports collidable participants, broad-phase candidate pairs, and the full-pair denominator without entering authoritative state or consuming randomness.

Bot perception builds one spatial hash per decision frame and searches a bounded five-by-five cell neighborhood before applying the existing six-candidate limit. Reaction delay, personality streams, target scoring, human-identity neutrality, commands, and physics remain unchanged.

## Local Headless Evidence

On 2026-07-22, Bun 1.3.14 ran 7,200 ticks each across sequential seeded rounds on the current workstation. This includes bot command generation and simulation but excludes PixiJS and browser rendering.

| Participants | AI p95 | Simulation p95 | Candidate/full pairs | Long steps over 100 ms |
|---:|---:|---:|---:|---:|
| 12 | 0.321 ms | 1.613 ms | 0.3793 | 0 |
| 24 | 0.647 ms | 2.844 ms | 0.2527 | 1 |
| 32 | 1.159 ms | 5.286 ms | 0.2704 | 1 |

The 24-participant AI maximum was 104.102 ms and the 32-participant simulation maximum was 97.162 ms. Those pre-item tail budgets passed. The first two item-enabled runs exposed allocation pressure in pickup scans. The second run brought p95 back under the 3/4/6 ms thresholds at 2.261/3.855/5.824 ms, but three 24-participant steps exceeded 100 ms, so the full headless gate remained failed. Pickup, expiry, item hashing, and bot item targeting were then changed to avoid steady-state allocation. A third run was not executed because the configured session policy stops an intent after two failures. Headless heap deltas remain observational because the harness does not force garbage collection and must not be compared with the Chrome restart measurement.

## Local Production-Chrome Evidence

A Vite production build ran in local headless Chrome at 1280×720. Each four-second sample used a fixed seed preselected only to keep the human active for 300 ticks; those seeds are workload identities, not evidence of typical round length. Every sample stayed at 1× with zero backlog.

| Participants | Seed | Frame p95 | Maximum frame | Delivered ticks / requested simulation second | Long frames over 100 ms |
|---:|---|---:|---:|---:|---:|
| 12 | `0000000c00000000` | 16.8 ms | 66.7 ms | 61.23 | 0 |
| 24 | `0000001800000001` | 16.8 ms | 17.7 ms | 61.46 | 0 |
| 32 | `0000002000000001` | 16.8 ms | 19.3 ms | 62.47 | 0 |

These 2026-07-22 samples include the recommended item policy and Collector item interest. Twenty immediate 32-participant restarts followed by CDP garbage collection increased used heap by 1,391,252 bytes and left one canvas. This is Chromium-specific lab evidence. The host reports device pixel ratio 1, so the run confirms the Mayhem upper bound but does not exercise a physical high-DPR display.

## Limits

- No physical baseline device, headed-browser trace, GPU timing, field data, Firefox, Edge, Safari, or mobile result exists.
- The first uncontrolled browser attempt ended a 12-participant round at tick 364 after human elimination and 6× resolution. That observation is a gameplay-duration risk, not a valid steady active-load performance sample.
- Candidate ratios aggregate source counts across changing survivor counts. They describe comparison reduction for this workload, not a universal constant.
- Worker, WASM, WebGPU-only behavior, 64 participants, and rule changes by quality tier remain prohibited.
