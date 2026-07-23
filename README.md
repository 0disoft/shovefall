# 바닥이 사라지는 술래잡기

- Status: Playable fixed 50-participant rounds with deterministic items, Coal-Twilight presentation, GitHub Pages deployment, and reviewed contributor recognition
- Scope: frontend
- Repository Type: web-app
- Addons: none

Play: <https://0disoft.github.io/shovefall/>

바닥이 사라지는 술래잡기 (`Shovefall`) is a short single-player browser party game about shoving opponents off a collapsing arena. One participant is human and the remaining participants are deterministic rule-based bots. The MVP is a static client application with no backend, database, account system, runtime LLM, or remote analytics.

The repository contains a playable semantic DOM and PixiJS WebGL client, exact package graph, local validation commands, and a Clarissimi-backed public contribution review path. A pausable `3→2→1` session countdown renders the fresh arena while keeping simulation, bots, and input at tick zero. Public play is one 50-participant Hard-AI mode; the human chooses a numeric starting weight from 50 through 100 plus two distinct items from nine offered choices. WASD, arrow keys, mouse or touch drag anywhere in the arena, a touch joystick, a standard gamepad stick, or its D-pad moves; Space, the first gamepad button, or the touch action extends a short hand shove without launching the attacker; Shift, the second gamepad button, or the touch action dodges; Q/E, gamepad face buttons, or the arena item buttons use inventory slots; and `1..4` spends elimination-earned points on Power, Stability, Mobility, or Reflex. Wind Blast has two charges and launches the first unshielded body on its ray. Brick Bag has four charges and places a cardinal wall on the faced supported tile. Boat grants five seconds of movement across in-arena water. Bomb has two charges and leaves a visible five-second hazard whose three-tile blast launches every nearby body, including its owner; Dodge works, Brick does not absorb the blast, and armed bombs keep their fuse after flooding or owner elimination. Soap has three charges and leaves a one-use patch on the faced tile; the first body to cross it slips and Stumbles, including the installer. `구조 갈고리` has two charges and pulls only its user toward current land or the first Brick wall along a 4.5-tile facing ray; it does not teleport, provide water support, pull opponents, or create elimination credit. Launched and pulled bodies still transfer motion through swept weak contacts. The 44×36 procedural-island bound supports a wider coast, five bounded lake attempts, delayed seeded collapse waves, and a Slow/Normal/Fast override. Iron Boots, Feather, and Spring Glove alter mass, movement, dodge, inertia, reach, and shove impulse; stable outer tiles receive higher spawn weight so collecting them carries positional risk. Human defeat accelerates the remaining simulation and the DOM result path starts a fresh world. The least-privilege GitHub Actions workflows mirror local merge checks, deploy the exact tested `dist` to GitHub Pages, keep Clarissimi PR decisions advisory, and route merged-contributor recognition through maintainer-reviewed proposals. [CI run `30033824900`](https://github.com/0disoft/shovefall/actions/runs/30033824900) validated and deployed exact `v0.31.0` SHA `50ec3c1a6c6e3d2dfb46987b5ab55f6a67f7666e`; a fresh public session confirmed the Soap setting, a running 50-participant WebGL arena, and no browser log entries. The `0.32.0` Grappling Hook candidate passes 169 local tests, thirteen production-artifact Chrome paths, and its refreshed fixed-50 headless profile; exact-SHA hosted, deployment, and public-browser proof remain pending. The current local production-Chrome performance sample is rejected as host-contended rather than being promoted by weakening the budget. Human playtest and cross-browser checks remain pending.

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

The toolchain, replay format v2, fixed-tick physics, swept-circle and static-wall contact, browser scheduler, pausable countdown, keyboard adapter, Coal-Twilight PixiJS renderer, fixed Hard utility bots, selectable Slow/Normal/Fast collapse, results, spatial broad phase, one 50-participant browser mode, bounded edge-weighted item settings, three passives, Wind Blast, Brick Bag, Boat, Bomb, Soap, Grappling Hook, accelerated defeat resolution, restart, optional procedural audio, reduced motion, renderer recovery, deterministic round/balance/pacing auditing, and source-owned GitHub Actions Pages workflow are implemented for product `0.32.0`, simulation `15.0.0`, and content `9.0.0`; replay remains v2 and reports remain v4. The local candidate passes 169 unit/scenario tests and thirteen production-safe Chrome paths. Its fixed-50 headless profile exercised both Hook charges, reached simulation p95 `5.123 ms`, zero 100 ms steps, and `3.69×` real time. A same-run Brick/Bomb versus Hook/Bomb production-Chrome comparison was rejected because total workstation CPU remained `81.6–94.2%` and both conditions collapsed almost identically to p95 `89.3 / 89.5 ms`; the `25 ms` automated ceiling was not weakened. The local `0.31.0` Chrome rerun at p95 `18.4 ms` and zero backlog remains historical evidence only. CI run `30033824900` is the exact hosted and Pages proof for `v0.31.0`; the `0.32.0` candidate SHA, uncontended browser profile, hosted proof, and deployment proof remain pending. Bot use and balance evidence for active items, human active-item balance, branch protection, broader physical-device and cross-browser coverage, external playtest, final captures, and any optional external image asset inventory remain pending or separately gated.
