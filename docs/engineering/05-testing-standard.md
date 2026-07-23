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
- Gray-box scenarios cover the slower mass speed curve, selected starting mass and two-item loadout, exact hand-reach shove windows without body launch, dodge priority and cooldown boundary, credited elimination, one-point bounded stat spending, finite speed caps, triple-overlap containment, swept contacts, same-tick mutual hits, target-mass impulse monotonicity, support recovery, falling, and irreversible elimination.
- Bot scenarios cover bounded Easy/Normal/Hard decision profiles, one sorted command per active non-human actor, same-seed personality/command/final-hash equality, immediate self edge recovery, identity-neutral edge opportunity, and reaction only after the configured perception delay.
- Collapse scenarios cover seeded order, outer-layer precedence, warning/collapsing/void transitions, last-standing result, honest time-limit draw, and post-result world sealing.
- Spatial scenarios cover cell boundaries, negative coordinates, identical positions, 32 actors in one cell, invalid inputs, and equality between full-scan and spatially filtered distance contacts. Checked-in replay fixtures protect end-to-end semantic parity.
- Item scenarios cover duplicate refresh, opposing mass effects, global mass bounds, exact expiry before movement, Spring Glove consumption, Wind Blast charges, first-hit targeting, dodge and request priority, launch transfer, same-tick offensive-credit arbitration, boosted multi-target contact, relative shove strength, seeded placement clearance, outer-ring preference, interior availability, and simultaneous caps.
- The Playwright suite covers a menu-only first screen, version-history rendering and Escape focus return, hidden pre-game canvas, settings save behavior, WebGL initialization after start, non-uniform active-round canvas pixels, player-follow camera frame change, Wind Blast selection and Q/E charge decrease, collapse-speed propagation, menu-to-settings-to-countdown-to-round transition, countdown tick-zero and input isolation, countdown blur freeze, fixed-tick progress, WASD, arrow-key, mouse-drag and narrow-viewport virtual-joystick movement, touch shove bridging, Space action state, sound mute state, window-blur pause, focus resume, arena focus, menu return, deterministic-clock collapse completion, result focus, fresh-world countdown restart, deterministic human defeat and immediate restart, Web Audio-unavailable silence, reduced motion, injected development fatal recovery, WebGL context-loss pause, and restoration. A mocked PixiJS application separately requires every renderer frame request to call the explicit application presentation boundary and renders Wind Blast activation and impact events. Physical touch and gamepad hardware remain manual device-matrix evidence.
- `smoke-dist` builds the static artifact and repeats the eight production-safe browser flows through `vite preview`. The fatal injector is tagged `@dev-only`; omitting it from production proves that the test hook is absent, not that production fatal recovery was re-executed.
- Separate configured profiles cover 7,200 headless ticks at the public 50-participant setting and fixed-seed production Chrome frame pacing plus 20 immediate restarts. The main round and strategy scenarios use 50 participants; smaller 8- and 16-participant controlled rotations remain diagnostic fixtures for isolating mass, item-slot, and collapse-speed variables and are not public modes. Profile and balance evidence is not part of the routine smoke suite and does not claim cross-browser, physical-device, risky-pickup item balance, or human-play approval.
- The production Chrome profile begins only after the session reports an active round. Countdown time is product-flow evidence in smoke tests, not requested simulation time in the frame profile.
- Browser promotion must still add readable combat and item-telegraph assertions.
- Future Playwright cases must add remaining failure paths as those surfaces become real.
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
