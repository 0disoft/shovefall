# Deterministic Round and Balance Audit

- Status: Local bot-workload evidence; human-play approval pending
- Command: `audit-rounds` through the configured `shovefall_audit_rounds` intent
- Audit schema: `deterministic-round-and-balance-audit` version 5

## Question and Boundary

The audit asks five bounded questions: whether each production preset terminates without a hard-limit draw, where the item policy actually places rewards, whether controlled base-mass groups show an obvious win-rate skew, whether equal-slot synthetic item grants show an obvious winner-distribution skew, and whether collapse-speed choices preserve a useful pacing relationship. It also reports live item-exposure outcomes, but those are descriptive rather than causal because longer-lived actors have more time to collect items.

The production workload uses 8, 16, 24, and 32 participants with the Small, Default, Crowded, and Mayhem rules at Normal bot difficulty. Each count runs sixteen fixed seeds with production arena size, recommended initial items, preset respawn interval, preset collapse speed, and a 75-second limit. Actor 1 receives the same deterministic bot policy as every other actor only inside this harness.

Duration is `completedTick / 60`, not command wall time. Percentiles use nearest-rank selection. Every raw round reports its seed, completion tick, terminal reason, winner, and state hash. Item exposure counts one actor-round when that actor collected the named item at least once; the same actor-round may appear under several items. Mass exposure counts active actor-ticks, so winners necessarily contribute more ticks.

## Version 5 Production-Preset Observation

The accepted product `0.16.0`, simulation `5.3.0`, and content `3.1.0` run produced:

| Participants | Preset | Minimum | p50 | p95 | Maximum | Last standing | No survivors | Time limit |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 8 | Small | 6.500 s | 14.467 s | 41.967 s | 41.967 s | 16 | 0 | 0 |
| 16 | Default | 12.617 s | 21.917 s | 40.750 s | 40.750 s | 16 | 0 | 0 |
| 24 | Crowded | 18.567 s | 34.583 s | 38.233 s | 38.233 s | 16 | 0 | 0 |
| 32 | Mayhem | 22.583 s | 25.600 s | 27.683 s | 27.683 s | 16 | 0 | 0 |

All 64 production-preset samples ended by last standing within the limit and none relied on a time-limit draw. These bot medians remain well below a one-to-two-minute claim and do not establish human round duration.

## Item Placement Observation

Item candidates must be stable and clear of participants and existing items. At each spawn, the current stable footprint defines its outer and second rings; this includes a new frontier exposed by earlier collapse. Integer weights are 3 for that outer ring, 2 for the second ring, and 1 for the interior. The measured spawn distribution was:

| Participants | Outer ring | Second ring | Interior | Outer two rings |
|---:|---:|---:|---:|---:|
| 8 | 49 | 22 | 6 | 92.21% |
| 16 | 95 | 44 | 24 | 85.28% |
| 24 | 130 | 72 | 49 | 80.48% |
| 32 | 167 | 76 | 58 | 80.73% |

The policy clears the predeclared 60% outer-two-ring gate at every production count. It is a preference, not an exclusive edge spawn: every count retained interior observations. Warning, collapsing, and void tiles are never candidates for a new item.

## Item Exposure Observation

The exposed-actor win rate divided by the no-item-exposure win rate varied by participant count:

| Participants | Iron Boots | Feather | Spring Glove |
|---:|---:|---:|---:|
| 8 | 4.884× | 7.325× | 9.420× |
| 16 | 0.839× | 0.000× | 1.695× |
| 24 | 1.366× | 1.568× | 0.946× |
| 32 | 3.034× | 4.335× | 2.311× |

This table is not an item-power ranking. All three items move together, exposure overlaps, Collector personality is not uniformly distributed, and surviving longer creates more pickup opportunities. The evidence is retained as a drift baseline, but no item multiplier is changed solely from this correlation.

## Controlled Item-Grant Observation

The item check disables production spawns in an 8-participant slow-collapse arena and rotates every actor through control, Iron Boots, Feather, and Spring Glove over sixty-four fixed seeds. Each group receives 128 actor-round slots. Six synthetic items are placed directly under their assigned actors and consumed on tick zero; this deliberately bypasses the production simultaneous-item cap so every non-control slot receives exactly one grant. One round ended with no survivors, leaving 63 winners:

