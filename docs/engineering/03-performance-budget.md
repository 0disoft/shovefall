# Performance Budget

- Status: Accepted local production-Chrome budgets; physical browser baseline pending
- Owner: Repository owner
- Source of truth: `docs/product/02-spec.md` and this document

## User-facing Budgets

- The normal 16- and 24-participant modes target 60 rendered frames per second on the named desktop baseline.
- The 25- to 32-participant Mayhem tier must sustain at least 45 rendered frames per second and preserve input delivery. Presentation quality may reduce particles, shadows, shake, and device-pixel ratio before changing rules.
- The fixed 60 Hz simulation cannot drop authoritative ticks. The application caps catch-up work per render frame and exposes backlog rather than silently changing results.
- Setup-to-rendered-tick-zero and restart-to-rendered-tick-zero should complete within one second when assets are already local. The deliberate 1.5-second countdown begins only after that ready state and is excluded from this loading budget. Human defeat must offer restart or accelerated resolution within five seconds.

The physical baseline device and repeatable browser capture procedure are still pending, so browser frame targets are release blockers only after that evidence is named.

## Automated Regression Budgets

- The 100-run determinism test executes 12,000 ticks with 12 participants and must finish within its 15-second Vitest budget. Observed 2026-07-22 local runs completed in approximately 2.7 to 13.5 seconds under varying concurrent test load; this is evidence from one workstation, not a portable forecast. Repeated approach to the upper bound requires profiling rather than a silent timeout increase.
- A 32-participant `RenderFrameV1` has a 256 KiB warning threshold. Production code must not JSON-serialize the full frame every render.
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

- Simulation work is renderer-independent and allocation changes must be measured with 16, 24, and 32 participants.
- Same-tick shove contacts remain batched for correctness. A stable 1.7-unit spatial hash supplies same and adjacent-cell pairs to weak contacts and shoves, preserves ActorId order, and reports candidate/full-pair source counts.
- The first weak-contact iteration checks the analytic first intersection of each candidate pair's relative movement segment and combined body radius. It reintegrates the remaining fraction of that tick after a deterministic mass-weighted response. Later iterations retain bounded overlap correction; no physics substep count scales with speed.
- Bot decisions run on staggered 12-tick schedules, retain intent between decisions, query a bounded spatial neighborhood, and score at most six nearby candidates. Browser composition reuses the last emitted `RenderFrameV1` for AI and presentation instead of rebuilding and hashing the world multiple times per tick.
- Item pickup uses bounded direct squared-distance scans without per-item steady-state sorting. Spawn and safe-area work is skipped on ticks with neither a due spawn nor an arena transition. Weighted candidate choice performs one bounded tile scan only when an initial or due spawn needs a location. Item-enabled headless and Chrome evidence passes at 16/24/32 after the allocation optimization.
- Presentation event cursors advance in constant time and reject duplicate or older events before creating visuals or sound. Normal rounds cap transient effects at 36 and audio voices at 6; Mayhem caps nonessential transient effects at 14 and suppresses bot dodge trails while preserving human feedback.
- PixiJS rebuilds the tile graphics layer only for a tile-state transition, a new round, or a renderer resize. Participants, items, and transient effects remain live per-frame layers; static arena tiles are not cleared and reconstructed on every animation frame.
- No background job, application network request, analytics upload, or remote model call belongs in the MVP runtime.

## Review Blockers

- A visual optimization changes simulation rules, skips ticks, or removes a telegraph.
- A 32-participant claim is made from renderer count alone without collision, bot, tile, and input evidence.
- A slow test is deleted or reduced below its contract instead of receiving a documented local budget or a measured optimization.
- Bundle or frame evidence omits source maps, compression mode, device, browser, participant count, or scenario.
