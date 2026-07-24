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

The implementation already proves deterministic rules, fixed 50-participant browser boot,
bounded local 50-participant workload, and the Coal-Twilight procedural visual direction. The critical
path is no longer adding systems. It is proving the current systems and final-art readability with
people, then publishing the exact candidate without burying combat telegraphs.

## Completed Foundation

- [x] Provider-neutral Vite and PixiJS static application with a pure 60 Hz simulation.
- [x] Movement, shove, dodge, missed-shove stumble, simultaneous impulses, support loss, falling,
      results, and fresh-world restart.
- [x] One public 50-participant mode with a 48×40 procedural island and exactly eight bounded separated lakes.
- [x] Hard utility-bot reaction profile fixed for public play without bot-only physics advantages.
- [x] Slow, Normal, and Fast collapse controls with deterministic warning and collapse schedules.
- [x] Iron Boots, Feather, and Spring Glove with a bounded 3/2/1 outer-ring placement preference.
- [x] Human Wind Blast, Brick Bag, Boat, Bomb, Soap, and static-anchor Grappling Hook activation through the shared two-slot input contract.
- [x] Sharded deterministic `0.34.0` round, mass, item-grant, and collapse-pacing evidence with no sampled time-limit draws.
- [x] Widened-island fixed-50 headless scale evidence at simulation p95 `6.823 ms` with no 100 ms step.
- [ ] Host-qualified production-Chrome performance evidence. The configured five-sample preflight now blocks contaminated runs; its first `0.34.0` attempt rejected `63.5%` average and `87.4%` maximum host CPU before Chrome started.
- [x] Local aggregate validation and thirteen production-artifact Chrome paths on `0.34.0`.
- [x] Exact-SHA hosted validation, tested-artifact Pages deployment, and cache-busted public 50-participant WebGL smoke on `0.34.0`.

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
  distinguishable in the fixed 50-participant mode.

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

Current status: `IMPLEMENTED_PENDING_HUMAN_READABILITY`. Umans GLM 5.2 selected Coal-Twilight,
the repository implements it with procedural CSS and PixiJS geometry, and no external raster asset
is required. Automated browser smoke passed; the human readability conditions above remain open.

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

Current status: `IN_PROGRESS`. Product `0.34.0` runtime SHA `c0ddda93e1d75520909c79888c342f4b57747d7f` is the newest accepted hosted, Pages, and public functional candidate with sharded deterministic balance evidence. [CI run 30055148110](https://github.com/0disoft/shovefall/actions/runs/30055148110) passed all 173 tests and thirteen production Chrome paths before deploying the tested artifact. Host-qualified browser performance, named physical-browser coverage, final captures, and human-play evidence remain open.

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
