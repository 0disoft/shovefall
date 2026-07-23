# Scale and Performance

- Status: Accepted local automated baseline; physical and cross-browser evidence pending
- Owner: Repository owner

## 0.29.0 Brick Bag and Boat Profile

On 2026-07-24, the 7,200-tick fixed-50 profile equipped the scripted human with Brick Bag and Boat, kept a peak of three walls with `2.999` mean walls per tick, and observed one active Boat user with `0.042` mean users per tick. It completed in `30,314.626 ms`, or `3.96×` real time. AI p95 was `7.967 ms`, simulation p95 was `4.351 ms`, the spatial candidate/full-pair ratio was `0.096`, and no combined step exceeded 100 ms. The `15,197,027`-byte heap delta remains observational because the harness does not force garbage collection.

The production Chrome profile selected Brick Bag and Boat, placed a wall, activated Boat, and then sampled four seconds at 1280×720 and effective DPR 1. Frame p95 was `18.5 ms`, maximum was `38.6 ms`, delivered ticks were `62.55` per requested simulation second, backlog stayed zero, and no frame exceeded 100 ms. Twenty immediate restarts followed by CDP garbage collection left a `2,755,504`-byte used-heap delta. This is one local Chrome run, not physical-device, cross-browser, or field evidence.

## 0.28.0 Brick Bag Profile

On 2026-07-24, the 7,200-tick fixed-50 profile equipped the scripted human with Brick Bag and kept a peak of three walls with `2.999` mean walls sampled per tick. It completed in `18,142.957 ms`, or `6.61×` real time. AI p95 was `4.875 ms`, simulation p95 was `2.525 ms`, the spatial candidate/full-pair ratio was `0.096`, and no combined step exceeded 100 ms. The `14,987,032`-byte heap delta remains observational because the harness does not force garbage collection.

The production Chrome profile equipped and placed Brick Bag before its four-second sample. At 1280×720 and effective DPR 1 it measured `18.5 ms` frame p95, `35.7 ms` maximum, `62.09` delivered ticks per requested simulation second, zero backlog, and no frame above 100 ms. Twenty immediate restarts followed by CDP garbage collection left a `2,779,444`-byte used-heap delta. The p95 is `1.7 ms` slower than the prior `0.27.0` Wind Blast sample but remains inside the declared browser budget. This is one local Chrome run, not physical-device, cross-browser, or field evidence.

## 0.27.0 Wind Blast Profile

On 2026-07-24, the accepted 7,200-tick fixed-50 rerun completed in `43,839.502 ms`, or `2.74×` real time. AI p95 was `10.034 ms`, simulation p95 was `5.454 ms`, the spatial candidate/full-pair ratio remained `0.1679`, and no combined step exceeded 100 ms. The `49,304,313`-byte heap delta is observational because the harness does not force garbage collection. An immediately preceding run had similar p95 values but two host-level 100 ms spikes and failed the declared tail gate; the passing rerun is retained without hiding that first result.

The production Chrome profile at 1280×720 and effective DPR 1 measured `16.8 ms` frame p95, `17.5 ms` maximum, `62.2` delivered ticks per requested simulation second, zero backlog, and no frame above 100 ms. Twenty immediate restarts followed by CDP garbage collection left a `2,984,412`-byte used-heap delta. This proves the current local 50-participant workload, not physical-device, cross-browser, or field performance.

## 0.26.0 Fixed-50 Profile

On 2026-07-23, the 44×36 public island with five lake attempts and Hard AI completed a 7,200-tick headless run in `51,344.41 ms`, or `2.34×` real time. AI p95 was `11.538 ms`, simulation p95 was `6.702 ms`, the spatial candidate/full-pair ratio was `0.1679`, and one combined step exceeded 100 ms. The `51,408,098`-byte heap delta is observational because the harness does not force garbage collection.

The first production-Chrome attempt rebuilt the full decorative bot treatment every frame and measured a `33.4 ms` p95 despite delivering `63.99` ticks per requested simulation second with zero backlog. That failed profile is retained as the optimization trigger, not accepted by weakening the budget. After 25+ participant bots kept mass-scaled size, action color, facing, and stumble/fall marks while dropping redundant shadows, collision rings, mass glyphs, and item badges, the same seed measured:

| Participants | Seed | Frame p95 | Maximum frame | Delivered ticks / requested simulation second | Backlog | Long frames over 100 ms |
|---:|---|---:|---:|---:|---:|---:|
| 50 | `0000003200000000` | 16.8 ms | 33.4 ms | 63.13 | 0 | 0 |

Twenty immediate 50-participant restarts followed by CDP garbage collection increased used heap by `2,848,504` bytes and left one canvas. This is one local headless Chrome run at 1280×720 and effective DPR 1, not physical-device, cross-browser, or field evidence.

## 0.20.0 Expanded-arena Profile

On 2026-07-23, Hard-difficulty 7,200-tick headless runs passed at 16/24/32 participants with simulation p95 `1.704 / 3.133 / 4.064 ms`, AI p95 `0.440 / 0.794 / 1.107 ms`, and zero steps over 100 ms. Production Chrome p95 frames were `16.8 / 16.8 / 16.9 ms`, maximum backlog was zero, and twenty restarts produced a `2,340,924`-byte collected heap delta. The larger `15×12`, `18×14`, and `20×15` grids therefore remain inside the existing local frame and tick budgets.

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
