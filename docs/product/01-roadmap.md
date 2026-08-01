# Roadmap

- Status: Active MVP roadmap
- Product owner: Repository owner
- Technical owner: Repository owner
- Product source of truth: [02-spec.md](02-spec.md)
- Risk source of truth: [03-risk-register.md](03-risk-register.md)
- Human evidence procedure: [04-playtest-protocol.md](04-playtest-protocol.md)

## Release Objective

Ship a short browser party-action game whose chaos stays readable. The submission build
must let a first-time player move, shove, dodge, understand most defeats, and restart without an
account, tutorial wall, backend, or hidden probability deciding combat.

The implementation already proves deterministic rules, fixed 70-participant browser boot,
bounded local 50-participant workload, and the Coal-Twilight procedural visual direction. The critical
path is no longer adding systems. It is proving the current systems and final-art readability with
people, then publishing the exact candidate without burying combat telegraphs.

## Completed Foundation

- [x] Provider-neutral Vite and PixiJS static application with a pure 60 Hz simulation.
- [x] Movement, shove, dodge, missed-shove stumble, simultaneous impulses, support loss, falling,
      results, and fresh-world restart.
- [x] One public 70-participant mode with a 57×48 procedural island and exactly twelve bounded separated lakes.
- [x] Hard utility-bot reaction profile fixed for public play without bot-only physics advantages.
- [x] Slow, Normal, and Fast collapse controls with deterministic warning and collapse schedules.
- [x] Iron Boots, Feather, and Spring Glove with a bounded 3/2/1 outer-ring placement preference.
- [x] Human Soap, Brick Bag, Boat, Bomb, and static-anchor Grappling Hook activation through the shared item and built-in action contracts.
- [x] Immediate locomotion, saved automatic growth planning, Brick dodge mounting, direct-kill Bombs, exact-ammunition pirate cannon collapse, and protected-core lethal rocks in the local `0.35.0` ruleset.
- [x] Hard bots receive balanced passive-plus-active loadouts and spend charges through delayed perception and bounded deterministic utility rules in `0.36.0`.
- [x] Bomb owners survive their own blast with dangerous launch and stumble, and the alpha terrain atlas replaces flat island tiles in `0.37.0`.
- [x] Nearby combat gains shove windup fans, hand trajectories, dodge wedges, launch trails, and falling marks without changing simulation rules in `0.38.0`.
- [x] Sharded deterministic `0.34.0` round, mass, item-grant, and collapse-pacing evidence with no sampled time-limit draws.
- [x] Widened-island fixed-50 headless scale evidence at simulation p95 `6.823 ms` with no 100 ms step.
- [ ] Host-qualified production-Chrome performance evidence. The configured five-sample preflight blocks contaminated runs; two independent `0.34.0` attempts rejected `63.5 / 64.1%` average and `87.4 / 84.3%` maximum host CPU before Chrome started.
- [x] Local aggregate validation, fourteen DEV Chrome paths, and thirteen production-artifact Chrome paths on `0.34.1`.
- [x] Exact-SHA hosted validation, tested-artifact Pages deployment, cache-busted public smoke, and exact-SHA submission capture on `0.34.1`.

## Gate 1: Human Gray-box Evidence

Run the sessions in [04-playtest-protocol.md](04-playtest-protocol.md) against an exact commit SHA.
Do not tune from bot win rates or from one vivid anecdote.

Exit conditions:

- The first-time discovery cohort reaches the movement, dodge, explainable-death, restart, and
  three-round gates in [02-spec.md](02-spec.md), or each miss has a reproduced cause and bounded
  corrective change.
- A paired Normal-versus-Slow session records whether Slow creates useful decisions rather than
  merely delaying the ending.
- Edge-item attempts are experienced as a visible voluntary risk. Unreadable spawns, accidental
  pickups, and forced deaths are separated from chosen greed.
- Human identity, shove windup, dodge window, collapse warning, item type, and result state remain
  distinguishable in the fixed 70-participant mode.

Current status: `PENDING_EXTERNAL_PLAYTEST`. Automated audits are supporting evidence only; bots do not use charged active items, so they cannot establish Grappling Hook or active-item pair balance.

## Gate 2: Visual Direction and Asset Inventory

Choose one visual direction through the user-designated Umans GLM 5.2 review path. Translate the
approved direction into semantic tokens and a small asset inventory before generating images.

Exit conditions:

- Palette, typography, shape language, camera treatment, and motion hierarchy are approved as one
  system rather than accumulated decoration.
- Human identity and danger telegraphs work without color alone and under reduced motion.
- Every external or generated asset has a source, license or generation record, dimensions, and
  fallback behavior.
- Optional image failure leaves the game playable; art never changes simulation timing or hit
  windows.

Current status: `PARTIALLY_IMPLEMENTED_PENDING_HUMAN_READABILITY`. Umans GLM 5.2 selected
Coal-Twilight. Procedural CSS and PixiJS geometry remain the failure-safe baseline; accepted
character, item, artillery, impact, and terrain art now layers over it. Product `0.38.0` prioritizes
detailed action geometry around the human while distant bots retain cheaper direction cues. The
human readability conditions above remain open.

## Gate 3: Submission Hardening

Freeze balance before this gate. Changes here remove delivery risk rather than adding mechanics.

Exit conditions:

- The exact candidate SHA passes configured local `check`, `smoke-dist`, round audit, headless
  scale profile, and production-browser profile.
