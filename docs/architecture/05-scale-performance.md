# Scale and Performance

- Status: Accepted local automated baseline; physical and cross-browser evidence pending
- Owner: Repository owner

## Semantics Boundary

The simulation builds one participant spatial hash after position integration. The 1.7-world-unit cell is approximately 2.5 participant diameters. Same-cell and adjacent-cell candidates are emitted in stable `(leftActorId, rightActorId)` order. Weak-contact iterations and directed shove checks preserve the previous ActorId order; the index may remove impossible comparisons but cannot choose a collision result.

Boundary, negative-coordinate, identical-position, and full-scan distance-filter equivalence tests protect candidate completeness. All checked-in replay hashes stayed unchanged after broad-phase adoption. `SimulationStepDiagnostics` reports collidable participants, broad-phase candidate pairs, and the full-pair denominator without entering authoritative state or consuming randomness.

Bot perception builds one spatial hash per decision frame and searches a bounded five-by-five cell neighborhood before applying the difficulty profile's four-, six-, or eight-candidate limit. Difficulty changes reaction delay and decision cadence; personality streams, target scoring, human-identity neutrality, commands, and physics remain unchanged.

## Local Headless Evidence

On 2026-07-22, Bun 1.3.14 ran 7,200 ticks each across sequential seeded rounds on the current workstation. This includes bot command generation and simulation but excludes PixiJS and browser rendering.

| Participants | AI p95 | Simulation p95 | Candidate/full pairs | Long steps over 100 ms |
|---:|---:|---:|---:|---:|
| 12 | 0.321 ms | 1.613 ms | 0.3793 | 0 |
| 24 | 0.647 ms | 2.844 ms | 0.2527 | 1 |
| 32 | 1.159 ms | 5.286 ms | 0.2704 | 1 |

The first two item-enabled runs exposed allocation pressure in pickup scans. After pickup, expiry, item hashing, and bot item targeting stopped allocating on steady-state ticks, the item slice passed all tail gates. A fresh 2026-07-22 simulation `5.0.0` run with swept contacts reported:

| Participants | AI p95 | Simulation p95 | Candidate/full pairs | Long steps over 100 ms |
|---:|---:|---:|---:|---:|
| 12 | 0.374 ms | 1.935 ms | 0.3629 | 1 |
| 24 | 0.755 ms | 3.138 ms | 0.2993 | 0 |
| 32 | 1.092 ms | 4.272 ms | 0.2245 | 0 |

One 12-participant combined step exceeded 100 ms during the local run; 24 and 32 participants had none, and all p95 and harness tail gates passed. This isolated scheduler or workstation tail is retained rather than edited out. Headless heap deltas are observational because the harness does not force garbage collection and must not be compared with the Chrome restart measurement.

## Local Production-Chrome Evidence

A Vite production build ran in local headless Chrome at 1280×720. Each four-second sample used a fixed seed preselected only to keep the human active for 300 ticks; those seeds are workload identities, not evidence of typical round length. Every sample stayed at 1× with zero backlog.

| Participants | Seed | Frame p95 | Maximum frame | Delivered ticks / requested simulation second | Long frames over 100 ms |
|---:|---|---:|---:|---:|---:|
| 12 | `0000000c00000000` | 16.9 ms | 17.5 ms | 61.06 | 0 |
| 24 | `0000001800000001` | 16.9 ms | 17.5 ms | 61.25 | 0 |
| 32 | `0000002000000001` | 17.1 ms | 17.7 ms | 60.95 | 0 |

These refreshed 2026-07-22 samples include simulation `5.0.0` swept contacts, the recommended item policy, Collector item interest, presentation-event feedback, and Mayhem effect caps. Twenty immediate 32-participant restarts followed by CDP garbage collection increased used heap by 2,145,784 bytes and left one canvas. This is Chromium-specific lab evidence. The host reports device pixel ratio 1, so the run confirms the Mayhem upper bound but does not exercise a physical high-DPR display.

## Preset and Balance Refresh

