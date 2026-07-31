# 바닥이 사라지는 술래잡기

- Status: Playable fixed 60-participant rounds with deterministic items, Coal-Twilight presentation, GitHub Pages deployment, and reviewed contributor recognition
- Scope: frontend
- Repository Type: web-app
- Addons: none

Play: <https://0disoft.github.io/shovefall/>

바닥이 사라지는 술래잡기 (`Shovefall`) is a short single-player browser party game about shoving opponents off a collapsing arena. One participant is human and the remaining participants are deterministic rule-based bots. The MVP is a static client application with no backend, database, account system, runtime LLM, or remote analytics.

The repository contains a playable semantic DOM and PixiJS WebGL client, exact package graph, local validation commands, and a Clarissimi-backed public contribution review path. A pausable `3→2→1` session countdown renders the fresh arena while keeping simulation and bots at tick zero; movement held during the countdown is remembered, while skills and items remain gated until play begins. Public play is one 60-participant Hard-AI mode.

The human allocates exactly 20 points across six starting attributes, selects two of six reusable combat skills, and chooses one of four charged starting items. Arrow keys, right-click ground destinations, a touch joystick, a standard gamepad stick, or its D-pad own ordinary movement. A new right-click replaces the current destination, while direct movement input cancels destination travel. `Q/W/E/D` enter a visible aim preview: `Q/W` use the selected skills, `E` uses the shared cooldown-based Grappling Hook, and `D` uses the selected item. Pointer confirmation either casts in range or walks to the selected point before casting. `Escape` or right-click cancels aiming. Participants own health, mana, delayed health regeneration, continuous mana regeneration, shields, and visible control states. Skills deal damage or create knockback, stun, root, slow, damaging zones, movement, and shields; zero health and support loss are separate elimination paths.

A credited elimination pauses the round and offers one direct choice among six uncapped combat traits. The arena owns the full dynamic viewport during play; `P` opens live round statistics and non-combat actions without pushing the map into a page layout. The public 52×44 procedural island contains exactly twelve separated 5–9-tile lakes under a 96-tile budget. Its rectangular bound is 19.2% larger than the former 48×40 map, while an 8% camera zoom keeps nearby terrain and combat readable. Sixteen offshore pirate ships begin telegraphing during the opening seconds. Every ship owns a deterministic independent firing clock and launches once every seeded 1.5 to 2.25 seconds; every accepted shot owns exactly one warning tile and floods only that tile. A coast target that a firing ship cannot reach over open water is deferred rather than warned without a projectile. Multiple ships and consecutive shots from one ship may remain airborne together, and only an actual impact exposes deeper coast targets. Ships have no ammunition counter and keep firing until every land tile has flooded. The public round has no time limit and ends only when one participant remains or nobody survives. It starts with eight map items. Two opposite treasure ships alternate the configured seven-second cycle, producing one launch about every 3.5 seconds when capacity permits; every target is three to seven stable tiles inland from the nearest water boundary at launch.

Product `0.129.0`, simulation `78.0.0`, content `48.0.0`, replay v8, and local reports v11 own these current local rules. Game Start first explains that pirate cannon impacts flood coast tiles and shrink the island while the round is prepared before play; only `알겠다요 ㅇㅅㅇ` reveals the arena and starts the countdown. Starting attributes and kill-reward traits use the same six Korean names, the live defense readout names damage reduction and shield strength, and skill descriptions call their cone assistance automatic aiming. Grappling Hook catches only trees and Brick Bag walls, spends nothing on bare ground, and sustains its pull until shared obstacle collision stops the user in front of the anchor. Soap has four charges, slides its victim for two seconds, and then deals 30 damage. Meteor Mark deals 32 damage. Frost Field costs 38 mana with a ten-second cooldown; Bomb deals 60 damage and its installer receives a 25% share. Agility grants 4.5% movement per point and Constitution grants 1.5 maximum health per point. Arc Bolt deals 25 damage, Blink Step travels up to four tiles with two seconds of attack evasion, and Collector bots reserve only nearby safe items after spending a usable occupied active slot. Arc Bolt and Chain Bind keep immediate deterministic hit resolution while their generated projectile art travels from caster to impact at three tiles per second. Forward targeting scans current participants without allocating and sorting a candidate array for every cast, active zones reuse one actor ordering per tick, and generated skill art suppresses its procedural duplicate. Pirate ships expose no ammunition count and continue cannon flooding through the last stable tile without switching to rocks. Browser context menus are suppressed inside the game application so right-click remains a game-owned movement and aiming input. The shared sound-volume curve keeps 0 silent and 100 at full output while making visible level 50 equal the former level-80 output. Hosted proof for `0.129.0`, a fresh balance audit, human playtest, measured contested-browser performance, and cross-browser checks remain pending.

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

The toolchain, replay format v8, fixed-tick physics, health/mana combat with 30 starting current mana, swept-circle and blocking-obstacle contact, bounded browser scheduler, single-submit PixiJS frame presentation, 10 Hz HUD telemetry, a pre-round briefing gate, Coal-Twilight renderer with water-clean cardinal and diagonal shoreline cutouts, sixteen four-state character animation sets without duplicate procedural body discs, fixed Hard utility bots with obstacle-aware routing, target commitment, crowded-stall separation, tactical skill selection, safe Collector item turnover, opening Slow collapse, kill-triggered direct six-trait selection with current-to-next comparison rows, compact pre-round trait allocation with twelve combat-stat meters and horizontal decrease/value/increase controls, full-viewport play with a P pause layer, result-first round summaries, expanded live round statistics, and post-elimination keyboard/pointer spectator panning, launch-synchronized one-shot/one-tile outer-coast cannon warnings from sixteen independently firing pirate ships with 3-4 visible water tiles between hull and shore, unlimited cannon flooding through the final stable tile without a terminal rock phase, one 60-participant browser mode on a 52×44 island with an 8% closer camera, browser-local scoreboard, six independent combat skills with role-colored transparent hand-painted PNG card art, definition-derived base knockback distances, and equal-height cards within each desktop row, four charged active items with range-derived player-facing placement instructions, two opposite treasure ships with alternating inland gift deliveries, a 10.5-second obstacle-only shared Grappling Hook and one charged-item slot with water-triggered Boat boarding, a definition-owned long Soap slide, app-owned right-click destination movement with browser context-menu suppression and direct-input cancellation, held-arrow movement that resumes after targeting, a viewport-centered fullscreen menu, a menu-owned public source-code link, four persisted text sizes, separate persisted 0–100 sound-effect and background-music volumes with an audible shared midpoint, explicit one-line skill-efficiency labels with hover and focus help, accepted generated-image assets including a teal-and-gold treasure vessel and stunned-state feedback, optional procedural effects plus a licensed same-origin looping music track, deterministic balance auditing with independent item-personality exposure and composite high-variance signals, and source-owned GitHub Actions Pages workflow are implemented locally for Product `0.129.0`, simulation `78.0.0`, and content `48.0.0`; reports use v11. Production HTML contains no developer telemetry or tuning-lab markup. Combat and item human balance, measured contested-browser performance, broader physical-device and cross-browser coverage, and external playtest remain pending or separately gated.

## Music Credit

`HYP - Catch Me If You Can` · BGM provided by HYP MUSIC · [official track](https://youtu.be/LrTkfYqNJFU) · [distribution and license record](https://bgmdesign.tistory.com/1)
