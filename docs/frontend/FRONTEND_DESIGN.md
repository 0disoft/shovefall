# Frontend Design

- Status: Playable gray-box boundary implemented; Coal-Twilight visual direction adopted

## 0. Decision Summary

바닥이 사라지는 술래잡기 uses one static browser application. PixiJS 8 with WebGL owns the game world. Semantic HTML, DOM, and CSS own setup, settings, results, fatal errors, focus, and accessibility text. TypeScript 7, Vite 8, Bun, Oxlint, and Oxfmt form the accepted toolchain baseline.

React, Vue, Svelte, Phaser, Tailwind CSS, a general state manager, and a general-purpose physics engine are not part of the initial baseline. The contest-submission visual direction is Coal-Twilight: a single dark palette shared by the DOM shell and the PixiJS canvas. Character and item atlases plus single pirate-ship, cannonball, boulder, explosion, and seawater-impact sprites have passed the asset ledger and now layer over the procedural renderer. The rejected multi-asset sheets stay outside the runtime; terrain, character-action, and item-prop replacements remain pending. Reduced-motion presentation follows the same authoritative telegraph timing without depending on animation amplitude.

## 1. Product Surface and Scope

The primary surface is a short desktop-or-mobile browser single-player game reached through a public HTTPS link. The default entry point must reach quick start without installation, account creation, or a network service. Online multiplayer, authentication, a backend, a database, runtime LLM calls, and remote analytics are outside the MVP.

## 2. User Flow Map

The minimum user flow is load, menu, game start, a pausable `3→2→1` countdown, play, elimination or victory, and immediate restart through a fresh countdown. Settings are a secondary menu branch: edits remain draft values until `설정 저장`, then return to the menu; `게임 시작` always consumes the last saved values. Version history is another static secondary branch: it renders concise newest-first milestones, returns through `메뉴로` or `Escape`, and restores focus to its launcher without creating URL or persisted state. Required initialization failure disables start and enters a recoverable DOM error state. There are no application permission or authentication flows.

## 3. Routing Contract

The MVP is a single-page static application with one document route. URL parameters, query-driven game state, hash routing, redirects, and shareable configuration are not part of the initial contract. Static hosting must support both root and configured base-path builds without application routing.

## 4. Page and Layout Model

The DOM shell owns the initial menu, version history, settings, HUD overlays outside the game world, results, errors, and accessibility text. The PixiJS canvas is hidden before play and owns arena tiles, participants, items, pirate ships, cannon and rock trajectories, impact effects, and a human-follow camera after start. The camera renders a local viewport and clamps at the projected world edge with an ocean margin large enough to reveal offshore attackers; it never shrinks the full island into one screen. Presentation uses a fixed 58-degree elevation: world depth is foreshortened by `sin(58°)`, while simulation and collision coordinates remain top-down.

## 5. State Ownership Model

The pure simulation owns round state. The application layer owns the fixed-step accumulator, countdown elapsed time, screen and round lifecycle, generated local seed, pause/resume, automatic growth-plan command selection, and command delivery. The DOM shell owns draft settings including the ordered growth plan, last-saved in-memory settings, focus, match-readable status, restart, and menu return. PixiJS owns presentation objects derived from read-only render state. There is no server state or durable URL state. Presentation layers cannot mutate simulation entities directly.

## 6. Data Fetching and Cache Policy

Application data fetching and cache invalidation are `NOT_APPLICABLE`. Required static assets load from the same origin. Optional character and item atlases start loading without blocking countdown or simulation; failure sets the renderer asset state to `procedural-fallback`. Optional audio failure falls back to silence. A required renderer or content-contract failure blocks round start with a recoverable error screen.

## 7. Component Boundary Model

The application composes simulation, AI, presentation, platform adapters, and content. Simulation remains pure TypeScript and cannot import PixiJS, DOM, browser clocks, or ambient randomness. AI emits the same participant command shape as human input. PixiJS and DOM consume read-only state and events. Generic `shared`, `utils`, and framework-shaped layer hierarchies are not created without a concrete owner.

## 8. Design Token Contract

Semantic tokens must distinguish canvas background, stable tile, warning tile, void, human participant, bot participants, focus, cooldown readiness, mass state, success, danger, and disabled controls. The Coal-Twilight palette is the adopted contest-submission direction and is shared between the DOM shell (`src/styles.css`) and the PixiJS canvas (`src/presentation/arena-renderer.ts`):