Product `0.14.0` changes the production profile counts to 16, 24, and 32, adds edge-weighted item candidates, and narrows mass bounds. Simulation `5.2.0` also skips collapse scanning on ticks that cannot contain a scheduled transition. The PixiJS tile layer remains cached between tile transitions, new rounds, and resizes. Both profiles were rerun because these changes alter authoritative workload and round frequency.

On 2026-07-23, the refreshed Bun 1.3.14 run measured 7,200 ticks per count:

| Participants | AI p95 | Simulation p95 | Candidate/full pairs | Long steps over 100 ms |
|---:|---:|---:|---:|---:|
| 16 | 0.383 ms | 1.325 ms | 0.2899 | 0 |
| 24 | 0.653 ms | 2.482 ms | 0.3239 | 0 |
| 32 | 0.708 ms | 2.319 ms | 0.2300 | 0 |

The production-Chrome harness waits for `data-round=active` before starting each four-second sample. This excludes the intentionally tick-zero countdown from delivered simulation rate while preserving it in browser smoke coverage.

| Participants | Seed | Frame p95 | Maximum frame | Delivered ticks / requested simulation second | Long frames over 100 ms |
|---:|---|---:|---:|---:|---:|
| 16 | `0000001000000001` | 16.8 ms | 17.3 ms | 60.72 | 0 |
| 24 | `0000001800000001` | 16.8 ms | 17.3 ms | 60.67 | 0 |
| 32 | `0000002000000000` | 16.8 ms | 17.9 ms | 60.62 | 0 |

All three samples stayed at 1× with zero backlog and effective device pixel ratio 1. Twenty immediate 32-participant restarts followed by CDP garbage collection increased used heap by 509,168 bytes and left one canvas. Headless heap deltas remain observational because that harness does not force garbage collection. These are fresh local measurements, not a controlled interleaved regression comparison or physical-device evidence.

## Hard-Difficulty Refresh

Product `0.15.0` and simulation contract `5.3.0` add selectable bot difficulty. Normal retains its previous 10-tick perception delay, 12-tick decision interval, and six-candidate limit. The performance harnesses now select Hard's 6-tick delay, 8-tick interval, and eight-candidate limit so the public performance evidence covers the largest supported AI decision budget.

On 2026-07-23, Bun 1.3.14 ran 7,200 hard-difficulty ticks per count:

| Participants | AI p95 | Simulation p95 | Candidate/full pairs | Long steps over 100 ms |
|---:|---:|---:|---:|---:|
| 16 | 0.449 ms | 1.762 ms | 0.2976 | 0 |
| 24 | 0.627 ms | 2.025 ms | 0.2294 | 0 |
| 32 | 1.033 ms | 3.248 ms | 0.2329 | 0 |

The matching local production-Chrome run used Hard at 1280×720:

| Participants | Seed | Frame p95 | Maximum frame | Delivered ticks / requested simulation second | Long frames over 100 ms |
|---:|---|---:|---:|---:|---:|
| 16 | `0000001000000001` | 18.4 ms | 18.9 ms | 60.65 | 0 |
| 24 | `0000001800000001` | 18.4 ms | 18.6 ms | 60.77 | 0 |
| 32 | `0000002000000000` | 18.3 ms | 19.1 ms | 60.75 | 0 |

All samples stayed at 1× with zero backlog and effective device pixel ratio 1. Twenty immediate 32-participant restarts followed by CDP garbage collection increased used heap by 551,392 bytes and left one canvas. This replaces neither physical-device nor cross-browser evidence.

## Limits

- No physical baseline device, headed-browser trace, GPU timing, field data, Firefox, Edge, Safari, or mobile result exists.
- The pre-countdown browser harness used a fixed 750 ms startup delay. After the 1.5-second countdown shipped, that stale boundary included tick-zero time and produced invalid delivered-rate failures between 52.58 and 54.42. Those observations are rejected rather than reported as performance regressions.
- The first uncontrolled browser attempt ended an older 12-participant round at tick 364 after human elimination and 6× resolution. That historical observation is a gameplay-duration risk, not a valid steady active-load performance sample.
- Candidate ratios aggregate source counts across changing survivor counts. They describe comparison reduction for this workload, not a universal constant.
- Worker, WASM, WebGPU-only behavior, 64 participants, and rule changes by quality tier remain prohibited.
