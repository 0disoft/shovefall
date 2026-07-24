# Static Release Procedure

- Status: `0.34.0` exact-SHA CI, Pages, public functional proof, and deterministic audits accepted; browser performance and human evidence pending
- Primary owner: Repository owner
- Current product version: `0.34.0`
- Validation source: [../../VALIDATION.md](../../VALIDATION.md)
- Submission package: [../product/05-submission-package.md](../product/05-submission-package.md)
- Asset ledger: [../assets/README.md](../assets/README.md)

Product `0.20.0`, simulation `6.0.0`, and content `4.0.0` introduce starting loadouts, larger arenas, hand-reach shove physics, credited-elimination stat growth, and local debug tuning. Local unit, browser, focused strategy, headless scale, and production Chrome profiles pass. The legacy full controlled round audit timed out twice and hosted proof for this exact candidate remains pending; older hosted SHA evidence does not prove these rules.

Product `0.21.0` renames the public game to `바닥이 사라지는 술래잡기`, removes decorative masthead and section copy, and adds arrow-key, mouse-drag, virtual-joystick, and standard-gamepad input adapters without changing simulation `6.0.0` or content `4.0.0`. The collapsed `data-development-only` telemetry panel is a release blocker: remove it or gate it behind `import.meta.env.DEV` before the contest candidate is captured.

Product `0.22.0` and simulation `7.0.0` add seeded connected island coastlines, enclosed lakes, larger preset bounds, shoreline-aware bots and items, and a connected 20% collapse floor. Content remains `4.0.0`. Replay fixtures must be regenerated and the round, scale, browser, and hosted checks refreshed for the exact candidate SHA; evidence from the rectangular `0.21.0` map does not transfer.

Product `0.23.0` and simulation `8.0.0` split the entry flow into menu, saved settings, and gameplay screens; remove the setup-map preview; add a player-follow camera; and expand the 8/16/24/32 bounds to `22×17`, `25×20`, `28×23`, and `31×26`. Coast seeds vary shape while preserving a fixed pre-lake land budget, so every larger preset has strictly more playable land even when its seed differs. Content remains `4.0.0`.

Product `0.24.0` changes only PixiJS presentation: the local camera now renders a fixed 58-degree elevation with projected tile depth, bounded southern cliff fronts, upright participant shadows, projected action vectors, and Y-depth ordering. Simulation stays `8.0.0`, content stays `4.0.0`, and replay hashes are unchanged apart from the recorded product envelope. Exact-SHA Chrome smoke and hosted Pages evidence must be refreshed before this visual candidate replaces `0.23.0`.

Product `0.25.0` adds a no-network version-history screen to the main menu. Six concise records explain why the `0.20.0`–`0.25.0` milestones happened and what changed, while `Escape`, `메뉴로`, skip-link routing, and launcher-focus restoration preserve the existing keyboard contract. Simulation stays `8.0.0`, content stays `4.0.0`, and replay hashes remain unchanged apart from the product-version envelope. Exact-SHA Chrome smoke and hosted Pages evidence must be refreshed before this candidate replaces `0.24.0`.

Product `0.26.0` fixes public play at 50 participants and Hard AI, replaces categorical mass with a 50–100 starting-weight slider, expands the island to `44×36`, and attempts five bounded lakes. Simulation advances to `9.0.0`, content to `5.0.0`, and local playtest reports to v4. The local production artifact passes all eight Chrome smoke paths; the fixed-seed 50-participant browser profile reports p95 `16.8 ms`, zero backlog, and a `2,848,504`-byte forced-GC heap delta after 20 restarts. Hosted exact-SHA Pages and public-URL smoke remain pending for this candidate.

Product `0.27.0` adds human Wind Blast activation, Q/E and gamepad/DOM slot bridges, launch-speed swept contact, strength-based elimination credit, and replay format v2 with required human mass/loadout setup. Simulation advances to `10.0.0`; content stays `5.0.0`; report schema stays v4. Local merge checks, eight production smoke paths, the fixed-50 headless profile, and the fixed-50 Chrome profile pass. Hosted CI, Pages, and public-URL evidence must still be refreshed at the final `0.27.0` SHA before promotion.

