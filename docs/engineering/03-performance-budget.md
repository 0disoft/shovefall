# Performance Budget

- Status: Accepted local production-Chrome budgets; physical browser baseline pending
- Owner: Repository owner
- Source of truth: `docs/product/02-spec.md` and this document

## Product 0.30.0 Local Result

The fixed-50 harness exercises live Bomb work rather than an empty entity list. Actor 1 maintains up to three Brick Bag walls while actors 1 and 2 place two Bombs that complete their 300-tick fuses and detonate on the same tick. The 7,200-tick headless run reports simulation p95 `4.867 ms`, AI p95 `8.451 ms`, no combined step above 100 ms, and `4.10×` real-time throughput. Local production Chrome at 1280×720 and effective DPR 1 reports frame p95 `18.5 ms`, maximum `18.9 ms`, zero backlog, no frame above 100 ms, `61.63` delivered ticks per requested simulation second, and a `3,033,656`-byte forced-GC heap delta after twenty restarts. This passes the existing local budgets but does not replace physical-device, cross-browser, or field evidence.

## Product 0.29.0 Local Result

The fixed-50 harness exercises both active mechanics: the scripted human keeps up to three Brick Bag walls and activates Boat for 300 ticks each round. The 7,200-tick headless run reports simulation p95 `4.351 ms`, AI p95 `7.967 ms`, no combined step above 100 ms, and `3.96×` real-time throughput. Local production Chrome at 1280×720 and effective DPR 1 reports frame p95 `18.5 ms`, maximum `38.6 ms`, zero backlog, no frame above 100 ms, `62.55` delivered ticks per requested simulation second, and a `2,755,504`-byte forced-GC heap delta after twenty restarts. This passes the existing local budgets but does not replace physical-device, cross-browser, or field evidence.

## Product 0.28.0 Local Result

The Brick Bag profile exercises real static-wall work rather than measuring an empty wall collection. The scripted human maintains up to three walls across the 7,200-tick fixed-50 headless run; simulation p95 is `2.525 ms`, no combined step exceeds 100 ms, and throughput is `6.61×` real time. The local production Chrome case equips and places Brick Bag before sampling and reports frame p95 `18.5 ms`, maximum `35.7 ms`, zero backlog, no frame above 100 ms, `62.09` delivered ticks per requested simulation second, and a `2,779,444`-byte forced-GC heap delta after twenty restarts. This passes the existing local budgets but does not replace physical-device, cross-browser, or field evidence.

## Product 0.27.0 Local Result

The Wind Blast system and its DOM/PixiJS feedback preserve the fixed-50 budgets on the current workstation. The accepted 7,200-tick rerun measured simulation p95 `5.454 ms`, zero combined steps above 100 ms, and `2.74×` real-time throughput. Local production Chrome measured frame p95 `16.8 ms`, maximum `17.5 ms`, zero backlog, no frame above 100 ms, and a `2,984,412`-byte forced-GC heap delta after twenty restarts. One preceding headless run failed only the tail gate with two host-level spikes despite simulation p95 `5.749 ms`; the rerun and the failed tail are both recorded in the scale evidence rather than weakening the gate.

## Product 0.20.0 Local Result

The enlarged arenas, starting loadout state, progression fields, and hand-contact presentation pass the existing bounded local profiles. Hard-difficulty headless p95 AI/simulation time is `0.440/1.704 ms` at 16, `0.794/3.133 ms` at 24, and `1.107/4.064 ms` at 32 participants, with no step above 100 ms. Production Chrome p95 frame time is `16.8/16.8/16.9 ms`, maximum backlog is zero, and no sampled frame exceeds 100 ms. Twenty fresh-round restarts add `2,340,924` Chromium heap bytes after collection. This is one local workstation and headless Chrome result, not field or cross-browser evidence.

## User-facing Budgets

- The fixed 50-participant mode targets 60 rendered frames per second on the named desktop baseline and must preserve input delivery. Presentation quality may reduce bot shadows, duplicate rings, badges, particles, shake, and device-pixel ratio before changing rules or the human's identity treatment.
- The fixed 60 Hz simulation cannot drop authoritative ticks. The application caps catch-up work per render frame and exposes backlog rather than silently changing results.
- Setup-to-rendered-tick-zero and restart-to-rendered-tick-zero should complete within one second when assets are already local. The deliberate 1.5-second countdown begins only after that ready state and is excluded from this loading budget. Human defeat must offer restart or accelerated resolution within five seconds.

