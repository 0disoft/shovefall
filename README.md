# 바닥이 사라지는 술래잡기

- Status: Playable fixed 50-participant rounds with deterministic items, Coal-Twilight presentation, GitHub Pages deployment, and reviewed contributor recognition
- Scope: frontend
- Repository Type: web-app
- Addons: none

Play: <https://0disoft.github.io/shovefall/>

바닥이 사라지는 술래잡기 (`Shovefall`) is a short single-player browser party game about shoving opponents off a collapsing arena. One participant is human and the remaining participants are deterministic rule-based bots. The MVP is a static client application with no backend, database, account system, runtime LLM, or remote analytics.

The repository contains a playable semantic DOM and PixiJS WebGL client, exact package graph, local validation commands, and a Clarissimi-backed public contribution review path. A pausable `3→2→1` session countdown renders the fresh arena while keeping simulation, bots, and input at tick zero. Public play is one 50-participant Hard-AI mode; the human chooses a numeric starting weight from 50 through 100 and two distinct items from nine offered choices. WASD, arrow keys, mouse or touch drag, a touch joystick, a standard gamepad stick, or its D-pad starts, turns, and stops ordinary movement immediately; Space or the first action button extends a short hand shove without launching the attacker; Shift or the second action button dodges; and Q/E or the remaining face/arena buttons use inventory slots. A credited elimination pauses the active round and opens one four-choice stat dialog; saving a valid choice resumes play, while elimination and round completion always take priority over the dialog. Wind Blast launches the first unshielded body on its ray. Brick Bag places four cardinal walls, and a dodge that reaches one mounts it as an immovable non-attacking perch until movement or flooding dismounts the rider. Boat grants five seconds of movement across in-arena water. Bomb leaves a visible five-second hazard that directly eliminates opponents in its three-tile radius; its owner survives but receives a strong launch and long stumble, so nearby water remains dangerous. Dodge and Brick cannot save an opponent. Soap leaves a one-use slip patch. `구조 갈고리` pulls only its user toward current land or the first Brick wall on its ray. The public 48×40 procedural island contains exactly twelve separated 5–9-tile lakes under a 96-tile budget and a connected 20% protected core. Public collapse is fixed to Slow, begins after 18 seconds, and groups six adjacent shore tiles per wave. Each wave receives one projectile from the closest offshore pirate ship instead of one cross-map projectile per doomed tile; after ammunition runs out, targeted lethal rocks pressure survivors without deleting the core. The public round limit is 120 seconds, starts with eight map items, and adds one item every four seconds. Item placement selects edge, near-edge, or interior at a stable 3:2:1 ratio. Product `0.39.0`, simulation `20.0.0`, content `14.0.0`, and local reports v6 own these current local rules. Hosted `0.37.0` remains the last deployed proof; the `0.39.0` candidate, human playtest, uncontended browser performance, and cross-browser checks remain pending.

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

The toolchain, replay format v2, fixed-tick physics, swept-circle and static-wall contact, bounded browser scheduler, Coal-Twilight PixiJS renderer, fixed Hard utility bots, fixed Slow public collapse, kill-triggered manual stat selection, nearby-wave cannon collapse, protected-core rock pressure, one 50-participant browser mode, nine starting items, eight accepted generated-image assets, optional procedural audio, deterministic balance auditing, and source-owned GitHub Actions Pages workflow are implemented locally for product `0.39.0`, simulation `20.0.0`, and content `14.0.0`; reports use v6. Production HTML contains no developer telemetry or tuning-lab markup. Active-item human balance, uncontended browser performance, broader physical-device and cross-browser coverage, and external playtest remain pending or separately gated.
