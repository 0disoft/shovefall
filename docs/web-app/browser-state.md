# Browser State

- Status: Accepted gray-box lifecycle
- Repository Type: web-app
- Owner: Repository owner

## Ownership

The browser application has one in-memory screen state: `setup` or `arena`. The DOM owns draft settings and focus. `GameSession` owns whether a round is active or paused, the fixed-step accumulator, current world and bot-director references, last emitted render frame, generated local seed, and animation-frame handle. `InputState` owns held gameplay keys and unconsumed action edges. `BotDirector` owns bounded perception history and bot intent memory. The simulation owns all authoritative participant and tile state. PixiJS owns no game state.

There is no server state, durable URL state, cookie, local storage, IndexedDB, service worker, or cross-tab coordination in the MVP gray-box.

## Lifecycle

1. Boot initializes the renderer and draws a deterministic setup preview.
2. Quick Start normalizes settings, derives arena dimensions, creates a fresh seed and world, reveals telemetry, and focuses the labeled arena region.
3. `requestAnimationFrame` supplies browser time to an accumulator. Whole 60 Hz steps consume one human command and one command per active bot. The bot director reads the last immutable frame, and the step result becomes the next AI and presentation frame without duplicate world hashing. Rendering interpolates that frame and never supplies delta time to rules.
4. No more than eight simulation steps run in one render callback. Remaining elapsed work stays as visible backlog rather than being discarded.
5. Window blur or hidden visibility clears held keys and pauses the accumulator. Visible focus resumes from a fresh timestamp so hidden time is not simulated as a burst.
6. Restart cancels the previous animation frame and creates a fresh seed and world. Settings return stops and releases the current world, restores the preview, and returns focus to Quick Start.
7. Page hide destroys the session, input listeners, and PixiJS application.

## Input Contract

`WASD`, `Space`, and left or right `Shift` are intercepted only while a non-paused round is active and focus is not owned by an input, textarea, select, button, link, or editable element. Movement remains held state. Shove and dodge are edge queues consumed at most once. Repeated keydown does not create repeated action edges. Blur, visibility loss, stop, restart, and destroy clear every held key and queued edge.

## Diagnostics and Privacy

The local HUD exposes tick, human action, mass category, position, seed, state hash, and catch-up backlog. These values stay in the page and are not uploaded. Errors use the DOM boundary and console without including credentials or private user data; the MVP has no such runtime values.

## Pending States

The complete round slice still must add countdown, victory, human defeat, accelerated bot resolution, result, restart-after-result, and fatal-invariant recovery tests. Bot weights and personality readability remain unapproved until external gray-box observation.
