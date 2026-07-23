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
| `test` | Vitest 4 | Runs loadout normalization, starting effects, deterministic connected island and multi-lake generation, supported spawn placement, the 50-participant arena budget, protected 20% collapse cores across every internal tier, replay v2 parsing and starting setup, spatial-hash equivalence and launch containment, numeric weight mapping, slower mass-sensitive movement, compact hand-reach shove timing, batch impulse, Wind Blast charges, first-hit selection, dodge and action priority, contact transfer, offensive-credit arbitration, support, credited elimination, bounded stat spending, item effects, collapse, round sealing, report v4, keyboard/pointer/gamepad input state, version-history completeness, 58-degree projection math and camera bounds, bot determinism, shoreline safety, delayed perception, tile safety, and targeting coverage. |
| `contract` | Repository-owned Bun TypeScript checks | Validates module boundaries, forbidden dependencies, the least-privilege Clarissimi workflow shape, asset provenance, and other repository contracts that Oxlint cannot express reliably. |
| `migration-check` | Not applicable until a persisted format or compatible migration surface exists | Must report `NOT_APPLICABLE`, not fake success. |
| `smoke` | Playwright Test | Proves Chrome boot, a menu-only first screen, version-history entry/current-version rendering/Escape focus return, hidden pre-game canvas, settings draft/save behavior, WebGL initialization after start, non-uniform active-round canvas pixels, player-follow camera frame change, recommended item defaults, Mayhem item normalization, bot difficulty and collapse-speed selection and propagation, menu-to-settings-to-countdown-to-round transition, countdown input rejection and blur freeze, fixed-tick progress, WASD, arrow-key, mouse-drag, narrow-viewport virtual-joystick movement, touch shove bridging, Space action state, sound mute state, active-round blur pause and focus resume, keyboard focus entry, menu return, deterministic-clock collapse completion, result focus, local playtest-record clipboard copy and denial fallback, fresh-world countdown restart, deterministic human defeat and immediate restart, Web Audio-unavailable silence, reduced motion, injected development fatal-error recovery, WebGL context-loss pause, and context restoration. |
| `smoke-dist` | Vite production build plus Playwright Test | Runs the eight production-safe browser smoke paths against `vite preview` of the generated `dist` artifact. It excludes only the explicitly tagged development-only fatal injector and does not claim hosted deployment evidence. |
| `profile-scale` | Bun hard-difficulty headless local profile | Measures 7,200 ticks at the public 50-participant setting, separating AI and simulation duration while reporting candidate/full-pair source counts, long steps, real-time throughput, and observational heap delta. The simulation p95 gate is 10 ms; AI timing remains visible independently because it is staggered rather than charged every simulation tick. |
| `audit-rounds` | Bun deterministic round, balance, and pacing audit | Runs sixteen fixed-seed rounds at the public 50-participant setting, plus smaller controlled diagnostic rotations for base mass, item grants, and collapse speed. It records duration, terminal results, item spawn bands, observational exposure, equal-slot win rates, no-item-relative controlled rankings, 95% Wilson intervals, buff/nerf investigation signals, controlled item winner distribution, and collapse-speed duration distributions. It fails on malformed results, time-limit draws, a missing outer-ring preference, extreme controlled mass/item skew, or loss of the declared collapse pacing relationship. Ranking signals remain descriptive review inputs rather than merge gates, and the audit is not human-play or risky-pickup balance evidence. |
| `audit:items` | Bun deterministic starting-loadout balance audit | Runs at least sixty-four fixed-seed 8-participant rounds with Fast collapse, a 45-second audit limit, and production item spawns disabled. The sample count grows to keep at least sixteen actor-round slots per treatment as the auditable catalog expands. Normal-mass scripted actors rotate independently through bot personalities, the no-item control, every implemented passive starting item, and every unique passive pair. It reports wins, 95% Wilson intervals, no-item-relative win indices, credited eliminations, mean survival time, pair independence expectations, synergy indices, duration bounds, and time-limit seeds without dumping every round record. Charged active items stay excluded until bot-use policy and comparable use opportunities exist; Wind Blast's human command implementation does not make the passive audit an active-item balance claim. It fails only on malformed/incomplete sampling; buff and nerf labels are review signals rather than automated balance verdicts. |
| `profile-browser` | Production build plus local headless Chrome | Measures fixed hard-difficulty active-load seeds at 1280×720 for frame p95, long frames, requested-versus-delivered ticks, backlog, effective DPR, and forced-GC heap change after 20 restarts. It is not cross-browser or field evidence. |
| `docs` | Repository and ssealed documentation checks | Validates source-of-truth links, critical-document scaffold removal, static release and rollback contracts, submission and asset-provenance surfaces, and Markdown hygiene. |
| `build` | Vite 8 | Produces the provider-neutral static `dist` artifact with relative asset URLs that remain valid at the GitHub Pages `/shovefall/` project path. |
| `audit:strategy` | Bun TypeScript | Runs fixed all-bot rounds at the public 50-participant setting and reports personality wins, credited eliminations, survival time, overlapping item exposure, mass exposure, round duration, and time-limit counts. This focused repository script is evidence for the aggression-versus-survival decision, not a human fairness claim. |
| `check` | Aggregate command | Runs the configured merge-blocking validations without silently skipping a missing command. |

