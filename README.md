# Shovefall

- Status: Runnable application bootstrap; gameplay pending
- Scope: frontend
- Repository Type: web-app
- Addons: none

Shovefall is a short single-player browser party game about shoving opponents off a collapsing arena. One participant is human and the remaining participants are deterministic rule-based bots. The MVP is a static client application with no backend, database, account system, runtime LLM, or remote analytics.

The repository now contains a runnable semantic DOM setup shell, a PixiJS WebGL arena preview, exact package metadata, a Bun lockfile, and local validation commands. Movement, shove and dodge physics, bots, collapsing tiles, items, final visual direction, CI, and deployment remain outside this bootstrap slice.

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
- tests/: Vitest unit and application-model tests
- e2e/: Playwright browser smoke
- tools/: Bun TypeScript contract and documentation checks
- AGENTS.md: agent working rules
- CHECKLIST.md: checklist router
- VALIDATION.md: validation names and reporting requirements
- .agents/context-map.md: agent route map
- docs/engineering/08-toolchain-baseline.md: accepted technology and tool ownership
- docs/frontend/FRONTEND_DESIGN.md: PixiJS, DOM, state, accessibility, and presentation boundaries
- docs/: design, operations, architecture, and engineering standards

## Repository Shape Notes

- web-app: This repository type owns routes, rendering mode, browser state, accessibility, and client observability.


## Repository Hygiene

.editorconfig, .gitattributes, and .gitignore are generated to keep line endings,
binary diffs, local files, build outputs, caches, and secret files under control.

## Scope Notes

The toolchain and bootstrap layout are implemented. The static hosting provider, gameplay tuning, final visual direction, and asset inventory remain unimplemented or separately undecided. The current grayscale setup surface is a functional gray-box baseline, not the final art direction.
