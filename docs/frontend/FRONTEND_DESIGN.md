# Frontend Design

- Status: Playable gray-box boundary implemented; Coal-Twilight visual direction adopted

## 0. Decision Summary

Shovefall uses one static browser application. PixiJS 8 with WebGL owns the game world. Semantic HTML, DOM, and CSS own setup, settings, results, fatal errors, focus, and accessibility text. TypeScript 7, Vite 8, Bun, Oxlint, and Oxfmt form the accepted toolchain baseline.

React, Vue, Svelte, Phaser, Tailwind CSS, a general state manager, and a general-purpose physics engine are not part of the initial baseline. The contest-submission visual direction is Coal-Twilight: a single dark palette shared by the DOM shell and the PixiJS canvas, built only from procedural shapes, text, and CSS. No external raster image assets are required. Generated image inventory remains empty by design; animation polish is limited to reduced-motion-respecting telegraphs already in the simulation contract.

## 1. Product Surface and Scope

The primary surface is a short desktop-browser single-player game reached through a public HTTPS link. The default entry point must reach quick start without installation, account creation, or a network service. Mobile touch, online multiplayer, authentication, a backend, a database, runtime LLM calls, and remote analytics are outside the MVP.

## 2. User Flow Map

The minimum user flow is load, setup, quick start, a pausable `3→2→1` countdown, play, elimination or victory, and immediate restart through a fresh countdown. Optional settings branch from setup and return to countdown. Required initialization failure enters a DOM fatal-error state with a retry path. There are no application permission or authentication flows.

## 3. Routing Contract

The MVP is a single-page static application with one document route. URL parameters, query-driven game state, hash routing, redirects, and shareable configuration are not part of the initial contract. Static hosting must support both root and configured base-path builds without application routing.

## 4. Page and Layout Model

The DOM shell owns setup, settings, HUD overlays outside the game world, results, errors, and accessibility text. The PixiJS canvas owns arena tiles, participants, items, world effects, and camera transforms. The game preserves a fixed logical world aspect and may letterbox rather than distort simulation coordinates.

## 5. State Ownership Model

The pure simulation owns round state. The application layer owns the fixed-step accumulator, countdown elapsed time, screen and round lifecycle, generated local seed, pause/resume, and command delivery. The DOM shell owns draft settings, focus, textual telemetry, restart, and settings return. PixiJS owns presentation objects derived from read-only render state. There is no server state or durable URL state. Presentation layers cannot mutate simulation entities directly.

## 6. Data Fetching and Cache Policy

Application data fetching and cache invalidation are `NOT_APPLICABLE`. Required static assets load from the same origin. Optional image or audio failure may fall back to procedural visuals or silence; required renderer or content-contract failure blocks round start with a recoverable error screen.

## 7. Component Boundary Model

The application composes simulation, AI, presentation, platform adapters, and content. Simulation remains pure TypeScript and cannot import PixiJS, DOM, browser clocks, or ambient randomness. AI emits the same participant command shape as human input. PixiJS and DOM consume read-only state and events. Generic `shared`, `utils`, and framework-shaped layer hierarchies are not created without a concrete owner.

## 8. Design Token Contract

Semantic tokens must distinguish canvas background, stable tile, warning tile, void, human participant, bot participants, focus, cooldown readiness, mass state, success, danger, and disabled controls. The Coal-Twilight palette is the adopted contest-submission direction and is shared between the DOM shell (`src/styles.css`) and the PixiJS canvas (`src/presentation/arena-renderer.ts`):

- Void surface: `#0c0f0e` (page), `#141816` (canvas and arena host)
- Tile stable: `#2c3431`; tile warning: `#8a5a1e` stroke `#ffc857`; tile collapsing: `#6b2a24` stroke `#ff5c4d`
- Human identity: `#3b8cff` focus accent, doubled as a guard ring plus diamond body stroke so the human is identifiable at 32 participants
- Action telegraph: ShoveWindup amber `#ffc857`, ShoveActive red `#ff695c`, DodgeActive cyan `#68d8d6`, Stumbling magenta `#d58bea`
- Mass ring scales stroke width with `massFactor`; iron-boots badge and feather chevron provide non-color mass signals
- Success `#5fd6a6`, danger `#ff5c4d`, warning `#ffc857`, warm accent `#ff8f5c` for Mayhem mode

