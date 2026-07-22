# Shovefall

- Status: Playable browser gray-box; bots and collapse pending
- Scope: frontend
- Repository Type: web-app
- Addons: none

Shovefall is a short single-player browser party game about shoving opponents off a collapsing arena. One participant is human and the remaining participants are deterministic rule-based bots. The MVP is a static client application with no backend, database, account system, runtime LLM, or remote analytics.

The repository contains a playable semantic DOM and PixiJS WebGL gray-box, exact package graph, and local validation commands. WASD, Space, and Shift produce versioned commands for the renderer-independent 60 Hz simulation. The browser renders mass-sensitive movement, weak contact, shove and dodge states, missed-shove stumble, same-tick batch impulses, support grace, falling, elimination, stable hashes, and reproducible seeds. Bots, collapsing tiles, items, final visual direction, CI, and deployment remain later slices.

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
- docs/: design, operations, architecture, and engineering standards

## Repository Shape Notes

- web-app: This repository type owns routes, rendering mode, browser state, accessibility, and client observability.


## Repository Hygiene

.editorconfig, .gitattributes, and .gitignore are generated to keep line endings,
binary diffs, local files, build outputs, caches, and secret files under control.

## Scope Notes

The toolchain, deterministic replay, first gray-box physics tuning, fixed-step browser scheduler, keyboard adapter, and procedural PixiJS renderer are implemented. The current tuning still needs external playtest evidence before it is treated as fun or final. Stationary gray-box opponents prove collision and presentation only; they are not the approved bot AI. Static hosting, final visual direction, and the asset inventory remain unimplemented or separately undecided.
