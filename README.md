# 바닥이 사라지는 술래잡기

- Status: Playable fixed 50-participant rounds with deterministic items, Coal-Twilight presentation, GitHub Pages deployment, and reviewed contributor recognition
- Scope: frontend
- Repository Type: web-app
- Addons: none

Play: <https://0disoft.github.io/shovefall/>

바닥이 사라지는 술래잡기 (`Shovefall`) is a short single-player browser party game about shoving opponents off a collapsing arena. One participant is human and the remaining participants are deterministic rule-based bots. The MVP is a static client application with no backend, database, account system, runtime LLM, or remote analytics.

The repository contains a playable semantic DOM and PixiJS WebGL client, exact package graph, local validation commands, and a Clarissimi-backed public contribution review path. A pausable `3→2→1` session countdown renders the fresh arena while keeping simulation, bots, and input at tick zero. Public play is one 50-participant Hard-AI mode; the human chooses a numeric starting weight from 50 through 100 plus two distinct items from nine offered choices. WASD, arrow keys, mouse or touch drag anywhere in the arena, a touch joystick, a standard gamepad stick, or its D-pad moves; Space, the first gamepad button, or the touch action extends a short hand shove without launching the attacker; Shift, the second gamepad button, or the touch action dodges; Q/E, gamepad face buttons, or the arena item buttons use inventory slots; and `1..4` spends elimination-earned points on Power, Stability, Mobility, or Reflex. Wind Blast has two charges and launches the first unshielded body on its ray. Brick Bag has four charges and places a cardinal wall on the faced supported tile. Boat grants five seconds of movement across in-arena water. Bomb has two charges and leaves a visible five-second hazard whose three-tile blast launches every nearby body, including its owner; Dodge works, Brick does not absorb the blast, and armed bombs keep their fuse after flooding or owner elimination. Soap has three charges and leaves a one-use patch on the faced tile; the first body to cross it slips and Stumbles, including the installer. `구조 갈고리` has two charges and pulls only its user toward current land or the first Brick wall along a 4.5-tile facing ray; it does not teleport, provide water support, pull opponents, or create elimination credit. Launched and pulled bodies still transfer motion through swept weak contacts. The public 48×40 procedural island contains exactly eight separated 6–10-tile lakes while preserving one connected landmass and a connected 20% collapse core. Item placement selects the edge, near-edge, or interior band at a stable 3:2:1 ratio before choosing a tile, so the added shoreline does not silently turn the risk preference into edge-only placement. Human defeat accelerates the remaining simulation and the DOM result path starts a fresh world. The least-privilege GitHub Actions workflows mirror local merge checks, deploy the exact tested `dist` to GitHub Pages, keep Clarissimi PR decisions advisory, and route merged-contributor recognition through maintainer-reviewed proposals. [CI run `30038218455`](https://github.com/0disoft/shovefall/actions/runs/30038218455) validated and deployed exact `0.32.0` SHA `4dc23456673d08ba15228776bdce15e2b768bcd5`; a fresh public session confirmed the Hook setting, a running Hard-AI WebGL arena, changing survivor state, and no browser log entries. The local `0.33.0` island candidate includes the `0.32.1` production-telemetry cleanup, passes 170 tests, and passes the 50-participant headless budget at simulation p95 `6.823 ms` with no 100 ms step. The full round audit exceeded its 300-second configured limit, and the browser profile was skipped after a preflight observed `67.6%` average and `96.4%` maximum host CPU. Exact-SHA hosted proof, human playtest, and cross-browser checks remain pending.

## Accepted Toolchain Baseline

- Browser application: semantic HTML, DOM, CSS, and a PixiJS 8 WebGL game world
- Language and type checking: TypeScript 7 stable with `tsc --noEmit` as the authoritative type gate
- Build: Vite 8 with a provider-neutral static `dist` artifact
- Package and automation runtime: Bun stable with a committed `bun.lock`
- Lint: Oxlint with `oxlint-tsgolint@7` type-aware rules
- Format: Oxfmt; no direct Prettier dependency
- Tests: Vitest 4 for unit and simulation scenarios, with Playwright Test for browser smoke and E2E

The complete adoption constraints, rollback path, and version policy are in [docs/engineering/08-toolchain-baseline.md](docs/engineering/08-toolchain-baseline.md).

## Source Files

- package.json and bun.lock: exact dependency and local command graph
- src/app/: DOM lifecycle and normalized setup state
- src/content/: versioned item definitions and physical multipliers
- src/ai/: delayed-perception, utility-scored bot command generation
- src/presentation/: PixiJS-only arena presentation
- src/simulation/: renderer-independent fixed-tick contracts, world, random streams, hashing, and replay
- tests/: Vitest unit and application-model tests
- e2e/: Playwright browser smoke
- tools/: Bun TypeScript contract and documentation checks
- AGENTS.md: agent working rules
- CHECKLIST.md: checklist router
- VALIDATION.md: validation names and reporting requirements
- .agents/context-map.md: agent route map
- docs/engineering/08-toolchain-baseline.md: accepted technology and tool ownership
- docs/frontend/FRONTEND_DESIGN.md: PixiJS, DOM, state, accessibility, and presentation boundaries
- docs/product/02-spec.md: accepted game scope, controls, quality tiers, gates, and non-goals
- docs/architecture/: authoritative boundary, domain model, and fixed-tick runtime order
- docs/architecture/04-bot-ai.md: bot fairness, personality, scheduling, and command boundaries
- docs/architecture/05-scale-performance.md: broad-phase semantics and bounded local performance evidence
- docs/architecture/06-items-and-effects.md: deterministic item definitions, lifecycle, and ownership
- docs/architecture/07-presentation-feedback.md: event consumption, audio, motion, and renderer-recovery boundaries
- docs/architecture/08-swept-contacts.md: fixed-tick continuous contact detection and compatibility
- docs/: design, operations, architecture, and engineering standards

## Repository Shape Notes

- web-app: This repository type owns routes, rendering mode, browser state, accessibility, and client observability.


## Repository Hygiene

.editorconfig, .gitattributes, and .gitignore are generated to keep line endings,
binary diffs, local files, build outputs, caches, and secret files under control.

## Scope Notes

The toolchain, replay format v2, fixed-tick physics, swept-circle and static-wall contact, browser scheduler, pausable countdown, keyboard adapter, Coal-Twilight PixiJS renderer, fixed Hard utility bots, selectable Slow/Normal/Fast collapse, results, spatial broad phase, one 50-participant browser mode, bounded edge-band item settings, three passives, Wind Blast, Brick Bag, Boat, Bomb, Soap, Grappling Hook, accelerated defeat resolution, restart, optional procedural audio, reduced motion, renderer recovery, deterministic round/balance/pacing auditing, and source-owned GitHub Actions Pages workflow are implemented for product `0.33.0`, simulation `16.0.0`, and content `9.0.0`; replay remains v2 and reports remain v4. Production HTML contains no developer telemetry markup, while DEV creates the diagnostic panel at runtime. The local candidate passes 170 unit/scenario tests, fourteen DEV Chrome paths, and thirteen production-artifact Chrome paths. Its widened fixed-50 headless profile exercises both Hook charges, passes simulation p95 `6.823 ms` with zero 100 ms steps, and runs at `1.73×` real time. The 300-second round audit and an uncontended production-Chrome profile remain unaccepted, while CI run `30038218455` remains exact hosted and Pages proof only for historical `0.32.0` SHA `4dc23456673d08ba15228776bdce15e2b768bcd5`. Bot use and balance evidence for active items, human active-item balance, branch protection, broader physical-device and cross-browser coverage, external playtest, final captures, and any optional external image asset inventory remain pending or separately gated.