The physical baseline device and repeatable browser capture procedure are still pending, so browser frame targets are release blockers only after that evidence is named.

## Automated Regression Budgets

- The 100-run determinism test executes 12,000 ticks with 12 participants and must finish within its 15-second Vitest budget. Observed 2026-07-22 local runs completed in approximately 2.7 to 13.5 seconds under varying concurrent test load; this is evidence from one workstation, not a portable forecast. Repeated approach to the upper bound requires profiling rather than a silent timeout increase.
- A 50-participant `RenderFrameV1` has a 512 KiB warning threshold. Production code must not JSON-serialize the full frame every render.
- Total compressed production JavaScript has a 180 KiB warning budget and CSS has a 20 KiB warning budget before image assets. The Coal-Twilight `0.18.2` Vite build on 2026-07-23 reports approximately 160.79 KiB gzip across emitted JavaScript chunks, a 51.72 KiB gzip entry chunk, and 2.36 KiB gzip CSS. Procedural oscillator audio adds no downloaded media. Chunk count alone is not a failure when Vite and PixiJS load the provider-neutral static artifact correctly.
- Replay JSON is capped at 5 MiB and 7,200 ticks before parsing or execution.

The `0.18.2` local production-Chrome profile at 1280×720 and DPR 1 measured p95 frame times of
`17.1 / 17.0 / 16.8 ms` for 16/24/32 hard-difficulty participants, maximum frames of
`33.4 / 17.6 / 29.1 ms`, no frame over 100 ms, and zero simulation backlog. Twenty forced restarts
left an observational forced-GC heap delta of 2,759,440 bytes. This is the first baseline that
explicitly presents every requested PixiJS frame; the earlier `0.18.0` measurement did not exercise
that presentation boundary and is not a valid before/after rendering comparison. This remains one
headless Chrome run on the local workstation, not physical-device, cross-browser, or field evidence.

## Hot-path Rules

- Simulation work is renderer-independent and allocation changes must be measured with the public 50-participant setting.
- Same-tick shove contacts remain batched for correctness. A stable 1.7-unit spatial hash supplies same and adjacent-cell pairs to weak contacts and shoves, preserves ActorId order, and reports candidate/full-pair source counts.
- The first weak-contact iteration checks the analytic first intersection of each candidate pair's relative movement segment and combined body radius. It reintegrates the remaining fraction of that tick after a deterministic mass-weighted response. Later iterations retain bounded overlap correction; no physics substep count scales with speed.
- Bot decisions run on staggered 12-tick schedules, retain intent between decisions, query a bounded spatial neighborhood, and score at most six nearby candidates. Browser composition reuses the last emitted `RenderFrameV1` for AI and presentation instead of rebuilding and hashing the world multiple times per tick.
- Item pickup uses bounded direct squared-distance scans without per-item steady-state sorting. Spawn and safe-area work is skipped on ticks with neither a due spawn nor an arena transition. Weighted candidate choice performs one bounded tile scan only when an initial or due spawn needs a location. Item-enabled headless and Chrome evidence passes at 50 participants after the allocation optimization.
- Presentation event cursors advance in constant time and reject duplicate or older events before creating visuals or sound. Normal rounds cap transient effects at 36 and audio voices at 6; Mayhem caps nonessential transient effects at 14 and suppresses bot dodge trails while preserving human feedback.
- PixiJS rebuilds the tile graphics layer only for a tile-state transition, a new round, or a renderer resize. Participants, items, and transient effects remain live per-frame layers; static arena tiles are not cleared and reconstructed on every animation frame.
- At 25 or more participants, non-human presentation uses one mass-scaled body, an action-colored outline, facing, and stumble/fall marks. The human keeps the full diamond, guard ring, shadow, and item treatment. This keeps public 50-participant Chrome p95 at `16.8 ms` without changing commands, physics, support, AI, or replay state.
- No background job, application network request, analytics upload, or remote model call belongs in the MVP runtime.

## Review Blockers

- A visual optimization changes simulation rules, skips ticks, or removes a telegraph.
- A 50-participant claim is made from renderer count alone without collision, bot, tile, and input evidence.
- A slow test is deleted or reduced below its contract instead of receiving a documented local budget or a measured optimization.
- Bundle or frame evidence omits source maps, compression mode, device, browser, participant count, or scenario.
