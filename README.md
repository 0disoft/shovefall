# 바닥이 사라지는 술래잡기

- Status: Playable fixed 50-participant rounds with deterministic items, Coal-Twilight presentation, GitHub Pages deployment, and reviewed contributor recognition
- Scope: frontend
- Repository Type: web-app
- Addons: none

Play: <https://0disoft.github.io/shovefall/>

바닥이 사라지는 술래잡기 (`Shovefall`) is a short single-player browser party game about shoving opponents off a collapsing arena. One participant is human and the remaining participants are deterministic rule-based bots. The MVP is a static client application with no backend, database, account system, runtime LLM, or remote analytics.

The repository contains a playable semantic DOM and PixiJS WebGL client, exact package graph, local validation commands, and a Clarissimi-backed public contribution review path. A pausable `3→2→1` session countdown renders the fresh arena while keeping simulation, bots, and input at tick zero. Public play is one 50-participant Hard-AI mode; the human chooses a numeric starting weight from 50 through 100 plus two distinct items from nine offered choices. WASD, arrow keys, mouse or touch drag anywhere in the arena, a touch joystick, a standard gamepad stick, or its D-pad moves; Space, the first gamepad button, or the touch action extends a short hand shove without launching the attacker; Shift, the second gamepad button, or the touch action dodges; Q/E, gamepad face buttons, or the arena item buttons use inventory slots; and `1..4` spends elimination-earned points on Power, Stability, Mobility, or Reflex. Wind Blast has two charges and launches the first unshielded body on its ray. Brick Bag has four charges and places a cardinal wall on the faced supported tile. Boat grants five seconds of movement across in-arena water. Bomb has two charges and leaves a visible five-second hazard whose three-tile blast launches every nearby body, including its owner; Dodge works, Brick does not absorb the blast, and armed bombs keep their fuse after flooding or owner elimination. Soap has three charges and leaves a one-use patch on the faced tile; the first body to cross it slips and Stumbles, including the installer. `구조 갈고리` has two charges and pulls only its user toward current land or the first Brick wall along a 4.5-tile facing ray; it does not teleport, provide water support, pull opponents, or create elimination credit. Launched and pulled bodies still transfer motion through swept weak contacts. The public 48×40 procedural island contains exactly eight separated 6–10-tile lakes while preserving one connected landmass and a connected 20% collapse core. Item placement selects edge, near-edge, or interior at a stable 3:2:1 ratio. Once the protected core is reached, its tiles stay intact while deterministic outward pressure pulses prevent an indefinite center draw. The least-privilege GitHub Actions workflows mirror local merge checks and deploy the exact tested `dist` to GitHub Pages. Product `0.34.0` is the local candidate with completed sharded round, mass, item, and collapse audits; [CI run `30043768628`](https://github.com/0disoft/shovefall/actions/runs/30043768628) remains exact hosted proof only for `0.33.0` SHA `732f95f3a777220d0410612a2fb95840a8e7e721`. Human playtest, uncontended browser performance, exact-SHA hosted proof, and cross-browser checks remain pending for `0.34.0`.

## Accepted Toolchain Baseline

- Browser application: semantic HTML, DOM, CSS, and a PixiJS 8 WebGL game world
- Language and type checking: TypeScript 7 stable with `tsc --noEmit` as the authoritative type gate
- Build: Vite 8 with a provider-neutral static `dist` artifact
- Package and automation runtime: Bun stable with a committed `bun.lock`
- Lint: Oxlint with `oxlint-tsgolint@7` type-aware rules
- Format: Oxfmt; no direct Prettier dependency
- Tests: Vitest 4 for unit and simulation scenarios, with Playwright Test for browser smoke and E2E

The complete adoption constraints, rollback path, and version policy are in [docs/engineering/08-toolchain-baseline.md](docs/engineering/08-toolchain-baseline.md).

## Source Files

- package.json and bun.lock: exact dependency and local command graph
- src/app/: DOM lifecycle and normalized setup state
- src/content/: versioned item definitions and physical multipliers
- src/ai/: delayed-perception, utility-scored bot command generation
- src/presentation/: PixiJS-only arena presentation
- src/simulation/: renderer-independent fixed-tick contracts, world, random streams, hashing, and replay
- tests/: Vitest unit and application-model tests
- e2e/: Playwright browser smoke
- tools/: Bun TypeScript contract and documentation checks
- AGENTS.md: agent working rules
- CHECKLIST.md: checklist router
- VALIDATION.md: validation names and reporting requirements
- .agents/context-map.md: agent route map
- docs/engineering/08-toolchain-baseline.md: accepted technology and tool ownership
- docs/frontend/FRONTEND_DESIGN.md: PixiJS, DOM, state, accessibility, and presentation boundaries
- docs/product/02-spec.md: accepted game scope, controls, quality tiers, gates, and non-goals
- docs/architecture/: authoritative boundary, domain model, and fixed-tick runtime order
- docs/architecture/04-bot-ai.md: bot fairness, personality, scheduling, and command boundaries
- docs/architecture/05-scale-performance.md: broad-phase semantics and bounded local performance evidence
- docs/architecture/06-items-and-effects.md: deterministic item definitions, lifecycle, and ownership
- docs/architecture/07-presentation-feedback.md: event consumption, audio, motion, and renderer-recovery boundaries
- docs/architecture/08-swept-contacts.md: fixed-tick continuous contact detection and compatibility
- docs/: design, operations, architecture, and engineering standards

## Repository Shape Notes

- web-app: This repository type owns routes, rendering mode, browser state, accessibility, and client observability.


## Repository Hygiene

.editorconfig, .gitattributes, and .gitignore are generated to keep line endings,
binary diffs, local files, build outputs, caches, and secret files under control.

## Scope Notes

The toolchain, replay format v2, fixed-tick physics, swept-circle and static-wall contact, browser scheduler, Coal-Twilight PixiJS renderer, fixed Hard utility bots, selectable collapse speed, protected-core pressure, one 50-participant browser mode, nine starting items, optional procedural audio, deterministic balance auditing, and source-owned GitHub Actions Pages workflow are implemented for product `0.34.0`, simulation `17.0.0`, and content `10.0.0`; reports remain v4. Production HTML contains no developer telemetry markup. The local candidate has 173 unit/scenario tests before final aggregate validation and accepted fixed-seed production, mass, selectable-item, and collapse-speed screens. Bot use and human balance for active items, uncontended browser performance, exact-SHA hosted proof, broader physical-device and cross-browser coverage, external playtest, final captures, and optional external image assets remain pending or separately gated.
