# Static Release Procedure

- Status: `0.69.0` round-statistics candidate; hosted proof pending
- Primary owner: Repository owner
- Current product version: `0.69.0`
- Validation source: [../../VALIDATION.md](../../VALIDATION.md)
- Submission package: [../product/05-submission-package.md](../product/05-submission-package.md)
- Asset ledger: [../assets/README.md](../assets/README.md)

Product `0.67.0`, simulation `39.0.0`, and content `25.0.0` increase the shared Grappling Hook cooldown from 600 to 900 ticks, expose its 15-second base reuse time and live remaining cooldown in the HUD, and move the headless scale harness from 50 to the public 60 participants. Unit and replay checks pass. The first corrected fixed-60 profile fails the unchanged simulation p95 gate at `14.143 ms` against `10 ms`; hosted, browser, and release evidence therefore remain pending.

Product `0.67.1`, simulation `39.0.0`, and content `25.0.0` make native hidden state authoritative over shared button display styles. Completed and fatal panels remove and disable the resumable action, while active manual pause restores it. Simulation, replay, and report schemas are unchanged.

Product `0.67.2`, simulation `39.0.0`, and content `25.0.0` preserve generated and procedural terrain colors through cannon warning and critical phases. Separate amber exclamation and red skull markers carry the danger state without replacing the island surface. Simulation, collapse timing, replay, and report schemas are unchanged.

Product `0.68.0`, simulation `40.0.0`, and content `25.0.0` separate boundary-connected outer ocean from enclosed lakes for collapse and artillery planning. Ships sit 1.4 tiles offshore, fire only along a sampled clear-water approach at a current outer-coast tile, target a 210-tick flight, and cannot fire again until 120 ticks after their prior impact. Replay and report schemas remain unchanged, but deterministic fixtures advance to the new simulation envelope.

Product `0.69.0`, simulation `41.0.0`, and content `25.0.0` move manual pause from Shift to `P` and leave Shift unbound. Session-local round statistics accumulate actual path distance, health damage dealt and received, shield-absorbed damage, slowed ticks, and selected-skill use counts from authoritative frames and events. The pause layer renders that live snapshot without changing replay or report schemas; deterministic fixtures advance because `damage-applied` events can now include absorbed damage.

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

