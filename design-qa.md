# Design QA

## Historical menu, camera, and projection QA

### Scope

- Request: replace the always-visible setup/arena layout with a simple menu, open settings only on demand, reveal the arena only after starting, reduce the title scale, enlarge supporting text, use a player-follow camera over a larger island, and add a concise version-history branch.
- Reference screenshots:
  - `C:/Users/cherr/AppData/Local/Temp/codex-clipboard-f6d8fbaf-1f78-4d99-84ac-36ab61f0dc60.png`
  - `C:/Users/cherr/AppData/Local/Temp/codex-clipboard-aaa7ab56-1314-40f8-b05a-4912e5c8ea75.png`
- Rendered evidence:
  - `.cache/design-qa/menu-1440x900.png`
  - `.cache/design-qa/arena-live-1440x900.png`
  - `.cache/design-qa/arena-58deg-local-1440x900.png`
- Target: deployed GitHub Pages build at `https://0disoft.github.io/shovefall/`
- Viewport: desktop Chrome, 1440 x 900 CSS pixels at DPR 1.

### Full-view comparison

- The reference exposed the configuration form and arena before play and gave the title most of the first viewport.
- The rendered menu exposes only the reduced title, fullscreen guidance, `게임 시작`, `설정`, and `버전 기록`.
- Supporting menu text and controls are larger and remain readable without competing with the title.
- The arena is absent from the initial DOM presentation and becomes visible only after `게임 시작`.

### Focused interaction evidence

- Browser smoke inspection confirmed the initial menu contains one each of `게임 시작`, `설정`, and `버전 기록`, with no visible arena canvas.
- Starting the game switches to the arena landmark and exposes the Pixi canvas, HUD, controls, restart, and menu return actions.
- The 16-player preset creates a 25 x 20 tile world while the desktop camera targets roughly 18 x 11 tiles, so the whole coastline cannot fit in one frame.
- The renderer follows the local player and clamps the camera to the world plus ocean margin; browser smoke coverage checks that movement changes the camera frame.
- The saved settings object is the only source used by `게임 시작`; opening and cancelling settings restores the saved values instead of leaking a draft.

### Findings and iteration history

1. P1: title dominated the page and setup/arena competed for attention. Fixed by reducing the title to a 2.3rem maximum and introducing menu/settings/arena screen states.
2. P1: the old arena fit the full island in one viewport. Fixed by enlarging every participant tier and adding a bounded player-follow camera.
3. P2: cancelling settings could leave draft values visible. Fixed by hydrating the form and debug tuning from the saved settings snapshot on open/cancel.
4. P2: a saved-settings summary made the menu busier than requested. Removed.
5. P2: the centered menu could become too tall on short screens. Bounded with `min(420px, 58dvh)` and responsive spacing.
6. P3: final island art is intentionally still procedural gray-box artwork. Asset generation remains a separate visual-polish pass and does not block the requested navigation or camera behavior.

### Version-history review

- Product `0.25.0` adds a third menu action without weakening the visual priority of `게임 시작`; `설정` and `버전 기록` remain equal secondary actions.
- The history is a separate DOM screen rather than an overlay, so long text uses normal page scrolling and never traps the arena or menu beneath a modal.
- Six newest-first cards use the Gemini 3.6 Flash copy structure: a short title, `왜 바꿨냐면`, and `이렇게 바뀌었어`. Exact technical claims were shortened to player-visible outcomes.
- The current entry receives the only accent rail. Remaining entries share neutral surfaces, keeping the list readable without turning every version into a competing callout.
- `메뉴로` and `Escape` both restore focus to `버전 기록`; the skip link retargets to the screen heading, and the pre-game canvas remains hidden.

### 58-degree projection review

- Product `0.24.0` uses the GLM-recommended 58-degree camera elevation, verified at runtime through `data-projection-angle="58"` and `data-projection-scale-y="0.8480"`.
- At 1440 x 900, the rendered 16-player arena uses a 1388 x 688 canvas and a bounded 6–14-pixel cliff front. The whole island remains outside one camera frame.
- Simulation, support, collision, AI, and replay coordinates remain top-down; only presentation points, vectors, camera bounds, and draw ordering are projected.
- Characters and items remain upright. Their short angle-derived shadows, projected action lines, participant depth ordering, tile-top highlights, and unsupported southern cliff fronts provide depth without hiding shove timing or shoreline support.
- The chosen 58 degrees compresses depth by about 15.2%, making the terrain angle visible while retaining more shove and shoreline readability than the lower 55-degree edge of the reviewed range.