- Void surface: `#0c0f0e` (page), `#141816` (canvas and arena host)
- Tile stable: `#2c3431`; tile warning: `#8a5a1e` stroke `#ffc857`; tile collapsing: `#6b2a24` stroke `#ff5c4d`
- Human identity: `#3b8cff` focus accent, doubled as a guard ring plus diamond body stroke so the human is identifiable among 50 participants
- Action telegraph: ShoveWindup amber `#ffc857`, ShoveActive red `#ff695c`, DodgeActive cyan `#68d8d6`, Stumbling magenta `#d58bea`
- Mass ring scales stroke width with `massFactor`; iron-boots badge and feather chevron provide non-color mass signals
- Success `#5fd6a6`, danger `#ff5c4d`, warning `#ffc857`, warm accent `#ff8f5c` for Mayhem mode

Color is never the only signal for collapse warning, player identity, or action readiness. Collapse uses shape (diagonal cross, X-hatch), identity uses shape (diamond) plus a doubled ring, and action readiness uses direction-line width and color together.

The 2.5D depth contract keeps tile tops rectangular and only exposes a dark 6–14 CSS-pixel cliff front where a supported tile has no southern neighbor. Characters and items remain upright instead of being vertically squashed, receive bounded elliptical ground shadows, and are drawn by interpolated world Y so nearer participants cover farther ones. Facing lines and world effects use the same projected vector plane. The projection is presentation-only and cannot change support, collision, AI, replay hashes, or deterministic outcomes.

## 9. Interaction and Accessibility Contract

The input contract accepts `WASD` and arrow-key movement, mouse or touch drag anywhere in the arena, a mobile virtual joystick, a standard gamepad left stick or D-pad, `Space`/the first gamepad button/touch hand shove, `Shift`/the second gamepad button/touch dodge, and `Q`/`E` or the third/fourth gamepad buttons and arena buttons for inventory slots. Every adapter writes the same bounded human command state sampled once per fixed tick; simultaneous slot edges choose slot zero, pointer input overrides gamepad input while actively dragged, gamepad input overrides held keyboard movement while displaced, and releasing or losing focus restores a neutral vector and stops ordinary locomotion immediately. Setup offers an integer 50–100 starting-weight slider, all nine starting items including `구조 갈고리`, and an ordered automatic growth plan; exactly two distinct offered starting-item checkboxes are required, and once two are selected unused options are disabled until one is removed. Permanent items say `패시브`, while charged cards and in-round slot buttons show remaining uses. The in-round left overlay exposes shove and dodge readiness, blocking reason, or cooldown seconds; the upper-right overlay exposes current levels, unspent points, and the next valid automatic step. A successful dodge onto a Brick wall snaps to its center and becomes immovable, disables attacks while mounted, and dismounts on movement. Grappling Hook uses the same current movement/facing direction as other directed actions; it adds no cursor-only aiming mode. Gameplay keys are ignored when an input, link, or button owns focus. Window blur and document visibility loss clear held input and pause the scheduler.

The experimental tuning lab exists only in development builds and is absent from the production DOM. It starts collapsed and disabled, then exposes bounded sliders for base movement speed, light/heavy speed multipliers, hand reach, active ticks, dodge speed, and dodge ticks when enabled. Ordinary movement acceleration is intentionally not tunable because locomotion is direct. Values apply to the next round for both human and bots, can be reset, and copy as local schema `shovefall-debug-tuning/v1`; they never persist or upload.

## 10. Loading, Empty, Error, and Disabled States

Boot has loading, ready, unsupported-renderer, required-content-error, and retry states. Setup disables start only when normalized configuration cannot be produced. Playing exposes paused and fatal-invariant states. Optional media failure does not create an empty game state.

## 11. Form and Validation Model

Settings are local client inputs validated at the DOM boundary and normalized again by the application contract. There is no backend validation. Invalid user-controlled values are constrained with visible feedback; invalid project-owned content blocks start rather than silently inventing defaults.

## 12. Responsive and Layout Rules

The layout supports narrow mobile viewports without covering setup controls. A coarse pointer or viewport at or below 820 px reveals an arena-overlay virtual joystick plus shove and dodge buttons; touch may also drag anywhere outside those buttons. The mobile arena height is capped by dynamic viewport height with a 300 CSS pixel floor instead of forcing a 440 CSS pixel canvas into short landscape screens. Desktop keeps mouse-drag and keyboard controls without the overlay. DOM controls wrap without clipping the canvas, controls remain at least 44 CSS pixels, and device-pixel ratio stays capped by measured performance policy. Physical-device and safe-area testing remain release evidence gates rather than inferred support claims.

