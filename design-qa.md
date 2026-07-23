# Design QA

## Scope

- Request: replace the always-visible setup/arena layout with a simple menu, open settings only on demand, reveal the arena only after starting, reduce the title scale, enlarge supporting text, and use a player-follow camera over a larger island.
- Reference screenshots:
  - `C:/Users/cherr/AppData/Local/Temp/codex-clipboard-f6d8fbaf-1f78-4d99-84ac-36ab61f0dc60.png`
  - `C:/Users/cherr/AppData/Local/Temp/codex-clipboard-aaa7ab56-1314-40f8-b05a-4912e5c8ea75.png`
- Rendered evidence:
  - `.cache/design-qa/menu-1440x900.png`
  - `.cache/design-qa/arena-live-1440x900.png`
- Target: deployed GitHub Pages build at `https://0disoft.github.io/shovefall/`
- Viewport: desktop Chrome, 1440 x 900 CSS pixels at DPR 1.

## Full-view comparison

- The reference exposed the configuration form and arena before play and gave the title most of the first viewport.
- The rendered menu exposes only the reduced title, fullscreen guidance, `게임 시작`, and `설정`.
- Supporting menu text and controls are larger and remain readable without competing with the title.
- The arena is absent from the initial DOM presentation and becomes visible only after `게임 시작`.

## Focused interaction evidence

- In-app Browser DOM inspection confirmed the initial menu contains one `게임 시작` button and one `설정` button, with no visible arena canvas.
- Starting the game switches to the arena landmark and exposes the Pixi canvas, HUD, controls, restart, and menu return actions.
- The 16-player preset creates a 25 x 20 tile world while the desktop camera targets roughly 18 x 11 tiles, so the whole coastline cannot fit in one frame.
- The renderer follows the local player and clamps the camera to the world plus ocean margin; browser smoke coverage checks that movement changes the camera frame.
- The saved settings object is the only source used by `게임 시작`; opening and cancelling settings restores the saved values instead of leaking a draft.

## Findings and iteration history

1. P1: title dominated the page and setup/arena competed for attention. Fixed by reducing the title to a 2.3rem maximum and introducing menu/settings/arena screen states.
2. P1: the old arena fit the full island in one viewport. Fixed by enlarging every participant tier and adding a bounded player-follow camera.
3. P2: cancelling settings could leave draft values visible. Fixed by hydrating the form and debug tuning from the saved settings snapshot on open/cancel.
4. P2: a saved-settings summary made the menu busier than requested. Removed.
5. P2: the centered menu could become too tall on short screens. Bounded with `min(420px, 58dvh)` and responsive spacing.
6. P3: final island art is intentionally still procedural gray-box artwork. Asset generation remains a separate visual-polish pass and does not block the requested navigation or camera behavior.

No P0, P1, or P2 findings remain for this request. A network response audit reproduced no HTTP 4xx/5xx resources, and the deployed production smoke suite passed.

final result: passed
