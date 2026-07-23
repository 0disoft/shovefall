# Round and strategy audit

## Widened-island `0.33.0` status

- Product: `0.33.0`
- Simulation: `16.0.0`
- Content: `9.0.0`
- Public bound: `48×40`, exactly eight separated 6–10-tile lakes under a 72-tile budget

Thirty-two public seeds pass the topology gate with one connected 1,080–1,104-tile starting island after lakes, eight enclosed lake components, fifty distinct supported spawns at shore depth one or greater, and an exact connected `ceil(initial land × 0.20)` collapse core. The topology-independent item selector chooses edge, near-edge, or interior with fixed 3:2:1 band weights before choosing a tile within that band.

The full `audit:rounds` workload exceeded its configured 300-second limit before emitting a result. This is neither a balance pass nor a balance failure. The 7,200-tick headless performance profile passes at simulation p95 `6.823 ms`, zero steps over 100 ms, and `1.73×` real time, but it does not prove round duration, human pacing, risky-pickup balance, or aggression-versus-survival outcomes on the widened map.

## Fixed-50 `0.26.0` status

- Product: `0.26.0`
- Simulation: `9.0.0`
- Content: `5.0.0`
- Public bound: `44×36`, five bounded lake attempts

The main round and strategy harnesses now target 50 participants. The fresh headless performance profile completed 7,200 Hard-AI ticks at `2.34×` real time with AI p95 `11.538 ms`, simulation p95 `6.702 ms`, and one combined step over 100 ms. The local production-Chrome profile measured p95 `16.8 ms`, zero backlog, no frame over 100 ms, and a `2,848,504`-byte forced-GC heap increase after 20 restarts. Full fixed-50 round and strategy balance results have not yet been accepted; the historical tables below remain provenance only and cannot justify current tuning.

## Procedural-island `0.22.0` validation status

- Product: `0.22.0`
- Simulation: `7.0.0`
- Content: `4.0.0`
- Preset bounds: `16×13`, `20×16`, `24×19`, and `28×22`

The island contract has deterministic tests across all four participant tiers and multiple seeds. They require one connected tick-zero landmass, enclosed lakes, distinct supported default spawns, an exact `ceil(initial playable land × 0.20)` final land count, and one connected protected final core. These invariants validate topology and collapse limits; they do not prove human pacing or item risk preference.

The full `audit:rounds` workload again hit its configured 300-second timeout before emitting a result. It is neither a pass nor a balance failure, and the historical `0.20.0` round tables below do not transfer to procedural islands. Current headless scale profiling completed 7,200 ticks at 16/24/32 participants with 0 steps over 100 ms; the 32-participant run reported AI p95 `5.404 ms`, simulation p95 `3.917 ms`, and `3.61×` real-time throughput. Current local production Chrome profiling reported p95 `16.9/17.0/16.9 ms`, 0 backlog ticks, 0 frames over 100 ms, and a 1,436,776-byte heap increase after 20 restarts. This is local lab evidence, not field or cross-browser evidence.

## Current evidence

- Historical product: `0.20.0`
- Simulation: `6.0.0`
- Content: `4.0.0`
- Focused command: `bun run audit:strategy`
- Seeds: `strategy-audit-v1-<participantCount>-<0..7>`
- Sample: eight deterministic all-bot rounds at each 8/16/24/32 tier
- Round limit: 75 seconds

The focused audit was added after starting loadouts, larger arenas, hand-reach shove contacts, elimination credit, and command-driven stat growth changed the previous balance model. It records personality wins, credited eliminations, active survival ticks, overlapping item exposure, overlapping mass exposure, duration, and terminal reason. It is a regression screen over fixed rule-based bots, not a human-play or causal balance proof.

## Round duration

| Participants | Arena | Minimum | Mean | Maximum | Last standing | No survivors | Time limit |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 8 | 12×10 | 18.733 s | 33.665 s | 46.383 s | 8 | 0 | 0 |
| 16 | 15×12 | 38.233 s | 40.544 s | 42.850 s | 8 | 0 | 0 |
| 24 | 18×14 | 41.367 s | 41.675 s | 42.250 s | 7 | 1 | 0 |
| 32 | 20×15 | 29.133 s | 30.415 s | 31.183 s | 7 | 1 | 0 |

The enlarged arenas lengthen the 8/16/24 tiers without producing a sampled time-limit draw. Chaos remains shorter because its production preset uses Fast collapse. These are bot-workload observations; human duration remains a playtest question.

## Aggression versus survival

| Personality | Actor-rounds | Wins | Win rate | Credited eliminations / actor-round | Mean survival |
| --- | ---: | ---: | ---: | ---: | ---: |
| Aggressor | 119 | 6 | 5.04% | 1.0588 | 31.271 s |
| Survivor | 125 | 8 | 6.40% | 0.9200 | 31.076 s |
| Opportunist | 121 | 3 | 2.48% | 0.7107 | 30.172 s |
| Disruptor | 143 | 10 | 6.99% | 0.8741 | 28.329 s |
| Collector | 132 | 3 | 2.27% | 0.6364 | 23.856 s |

The declared screen requires Aggressor win rate to remain at least `0.75×` Survivor and its credited-elimination rate not to trail Survivor. The accepted run reports `0.7875×` and `1.1509×`. The first run before balance correction reported `0.2333×` win rate despite `1.2129×` eliminations: Aggressor spent its first reward on more Power and Survivor was not sufficiently distinct from ordinary combat. The accepted implementation makes Survivor less willing to approach, makes Aggressor spend its first earned point on Stability, and raises Stability from 7% to 12% received-impulse reduction per level. The gate was not weakened.

## Descriptive item and mass exposure

| Exposure | Actor-rounds | Winner actor-rounds | Observed win rate |
| --- | ---: | ---: | ---: |
| Iron Boots | 85 | 6 | 7.06% |
| Feather | 79 | 2 | 2.53% |
| Spring Glove | 92 | 3 | 3.26% |
| Light mass | 79 | 2 | 2.53% |
| Normal mass | 640 | 30 | 4.69% |
| Heavy mass | 85 | 6 | 7.06% |

These rows overlap and contain selection, survival-time, personality, spawn, and edge-risk confounding. They do not justify a causal item or mass buff by themselves. Starting human loadouts are deliberately excluded because every audit actor is bot-controlled.

## Inconclusive full audit

The legacy `audit:rounds` command still includes 64 production rounds, 24 controlled base-mass rounds, 64 controlled tick-zero item rounds, and 48 paired collapse-speed rounds. After arena expansion it exceeded both the configured 300-second limit and a one-time 420-second diagnostic limit before emitting a result. Both exits were `124`; neither is a balance failure or pass. The sample count and gates were not reduced to manufacture a result. The focused strategy audit supplies the current aggression decision, while refreshed controlled mass, item, and collapse evidence remains pending a faster harness or separately configured bounded jobs.

## Limits

- Fixed seeds and deterministic bots are regression evidence, not population statistics.
- The strategy comparison is observational because personality assignment, spawn position, item access, and opponent mix vary.
- Item and mass exposure rows overlap and are not controlled treatment estimates.
- Browser performance is measured separately; this audit does not measure rendering.
- Physical-device, cross-browser, hosted-version, and human-play balance remain unproven.