Product `0.34.1` removes the local tuning lab and `DEBUG` marker from production settings while retaining the tool in DEV. Simulation stays `17.0.0`, content stays `10.0.0`, replay remains v2, reports remain v4, and replay hashes are unchanged. The local suite passes 179 tests, fourteen DEV Chrome paths, thirteen production-artifact Chrome paths, and an exact-HEAD submission capture. [CI run 30061893140](https://github.com/0disoft/shovefall/actions/runs/30061893140) validated, captured, uploaded, and deployed exact runtime SHA `354a602392cccb453ebb1a4ac1fd52c5a39fac6c`; a fresh cache-busted public session confirmed `v0.34.1`, zero debug-tuning nodes or labels, and no browser warnings or errors.

Product `0.35.0`, simulation `18.0.0`, and content `11.0.0` replace delayed locomotion and protected-core pressure with immediate movement, stronger hand-shove commitment, saved automatic growth planning, Brick dodge mounting, direct-kill Bombs, exact-ammunition pirate cannon collapse, and lethal land-preserving rock pressure. Reports advance to v5, replay fixtures are regenerated under the new simulation envelope, and replay remains v2. Unit/scenario validation passes 182 tests; browser, deterministic audit, performance, capture, hosted CI, Pages, and public functional evidence must be refreshed before promotion.

Product `0.36.0` keeps simulation `18.0.0` and advances content to `12.0.0`. Forty-nine public bots receive a seed-derived balanced passive-plus-active loadout, then request charged items through the existing command contract after delayed perception, context-specific utility checks, and a deterministic decision cooldown. Bomb users retain a two-second escape intent and stop planting new Bombs below ten survivors. Generated character motion, placed Bomb and Soap props, Boat presentation, and bounded camera kick remain presentation-only. Formatting, lint, TypeScript, 187 unit/scenario checks, and all thirteen production Chrome paths pass. Production audit shard zero passes eight fixed 50-participant seeds with no time-limit or no-survivor result, `43.050..56.617` second duration, 365 active uses, and nine Bomb-owner deaths across 29 Bomb uses. Shard one, merged strategy gates, profile, capture, hosted CI, Pages, and public functional evidence remain promotion gates.

Product `0.37.0` advances simulation to `19.0.0` and content to `13.0.0`. A Bomb owner survives the direct-kill portion of that owner's blast but receives a strong outward launch and 42-tick stumble before any same-tick new item command. Opponents remain directly eliminated. A new sixteen-frame true-alpha terrain atlas adds grass, sand, cardinal coast, corner, water, and warning art over the procedural fallback; camera-space culling keeps the live terrain-sprite set below 500 in the production smoke viewport. Replay fixtures regenerate because Bomb outcomes change. The merged sixteen-seed production audit reports a `50.215` second mean, no time-limit result, `83.57%` of item spawns in the outer two risk bands, and zero Bomb-owner direct self-deaths across 58 uses. [CI run 30087368621](https://github.com/0disoft/shovefall/actions/runs/30087368621) validated and deployed exact SHA `7386349b43a6e83bd0071873184f70e303c92ef0`; optional media capture did not produce promoted evidence.

Product `0.38.0` keeps simulation `19.0.0` and content `13.0.0`. It adds presentation-only windup fans, hand trajectories, dodge wedges, velocity trails, and falling rings in a dedicated overlay above character sprites. Public-scale detail is limited to the human and actors within eight world units; distant bots retain one cheap direction cue. Reduced-motion keeps static information shapes. Replay fixtures refresh only for the product envelope; deterministic hashes and rules remain unchanged. All 194 unit/scenario checks and thirteen production Chrome paths pass locally.

Product `0.39.1`, simulation `20.0.0`, and content `14.0.0` preserve the Slow-collapse 50-player rules, including 12 separated 5–9-tile lakes under the 96-tile budget, and fix keyboard movement held during the countdown. The application remembers movement through the transition but still rejects pre-start shove, dodge, and item edges; reports advance to v6 for the current public rules. Replay remains v2 because simulation state and hashes are unchanged. All 195 unit/scenario checks, fourteen development Chrome paths, and thirteen production-artifact Chrome paths pass locally. Strategy audit, host-qualified profile, capture, hosted CI, Pages, and public URL evidence remain gates for this candidate.

Product `0.41.0`, simulation `21.0.0`, and content `15.0.0` include solid deterministic trees, mass-scaled 1.5–3-tile Dodge, swept Soap crossings, one-airborne-shot-per-ship scheduling, immediate bot escape from lethal rocks, and a browser-local 50-round scoreboard. Presentation adds atlas-derived ocean, rectangular surface crops, generated trees, effective percentage HUD values, and 70% master audio gain. Replay remains v2 but fixtures regenerate for the product envelope and prior deterministic state changes. Grouped local, production browser, audit, profile, capture, hosted CI, Pages, and public URL evidence are pending for this candidate.

Product `0.42.0`, simulation `22.0.0`, and content `16.0.0` separate movement from combat: arrows/pointer/gamepad own movement, three selected reusable skills use `Q/W/E`, and two charged inventory slots use `D/F`. Setup chooses one starting item and map pickups fill empty or depleted stable slots. Kill rewards pause for a prerequisite-gated stat/skill tree. Reports advance to v7; replay stays v2 with optional starting-skill compatibility and regenerated deterministic fixtures. Grouped local, production browser, balance audit, profile, capture, hosted CI, Pages, and public URL evidence are pending for this candidate.

Product `0.43.0`, simulation `23.0.0`, and content `17.0.0` add health and mana, regeneration, shields, deterministic control state, and nine inventory-independent combat skills. Bots receive varied three-skill loadouts and use the same readiness and mana rules. Vitality, Focus, and selected-skill scaling extend the kill-reward tree. Public Slow artillery begins during the opening seconds and spreads waves every 42 ticks. Reports advance to v8 with final human combat state; replay remains v2 with regenerated deterministic fixtures. Grouped local, production browser, combat balance, profile, capture, hosted CI, Pages, and public URL evidence are pending for this candidate.

Product `0.44.0` and simulation `24.0.0` replace immediate scheduled item materialization with one visible 72-tick treasure gift. A tick-derived offshore ship orbit, nearby candidate restriction after the existing 3:2:1 risk-band draw, one-flight limit, impact revalidation, reserved item IDs, and active-delivery hashing keep the sequence deterministic and bounded. Content remains `17.0.0`, reports remain v8, replay remains v2, and fixtures regenerate. Grouped local, production browser, treasure-delivery readability, balance, profile, capture, hosted CI, Pages, and public URL evidence are pending for this candidate.

Product `0.44.0`, simulation `24.0.0`, and content `17.0.0` were the prior treasure-delivery contract.

Product `0.45.0`, simulation `25.0.0`, and content `17.0.0` replace total-spent skill gating with a three-branch progression graph. Root and branch levels gate matching `Q/W/E` ranks, while rank three requires cross-branch skill investment. The DOM renders nine keyboard-selectable nodes, explicit prerequisite text, persistent ranks, and decorative connection state without owning eligibility. Vitality and Focus become valid normalized commands, and ambiguous dual upgrades fail closed. Reports and replay format remain v8 and v2; deterministic fixtures regenerate. Grouped local, production browser, path-balance, narrow-viewport, capture, hosted CI, Pages, and public URL evidence are pending.

Product `0.46.0`, simulation `26.0.0`, and content `17.0.0` replace the starting-weight slider with an exact 20-point five-attribute build. Replay advances to v3 and local reports to v9.

Product `0.47.0`, simulation `26.0.0`, and content `17.0.0` remove every preselected starting attribute, skill, and item from the browser. Settings remain invalid until all 20 points, three skills, and one item are chosen. Starting without a saved valid setup opens an accessible modal and routes directly to settings. Hosted exact-SHA proof remains pending.

Product `0.48.0`, simulation `26.0.0`, and content `17.0.0` split setup into four accessible tabs and expose current derived combat values plus each attribute's next-point delta. The Lab tab remains development-only. The simulation, replay, and report contracts do not change.

Product `0.49.0`, simulation `27.0.0`, and content `17.0.0` add Willpower as the sixth starting attribute, remove the four-point neutral threshold, and open every attribute to the full 20-point budget with linear per-point effects. Willpower reduces health damage and increases shields. The six setup cards use a two-column, three-row desktop layout with a narrow-screen fallback. Replay remains v3 and reports remain v9, while deterministic fixtures require regeneration for the expanded hashed setup contract.

Product `0.50.0`, simulation `28.0.0`, and content `18.0.0` add the same bounded forward-cone assistance to Wind Blast and Arc Bolt while retaining wall/tree occlusion on the assisted path. Settings add nine repository-owned skill icons, complete combat details, and vertical attribute steppers. Replay remains v3 and reports remain v9; deterministic fixtures require regeneration because assisted targeting changes simulation outcomes.

Product `0.51.0` and simulation `29.0.0` make Hard bots sample their complete Dodge path before committing, preserve skill knockback through Stumbling actions, and add an Arc Bolt impact trail. Content remains `18.0.0`, replay remains v3, and reports remain v9. Deterministic fixtures require regeneration because bot commands and skill displacement change outcomes.

Product `0.58.0`, simulation `33.0.0`, and content `21.0.0` define the current local candidate. The Boat card now exposes the already-enforced boarding restrictions: skills and items cannot be used, and health and mana regeneration stop during its four-second water traversal. Replay remains v3 and reports remain v9; deterministic fixtures advance to the new version envelope.

Product `0.59.0`, simulation `33.0.0`, and content `21.0.0` replace the player-facing `1.00×` mass multiplier with a weight-adjustment label. Neutral reads `기본`; Strength investment reports its percentage above baseline while the deterministic simulation value remains unchanged. Replay remains v3 and reports remain v9; deterministic fixtures advance only for the product-version envelope.

Product `0.60.0`, simulation `33.0.0`, and content `21.0.0` make aiming input-complete without a pointer. `Q/W/D` enter aim, arrows move the target while ordinary movement is held at zero, the same action key or Enter confirms, and Escape cancels. Pointer confirmation remains available, self-target actions bypass aim, and movement input cancels an out-of-range approach. Replay remains v3 and reports remain v9; deterministic fixtures advance only for the product-version envelope.

Product `0.61.0`, simulation `34.0.0`, and content `22.0.0` align the fixed 60-participant browser mode with bot-loadout, replay, and scoreboard boundaries, fixing the startup exception that previously left the renderer before its first frame. Skill and item balance fields now drive both descriptions and default runtime tuning. Brick Bag gains two-tile placement and 20 healing on each accepted wall; Soap gains three-tile placement. Replay remains v3 and reports remain v9; deterministic fixtures require regeneration.

Product `0.61.1`, simulation `34.0.0`, and content `22.0.0` remove the always-visible fixed-seed warning, build metadata, and summary-card preamble from the local balance dashboard so comparison results begin immediately below the page header. A short inline error remains hidden unless the snapshot cannot be parsed. Replay stays v3 and reports stay v9.

Product `0.62.0`, simulation `34.0.0`, and content `22.0.0` add nine separately generated skill-effect sprites without changing combat rules. Directional art rotates with projected vectors, persistent zone and shield sprites follow authoritative simulation state, and the prior Graphics geometry remains the optional-asset fallback. Replay stays v3 and reports stay v9; fixtures advance only for the product-version envelope.

Product `0.63.0`, simulation `35.0.0`, and content `23.0.0` replace the public `E` shove with a cooldown-based Grappling Hook shared by every participant and remove Hook from the item catalog. Bomb and Soap owner exceptions, Arc Bolt cooldown and impulse, Spring Glove Hook enhancement, command fields, cooldown state, HUD, bot decisions, and targeting adapters advance together. Replay advances to v4 and deterministic fixtures must be regenerated; reports stay v9.

Product `0.63.1`, simulation `35.0.0`, and content `23.0.0` keep replay v4 and report v9. Item labels move into the item definition SSOT; targeting construction and action HUD state become pure application modules with direct tests. Runtime order and public behavior do not change.

Product `0.64.0`, simulation `36.0.0`, and content `24.0.0` remove Stone Prison and the barrier-zone rule from the public catalog, bots, simulation, and presentation. Replay advances to v5 because old setup payloads may name the retired skill. The focused balance audit rotates all 28 remaining two-skill combinations and five starting items through eighty balanced-build 60-participant rounds; reports stay v9.

Product `0.65.0`, simulation `37.0.0`, and content `25.0.0` rebalance Force Palm, Chain Bind, Frost Field, Aegis, and Wind Blast from that focused audit and widen Hard-bot Brick Bag use under readable pressure. Skill and item cards continue to derive values from their runtime definitions. Replay stays v5 with regenerated deterministic fixtures; reports stay v9.

Product `0.66.0`, simulation `38.0.0`, and content `25.0.0` add obstacle-aware bot detours, blocked-path Dodge and emergency checks, stalled-progress recovery, target commitment, reachable-item selection, and contextual skill utility with obstacle visibility. The terrain cache and bounded 384-expansion search keep the 60-participant path inside the existing deterministic command boundary. Replay and reports remain v5 and v9; fixtures regenerate for the new version envelope.

The browser profile rejects a host above its five-sample CPU qualification before Chrome starts. Contest-release promotion still requires `0.62.0` production Chrome, strategy audit, hosted proof, a passing host-qualified 60-participant production-browser profile, combat/item/tree-path, assisted-aim, bot-dodge balance evidence, simultaneous skill-VFX readability, treasure-delivery readability, short-viewport pause/trait-choice proof, and human playtest.

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
4. Run `shovefall_capture_submission` from the clean exact-HEAD worktree, or inspect the matching
   successful `main` CI artifact. Confirm `manifest.json`, both PNG hashes, the WebM hash, and empty
   browser-error arrays before using the media in the contest post.
5. Confirm replay fixtures and evidence documents name the current versions.
6. Freeze game rules and content. A later behavior, content, asset, or build change creates a new
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

On 2026-07-24, [CI run 30056501932](https://github.com/0disoft/shovefall/actions/runs/30056501932) validated repository SHA `fc347488e2446d16dd52e341b4dd6ab28d1c8aab`, exercised thirteen production Chrome paths, and deployed the unchanged `0.34.0` application bundle. A cache-busted Pages session saved the fixed-50 Hard-AI setup with Bomb and Grappling Hook, entered active play, produced the missed-shove feedback, spent Hook and Bomb from two charges to one with their dedicated feedback, and reported no browser warning or error. Browser-automation backlog contaminated the attempted live movement/dodge observation, and screenshot capture timed out twice, so neither is promoted as current manual evidence.

Later on 2026-07-24, [CI run 30087368621](https://github.com/0disoft/shovefall/actions/runs/30087368621) validated exact `0.37.0` SHA `7386349b43a6e83bd0071873184f70e303c92ef0`, exercised thirteen production Chrome paths, uploaded the tested Pages artifact, and completed the dependent deployment. Optional exact-SHA media capture remained a visible non-blocking warning and produced no promoted capture bundle. A cache-busted public request returned HTTP 200 with the current application script. This proves hosted validation and delivery for `0.37.0`, not physical-device behavior, human readability, or the local `0.38.0` presentation candidate.

## Post-deploy Verification

Against the final HTTPS URL and candidate SHA:

1. Hard refresh and verify the title, setup, and canvas render without console-fatal errors.
2. Run `게임 시작` through countdown, movement, shove, dodge, collapse, result, and restart.
3. Verify `기록 복사` succeeds in the secure context and denial leaves visible failure and retry guidance.
4. Test one fixed 50-participant Slow round with eight initial map items, four-second respawns, and the 120-second limit. Internal Normal and Fast fixtures remain diagnostics, not public settings.
5. Confirm optional audio can fail without blocking play.
6. Inspect network activity for unexpected origins, runtime API calls, mixed content, and missing
   assets.
7. Capture the final screenshot/video only after this verification and record their source SHA.

## Stop Conditions

Stop promotion when any required check is missing, stale, pending, or tied to another SHA; when the
Pages deployment is cancelled or superseded; when the public artifact cannot be tied to the
candidate; when a critical journey fails; or when an asset has unknown provenance. Follow
[rollback.md](rollback.md) after a published regression.
