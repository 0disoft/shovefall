# Shovefall

- Status: Playable 4–32 participant gray-box rounds with deterministic items and functional feedback; final art pending
- Scope: frontend
- Repository Type: web-app
- Addons: none

Shovefall is a short single-player browser party game about shoving opponents off a collapsing arena. One participant is human and the remaining participants are deterministic rule-based bots. The MVP is a static client application with no backend, database, account system, runtime LLM, or remote analytics.

The repository contains a playable semantic DOM and PixiJS WebGL gray-box, exact package graph, and local validation commands. A pausable `3→2→1` session countdown renders the fresh arena while keeping simulation, bots, and input at tick zero. WASD, Space, and Shift then produce versioned commands for the renderer-independent 60 Hz simulation. Deterministic utility bots use delayed public perception and spatially bounded candidate search. A stable ActorId-ordered spatial hash reduces contact candidates without changing collision order, while swept-circle contact catches maximum-speed grazing collisions between fixed ticks. Seeded outer-in collapse waves visibly progress through warning, collapsing, and void states before the last standing participant wins. Iron Boots, Feather, and Spring Glove alter the existing mass, movement, dodge, inertia, and shove axes through deterministic effects. Human defeat accelerates the remaining simulation and the DOM result path starts a fresh world. A deduplicated presentation boundary drives capped procedural audio, transient PixiJS feedback, reduced-motion behavior, and recoverable renderer loss without mutating simulation state. Final visual direction, hosted CI, and deployment remain later slices.

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

The toolchain, deterministic replay, gray-box physics, swept-circle contact, fixed-step browser scheduler, pausable countdown, keyboard adapter, procedural PixiJS renderer, utility bots, collapse, results, spatial broad phase, 4–32 participant presets, bounded item settings, Iron Boots, Feather, Spring Glove, accelerated defeat resolution, restart, optional procedural audio, reduced motion, and renderer recovery are implemented. Development-server and generated-`dist` Chrome smoke pass, and item-enabled headless and production-Chrome profiles pass at 12/24/32 with continuous contact enabled. Physical-device, cross-browser, external playtest, static hosting, final visual direction, and the image asset inventory remain pending or separately undecided.
