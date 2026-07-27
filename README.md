# 바닥이 사라지는 술래잡기

- Status: Playable fixed 60-participant rounds with deterministic items, Coal-Twilight presentation, GitHub Pages deployment, and reviewed contributor recognition
- Scope: frontend
- Repository Type: web-app
- Addons: none

Play: <https://0disoft.github.io/shovefall/>

바닥이 사라지는 술래잡기 (`Shovefall`) is a short single-player browser party game about shoving opponents off a collapsing arena. One participant is human and the remaining participants are deterministic rule-based bots. The MVP is a static client application with no backend, database, account system, runtime LLM, or remote analytics.

The repository contains a playable semantic DOM and PixiJS WebGL client, exact package graph, local validation commands, and a Clarissimi-backed public contribution review path. A pausable `3→2→1` session countdown renders the fresh arena while keeping simulation and bots at tick zero; movement held during the countdown is remembered, while skills and items remain gated until play begins. Public play is one 60-participant Hard-AI mode.

The human allocates exactly 20 points across six starting attributes, selects two of eight reusable combat skills, and chooses one of five charged starting items. Arrow keys, mouse or touch drag, a touch joystick, a standard gamepad stick, or its D-pad start, turn, and stop ordinary movement immediately. `Q/W/E/D` enter a visible aim preview: `Q/W` use the selected skills, `E` uses the shared cooldown-based Grappling Hook, and `D` uses the selected item. Pointer confirmation either casts in range or walks to the selected point before casting. `Escape` or right-click cancels aiming. Participants own health, mana, delayed health regeneration, continuous mana regeneration, shields, and visible control states. Skills deal damage or create knockback, stun, root, slow, damaging zones, dashes, and shields; zero health and support loss are separate elimination paths.

A credited elimination pauses the round and offers one direct choice among six uncapped combat traits. The arena owns the full dynamic viewport during play; `P` opens live round statistics and non-combat actions without pushing the map into a page layout. The public 48×40 procedural island contains exactly twelve separated 5–9-tile lakes under a 96-tile budget and a connected 20% protected core. Slow collapse begins telegraphing at two seconds, launches its first cannonball during the opening seconds, and spaces six-tile shore waves by 42 ticks. Each wave receives one projectile from the closest available offshore pirate ship, and one ship never has two cannonballs airborne; after ammunition runs out, targeted lethal rocks pressure survivors without deleting the core. The public round limit is 120 seconds, starts with eight map items, and adds one item every seven seconds.

Product `0.53.0`, simulation `31.0.0`, content `19.0.0`, and local reports v9 own these current local rules. Hosted `0.37.0` remains the last deployed proof; the `0.53.0` candidate, human playtest, uncontended browser performance, and cross-browser checks remain pending.

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

The toolchain, replay format v5, fixed-tick physics, health/mana combat, swept-circle and blocking-obstacle contact, bounded browser scheduler, Coal-Twilight PixiJS renderer, fixed Hard utility bots with obstacle-aware routing, target commitment, tactical skill selection, and lethal-rock escape, opening Slow collapse, kill-triggered direct six-trait selection, full-viewport play with a P pause layer and live round statistics, outer-coast-only cannon collapse with per-ship reload, protected-core rock pressure, one 60-participant browser mode, browser-local scoreboard, eight independent combat skills, a 15-second shared Grappling Hook and one charged-item slot, accepted generated-image assets, optional procedural audio, deterministic balance auditing, and source-owned GitHub Actions Pages workflow are implemented locally for product `0.69.0`, simulation `41.0.0`, and content `25.0.0`; reports use v9. Production HTML contains no developer telemetry or tuning-lab markup. Combat and item human balance, uncontended browser performance, broader physical-device and cross-browser coverage, and external playtest remain pending or separately gated.
