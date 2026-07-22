# Performance Budget

- Status: Accepted initial budgets; physical browser baseline pending
- Owner: Repository owner
- Source of truth: `docs/product/02-spec.md` and this document

## User-facing Budgets

- The normal 12- and 24-participant modes target 60 rendered frames per second on the named desktop baseline.
- The 25- to 32-participant Mayhem tier must sustain at least 45 rendered frames per second and preserve input delivery. Presentation quality may reduce particles, shadows, shake, and device-pixel ratio before changing rules.
- The fixed 60 Hz simulation cannot drop authoritative ticks. The application caps catch-up work per render frame and exposes backlog rather than silently changing results.
- Setup-to-ready and restart-to-ready should complete within one second when assets are already local. Human defeat must offer restart or accelerated resolution within five seconds.

The physical baseline device and repeatable browser capture procedure are still pending, so browser frame targets are release blockers only after that evidence is named.

## Automated Regression Budgets

- The 100-run determinism test executes 12,000 ticks with 12 participants and must finish within its 15-second Vitest budget. The 2026-07-22 local run completed in approximately 4.6 seconds; this is evidence from one workstation, not a portable forecast.
- A 32-participant `RenderFrameV1` has a 256 KiB warning threshold. Production code must not JSON-serialize the full frame every render.
- Total compressed production JavaScript has a 180 KiB warning budget and CSS has a 20 KiB warning budget before art/audio assets. The 2026-07-22 Vite build reports approximately 152 KiB across emitted JavaScript chunks, a 32.72 KiB gzip entry chunk, and 1.90 KiB gzip CSS. Chunk count alone is not a failure when Vite and PixiJS load the provider-neutral static artifact correctly.
- Replay JSON is capped at 5 MiB and 7,200 ticks before parsing or execution.

## Hot-path Rules

- Simulation work is renderer-independent and allocation changes must be measured with 12, 24, and 32 participants.
- Same-tick shove contacts are batched for correctness. Weak contacts currently use bounded stable pair iteration; spatial hashing becomes mandatory before 24- and 32-participant promotion if profiling shows pair checks dominate.
- Bot decisions will run on staggered schedules and bounded nearby candidates rather than every bot evaluating the whole world every tick.
- No background job, application network request, analytics upload, or remote model call belongs in the MVP runtime.

## Review Blockers

- A visual optimization changes simulation rules, skips ticks, or removes a telegraph.
- A 32-participant claim is made from renderer count alone without collision, bot, tile, and input evidence.
- A slow test is deleted or reduced below its contract instead of receiving a documented local budget or a measured optimization.
- Bundle or frame evidence omits source maps, compression mode, device, browser, participant count, or scenario.
