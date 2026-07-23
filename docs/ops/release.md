# Static Release Procedure

- Status: GitHub Pages deployment and public Chrome smoke verified
- Primary owner: Repository owner
- Current product version: `0.28.0`
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

Product `0.28.0` adds human Brick Bag activation, deterministic same-tick placement priority, static-wall body and attack blocking, collapse-driven wall removal, and depth-sorted procedural wall presentation. Simulation advances to `11.0.0`; content, replay, and report schemas stay unchanged. Local unit coverage is current; merge checks, production smoke, fixed-50 profiles, and exact-SHA hosted evidence must be refreshed before promotion.

The current local tree passes merge-blocking checks, the production Chrome smoke suite, the 7,200-tick fixed-50 headless scale profile, and the fixed-50 production Chrome profile. Active-item bot balance and human playtest remain pending. Hosted evidence starts only after the exact commit is pushed and the Pages workflow succeeds.

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
3. Verify `기록 복사` succeeds in the secure context and denial still leaves visible manual data.
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