No P0, P1, or P2 findings remained for that request. A network response audit reproduced no HTTP 4xx/5xx resources, and the deployed production smoke suite passed.

Historical result: passed.

## 0.40.0 arena and HUD QA

- Reference: `C:\Users\cherr\AppData\Local\Temp\codex-clipboard-d120f65d-c5f8-4719-9df9-fae8915f2db1.png`
- Target viewport/state: desktop active arena, upper combat and stat HUD visible.
- Implementation evidence: production WebGL smoke passed all 13 browser paths; the run does not persist a same-state screenshot.

## Review

- P0: none found by automated boot, input, restart, and renderer recovery checks.
- P1: the right HUD now uses four translucent cells and reports effective percentage bonuses instead of levels or pending points.
- P1: the arena background uses the terrain atlas water texture rather than the renderer clear color.
- P1: terrain sprites crop rectangular surface interiors; procedural geometry alone draws exposed southern cliffs.
- P1: generated trees render in world-depth order and keep a procedural load-failure fallback.
- P2: final tree scale, ocean repetition, coast seams, and HUD translucency still require a same-state human screenshot comparison.

Final result: blocked — no persisted post-change screenshot exists for the required side-by-side visual comparison.

## 0.41.0 terrain, audio, and scoreboard QA

- References: `C:\Users\cherr\AppData\Local\Temp\codex-clipboard-69334221-9e81-4d22-9eb4-16546895f2a2.png` and the requested menu scoreboard flow.
- Target viewport/state: desktop active arena plus menu-level local history.
- Implemented review fixes: one stretched ocean surface replaces the visibly repeating ocean grid; gapless terrain crops and deterministic unsupported-shore fallbacks replace exposed dark squares; generated coasts no longer receive duplicate procedural black cliff bars; all procedural audio cues use 70% of their prior gain.
- Scoreboard review: `설정` is followed by `점수표`; empty, populated, Escape, and return-focus states use semantic DOM outside the canvas. Completed-round entries expose rank first, then score, eliminations, survival time, and participant count. Storage is browser-local, bounded to fifty, and failure-safe.
- Automated evidence: the complete non-browser check passed 202 tests, and the production artifact passed all 13 Playwright browser paths including the empty-scoreboard menu and focus flow.

Final result: blocked — source implementation is complete, but a same-state post-change terrain screenshot and populated-scoreboard browser capture have not yet been retained.

## 0.71.1 coast-autotile QA

### Evidence

- Source visual truth: `C:\Users\cherr\AppData\Local\Temp\codex-clipboard-19fa798a-6589-48c3-8a32-fc2288012e94.png`.
- Implementation: `.cache/design-qa/coast-autotile-0.71.1-final.png`.
- Combined comparison: `.cache/design-qa/coast-autotile-comparison.png`.
- Source pixels: 992 × 528. Implementation pixels and CSS viewport: 1280 × 720 at DPR 1.
- Comparison normalization: each image was aspect-fit into a 960 × 540 slot without stretching. The seed and combat state differ, so the comparison judges repeated shoreline junctions rather than island layout.

### Full-view comparison

- The source shows unsupported three-sided and opposite-edge cells borrowing a one-edge coast frame, leaving abrupt rectangular water arms and disconnected foam at narrow lake and coast junctions.
- The implementation keeps the accepted terrain art and viewport-wide ocean, restores three interior grass variants, and maps every visible tile through its actual north/east/south/west water mask.
- Sand and foam now continue around corners, narrow channels, and multi-edge remnants without a false shore opening on a supported side.

### Focused boundary comparison

- The source lake's lower stem and side arms expose hard frame substitutions. In the implementation, the lower-center channel and lower-right coast retain one continuous sand/foam boundary through turns and opposing shores.
- Exact one-edge and corner masks reuse the atlas's authored frames. Only the five shapes missing from the atlas are composed from its four cardinal cutouts.

### Required fidelity surfaces

