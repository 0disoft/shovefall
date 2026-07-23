# Shovefall

- Status: Playable 8/16/24/32 participant rounds with deterministic items, Coal-Twilight presentation, GitHub Pages deployment, and reviewed contributor recognition
- Scope: frontend
- Repository Type: web-app
- Addons: none

Play: <https://0disoft.github.io/shovefall/>

Shovefall is a short single-player browser party game about shoving opponents off a collapsing arena. One participant is human and the remaining participants are deterministic rule-based bots. The MVP is a static client application with no backend, database, account system, runtime LLM, or remote analytics.

The repository contains a playable semantic DOM and PixiJS WebGL client, exact package graph, local validation commands, and a Clarissimi-backed public contribution review path. A pausable `3→2→1` session countdown renders the fresh arena while keeping simulation, bots, and input at tick zero. WASD, Space, and Shift then produce versioned commands for the renderer-independent 60 Hz simulation. Deterministic utility bots use delayed public perception and spatially bounded candidate search; Easy, Normal, and Hard change only reaction delay, decision cadence, and candidate budget. A stable ActorId-ordered spatial hash reduces contact candidates without changing collision order, while swept-circle contact catches maximum-speed grazing collisions between fixed ticks. Four 8/16/24/32 participant presets, breathing-room arenas, delayed seeded collapse waves, and a Slow/Normal/Fast override vary pacing without raising the participant ceiling. Iron Boots, Feather, and Spring Glove alter the existing mass, movement, dodge, inertia, and shove axes through deterministic effects; stable outer tiles receive higher spawn weight so collecting them carries visible positional risk. Human defeat accelerates the remaining simulation and the DOM result path starts a fresh world. A deduplicated presentation boundary drives capped procedural audio, transient PixiJS feedback, reduced-motion behavior, and recoverable renderer loss without mutating simulation state. The least-privilege GitHub Actions workflows mirror local merge checks, deploy the exact tested `dist` to GitHub Pages, keep Clarissimi PR decisions advisory, and route merged-contributor recognition through maintainer-reviewed proposals. Hosted deployment and a Chrome critical-path smoke are proven; real external-contributor recognition, human playtest, and branch-protection enforcement remain separate evidence gates.

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

The toolchain, deterministic replay, fixed-tick physics, swept-circle contact, browser scheduler, pausable countdown, keyboard adapter, Coal-Twilight PixiJS renderer, selectable Easy/Normal/Hard utility bots, selectable Slow/Normal/Fast collapse, results, spatial broad phase, 8/16/24/32 browser presets, bounded edge-weighted item settings, Iron Boots, Feather, Spring Glove, accelerated defeat resolution, restart, optional procedural audio, reduced motion, renderer recovery, deterministic round/balance/pacing auditing, and source-owned GitHub Actions Pages workflow are implemented. Development-server and generated-`dist` Chrome smoke pass, and hard-difficulty item-enabled headless and production-Chrome profiles pass at 16/24/32 with continuous contact enabled. Exact-SHA Pages deployment and public-URL Chrome smoke also pass. Branch protection, broader physical-device and cross-browser coverage, risky-pickup item balance, external playtest, final captures, and any optional external image asset inventory remain pending or separately gated.
