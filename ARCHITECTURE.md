# Architecture

- Status: Accepted static-client and toolchain boundary

## Boundary

This repository owns one static browser game, its deterministic simulation, rule-based bots, PixiJS presentation, DOM shell, local assets, tests, design documents, and release evidence. It does not own a backend, database, account system, remote model, runtime secret, or remote analytics pipeline.

The simulation must not import PixiJS, DOM APIs, wall-clock time, or ambient randomness. PixiJS renders read-only simulation state. The DOM shell owns setup, settings, results, fatal errors, focus, and accessibility text without mutating simulation entities directly.

## Runtime Flow

The DOM shell normalizes user intent into application commands. Human input and bot decisions produce the same participant command shape. A fixed-tick pure TypeScript simulation advances the round and emits read-only render state and events. PixiJS renders the game world while DOM and CSS render non-world UI. Vite produces a provider-neutral static artifact that runs without application network services.

## Technology Ownership

- Bun: package graph, lockfile, package scripts, and project-authored automation
- TypeScript 7: language semantics and authoritative static type diagnostics
- Oxlint with tsgolint 7: lint and type-aware lint diagnostics
- Oxfmt: formatting with constrained project scope
- Vite 8: development and static production build
- PixiJS 8 WebGL: game-world rendering only
- Vitest 4 and Playwright Test: automated verification

The detailed technology contract is [docs/engineering/08-toolchain-baseline.md](docs/engineering/08-toolchain-baseline.md).

## Quality Attributes

- Determinism: rendering frame rate, visual effects, and bot presentation cannot change simulation results.
- Maintainability: one tool owns each responsibility and changes preserve source-of-truth documents.
- Performance: optimization follows measured browser profiles; no speculative worker, WASM, physics-engine, or spatial-index commitment is implied by this scaffold.
- Security: the public client contains no secrets and performs no application data collection or remote analytics.
- Operability: a release is a reproducible static artifact with local diagnostics and a tested rollback path.