Product `0.28.0` adds human Brick Bag activation, deterministic same-tick placement priority, static-wall body and attack blocking, collapse-driven wall removal, and depth-sorted procedural wall presentation. Simulation advances to `11.0.0`; content, replay, and report schemas stay unchanged. Local merge checks and eight production smoke paths pass. Wall-active fixed-50 profiles pass at headless simulation p95 `2.525 ms` and local Chrome frame p95 `18.5 ms` with zero backlog. GitHub Actions run `30022962614` validated and deployed implementation SHA `19b35261e3516b5cec572952c5228ccf2a856e28`; a fresh public Chrome session confirmed `v0.28.0`, the Brick Bag setting, WebGL canvas initialization, and a running 50-participant arena without warning or error logs.

Product `0.29.0` adds human Boat activation, an exact 300-tick effect, bounded support across in-arena Void tiles, procedural hull and activation feedback, remaining-duration HUD, and the sixth offered loadout card. Simulation advances to `12.0.0`, content to `6.0.0`; replay v2 and report v4 remain sufficient. Merge checks pass with 139 tests, and all eight production-artifact Chrome smoke paths pass. Brick-plus-Boat fixed-50 profiles pass at headless simulation p95 `4.351 ms` and local Chrome frame p95 `18.5 ms` with zero backlog. GitHub Actions run `30025468513` validated and deployed exact implementation SHA `d32e66711d87db21fc0b2d4adf1261d2cd52d9e0`; a fresh public session confirmed `v0.29.0` and the Boat setting at `https://0disoft.github.io/shovefall/`.

