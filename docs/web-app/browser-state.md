# Browser State

## Frame and input ownership

- `GameSession` submits at most one complete Pixi scene for each active browser animation frame.
- Aim, resize, asset-ready, reduced-motion, and spectator-camera setters retain state and coalesce a non-loop redraw instead of rendering synchronously from input handlers.
- Paused play is event-driven, countdown redraws only when its visible number changes, and HUD telemetry is projected at 10 Hz.
- Keyboard and touch-joystick movement may be primed during countdown. Right-click destinations, skill, item, grapple, and target confirmation remain blocked until active play.
- Losing touch pointer capture clears joystick movement. Pointer hover changes a target only while the pointer is over the arena, and screen-to-world conversion rejects coordinates outside the arena bounds.
- Held gamepad aim moves immediately, waits 280 ms, and then repeats no faster than every 120 ms; fixed-step catch-up does not multiply aim movement.

- Status: Accepted gray-box lifecycle
- Repository Type: web-app
- Owner: Repository owner

## Ownership

The browser application has one in-memory screen state: `menu`, `settings`, `scoreboard`, `history`, or `arena`. The DOM owns draft settings and focus. `GameSession` owns whether a round is active or paused, the fixed-step accumulator, current world and bot-director references, last emitted render frame, generated local seed, and animation-frame handle. `InputState` owns held gameplay keys and unconsumed action edges. `BotDirector` owns bounded perception history and bot intent memory. The simulation owns all authoritative participant and tile state. PixiJS owns no game state.

There is no server state, durable URL state, cookie, IndexedDB, service worker, or cross-tab coordination. The only durable browser state is the versioned `shovefall.scoreboard.v1` local-storage list: at most fifty validated completed-round summaries. Storage failure or malformed input produces an empty view and never blocks a round.

## Lifecycle

1. Boot initializes the renderer behind a menu-only first screen without drawing or exposing an arena preview.
2. Settings edits remain draft values until `설정 저장`; `게임 시작` derives arena dimensions from the last saved values, creates a fresh seed and world, reveals the arena and telemetry, and focuses the labeled arena region.
3. `requestAnimationFrame` supplies browser time to an accumulator. Whole 60 Hz steps consume one human command and one command per active bot. The bot director reads the last immutable frame, and the step result becomes the next AI and presentation frame without duplicate world hashing. Rendering interpolates that frame and never supplies delta time to rules.
4. No more than eight simulation steps run in one render callback. Remaining elapsed work stays as visible backlog rather than being discarded.
5. Window blur or hidden visibility clears held keys and pauses the accumulator. Visible focus resumes from a fresh timestamp so hidden time is not simulated as a burst.
6. Irreversible human falling clears combat input, captures human rank and survival tick, and raises simulation rate to six while preserving the same fixed-tick rules. The renderer freezes the current camera and then accepts bounded arrow-key and pointer-drag spectator panning without producing simulation commands. Completion publishes the final frame, writes one bounded local score summary, stops scheduling, announces the result, and offers `맵 보기`; that action closes the result layer, focuses the arena, and keeps the same spectator camera available until restart.
7. Restart cancels the previous animation frame and creates a fresh seed and world. Menu return stops and releases the current world, hides the arena, and returns focus to `게임 시작`.
8. Page hide destroys the session, input listeners, and PixiJS application.

## Input Contract

Arrow keys and `Q/W/E/D` are intercepted only while a non-paused round is active and focus is not owned by an input, textarea, select, button, link, or editable element. After human elimination or completion, arrow keys no longer create participant commands and instead pan the clamped spectator camera while the arena or bare pause-layer backdrop owns focus; repeated keydown provides continuous traversal without stealing arrows from buttons or the scrollable panel. Arena drag grabs the same camera. Completion's `맵 보기` action closes the result layer and focuses the arena, while `P` restores the result. During an active round, `P` is a screen-level manual pause toggle when no kill-reward dialog owns input; `Escape` or the pause layer's `계속` action resumes. Manual pause remains set across blur/focus, visibility, and renderer restoration instead of being confused with those environmental pause reasons. `WASD`, `Space`, `Shift`, and `F` are intentionally unbound. Desktop mouse left-drag has no movement meaning. Right-clicking a supported ground point stores one destination and moves toward it until arrival, replacement by another right-click, direct arrow/gamepad/touch input, pause, elimination, or support loss. The visible virtual joystick and arena touch dragging retain bounded analog vectors through Pointer Events; pointer capture keeps a touch drag coherent and pointer up, cancel, blur, or visibility loss clears it. `Q/W` aim the selected skills, `E` aims the shared Grappling Hook, and `D` aims the charged item. The first connected standard gamepad uses its left stick or D-pad for movement or aim, its first three face buttons for `Q/W/E`, and its first shoulder button for `D`, with an axis dead zone and action-edge detection. Direct gamepad and held-arrow movement override destination travel. Repeated keydown does not create repeated action edges. Blur, visibility loss, stop, restart, and destroy clear every held or analog input and queued edge. During play the app owns a fixed dynamic viewport and disables document scrolling and text selection; the pause and six-choice trait overlays own bounded internal scrolling.

## Diagnostics and Privacy

The match HUD exposes human action, mass category, effects, item count, and standing participant count. The P panel projects elapsed time, standing count or final rank, credited eliminations, remaining playable-land percentage, movement, dealt/taken/blocked damage, slowed time, skill hits and uses, item uses, and shove-hit count from current frames and authoritative events. DEV creates a collapsed `data-development-only` panel for tick, simulation rate, position, seed, and state hash. Production HTML contains none of that panel's markup or outputs, and production bootstrap never creates or updates them. The scheduler keeps only non-visible tick, backlog-tick, simulation-rate, countdown, and round-ID attributes, while the arena host keeps camera X/Y and follow/spectator mode attributes needed by bounded runtime observation and browser regression tests; neither exposes the seed or state hash. The scoreboard stores only play time, rank, participant count, calculated score, credited eliminations, survival seconds, and outcome; it contains no seed, state hash, input history, identifier, or network upload. Errors use the DOM boundary and console without including credentials or private user data.

## Pending States

The session owns a 1.5-second `3→2→1` countdown. It renders the new tick-zero world while closing bot work and all command delivery, including inventory slots. Blur, visibility loss, and renderer loss clear queued input and freeze elapsed countdown time; restart creates a new world and starts the same boundary again. Development smoke covers the diagnostic fatal path, while generated-`dist` smoke covers thirteen production-safe flows and asserts that no developer-panel node exists. Bot active-item use, collapse cadence, and personality readability remain unapproved until explicit implementation and external gray-box observation.
