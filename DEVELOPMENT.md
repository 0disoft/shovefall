# Development

- Status: Application bootstrap operational
- Owner: Repository owner

## Purpose

This document defines the implemented application-bootstrap boundary and the constraints that the first gameplay slice must preserve.

## Source of Truth

- Product decision: docs/product/02-spec.md
- Toolchain: docs/engineering/08-toolchain-baseline.md
- Frontend boundary: docs/frontend/FRONTEND_DESIGN.md
- Validation names: VALIDATION.md
- Technical owner: Repository owner

## Accepted Baseline

- Bun owns package installation, the lockfile, package scripts, and project-authored TypeScript automation.
- TypeScript 7 owns authoritative static type checking through `tsc --noEmit`.
- Oxlint owns syntax, correctness, import, and type-aware lint rules. Its integrated `typeCheck` mode does not replace the authoritative TypeScript gate yet.
- Oxfmt owns formatting. ESLint, typescript-eslint, and a direct Prettier dependency are not part of the baseline.
- Vite owns the development and production build boundary; PixiJS owns game-world rendering only.
- Vitest owns unit, contract, deterministic simulation, and scenario tests. Playwright Test owns browser smoke and E2E.
- The current application source stops at the semantic setup shell, normalized settings, and PixiJS WebGL arena preview. Gameplay rules remain absent.

## Command Policy

`package.json` exposes the stable validation names in `VALIDATION.md`. Agents run them only through the configured `shovefall_*` mustflow intents; humans may use the matching Bun scripts directly. Persistent custom automation belongs in `tools/` as Bun-executed TypeScript.

| Name | Current command owner |
|---|---|
| `format`, `format-check` | Oxfmt over the explicit application, test, tool, and configuration allowlist |
| `lint` | Oxlint with tsgolint type-aware rules from `.oxlintrc.json` |
| `typecheck` | TypeScript 7 `tsc --noEmit` |
| `contract` | `tools/check-architecture.ts` |
| `test` | Vitest |
| `docs` | `tools/check-doc-links.ts` |
| `build` | Vite |
| `smoke` | Playwright Test using the installed stable Chrome channel |
| `check` | All non-browser merge-blocking checks plus the production build |

Dependency installation uses exact package declarations and disables dependency lifecycle scripts. `bun.lock` is the only dependency lockfile.

## TypeScript 7 Compatibility Boundary

`skipLibCheck` is enabled because TypeScript 7 includes WebGPU declarations in `lib.dom` while PixiJS 8.19.0 also references `@webgpu/types`, and two Pixi declarations have not yet converged with the TS7 DOM and exact-optional definitions. This suppresses third-party declaration conflicts only. Repository source remains fully checked with strict mode, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.

## Bootstrap Completion Evidence

- Exact compatible package versions are recorded in `package.json` and `bun.lock`.
- A clean Bun install reproduces the dependency graph without lockfile changes.
- `format`, `lint`, `typecheck`, `test`, `smoke`, `build`, and aggregate `check` commands have real behavior and fail on defects.
- Oxlint type-aware rules and TypeScript 7 report compatible project graphs.
- Oxfmt check mode does not rewrite ssealed metadata or unadopted seeded documents.
- Vite builds a provider-neutral static artifact without runtime backend or external analytics requests.

The bootstrap met this evidence on 2026-07-22. Gameplay changes must extend the suites instead of treating the bootstrap smoke as proof of gameplay correctness.

## Review Blockers

- The change adds ESLint, typescript-eslint, a direct Prettier dependency, or another formatter without revisiting the toolchain source of truth.
- Oxlint experimental integrated type checking is used as the only type gate.
- `oxlint`, `oxlint-tsgolint`, or TypeScript is upgraded without checking their coupled compatibility.
- Oxfmt creates broad seeded-document or line-ending churn.
- A package script claims success while skipping its named validation.
- A generated, cache, build, or dependency directory is used as source truth.
