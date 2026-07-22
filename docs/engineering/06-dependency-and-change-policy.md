# Dependency and Change Policy

- Status: Accepted baseline

## Contract

Dependency policy covers necessity, alternatives, license, maintenance health, vulnerabilities, runtime impact, bundle impact, coupled version tracks, major upgrades, and removal cost.

## Required Evidence

- Source of truth: docs/engineering/08-toolchain-baseline.md
- Owner: Repository owner
- Merge-blocking validation: VALIDATION.md
- Related checklist: CHECKLIST.md

## Package and Lock Policy

- Bun is the package manager and package-script entry point.
- `bun.lock` is committed and a clean install must not modify it.
- Exact resolved versions belong in `bun.lock`; supported major tracks and migration constraints belong in the toolchain source of truth.
- The application does not commit `package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock` alongside `bun.lock`.
- Runtime dependencies remain minimal. PixiJS is the expected primary runtime dependency; adding a UI framework, physics engine, state manager, analytics SDK, or runtime AI SDK requires a new stack review.

## Coupled Version Policy

- TypeScript 7, Oxlint, and `oxlint-tsgolint@7` are upgraded as a compatibility set because tsgolint tracks a specific TypeScript release.
- Oxfmt is pinned independently and reviewed for formatting diffs before adoption or upgrade.
- Vite, Vitest, and their supported runtime ranges are checked together before a major upgrade.
- Playwright browser binaries and the Playwright package remain synchronized.
- Exact patch versions were selected from official sources and install-time registry metadata during application bootstrap. `package.json` and `bun.lock` own the resulting pins.
- Dependency installation disables lifecycle scripts. A package that requires one must be reviewed and explicitly allowed rather than silently enabling every install script.

## Tool Ownership

- TypeScript owns authoritative type diagnostics.
- Oxlint owns lint diagnostics and type-aware lint rules.
- Oxfmt owns formatting. A direct Prettier dependency is not part of the baseline even though Oxfmt may internally delegate non-native formats to its bundled formatter.
- Project-specific architecture and asset checks are Bun TypeScript automation under `tools/`, not shell-specific scripts or opaque linter tricks.

## Adoption and Rollback

This is a greenfield, code-only and build-pipeline decision. Rollback does not migrate user data. If TypeScript 7 blocks an essential tool, the repository may temporarily use the official TypeScript 6 compatibility track after recording the incompatibility. If Oxlint or Oxfmt produces blocking correctness or formatting defects, the failing tool can be pinned, scoped down, or replaced without changing simulation or product contracts.

## Review Blockers

- A dependency is added because it is fashionable or convenient without a concrete missing capability.
- A lockfile is regenerated without reviewing direct and transitive changes.
- TypeScript, Oxlint, and tsgolint are updated independently without compatibility evidence.
- Oxfmt is run in write mode across seeded or generated paths without a reviewed diff.
- A package with install lifecycle scripts is added without explicit review.
- A change weakens validation, hides skipped checks, or lacks license, failure, recovery, security, bundle, or removal evidence.