Color is never the only signal for collapse warning, player identity, or action readiness. Collapse uses shape (diagonal cross, X-hatch), identity uses shape (diamond) plus a doubled ring, and action readiness uses direction-line width and color together.

## 9. Interaction and Accessibility Contract

The input contract is `WASD` movement, `Space` hand shove, `Shift` dodge, and `1..4` stat spending. Key edges become `ActorCommandV1` actions and held movement is sampled once per fixed tick. Setup offers three starting-mass radios and exactly two distinct starting-item checkboxes; once two are selected, the unused option is disabled until one is removed. The in-round DOM panel exposes the same four stat choices as number keys and returns focus to the arena after a click. Gameplay keys are ignored when an input, link, or button owns focus. Window blur and document visibility loss clear held input and pause the scheduler.

The experimental tuning lab is collapsed and disabled by default. Enabling it exposes bounded sliders for base movement, acceleration, light/heavy speed multipliers, hand reach, active ticks, dodge speed, and dodge ticks. Values apply to the next round for both human and bots, can be reset, and copy as local schema `shovefall-debug-tuning/v1`; they never persist or upload.

## 10. Loading, Empty, Error, and Disabled States

Boot has loading, ready, unsupported-renderer, required-content-error, and retry states. Setup disables start only when normalized configuration cannot be produced. Playing exposes paused and fatal-invariant states. Optional media failure does not create an empty game state.

## 11. Form and Validation Model

Settings are local client inputs validated at the DOM boundary and normalized again by the application contract. There is no backend validation. Invalid user-controlled values are constrained with visible feedback; invalid project-owned content blocks start rather than silently inventing defaults.

## 12. Responsive and Layout Rules

The MVP targets desktop viewports with a minimum supported layout recorded during application bootstrap. DOM controls wrap without overlapping the canvas. Device-pixel ratio is capped by measured performance policy. Mobile touch and safe-area support remain non-goals until explicitly promoted.

## 13. Observability and Analytics

Remote analytics, session replay, advertising, and automatic error upload are excluded. Development builds may expose local frame, fixed-tick backlog, AI decision, collision, and state-hash diagnostics. Fatal errors may show copyable non-secret reproduction metadata without uploading it. Completed rounds may copy a local versioned playtest record with seed, normalized settings, result, and state hash; this is a user-triggered clipboard write, not analytics or persistence.

## 14. Test Strategy

Vitest covers pure state, input edges, loadout normalization, starting effects, compact hand reach, credited elimination, bounded stat spending, settings tiers, collapse phases, result sealing, and presentation boundaries. Playwright covers setup, debug tuning copy/apply, countdown, movement and hand shove, deterministic human defeat and restart, audio fallback, reduced motion, fatal recovery, and WebGL restoration. Visual review still must check the denser loadout cards, hand marker, stat availability, human identity, and item/mass readability.

## 15. Implementation Sequence

The toolchain, deterministic simulation, gray-box movement and combat, browser scheduler, pausable countdown, keyboard adapter, procedural PixiJS presentation, Easy/Normal/Hard utility bots, selectable Slow/Normal/Fast collapse, readable collapse states, round results, local playtest-record copy, accelerated defeat resolution, restart, spatial broad phase, four 8/16/24/32 setup presets, local 16/24/32 profiles, production-artifact smoke, three procedural item markers, effect HUD, bounded edge-weighted item settings, presentation-event deduplication, optional procedural audio, reduced-motion effects, and renderer recovery are implemented. Final art remains gated on an approved visual direction and user-provided or approved assets.

## 16. Open Questions and Decisions Log

Open decisions include typography, hosting provider, exact supported viewport and browser matrix, and whether post-submission generated images are required. The contest-submission visual direction (Coal-Twilight) and palette are adopted and do not require external raster assets. Procedural oscillator cues are the current optional audio baseline; recorded audio assets are not required. When visual assets become necessary beyond the procedural baseline, the implementation owner must give the repository owner a complete generation prompt instead of invoking a metered image-generation tool. Aesthetic frontend work should use the user-designated Umans GLM 5.2 path when available; if unavailable, prepare a self-contained handoff prompt for the user.

## Technology Reference

The toolchain, version tracks, formatter boundary, adoption constraints, and rollback policy are owned by [../engineering/08-toolchain-baseline.md](../engineering/08-toolchain-baseline.md). This document owns frontend responsibility and interaction boundaries, not package version duplication.