- Fonts and typography: unchanged; HUD hierarchy and optical weights do not drift from the existing arena.
- Spacing and layout rhythm: unchanged; canvas, HUD placement, camera, and tile extent remain stable.
- Colors and visual tokens: unchanged atlas grass, sand, foam, and ocean colors; no synthetic replacement palette was introduced.
- Image quality and asset fidelity: authored corners remain intact, missing masks are composited at 256 × 192 before GPU scaling, and the existing 5.5% sprite overscan remains bounded.
- Copy and content: unchanged except the new `0.71.1` version-history entry.

### Iteration history

1. P1: unsupported masks selected unrelated single-edge frames. Fixed by deriving a four-bit adjacency mask and preparing all sixteen textures.
2. P2: the first compositor replaced authored corner art and repeated one grass frame across the island. Fixed by retaining the four authored corner frames and restoring two additional interior variants.
3. Post-fix evidence: the final browser capture shows continuous boundary ownership without false water direction; no P0, P1, or P2 finding remains for this request.

### Follow-up polish

- P3: the simulation remains a square-cell island, so the macro shoreline silhouette is intentionally stepped. Removing that grid character would require a separate topology or mesh redesign rather than another frame-selection patch.

Primary interactions tested: saved setup, game start, active WebGL arena, generated terrain load, live combat HUD. Console-error inspection is covered by the repository smoke suite, but that suite exceeded its 240-second command budget during this pass.

final result: passed

## 0.85.0 trait allocation and reward comparison QA

### Scope

- Reference: `C:\Users\cherr\AppData\Local\Temp\codex-clipboard-037a82b7-3643-414a-bab0-2249c49322c4.png`.
- Requested change: remove repeated prose from pre-round trait cards, make the twelve derived combat values more visual, and show exact colored stat changes in the kill-reward dialog.

### Implemented hierarchy

- The six pre-round cards retain only trait name, allocated point count, vertical controls, and one allocation meter.
- The twelve derived combat-value cards retain exact text and receive a source-trait meter; color is supplementary rather than the only value signal.
- The six kill-reward cards render each affected value as `current → after`, color the after value, and overlay owned-rank and pending-rank fills in one meter.
- Desktop keeps the two-column setup grid and three-column reward grid. Existing 820 px and 480 px breakpoints reduce columns without changing keyboard-native radio and button controls.

### Automated evidence

- The configured browser path verifies six compact setup cards, twelve combat-value meters, six reward comparison groups, six reward meters, no setup-card `<small>` prose, keyboard selection, a reachable save action, narrow-width overflow containment, and the exact Stability `0% → +12%` / `0% → -5%` changes.
- The aggregate check passes format, lint, TypeScript, architecture, 255 tests, documentation validation, and production build.

### Remaining visual evidence

- P2: no persisted same-state post-change screenshot was produced. The in-app browser could not reach the short-lived configured preview even though the repository Playwright browser path passed twice.
- A manual screenshot comparison at the user's running `localhost:5173` remains useful for spacing and meter contrast, but does not block the verified DOM, keyboard, responsive, or calculation contracts.

final result: blocked

## 0.92.0 two-column loadout QA

### Scope

- Reference: `C:\Users\cherr\AppData\Local\Temp\codex-clipboard-74efce06-e29e-41c9-985d-e1ca59648610.png`.
- Requested change: retire Tidal Charge, remove its contradictory reward copy, and present skills and items as two cards per desktop row without large artificial empty areas.

### Implemented hierarchy

- The active skill catalog contains seven definitions; Tidal Charge is absent from setup, AI, simulation, effects, and statistics.
- Skill and item fieldsets both use two equal desktop columns and one narrow-screen column.
- Cards retain shared title, metadata, artwork, and effect tracks but no longer enforce a fixed minimum height. Longer descriptions grow only their own cards.
- Retired Tidal Charge PNGs remain provenance-only and are not bundled into the production runtime.

### Automated evidence

- The focused Playwright settings path verifies seven skill cards, no Tidal Charge card, two computed desktop columns for both catalogs, aligned internal card tracks, and seven loaded skill-effect assets.
- The aggregate check passes format, lint, TypeScript, architecture, 262 tests, documentation validation, and production build without bundling either retired Tidal Charge image.

### Remaining visual evidence

- P2: no persisted same-state screenshot was produced from the short-lived configured preview. The DOM geometry and runtime asset boundary are verified, while final optical spacing still benefits from the user's live `localhost:5173` review.

final result: passed with screenshot follow-up