Product `0.30.0` adds human Bomb placement, two charges, a visible exact 300-tick fuse, deterministic three-tile radial falloff, owner vulnerability, same-tick Dodge, flood and owner-death persistence, canonical hashed Bomb state, procedural warning/detonation feedback, and the seventh offered loadout card. Simulation advances to `13.0.0`, content to `7.0.0`; replay v2 and report v4 remain sufficient. The local suite passes 146 tests. Brick-plus-two-Bomb fixed-50 headless simulation passes at p95 `4.867 ms`; the local Chrome profile completes a visible fuse and detonation at frame p95 `18.5 ms` with zero backlog. [CI run 30030306125](https://github.com/0disoft/shovefall/actions/runs/30030306125) validated and deployed exact SHA `9b82be027846192464aff861ec7e7dd86e86cd19`; a fresh public session confirmed `v0.30.0`, the Bomb card, and no console warnings or errors.

Product `0.31.0` adds human Soap placement, three charges, deterministic actor-ID occupancy, one-use post-contact triggering, bounded `0.105..0.42` slip speed, 24-tick Stumbling, owner vulnerability, external-credit preservation on self-trigger, Void removal, canonical hashed Soap state, procedural grooves/bubbles, and the eighth offered loadout card. Simulation advances to `14.0.0`, content to `8.0.0`; replay v2 and report v4 remain sufficient. The local suite passes 160 tests and all twelve production-artifact Chrome paths. The fixed-50 Brick/two-Bomb/Soap profile passes at simulation p95 `6.265 ms`, zero 100 ms steps, and `2.35×` real time while observing three Soap patches and five triggers. The current-renderer production-Chrome rerun passes at frame p95 `18.4 ms`, maximum `18.8 ms`, zero backlog, and zero frames above 100 ms after one retained host-contended failure; Soap's live presentation is covered by the production-safe smoke rather than a dedicated frame window. [CI run 30033824900](https://github.com/0disoft/shovefall/actions/runs/30033824900) validated, uploaded, and deployed exact implementation SHA `50ec3c1a6c6e3d2dfb46987b5ab55f6a67f7666e`. A fresh public browser session confirmed `v0.31.0`, the Soap card, a running 50-participant WebGL arena, and no browser log entries.

Product `0.32.0` adds the human-only static-anchor Grappling Hook as the ninth offered loadout card with two charges, 4.5-tile range, 1.25-tile minimum, deterministic tile/Brick acquisition, mass-sensitive `0.24 / massFactor` self-pull capped at `0.30`, and 12-tick `GrapplePull` drag. Simulation advances to `15.0.0`, content to `9.0.0`; replay v2 and report v4 remain sufficient. The local suite passes 169 tests and all thirteen production-artifact Chrome paths. Its fixed-50 headless profile exercises both Hook charges and passes at simulation p95 `5.123 ms`, zero 100 ms steps, and `3.69×` real time. The latest production-Chrome performance sample is rejected because total workstation CPU stayed `81.6–94.2%` and both the Brick/Bomb baseline and Hook/Bomb case failed almost identically; its ceiling remains unchanged. [CI run 30038218455](https://github.com/0disoft/shovefall/actions/runs/30038218455) validated, uploaded, and deployed exact implementation SHA `4dc23456673d08ba15228776bdce15e2b768bcd5`. A fresh cache-busted public session confirmed `v0.32.0`, the Hook setting, an active Hard-AI WebGL arena with changing survivor state, and no browser log entries. The `0.31.0` run and SHA above remain exact historical proof.

Product `0.32.1` removes the developer telemetry markup from static public HTML and creates it only in DEV. Production no longer creates or updates tick, rate, position, seed, or state-hash outputs; bounded browser checks use existing scheduler and renderer observability instead. Clipboard failure copy no longer tells players to read removed values. Simulation remains `15.0.0`, content remains `9.0.0`, replay remains v2, and report v4 remains sufficient. Local aggregate validation passes 169 tests, DEV smoke passes fourteen paths, production smoke passes thirteen paths, and the public HTML contract rejects any reintroduced developer output ID. Exact-SHA hosted validation, Pages deployment, and public smoke remain pending for this patch candidate.

Product `0.33.0` and simulation `16.0.0` widen the public island to 48×40, require exactly eight separated 6–10-tile lakes under a 72-tile total budget, and preserve a connected 20% collapse floor. Item placement now selects edge, near-edge, or interior at a topology-independent 3:2:1 ratio before choosing a tile. Content remains `9.0.0`, replay remains v2, and reports remain v4. The local suite passes 170 tests, fourteen DEV Chrome paths, and thirteen production-artifact Chrome paths. The fixed-50 headless profile passes at simulation p95 `6.823 ms`, no 100 ms step, and `1.73×` real time. [CI run 30043768628](https://github.com/0disoft/shovefall/actions/runs/30043768628) validated, uploaded, and deployed exact implementation SHA `732f95f3a777220d0410612a2fb95840a8e7e721`; `Validate` completed in 3 minutes 49 seconds and the dependent Pages job in 10 seconds. A fresh cache-busted public session confirmed `v0.33.0`, the widened-island version record, a running 50-participant WebGL arena, zero developer-panel nodes, and no browser warnings or errors. The full round audit exceeded its configured 300-second limit without a result. A fresh CPU preflight observed `67.6%` average and `96.4%` maximum host CPU, so no `0.33.0` browser-performance claim was attempted.

Product `0.34.0`, simulation `17.0.0`, and content `10.0.0` add protected-core pressure and narrow mass/item extremes while retaining replay v2 and report v4. The local suite passes 173 product tests, thirteen production-artifact Chrome paths, and the sharded production, mass, selectable-item, and collapse-speed audits. [CI run 30055148110](https://github.com/0disoft/shovefall/actions/runs/30055148110) validated, uploaded, and deployed exact runtime SHA `c0ddda93e1d75520909c79888c342f4b57747d7f`; all thirteen hosted production Chrome paths and the dependent Pages deployment succeeded. A fresh cache-busted public session confirmed `v0.34.0`, an active 50-participant Hard-AI WebGL arena, changing tick and survivor state, one canvas, and no browser warnings or errors.

The deployed `0.34.0` runtime is the newest exact-SHA hosted, Pages, and public functional proof. The browser profile now rejects a host above its five-sample CPU qualification before Chrome starts; the first qualified attempt was rejected at `63.5%` average and `87.4%` maximum host CPU. Contest-release promotion still requires a passing host-qualified production-browser profile and human playtest. Active-item bot use and human balance remain pending; deterministic scenario tests prove rules, not human balance.

## Release Types

- `local candidate`: a clean exact SHA with configured local checks and browser evidence.
- `hosted candidate`: the same SHA built by hosted CI and served at a temporary or final HTTPS URL.
- `contest release`: a hosted candidate with human-play, visual, asset, capture, and submission
  evidence complete.

Calling a build a candidate does not publish it. Calling a URL deployed does not prove that it
serves the intended SHA.

## GitHub Pages Target

- Repository: `https://github.com/0disoft/shovefall`
- Public URL: `https://0disoft.github.io/shovefall/`
- Publishing source: GitHub Actions from `.github/workflows/ci.yml`
- Source branch: `main`
- Build output: `dist`
- Base-path contract: relative Vite asset URLs from `base: "./"`; the project site lives under
  `/shovefall/` without a provider-specific rebuild.
- Credential model: no repository secret or long-lived deploy token. The deploy job receives only
  `contents: read`, `pages: write`, and short-lived OIDC `id-token: write` permissions.
- Artifact identity: the `dist` directory tested by `smoke-dist` in the `Validate` job is uploaded
  once and consumed by the dependent `Deploy GitHub Pages` job. The Pages artifact is retained for
  30 days for incident evidence.

## Candidate Freeze

1. Record the full commit SHA, product/simulation/content versions, and intended host.
2. Confirm the child repository is clean and the remote branch resolves to the same SHA.
3. Run configured `shovefall_check`, `shovefall_smoke_dist`, `shovefall_audit_rounds`,
   `shovefall_profile_scale`, `shovefall_profile_browser`, and
   `ssealed_shovefall_doctor_strict` intents against that SHA.
4. Confirm replay fixtures and evidence documents name the current versions.
5. Freeze game rules and content. A later behavior, content, asset, or build change creates a new
   candidate and invalidates affected evidence.

## External Gates

Before deployment or contest submission, record all of the following:

- GitHub Actions workflow URL and conclusion for the exact candidate SHA.
- Branch-protection or manual-promotion decision; a workflow file alone is not enforcement.
- GitHub Pages deployment URL and environment result for the exact candidate SHA.
- Named device, OS, browser/version, viewport, and critical-journey result.
- Human playtest batch and decision from
  [../product/04-playtest-protocol.md](../product/04-playtest-protocol.md).
- Approved visual direction and every shipped asset row from [../assets/README.md](../assets/README.md).

## Deployment Boundary

Pushes to `main` and manual workflow dispatches run validation before deployment. Pull requests
cannot upload or deploy the Pages artifact. GitHub Pages is the only selected production host; the
workflow does not contain a provider token, package publication, release creation, database action,
or runtime secret. A successful `Validate` job is necessary but insufficient: promotion is complete
only when the dependent `Deploy GitHub Pages` job succeeds and the final HTTPS checks below pass.

The first source push after enabling Pages is the initial deployment. Do not call the public link
ready until its workflow run, `github-pages` environment deployment, URL content, and critical
journey are observed at the same candidate SHA.

## Current Deployment Evidence

On 2026-07-23, [CI #12](https://github.com/0disoft/shovefall/actions/runs/29979359647)
validated and deployed exact commit `7794e9a47f89aefea1f39483680996a5236963ae`. The `Validate`
job completed in 34 seconds, the dependent `Deploy GitHub Pages` job completed in 10 seconds, and
the retained `github-pages` artifact reported digest
`sha256:e3031183663b44eb4285a5499ee4e953dae6ee25e7daa8953fbd438b2a7d27ef`.

The public URL loaded in Chrome with WebGL ready and no captured console log entries. An 8-player,
Easy, Slow round reached active play; a held `D` input changed the reported position from
`2.77, 4.24` to `3.66, 4.24`, and Space produced the visible `Stumbling` action state. This is
deployment and critical-path browser evidence, not human fun, balance, physical-device matrix, or
cross-browser evidence.

## Post-deploy Verification

Against the final HTTPS URL and candidate SHA:

1. Hard refresh and verify the title, setup, and canvas render without console-fatal errors.
2. Run `게임 시작` through countdown, movement, shove, dodge, collapse, result, and restart.
3. Verify `기록 복사` succeeds in the secure context and denial leaves visible failure and retry guidance.
4. Test one 16-participant normal round and one 32-participant Mayhem boot.
5. Confirm optional audio can fail without blocking play.
6. Inspect network activity for unexpected origins, runtime API calls, mixed content, and missing
   assets.
7. Capture the final screenshot/video only after this verification and record their source SHA.

## Stop Conditions

Stop promotion when any required check is missing, stale, pending, or tied to another SHA; when the
Pages deployment is cancelled or superseded; when the public artifact cannot be tied to the
candidate; when a critical journey fails; or when an asset has unknown provenance. Follow
[rollback.md](rollback.md) after a published regression.