## Required Final Report

Final responses must list executed validations, passed validations, skipped validations, skip reasons, and remaining risk.

## Runner Policy

Ssealed runner remains `none`; package scripts are the application command surface rather than a generated task-runner file. Agents must use the configured `shovefall_*` mustflow intents. Unconfigured commands must fail, not pass with fake success.

## Hosted CI Boundary

GitHub Actions runs `check` and `smoke-dist` on `ubuntu-24.04` with Bun `1.3.14` and the committed lockfile. The workflow is source-owned at `.github/workflows/ci.yml`. Pull requests receive only `contents: read` and never upload or deploy an artifact. Successful `main` and manual runs upload the exact `dist` directory exercised by `smoke-dist`, retain it for 30 days, and pass it to a separate least-privilege GitHub Pages deployment job with only `contents: read`, `pages: write`, and `id-token: write`. `.github/workflows/clarissimi.yml` owns a separate read-only advisory PR gate plus scoped post-merge draft and manual promotion jobs; neither workflow makes a hosted result merge enforcement until branch protection requires its stable check. Local success is not hosted evidence, a hosted green validation is not deployment evidence, and either result is not merge enforcement until branch protection requires it.

## Hygiene Validation

Repository hygiene file changes must check line-ending churn, binary diff pollution,
tracked secret files, ignored build/cache artifacts, and generated-output drift.

## Scope

Frontend validations use the accepted stack in `docs/engineering/08-toolchain-baseline.md`. Exact package patch versions are owned by `package.json` and `bun.lock`.

## Repository Shape

Web-app validation covers the playable DOM/PixiJS gray-box, deterministic connected island coastlines and multiple lakes, a connected 20% collapse floor, one public 50-participant Hard-AI mode, a 50–100 starting-weight slider, selectable Slow/Normal/Fast seeded collapse, three bounded shoreline-weighted map items, the nine-entry catalog, four currently offered loadout items, two-charge Wind Blast through keyboard/gamepad/DOM slot bridges, item settings, pre-round countdown, round result, fresh-world restart, optional procedural audio, reduced-motion presentation, renderer loss recovery, spatial broad phase, local production-artifact smoke, deterministic mass, synthetic item-grant and collapse-pacing screens, and 50-participant local profiles without claiming hosted deployment, physical-device, cross-browser, audio-device, active-item bot balance, risky-pickup item balance, human balance, or external playtest approval.

## Formatting Boundary

Oxfmt must ignore `.agents/**`, `.ssealed/**`, dependencies, caches, coverage, and build output. Existing seeded documents are not bulk-formatted merely to satisfy a new formatter. Markdown prose wrapping remains preserved unless a document owner explicitly changes it.
