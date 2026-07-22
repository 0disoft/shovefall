# Testing Standard

- Status: Deterministic foundation suites active; gameplay suites expanding

## Contract

The testing standard defines merge-blocking evidence for the deterministic simulation, browser integration, module boundaries, static build, and regressions. Tool presence is not proof; every named command must fail on an intentional defect before it becomes a required gate.

## Required Evidence

- Source of truth: VALIDATION.md
- Toolchain source: docs/engineering/08-toolchain-baseline.md
- Owner: Repository owner
- Merge-blocking validation: VALIDATION.md
- Related checklist: CHECKLIST.md

## Static Evidence

- TypeScript 7 `tsc --noEmit` is the authoritative type check.
- Oxlint runs non-type-aware and type-aware rules through `oxlint-tsgolint@7`.
- Oxlint integrated `typeCheck` remains supplementary until its experimental status is explicitly retired and repository evidence supports replacement.
- Oxfmt check mode covers only approved project-owned paths and must not create broad scaffold churn.
- Repository-owned Bun TypeScript checks enforce architectural restrictions not covered reliably by the linter.

## Behavioral Evidence

- The Vitest suite covers configuration normalization, command bounds and normalization, duplicate-command rejection, neutral missing input, command-order independence, a versioned PRNG vector, named-stream independence, 100-run state-hash stability, strict replay parsing, checked-in replay fixtures, checkpoint verification, and corrupted-hash rejection.
- The current Playwright suite covers browser boot, WebGL initialization, setup-to-arena transition, and focus recovery.
- Combat promotion tests must cover finite-value invariants, speed caps, shove timing, dodge boundary ticks, simultaneous-impact order independence, mass monotonicity, weak-contact separation, support grace, irreversible falling, and restart as those behaviors are introduced.
- Future Playwright cases must add keyboard input, focus loss during play, round completion, failure recovery, restart, and static-build smoke as those surfaces become real.
- Visual and audio timing still require explicit manual evidence; screenshots alone do not prove interaction quality.

## Deferred Evidence

- Database migration tests are `NOT_APPLICABLE` while the MVP owns no persistent database or user data.
- Cross-browser support beyond the approved desktop matrix is not implied by a single Playwright run.
- Performance thresholds become release gates only after a named physical baseline and repeatable measurement procedure exist.

## Review Blockers

- Type checking is silently collapsed into an experimental linter mode.
- A test uses rendering frame time, wall-clock time, or ambient randomness as simulation truth.
- Human and bot commands reach different simulation paths without an approved contract change.
- A missing or skipped validation is reported as passed.
- A snapshot replaces behavior assertions for collision, action, or round invariants.
- Replay fixtures are regenerated without explaining a deliberate simulation rule or version change.
- A change lacks failure, recovery, security, performance, or test evidence where relevant.
