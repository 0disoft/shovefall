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
| `test` | Vitest 4 | Runs settings, deterministic simulation, replay, mass, action timing, batch impulse, dodge, support, falling, and application-model coverage. |
| `contract` | Repository-owned Bun TypeScript checks | Validates module boundaries, forbidden dependencies, asset provenance, and other repository contracts that Oxlint cannot express reliably. |
| `migration-check` | Not applicable until a persisted format or compatible migration surface exists | Must report `NOT_APPLICABLE`, not fake success. |
| `smoke` | Playwright Test | Currently proves Chrome boot, WebGL initialization, setup-to-arena transition, and focus recovery. Direct gameplay input, active-round focus loss, failure, result, and restart become mandatory when the headless combat is connected to the browser. |
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

Web-app validation covers the implemented DOM and PixiJS bootstrap without claiming that the headless combat is already playable in the browser.

## Formatting Boundary

Oxfmt must ignore `.agents/**`, `.ssealed/**`, dependencies, caches, coverage, and build output. Existing seeded documents are not bulk-formatted merely to satisfy a new formatter. Markdown prose wrapping remains preserved unless a document owner explicitly changes it.
