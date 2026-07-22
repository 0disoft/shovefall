# Validation

- Status: Executable application-bootstrap validations

## Validation Source of Truth

This document owns stable validation names for this scaffold.

## Standard Validation Names

| Name | Owner | Current contract |
|---|---|---|
| `format` | Oxfmt write mode | Formats only approved project-owned paths. |
| `format-check` | Oxfmt check mode | Fails when approved project-owned paths are not formatted. |
| `lint` | Oxlint and `oxlint-tsgolint@7` | Runs correctness, import, and type-aware rules without replacing the authoritative type gate. |
| `typecheck` | TypeScript 7 `tsc --noEmit` | Authoritative TypeScript diagnostics. |
| `test` | Vitest 4 | Runs settings, deterministic simulation, replay, spatial-hash boundary and full-scan equivalence, mass, action timing, batch impulse, dodge, support, falling, item stacking and exact expiry, boosted multi-target shove, seeded item placement and caps, collapse phases and ordering, round sealing, time-limit draws, input state, bot command shape, bot determinism, delayed perception, tile and edge safety, and identity-neutral targeting coverage. |
| `contract` | Repository-owned Bun TypeScript checks | Validates module boundaries, forbidden dependencies, asset provenance, and other repository contracts that Oxlint cannot express reliably. |
| `migration-check` | Not applicable until a persisted format or compatible migration surface exists | Must report `NOT_APPLICABLE`, not fake success. |
| `smoke` | Playwright Test | Proves Chrome boot, WebGL initialization, recommended item defaults, Mayhem item normalization, setup-to-round transition, fixed-tick progress, WASD movement, Space action state, sound mute state, active-round blur pause and focus resume, keyboard focus entry, settings return, deterministic-clock collapse completion, result focus, fresh-world restart, deterministic human defeat and immediate restart, Web Audio-unavailable silence, reduced motion, injected fatal-error recovery, WebGL context-loss pause, and context restoration. |
| `profile-scale` | Bun headless local profile | Measures 7,200 ticks each at 12, 24, and 32 participants, separating AI and simulation duration while reporting candidate/full-pair source counts, long steps, and observational heap deltas. |
| `profile-browser` | Production build plus local headless Chrome | Measures fixed active-load seeds at 1280×720 for frame p95, long frames, requested-versus-delivered ticks, backlog, effective DPR, and forced-GC heap change after 20 restarts. It is not cross-browser or field evidence. |
| `docs` | Repository and ssealed documentation checks | Validates source-of-truth links, scaffold state, and Markdown hygiene. |
| `build` | Vite 8 | Produces the provider-neutral static `dist` artifact. |
| `check` | Aggregate command | Runs the configured merge-blocking validations without silently skipping a missing command. |

## Required Final Report

Final responses must list executed validations, passed validations, skipped validations, skip reasons, and remaining risk.

## Runner Policy

Ssealed runner remains `none`; package scripts are the application command surface rather than a generated task-runner file. Agents must use the configured `shovefall_*` mustflow intents. Unconfigured commands must fail, not pass with fake success.

## Hygiene Validation

Repository hygiene file changes must check line-ending churn, binary diff pollution,
tracked secret files, ignored build/cache artifacts, and generated-output drift.

## Scope

Frontend validations use the accepted stack in `docs/engineering/08-toolchain-baseline.md`. Exact package patch versions are owned by `package.json` and `bun.lock`.

## Repository Shape

Web-app validation covers the playable DOM/PixiJS gray-box, deterministic utility bots, seeded collapse, three bounded items, item settings, round result, fresh-world restart, optional procedural audio, reduced-motion presentation, renderer loss recovery, spatial broad phase, and bounded local scale profiles without claiming physical-device, cross-browser, audio-device, or external playtest approval.

## Formatting Boundary

Oxfmt must ignore `.agents/**`, `.ssealed/**`, dependencies, caches, coverage, and build output. Existing seeded documents are not bulk-formatted merely to satisfy a new formatter. Markdown prose wrapping remains preserved unless a document owner explicitly changes it.
