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
- Gray-box scenarios cover the mass speed curve, identical-input mass movement, exact shove windows, dodge priority and cooldown boundary, finite speed caps, same-tick mutual hits, ActorId-swap symmetry, target-mass impulse monotonicity, geometric dodge success, support recovery, falling boundary, and irreversible elimination.
- Bot scenarios cover one sorted command per active non-human actor, same-seed personality/command/final-hash equality, immediate self edge recovery, identity-neutral edge opportunity, and reaction only after the configured perception delay.
- Collapse scenarios cover seeded order, outer-layer precedence, warning/collapsing/void transitions, last-standing result, honest time-limit draw, and post-result world sealing.
- Spatial scenarios cover cell boundaries, negative coordinates, identical positions, 32 actors in one cell, invalid inputs, and equality between full-scan and spatially filtered distance contacts. Checked-in replay fixtures protect end-to-end semantic parity.
- The Playwright suite covers browser boot, WebGL initialization, setup-to-round transition, fixed-tick progress, WASD movement, Space action state, window-blur pause, focus resume, arena focus, settings return, deterministic-clock collapse completion, result focus, fresh-world restart, and telemetry cleanup.
- Separate configured profiles cover 7,200 headless ticks each at 12/24/32 participants and fixed-seed production Chrome frame pacing plus 20 immediate restarts. Profile evidence is not part of the routine smoke suite and does not claim cross-browser or physical-device performance.
- Browser promotion must still add readable combat-telegraph assertions, explicit human-defeat injection, and fatal-invariant recovery. Weak-contact triple-overlap and high-speed crossing fuzz remain required before scale promotion.
- Future Playwright cases must add built-static-artifact smoke and the remaining failure paths as those surfaces become real.
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