- A named physical desktop and supported browser matrix have manual smoke evidence.
- GitHub Actions reports green checks for the exact candidate SHA. A local pass or remote push is
  not a substitute.
- The chosen HTTPS host serves the built artifact from a clean URL, including the configured base
  path, with no application backend.
- Screenshot, short gameplay capture, tool list, asset provenance, and development notes are ready
  in [05-submission-package.md](05-submission-package.md) for the contest post.

Current status: `IN_PROGRESS`. Product `0.75.0`, simulation `48.0.0`, and content `28.0.0` are the current local rules. Public play fixes 60 participants with Hard bots, 30 starting current mana, opening outer-coast-only Slow collapse, eight initial map items, one seven-second treasure-gift launch when capacity permits, a 120-second limit, twelve lakes, deterministic solid trees, sixteen-ship one-shot/one-tile cannon targeting with per-ship reload, obstacle-aware bot routing, target commitment, tactical skill selection, lethal-rock escape, and a bounded browser-local scoreboard. The sixteen pirate ships follow the local outer-water direction and leave roughly 3-4 visible water tiles between hull and shore. The orbiting item-delivery ship uses a distinct teal-and-gold treasure-vessel sprite with visible cargo. The human moves only through arrows, pointer/touch, or gamepad movement surfaces, selects two mana-backed `Q/W` combat skills from eight, uses the shared 15-second `E` Grappling Hook, chooses one starting `D` item, and spends each credited-elimination reward on one of six directly available combat traits. The live arena fills the viewport and moves telemetry plus non-combat actions into a `P` pause layer; Shift is unbound. That layer shows the current round's traveled distance, dealt and received health damage, shield-blocked damage, slowed time, and per-skill use counts. Completed results lead with the outcome and actions; completed and fatal panels remove the resumable action instead of leaving a dead control. Cannon warnings preserve the island art, begin on the exact projectile launch tick, and use separate exclamation and skull markers. Health, mana, regeneration, shields, damage, and control participate in deterministic combat alongside support loss. Generated terrain derives every one of the sixteen orthogonal coast masks from the accepted atlas and retains an independent procedural fallback. The deployed `0.37.0` SHA `7386349b43a6e83bd0071873184f70e303c92ef0` remains the last hosted proof. The `0.75.0` candidate still needs grouped production Chrome evidence, combat/item/trait balance review, opening-load performance review, cannon pacing and coast-coverage review, treasure-delivery readability, capture, exact-SHA hosted proof, named physical-browser coverage, and human-play evidence.

## Deferred Beyond the Submission

- Online multiplayer, accounts, leaderboards, cloud saves, remote analytics, and a database.
- Installed desktop packages, persistent progression, shops, skins, and user maps.
- Additional items or mechanics unless human evidence identifies a specific missing decision.
- Public replay upload or backward compatibility beyond the current developer format.

## Change Discipline

- One failed threshold does not authorize a broad redesign. Reproduce the failure, change the
  smallest owning surface, and rerun the relevant human and automated checks.
- Do not change combat physics and visual presentation in the same evidence batch when either can
  explain the result.
- A version bump is required for runtime, content, or replay-contract changes. Planning and
  evidence-document edits alone do not change the product or simulation version.

Product `0.70.0` closes the first Boat/autoboarding, coast-sector artillery, diagonal-coast topology, upright-ship, stunned-feedback, and closer-camera implementation pass. Human review of generated-coast edge cases and simultaneous 60-participant combat readability remains a promotion gate.

Product `0.71.0` replaces grouped cannon collapse with one projectile, one warning, and one flooded tile per accepted shot; expands the coast fleet to sixteen ships; and seeds fleet proposals between one and three seconds. Proposals without an available unobstructed full-flight ship are omitted rather than creating orphan warnings or forced flooding. The protected 20% core is a floor, not a requirement to remove 80% during the 120-second round. Human pacing and coast-coverage review remain promotion gates.

Product `0.71.1` keeps simulation and content unchanged and completes all sixteen terrain water-neighbor masks by composing the accepted north, east, south, and west coast art. Browser and human capture remain promotion gates for the final shoreline result.

Product `0.71.2` keeps simulation and content unchanged and makes pause and completion readable at a glance. Terminal results lead with outcome and actions, while active pause keeps statistics and controls in wider responsive cards. Browser, short-viewport, and human capture remain promotion gates.

Product `0.72.0` advances simulation to `44.0.0`, places pirate ship centers 5.25 tiles offshore along the local outer-water direction so the hull has 3-4 visible water tiles of clearance, and widens the camera ocean margin to keep them visible. Replay, browser, and human coast-distance evidence remain promotion gates.

Product `0.72.1` advances simulation to `45.0.0` and starts each accepted tile's yellow warning on its cannon shot launch tick. Danger, impact, and flooding timing remain unchanged. Replay, browser, and human telegraph-readability evidence remain promotion gates.

Product `0.72.2` keeps simulation at `45.0.0`, advances content to `27.0.0`, and replaces the temporary treasure-ship geometry with a dedicated transparent merchant-vessel sprite. Browser scale, overlap, and delivery-readability evidence remain promotion gates.

Product `0.73.0` advances simulation to `46.0.0` and starts all participants at 30 current mana without reducing maximum mana. Replay, focused balance, opening-load performance, browser, and human pacing evidence remain promotion gates.

Product `0.75.0` advances simulation to `48.0.0` and content to `28.0.0` with the follow-up trait, skill, and active-item balance pass. Deterministic replay fixtures and focused balance evidence must be refreshed before promotion; human combat pacing and browser proof remain pending.