| Grant group | Actor-round slots | Wins | Slot win rate | Relative to equal-slot expectation |
|---|---:|---:|---:|---:|
| Control | 128 | 15 | 11.72% | 0.953× |
| Iron Boots | 128 | 23 | 17.97% | 1.461× |
| Feather | 128 | 13 | 10.16% | 0.826× |
| Spring Glove | 128 | 12 | 9.38% | 0.763× |

The winner-distribution chi-square statistic is `4.7460` with three degrees of freedom, below the predeclared `7.815` screen. Every group also remains inside the broad `0.4×..1.8×` slot-rate gate. Iron Boots leads this fixed sample, but the result does not cross either regression boundary, so changing its defense multiplier would be tuning toward bot noise rather than demonstrated breakage.

This is causal evidence only for receiving one effect at tick zero inside the harness. It does not include the intended cost of reaching a dangerous edge spawn, later pickup timing, production item caps, repeated pickups, every participant count, or human decision-making. Those remain gray-box playtest questions.

## Controlled Collapse-Pacing Observation

The pacing check holds 16 participants, Normal bot difficulty, arena size, item policy, and sixteen seeds constant while varying only collapse speed:

| Collapse speed | Mean | p50 | p95 | Maximum | Time-limit draws |
|---|---:|---:|---:|---:|---:|
| Slow | 23.855 s | 21.000 s | 47.467 s | 47.467 s | 0 |
| Normal | 21.356 s | 21.933 s | 34.233 s | 34.233 s | 0 |
| Fast | 16.915 s | 17.100 s | 23.467 s | 23.467 s | 0 |

Slow lasted at least as long as Fast in 13 of 16 paired seeds (`81.25%`). Mean duration orders Slow above Normal above Fast, and both Slow and Normal p50 remain above Fast. The initially attempted `Slow p50 >= Normal p50 >= Fast p50` gate failed because Normal's p50 exceeded Slow by 0.933 seconds; bot combat can settle before the first collapse transition and later geometry changes can reorder adjacent outcomes. Audit version 5 keeps every percentile visible but gates the supported claim instead of pretending every individual or adjacent-tier result is monotonic.

The result supports a pacing control, not a promise that Slow lengthens every round. Human duration and perceived tempo still require playtest evidence.

## Controlled Base-Mass Observation

The mass check disables items in a 16-participant normal arena and rotates every actor through light, normal, and heavy base mass over twenty-four fixed seeds. Each band receives 128 actor-round slots. The initial `0.7 / 1.0 / 1.5` run produced only 3 light wins versus 12 heavy wins, failing the lower 0.4× gate for light actors. The accepted `0.8 / 1.0 / 1.4` range produced:

| Base mass | Actor-round slots | Wins | Slot win rate | Relative to equal-slot expectation |
|---:|---:|---:|---:|---:|
| 0.8 | 128 | 7 | 5.47% | 0.875× |
| 1.0 | 128 | 8 | 6.25% | 1.000× |
| 1.4 | 128 | 9 | 7.03% | 1.125× |

The accepted result passes the deliberately broad `0.4×..1.8×` screening gate. Twenty-four winners are too few for equivalence or population fairness claims; the result only rejects the earlier obvious extreme skew in this deterministic workload.

## Decision

The 8/16/24/32 production presets, selectable collapse speeds, 3/2/1 edge weighting, `0.8..1.4` mass bounds, and current three item effects are accepted for the next gray-box playtest. Combat impulse, dodge timing, support, item duration, item multipliers, and the 75-second limit are unchanged. The audit remains a regression screen, not permission to tune toward bot statistics at the expense of readable human play.

## Reproduction and Drift

Production seeds use `round-audit-v2-<participantCount>-<0..15>`, controlled mass seeds use `mass-audit-v1-<0..23>`, controlled item seeds use `item-grant-audit-v1-<0..63>`, and paired pacing seeds use `collapse-audit-v1-<0..15>`. Changing the sample set, exposure denominator, duration statistic, bot policy, item policy, arena sizing, collapse cadence, fixed-tick rate, controlled assignment, or terminal semantics requires an audit-version review. A passing rerun proves only the checked-in deterministic scenarios on the executing code. It does not prove browser frame rate, physical-device performance, cross-browser behavior, hosted behavior, risky live pickup balance, or human balance.
