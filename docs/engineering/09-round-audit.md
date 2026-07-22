# Deterministic Round Audit

- Status: Local bot-workload evidence; human-play approval pending
- Command: `audit-rounds` through the configured `shovefall_audit_rounds` intent
- Audit schema: `deterministic-all-bot-round-audit` version 1

## Question and Boundary

The audit asks whether recommended-size rounds reach a structurally valid terminal result without relying on the hard time-limit draw. It does not ask whether a human finds the round fun, fair, readable, or correctly paced.

Every scenario uses the production arena-size policy, enabled items, recommended initial item count, and a 75-second round limit. Counts 4, 12, and 24 use normal collapse with a five-second item interval. The 32-participant Mayhem scenario uses fast collapse with a three-second item interval. Actor 1 receives commands from the same deterministic bot policy as every other actor solely inside this harness.

The source unit is one completed deterministic round. Duration is `completedTick / 60`, not wall-clock execution time. Percentiles use nearest-rank selection over sixteen fixed seeds per participant count. The command emits each seed, completion tick, duration, reason, winner, and final state hash before the summaries, so a regression can be reproduced without treating an average as raw evidence.

## First Version 1 Observation

The first local run on product `0.12.0` and simulation `5.0.0` produced the following fixed-tick results:

| Participants | Minimum | p50 | p95 | Maximum | Last standing | No survivors | Time limit |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 4 | 2.367 s | 4.500 s | 23.367 s | 23.367 s | 16 | 0 | 0 |
| 12 | 8.950 s | 14.150 s | 29.817 s | 29.817 s | 16 | 0 | 0 |
| 24 | 14.117 s | 24.200 s | 31.017 s | 31.017 s | 16 | 0 | 0 |
| 32 | 18.800 s | 21.667 s | 23.633 s | 23.633 s | 15 | 1 | 0 |

All 64 samples produced consistent terminal state within the limit, so the structural termination rule passed. The 32-participant simultaneous elimination is a valid `no-survivors` result, not a malformed draw.

## Decision

The audit gates only terminal structure and absence of time-limit draws for its fixed all-bot workload. Winner coverage and duration distribution remain observations. They are deliberately not fairness gates: sixteen deterministic seeds are too few for a population claim, and a bot-only workload is not a substitute for a human session.

The short observed durations are a product risk. In particular, the default 12-participant bot workload has a 14.150-second median, so it cannot support a one-to-two-minute human-play claim. The product specification therefore states the implemented 75-second hard limit and leaves target human duration pending. Combat, spawn, or collapse tuning must not be changed solely to make these bot numbers look longer; the next pacing decision needs gray-box human observations with defeat reason and restart timing.

## Reproduction and Drift

The seed pattern is `round-audit-v1-<participantCount>-<0..15>`. Changing the sample set, percentile rule, bot policy, item policy, arena sizing, collapse cadence, fixed-tick rate, or terminal semantics requires an audit-version review. A passing rerun proves only the checked-in deterministic scenarios on the executing code. It does not prove browser frame rate, device performance, hosted behavior, cross-browser behavior, or external playtest success.
