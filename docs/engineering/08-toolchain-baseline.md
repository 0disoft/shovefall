# Toolchain Baseline

- Status: Accepted with constraints
- Decision date: 2026-07-22
- Owner: Repository owner
- Criticality: Customer-facing build pipeline for a time-bounded static game
- Reversibility: Code-only and build-pipeline changes; no persistent data migration

## Decision

Shovefall adopts a Bun-managed Vite and PixiJS browser stack with TypeScript 7, Oxlint, Oxfmt, Vitest, and Playwright Test. The stack must remain a small static-client toolchain rather than becoming a general web platform.

| Responsibility | Selected track | Decision |
|---|---|---|
| Package manager and automation runtime | Bun 1.3.14 | Owns installs, `bun.lock`, package scripts, and project-authored TypeScript automation. |
| Language and authoritative type check | TypeScript 7.0.2 | `tsc --noEmit` remains the authoritative compiler diagnostic gate. The repository does not require the legacy JavaScript compiler API. |
| Development and production build | Vite 8.1.5 | Produces one provider-neutral static `dist` artifact. |
| Game-world rendering | PixiJS 8.19.0 with WebGL preference | Owns rendering only; simulation state and rules remain renderer-independent. |
| Lint | Oxlint 1.75.0 | Owns correctness, suspicious, import, and repository-approved restriction rules. |
| Type-aware lint | `oxlint-tsgolint` 7.0.2001 | Runs Oxlint type-aware rules against the TypeScript 7 program. Oxlint, tsgolint, and TypeScript compatibility is reviewed and pinned as a set. |
| Format | Oxfmt 0.60.0 | Owns formatting for approved project paths. A direct Prettier dependency is not installed. |
| Unit and scenario tests | Vitest 4.1.10 | Owns pure simulation, contracts, deterministic scenarios, and application-model tests. |
| Browser smoke and E2E | Playwright Test 1.61.1 | Owns browser boot, input, focus, round, failure, restart, and static-build checks. The local bootstrap smoke uses installed stable Chrome. |
| Audio | Browser Web Audio API | Avoids an initial audio runtime dependency. |

`@types/node` 26.1.1 supports configuration and repository-owned Bun TypeScript tools. Exact declarations live in `package.json`; exact resolutions live in `bun.lock`. Dependency lifecycle scripts are disabled during installation.

## Rejected Baseline Alternatives

- ESLint and typescript-eslint are rejected because Oxlint and tsgolint provide the selected lint and type-aware rule surface with a smaller JavaScript dependency graph.
- A direct Prettier dependency is rejected because Oxfmt owns the project formatting command. Oxfmt may internally delegate formats that are not yet native; this does not make Prettier a separately managed project dependency.
- TypeScript 6 is rejected as the default compiler track because the greenfield application has no known compiler API consumer and the selected tsgolint track is built for TypeScript 7. The official TypeScript 6 compatibility track remains the rollback option if a required tool proves incompatible.
- React, Vue, Svelte, Tailwind CSS, a global state framework, a general-purpose physics engine, and a full game engine are rejected from the initial baseline because they add ownership surfaces without an approved current requirement.
- npm, pnpm, and Yarn lockfiles are rejected alongside Bun to prevent multiple dependency graphs.

## Adoption Constraints

- `tsc --noEmit` remains separate from Oxlint. Oxlint integrated `typeCheck` is not the sole type gate while upstream documents it as experimental.
- Oxlint uses JSON or JSONC configuration initially. TypeScript configuration files for Oxlint are not used while that configuration path is experimental and Node-specific.
- Oxfmt is adopted with a narrow formatting boundary because its upstream release line is newer and existing ssealed files already have checksums.
- `.agents/**`, `.ssealed/**`, dependencies, caches, coverage, build output, and generated output are excluded from formatter writes.
- Markdown uses preserved prose wrapping. Seeded documents are formatted only after deliberate project ownership and reviewed diff evidence.
- TypeScript 7, Oxlint, and tsgolint are upgraded together. A new major or incompatible patch requires type, lint, build, and editor smoke evidence.
- The simulation cannot depend on PixiJS, DOM APIs, browser clocks, or ambient randomness. These architecture checks belong in repository-owned Bun TypeScript validation when linter configuration alone is insufficient.
- No tool may claim a validation passed by omitting unmatched files or swallowing an unsupported configuration.
- `skipLibCheck` is temporarily enabled to isolate third-party declaration conflicts between TypeScript 7 `lib.dom`, PixiJS 8.19.0, and PixiJS's `@webgpu/types` dependency. Repository source remains under strict checking. Remove this exception when upstream declarations converge; do not expand it into application-level suppressions.

## Freshness Evidence

The decision used current primary sources checked on 2026-07-22:

- TypeScript 7 is the stable native compiler track. It does not expose the previous JavaScript compiler API, so API consumers require the official TypeScript 6 compatibility package: <https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/>
- Oxlint type-aware linting is stable through tsgolint 7, tracks TypeScript 7, and covers most but not every typescript-eslint type-aware rule: <https://oxc.rs/blog/2026-07-22-type-aware-linting-stable.html>
- Oxlint documents integrated compiler diagnostics through `typeCheck` as experimental, so this repository retains the independent TypeScript gate: <https://oxc.rs/docs/guide/usage/linter/type-aware.html>
- Oxfmt supports the selected JavaScript, TypeScript, JSON, CSS, HTML, and Markdown surfaces, with documented unsupported options and plugin limits: <https://oxc.rs/docs/guide/usage/formatter>
- Vite 8 supports the selected static build shape and requires a compatible modern JavaScript runtime: <https://vite.dev/blog/announcing-vite8>
- PixiJS 8 recommends WebGL for production while WebGPU browser behavior continues to mature: <https://pixijs.com/8.x/guides/components/renderers>
- Bun documents Vite use through Bun-managed installation and scripts: <https://bun.sh/docs/guides/ecosystem/vite>

## Smallest Adoption Slice

The first application bootstrap created package metadata, exact pins, Bun lockfile, TypeScript and Oxc configuration, Vite configuration, a semantic DOM setup shell, an initialized PixiJS WebGL arena preview, validation commands, and one browser smoke. It did not implement gameplay physics, AI, items, final visual polish, deployment, or analytics.

## Verification and Stop Conditions

Adoption succeeds only when a clean Bun install, Oxfmt check, Oxlint type-aware run, independent TypeScript 7 check, Vitest smoke, Playwright browser boot, and Vite production build all pass through configured commands.

The bootstrap satisfied these gates on 2026-07-22 with a frozen offline lockfile reproduction check still required after the final documentation update.

Stop and revisit the decision when any of the following occurs:

- A required tool cannot consume the TypeScript 7 project without the legacy compiler API.
- Oxlint and tsgolint disagree with TypeScript diagnostics in a way that hides a real defect.
- Oxfmt creates unstable or broad unrelated diffs after its scope and version are pinned.
- Bun cannot reproduce the lockfile or a required tool only works through an unmaintainable runtime workaround.
- Vite or PixiJS cannot produce the agreed WebGL static-client boundary in supported browsers.

## Rollback

Application source now depends on this baseline, so a toolchain rollback is a deliberate port rather than a lockfile-only revert. Revert or replace one tool responsibility together with its package scripts, lockfile, configuration, CI contract, and validation evidence. If only the TypeScript compiler track fails, adopt the official TypeScript 6 compatibility package temporarily and record the blocked TS7 capability. If an Oxc tool fails, pin the last passing version or temporarily replace only that responsibility without changing simulation or product contracts.