## 13. Observability and Analytics

Remote analytics, session replay, advertising, and automatic error upload are excluded. The normal HUD contains only match-readable state. DEV bootstrap creates one collapsed `data-development-only` panel for tick, rate, position, seed, and state hash; production HTML contains no panel markup and production never creates or updates those outputs. Fatal errors may show copyable non-secret reproduction metadata without uploading it. Completed rounds may copy a local versioned playtest record with seed, normalized settings, result, and state hash; this is a user-triggered clipboard write, not analytics or persistence.

## 14. Test Strategy

Vitest covers pure state, keyboard and pointer vectors, gamepad dead zones and slot edges, growth-plan normalization and selection, direct locomotion start/turn/stop, loadout normalization, starting effects, charged use, first-hit targeting, Brick Bag placement and rejection, dodge mounting and dismounting, mounted shove blocking, same-tick wall shielding, swept wall stops, hand-shove corner occlusion, Void-tile wall removal, Boat support, Bomb direct elimination, Soap, Grappling Hook, replayed setup, credited elimination, bounded stat spending, exact protected-core cannon ammunition, artillery telegraphs, lethal rock pressure, result sealing, version-history/product-version alignment, 58-degree projection math, projected camera bounds, and presentation boundaries. Playwright covers version-history entry and focus return, saved growth-plan editing, passive copy, match HUD state, setup, debug tuning copy/apply, countdown, keyboard, Q/E Wind, Brick Bag, Boat, Bomb, Soap, and Grappling Hook charge use, arrow-key, mouse-drag and narrow-viewport joystick movement, touch action bridging, deterministic human defeat and restart, audio fallback, reduced motion, fatal recovery, and WebGL restoration. Physical touch hardware and gamepad hardware remain manual device-matrix gates.

## 15. Implementation Sequence

The toolchain, deterministic simulation, direct movement, hand-shove combat, browser scheduler, pausable countdown, multi-device adapters, procedural PixiJS presentation, fixed Hard utility bots with one balanced passive-plus-active loadout and bounded charged-item use, selectable Slow/Normal/Fast collapse, automatic growth planning, match-readable HUD, round results, local report v5 copy, accelerated defeat resolution, restart, spatial broad phase, one 50-participant setup mode on a 48×40 island with eight separated lakes, topology-independent 3:2:1 item risk bands, all nine starting items, Brick dodge mounting, opponent-lethal and owner-launching Bombs, eight-ship cannon collapse, protected-core lethal rock pressure, eight asynchronously loaded generated assets, optional procedural audio, reduced-motion effects, renderer recovery, and a production-free developer telemetry boundary are implemented for product `0.37.0`. Generated terrain sprites layer over deterministic procedural geometry and follow stable coast topology plus warning state; camera-space culling keeps only the visible area and a two-tile gutter alive instead of submitting the full island every frame. Generated character variants layer over mass-scaled procedural identity, action, facing, and stumble/fall signals; generated Bomb, Soap, and Boat props layer over deterministic geometry; projectiles and impacts reuse cached textures while completed sprite instances are destroyed. Each static image loads independently, so one missing file cannot suppress unrelated art. Text-backed settings cards and procedural geometry remain usable when art fails. Hosted `0.37.0` proof, action replacements, human and bot active-item balance, and final-art readability remain gated on their own evidence.

## 16. Open Questions and Decisions Log

Open decisions include typography, exact supported viewport and browser matrix, and how much of the remaining procedural world should be replaced before submission. GitHub Pages is the current host and Coal-Twilight is the adopted palette. Procedural oscillator cues remain the optional audio baseline. The implementation owner supplies complete generation prompts to the repository owner instead of invoking a metered image generator. Generated files must pass alpha, provenance, payload, and readability checks before entering the runtime. Aesthetic frontend work should use the user-designated Umans GLM 5.2 path when available; otherwise a self-contained handoff prompt remains the fallback.

## Technology Reference

The toolchain, version tracks, formatter boundary, adoption constraints, and rollback policy are owned by [../engineering/08-toolchain-baseline.md](../engineering/08-toolchain-baseline.md). This document owns frontend responsibility and interaction boundaries, not package version duplication.
