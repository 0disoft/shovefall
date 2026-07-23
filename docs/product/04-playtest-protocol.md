# Human Playtest Protocol

- Status: Ready for first external gray-box batch
- Owner: Repository owner
- Product gates: [02-spec.md](02-spec.md)
- Roadmap gate: [01-roadmap.md](01-roadmap.md)
- Risk register: [03-risk-register.md](03-risk-register.md)

## Purpose

This procedure gathers the evidence the deterministic bot audits cannot produce: whether a person
understands the controls, sees danger, chooses risky items, explains a defeat, and wants another
round. It is deliberately local and lightweight. Shovefall does not add analytics, session replay,
automatic upload, or personal-data collection to answer these questions.

The facilitator records observations, not a polished story. A spectacular failure is one row, not
a balance decision. Repeated patterns across different people justify a reproduction task; they do
not automatically justify changing several systems at once.

## Evidence Levels

| Level | Minimum evidence | Claim allowed |
|---|---|---|
| Developer check | Repository owner on a named SHA and browser | Reproduction and obvious-regression notes only |
| Directional batch | Five distinct first-time players | Candidate usability and pacing problems; no quality-gate pass claim |
| Pre-submission batch | Ten distinct first-time players | Evaluate the percentages in the product specification |

Ten first-time players are the minimum for the current 90% explainable-death gate to tolerate one
miss without pretending a smaller sample is precise. These are submission gates for this build, not
population estimates.

## Build Record

Record this once per batch before anyone plays:

| Field | Value |
|---|---|
| Date | `YYYY-MM-DD` |
| Commit SHA | Exact 40-character SHA |
| Build source | Local production artifact or final HTTPS URL |
| Browser and version |  |
| Device, OS, viewport |  |
| Product / simulation / content versions |  |
| Facilitator | Pseudonym or role; no personal name required |

If the SHA or runtime versions change, start a new batch. Results from different behavior builds
must not be merged into one denominator.

After a round completes, `기록 복사` copies a local JSON record with the round versions, seed,
settings, completion tick, outcome, and state hash. Paste that record beside the observation row to
avoid transcription errors. It contains no player identity and performs no upload; the batch-level
commit SHA, browser, and device still come from the build record above.

## Session A: First-time Discovery

Give the player the link and only say: "한번 해봐." Do not explain controls, item effects, collapse,
or the desired number of rounds. Start on the menu with `게임 시작` and `설정` visible.

Observe until the player chooses to stop. Do not prompt a restart during the first five seconds
after the first defeat. If the player asks what to do, record the question before answering. After
their second round, ask the two neutral questions below without revealing the expected answer:

1. "방금 왜 떨어졌다고 생각해?"
2. "회피는 어떤 상황에서 쓰는 것 같아?"

Record one player-level row:

| Player code | Moved within 5 s | Dodge used or explained by round 2 | First death explained | Restarted within 5 s | Reached round 3 | First question or confusion | Notes |
|---|---|---|---|---|---|---|---|
| `T01` | Yes/No | Yes/No | Yes/No | Yes/No | Yes/No |  |  |

Count only observable behavior and the player's own explanation. A facilitator hint turns the
affected field into `Assisted`, which does not count as a pass.

## Session B: Paired Pacing

Use returning players or run this only after Session A is complete. Hold participant count at 16,
bot difficulty at Normal, recommended items at 6, and item respawn at 5 seconds. Compare Normal and
Slow collapse on the same build. Alternate order by player code so the first condition does not
always receive the learning disadvantage:

- Odd player codes: Normal, then Slow.
- Even player codes: Slow, then Normal.

Record each round:

| Player code | Order | Collapse | Seed | Duration | Result | Useful decisions or dead time | Preferred pace and why |
|---|---:|---|---|---:|---|---|---|
| `T01` | 1 | Normal |  |  |  |  |  |

Slow is not automatically better because it lasts longer. It earns promotion only when people can
name extra positioning, baiting, item, or recovery decisions created by the added time. Waiting for
the same ending is dead time.

## Session C: Risky Edge Items

Use the player's ordinary rounds; do not tell them to collect every item. Record an event only when
they visibly divert toward an item, deliberately refuse one, or ask what one means.

| Player code | Round | Item | Spawn band | Chose / refused / accidental | Outcome | Risk visible before choice | Player explanation |
|---|---:|---|---|---|---|---|---|
| `T01` | 1 | Iron Boots / Feather / Spring Glove | Outer / second / interior |  |  | Yes/No |  |

The design target is not maximum pickup rate. A healthy row can be a deliberate refusal because
the edge is too dangerous. Review is triggered by repeated unreadable or accidental outcomes,
not by low collection alone.

## Session D: Readability Stress

After the first-time batch, use experienced testers for one 24-participant round and optionally one
32-participant Mayhem round. Ask them to identify their character before moving, then record:

- whether human identity was lost during combat;
- whether shove windup and dodge were distinguishable;
- whether tile warning preceded the collapse clearly;
- whether each item type could be distinguished;
- whether the final cause of death was explainable.

Quality promotion applies to 16 and 24 participants. The 32-participant result is a stress report,
not a requirement that Mayhem look as clean as the normal modes.

## Batch Summary

Copy this table below the raw rows or into a dated file under `docs/product/playtests/` when a batch
is ready to preserve. Use aggregate counts with the denominator; do not store names, email
addresses, recordings, or free-form personal details.

| Gate | Passed / eligible | Rate | Required | Decision |
|---|---:|---:|---:|---|
| Moved within five seconds |  |  | 80% |  |
| Dodge used or explained by round two |  |  | 60% |  |
| First death explained immediately |  |  | 90% |  |
| Restarted within five seconds |  |  | 60% |  |
| Reached a third round |  |  | 50% |  |

Also report:

- Normal-versus-Slow preference count and the reasons, separated into useful decisions and dead
  time.
- Chosen, refused, accidental, readable, and unreadable edge-item events by item type.
- Repeated confusion patterns observed in at least three distinct players.
- Browser, device, or viewport failures separated from game-rule feedback.

## Decision Rules

- Change one owning variable at a time: input/physics, collapse cadence, item placement, item
  strength, or presentation. A batch that changes several cannot explain improvement.
- Preserve the failing seed and exact SHA when the complaint is reproducible. Add an automated
  regression only for deterministic behavior; subjective preference remains human evidence.
- Do not tune from one player, one memorable clip, bot-only exposure ratios, or a different SHA.
- If a product gate misses, write the observed cause before proposing a solution. If the cause is
  not reproducible or repeated, collect another batch rather than guessing.
- After a behavior change, retire the old batch for release approval. Keep it as historical
  evidence but run the affected session again on the new SHA.

## Privacy and Storage

Use player codes such as `T01`. Obtain explicit consent before recording video or audio and keep
those files outside Git. The repository may store only compact observation tables and aggregate
decisions without identifying data. Shovefall itself remains free of remote analytics and automatic
error or session upload.
