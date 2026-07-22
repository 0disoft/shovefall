# Frontend Design

- Status: Playable gray-box boundary implemented; visual direction pending

## 0. Decision Summary

Shovefall uses one static browser application. PixiJS 8 with WebGL owns the game world. Semantic HTML, DOM, and CSS own setup, settings, results, fatal errors, focus, and accessibility text. TypeScript 7, Vite 8, Bun, Oxlint, and Oxfmt form the accepted toolchain baseline.

React, Vue, Svelte, Phaser, Tailwind CSS, a general state manager, and a general-purpose physics engine are not part of the initial baseline. The visual style, final palette, typography, generated image inventory, and animation polish remain undecided and must not be invented by implementation code.

## 1. Product Surface and Scope

The primary surface is a short desktop-browser single-player game reached through a public HTTPS link. The default entry point must reach quick start without installation, account creation, or a network service. Mobile touch, online multiplayer, authentication, a backend, a database, runtime LLM calls, and remote analytics are outside the MVP.

## 2. User Flow Map

The minimum user flow is load, setup, quick start, countdown, play, elimination or victory, and immediate restart. Optional settings branch from setup and return to countdown. Required initialization failure enters a DOM fatal-error state with a retry path. There are no application permission or authentication flows.

## 3. Routing Contract

The MVP is a single-page static application with one document route. URL parameters, query-driven game state, hash routing, redirects, and shareable configuration are not part of the initial contract. Static hosting must support both root and configured base-path builds without application routing.

## 4. Page and Layout Model

The DOM shell owns setup, settings, HUD overlays outside the game world, results, errors, and accessibility text. The PixiJS canvas owns arena tiles, participants, items, world effects, and camera transforms. The game preserves a fixed logical world aspect and may letterbox rather than distort simulation coordinates.

## 5. State Ownership Model

The pure simulation owns round state. The application layer owns the fixed-step accumulator, screen and round lifecycle, generated local seed, pause/resume, and command delivery. The DOM shell owns draft settings, focus, textual telemetry, restart, and settings return. PixiJS owns presentation objects derived from read-only render state. There is no server state or durable URL state. Presentation layers cannot mutate simulation entities directly.

## 6. Data Fetching and Cache Policy

Application data fetching and cache invalidation are `NOT_APPLICABLE`. Required static assets load from the same origin. Optional image or audio failure may fall back to procedural visuals or silence; required renderer or content-contract failure blocks round start with a recoverable error screen.

## 7. Component Boundary Model

The application composes simulation, AI, presentation, platform adapters, and content. Simulation remains pure TypeScript and cannot import PixiJS, DOM, browser clocks, or ambient randomness. AI emits the same participant command shape as human input. PixiJS and DOM consume read-only state and events. Generic `shared`, `utils`, and framework-shaped layer hierarchies are not created without a concrete owner.

## 8. Design Token Contract

Semantic tokens must distinguish canvas background, stable tile, warning tile, void, human participant, bot participants, focus, cooldown readiness, mass state, success, danger, and disabled controls. The bootstrap uses a neutral gray-box palette with a blue focus and human marker only to make the shell testable. These values are not the final visual direction. Color cannot be the only signal for collapse warning, player identity, or action readiness.

## 9. Interaction and Accessibility Contract

The initial input contract is `WASD` movement, `Space` shove, and `Shift` dodge. Key edges become `ActorCommandV1` actions and held movement is sampled once per fixed tick. Setup and settings remain fully keyboard operable through DOM controls with visible focus. Gameplay keys are ignored when an input, link, or button owns focus so Space can still activate controls. Window blur and document visibility loss clear held input and pause the scheduler. Reduced-motion mode removes nonessential camera shake and large flashes without changing simulation timing or hit windows.

## 10. Loading, Empty, Error, and Disabled States

Boot has loading, ready, unsupported-renderer, required-content-error, and retry states. Setup disables start only when normalized configuration cannot be produced. Playing exposes paused and fatal-invariant states. Optional media failure does not create an empty game state.

## 11. Form and Validation Model

Settings are local client inputs validated at the DOM boundary and normalized again by the application contract. There is no backend validation. Invalid user-controlled values are constrained with visible feedback; invalid project-owned content blocks start rather than silently inventing defaults.

## 12. Responsive and Layout Rules

The MVP targets desktop viewports with a minimum supported layout recorded during application bootstrap. DOM controls wrap without overlapping the canvas. Device-pixel ratio is capped by measured performance policy. Mobile touch and safe-area support remain non-goals until explicitly promoted.

## 13. Observability and Analytics

Remote analytics, session replay, advertising, and automatic error upload are excluded. Development builds may expose local frame, fixed-tick backlog, AI decision, collision, and state-hash diagnostics. Fatal errors may show copyable non-secret reproduction metadata without uploading it.

## 14. Test Strategy

Vitest covers pure state, input edges, settings tiers, collapse phases, result sealing, presentation-event deduplication, optional-audio fallback, mute state, and voice limits. Playwright Test covers setup, fixed-tick progress, keyboard movement and shove, sound controls, active-round pause/resume, focus entry, settings return, collapse completion, result focus, fresh-world restart, deterministic human defeat, reduced motion, fatal recovery, and WebGL context loss and restoration. Visual review still must check telegraph, human identity, mass, item, and transient-effect readability. Oxfmt and Oxlint do not replace product interaction testing.

## 15. Implementation Sequence

The toolchain, deterministic simulation, gray-box movement and combat, browser scheduler, keyboard adapter, procedural PixiJS presentation, utility bots, readable collapse states, round results, accelerated defeat resolution, restart, spatial broad phase, local 12/24/32 profiles, three procedural item markers, effect HUD, bounded item settings, presentation-event deduplication, optional procedural audio, reduced-motion effects, and renderer recovery are implemented. Final art remains gated on an approved visual direction and user-provided or approved assets.

## 16. Open Questions and Decisions Log

Open decisions include the final visual direction, palette, typography, image asset inventory, hosting provider, exact supported viewport and browser matrix, and whether generated images are required. Procedural oscillator cues are the current optional audio baseline; recorded audio assets are not required. When visual assets become necessary, the implementation owner must give the repository owner a complete generation prompt instead of invoking a metered image-generation tool. Aesthetic frontend work should use the user-designated Umans GLM 5.2 path when available; if unavailable, prepare a self-contained handoff prompt for the user.

## Technology Reference

The toolchain, version tracks, formatter boundary, adoption constraints, and rollback policy are owned by [../engineering/08-toolchain-baseline.md](../engineering/08-toolchain-baseline.md). This document owns frontend responsibility and interaction boundaries, not package version duplication.
