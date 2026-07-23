# 바닥이 사라지는 술래잡기

- Status: Playable fixed 50-participant rounds with deterministic items, Coal-Twilight presentation, GitHub Pages deployment, and reviewed contributor recognition
- Scope: frontend
- Repository Type: web-app
- Addons: none

Play: <https://0disoft.github.io/shovefall/>

바닥이 사라지는 술래잡기 (`Shovefall`) is a short single-player browser party game about shoving opponents off a collapsing arena. One participant is human and the remaining participants are deterministic rule-based bots. The MVP is a static client application with no backend, database, account system, runtime LLM, or remote analytics.

The repository contains a playable semantic DOM and PixiJS WebGL client, exact package graph, local validation commands, and a Clarissimi-backed public contribution review path. A pausable `3→2→1` session countdown renders the fresh arena while keeping simulation, bots, and input at tick zero. Public play is one 50-participant Hard-AI mode; the human chooses a numeric starting weight from 50 through 100 plus two distinct starting items. WASD, arrow keys, mouse or touch drag anywhere in the arena, a touch joystick, a standard gamepad stick, or its D-pad moves; Space, the first gamepad button, or the touch action extends a short hand shove without launching the attacker; Shift, the second gamepad button, or the touch action dodges; Q/E, gamepad face buttons, or the arena item buttons use inventory slots; and `1..4` spends elimination-earned points on Power, Stability, Mobility, or Reflex. Wind Blast has two charges, hits the first unshielded body on its ray, and launches it at least three times the neutral hand-shove baseline before mass and Stability modify the result. Brick Bag has four charges and places a cardinal wall on the faced supported tile; walls stop bodies, Wind Blast, and hand shoves until their tile becomes water. Boat has one charge and grants five seconds of movement across in-arena water without granting combat immunity or support beyond the island bounds. Launched bodies transfer motion through swept weak contacts. The 44×36 procedural-island bound supports a wider coast, five bounded lake attempts, delayed seeded collapse waves, and a Slow/Normal/Fast override. Iron Boots, Feather, and Spring Glove alter mass, movement, dodge, inertia, reach, and shove impulse; stable outer tiles receive higher spawn weight so collecting them carries positional risk. Human defeat accelerates the remaining simulation and the DOM result path starts a fresh world. The least-privilege GitHub Actions workflows mirror local merge checks, deploy the exact tested `dist` to GitHub Pages, keep Clarissimi PR decisions advisory, and route merged-contributor recognition through maintainer-reviewed proposals. The `0.28.0` implementation SHA is proven on hosted CI and the public Pages URL; the `0.29.0` Boat candidate still needs refreshed exact-SHA hosted evidence, human playtest, and cross-browser checks.

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

The toolchain, replay format v2, fixed-tick physics, swept-circle and static-wall contact, browser scheduler, pausable countdown, keyboard adapter, Coal-Twilight PixiJS renderer, fixed Hard utility bots, selectable Slow/Normal/Fast collapse, results, spatial broad phase, one 50-participant browser mode, bounded edge-weighted item settings, three passives, two-charge Wind Blast, four-charge Brick Bag, one-charge five-second Boat, accelerated defeat resolution, restart, optional procedural audio, reduced motion, renderer recovery, deterministic round/balance/pacing auditing, and source-owned GitHub Actions Pages workflow are implemented. The `0.29.0` merge checks pass with 139 unit/scenario tests. With Brick Bag placed and Boat active, local fixed-50 Chrome is 18.5 ms p95 with zero backlog; the headless profile maintains up to three walls and one Boat user at simulation p95 4.351 ms and 3.96× real time. Bot use and balance evidence for active items, the remaining Bomb, Soap, and Grappling Hook mechanics, exact-SHA hosted proof for `0.29.0`, branch protection, broader physical-device and cross-browser coverage, external playtest, final captures, and any optional external image asset inventory remain pending or separately gated.
