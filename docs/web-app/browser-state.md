# Browser State

- Status: Accepted gray-box lifecycle
- Repository Type: web-app
- Owner: Repository owner

## Ownership

The browser application has one in-memory screen state: `setup` or `arena`. The DOM owns draft settings and focus. `GameSession` owns whether a round is active or paused, the fixed-step accumulator, current world and bot-director references, last emitted render frame, generated local seed, and animation-frame handle. `InputState` owns held gameplay keys and unconsumed action edges. `BotDirector` owns bounded perception history and bot intent memory. The simulation owns all authoritative participant and tile state. PixiJS owns no game state.

There is no server state, durable URL state, cookie, local storage, IndexedDB, service worker, or cross-tab coordination in the MVP gray-box.

## Lifecycle

1. Boot initializes the renderer behind a menu-only first screen without drawing or exposing an arena preview.
2. Settings edits remain draft values until `설정 저장`; `게임 시작` derives arena dimensions from the last saved values, creates a fresh seed and world, reveals the arena and telemetry, and focuses the labeled arena region.
3. `requestAnimationFrame` supplies browser time to an accumulator. Whole 60 Hz steps consume one human command and one command per active bot. The bot director reads the last immutable frame, and the step result becomes the next AI and presentation frame without duplicate world hashing. Rendering interpolates that frame and never supplies delta time to rules.
4. No more than eight simulation steps run in one render callback. Remaining elapsed work stays as visible backlog rather than being discarded.
5. Window blur or hidden visibility clears held keys and pauses the accumulator. Visible focus resumes from a fresh timestamp so hidden time is not simulated as a burst.
6. Irreversible human falling clears input and raises simulation rate to six while preserving the same fixed-tick rules. Completion publishes the final frame, stops scheduling, announces the result, and focuses Restart.
7. Restart cancels the previous animation frame and creates a fresh seed and world. Menu return stops and releases the current world, hides the arena, and returns focus to `게임 시작`.
8. Page hide destroys the session, input listeners, and PixiJS application.

## Input Contract

`WASD`, arrow keys, `Space`, and left or right `Shift` are intercepted only while a non-paused round is active and focus is not owned by an input, textarea, select, button, link, or editable element. Mouse or touch drag anywhere in the arena and the visible virtual joystick produce bounded analog vectors through Pointer Events; pointer capture keeps a drag coherent and pointer up, cancel, blur, or visibility loss clears it. The first connected standard gamepad uses its left stick or D-pad for movement, first button for shove, and second button for dodge with an axis dead zone and action-edge detection. Pointer movement has priority only while displaced, followed by gamepad and keyboard movement. Shove and dodge are edge queues consumed at most once. Repeated keydown does not create repeated action edges. Blur, visibility loss, stop, restart, and destroy clear every held or analog input and queued edge.

## Diagnostics and Privacy

The match HUD exposes human action, mass category, effects, item count, and standing participant count. Tick, simulation rate, position, seed, and state hash remain in a collapsed `data-development-only` panel during development and must be removed or development-gated before the contest release. These values stay in the page and are not uploaded. Errors use the DOM boundary and console without including credentials or private user data; the MVP has no such runtime values.

## Pending States

The session owns a 1.5-second `3→2→1` countdown. It renders the new tick-zero world while closing bot work and keyboard command delivery. Blur, visibility loss, and renderer loss freeze elapsed countdown time; restart creates a new world and starts the same boundary again. Development smoke covers the diagnostic fatal path, while generated-`dist` smoke covers the six production-safe flows. Bot weights, collapse cadence, and personality readability remain unapproved until external gray-box observation.
