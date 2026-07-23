# Product Specification

- Status: Accepted for MVP; gray-box implementation in progress
- Owner: Repository owner
- Technical owner: Repository owner
- Related decisions: `docs/adr/0001-initial-architecture-boundaries.md` and `docs/adr/0002-contract-source-of-truth.md`

## Product

바닥이 사라지는 술래잡기 (`Shovefall`) is a brief single-player browser party-action game with a 75-second hard round limit. One human and deterministic rule-based bots shove each other from a collapsing tile arena. The game must explain itself through movement, telegraphs, impacts, and falling rather than a long tutorial or decorative marketing copy. A target human-play duration distribution remains a playtest decision rather than a claim inferred from bot-only rounds.

The central promise is a readable comic reversal: a player can dodge an incoming shove so that the attacker stumbles into the void, or two attackers can collide on the same tick and both fly away. A result may be chaotic, but it must follow visible state and deterministic rules rather than a hidden probability roll.

## Core Loop

1. `게임 시작` begins with the last saved settings; custom settings remain a secondary menu branch.
2. The human selects a starting mass and two distinct starting items; moves with `WASD`, arrow keys, mouse drag, a touch joystick, a standard gamepad stick, or its D-pad; extends a hand shove with `Space`, the first gamepad button, or the touch action; dodges with `Shift`, the second gamepad button, or the touch action; and spends earned stat points with `1..4` or the DOM controls.
3. Mass continuously changes acceleration, turning, top speed, and impulse response without changing outcomes by chance.
4. Telegraphing tiles collapse and compress the arena.
5. The last active participant wins. A defeated human can restart immediately or watch no more than five seconds of accelerated resolution.

## Player and Mode Contract

- Simulation and replay support: 4 through 32 participants, including the human.
- Browser presets: 8, 16, 24, and 32 participants.
- Recommended default: 16.
- Normal competitive-quality range: 8 through 24.
- Participants 25 through 32 are explicitly labeled `Mayhem`; input stability and deterministic rules still apply, but normal balance and readability are not promised.
- Arena area, spawn spacing, item caps, and bot search bounds are derived from participant count and density rather than exposed as unrelated raw numbers.

## Gray-box Gate

The current gate uses flat shapes and no final art. It must prove movement, weak contact, shove windup/active/recovery, dodge, missed-shove momentum, simultaneous shove resolution, two mass extremes, support loss, falling, and restart with two to eight participants.

Collapse, formal bots, 32-participant scale, items, audio, and final art cannot be used to hide a failed core interaction. They are promoted only after the gray-box interactions are deterministic, readable, and covered by scenario tests.

## MVP Scope

- A menu-first game start plus bounded settings for participant count, item frequency, density, collapse speed, and bot difficulty.
- One human and up to 31 bots using the same `ActorCommandV1` contract.
- A 60 Hz fixed-tick simulation independent of PixiJS and browser time.
- Deterministic movement, hand-reach shove, dodge, stumble, mass, collision, support, falling, elimination credit, and stat progression.
- Stable, warning, collapsing, and void tile states.
- At least three bot personalities implemented as data-driven utility weights.
- Iron Boots, Feather, and Spring Glove after the core gate passes.
- Reproducible developer replay fixtures containing normalized settings, seed, human commands, versions, checkpoints, and a final state hash.
- A provider-neutral static build playable over HTTPS without an application backend.

## Failure and Recovery

- Invalid settings and replay data fail before a round begins; malformed values are never silently coerced into valid actions.
- Duplicate commands for one actor and tick are a development error. A missing command is neutral input.
- An unsupported replay format or simulation version is rejected instead of guessed or migrated.
- Falling becomes irreversible after the support grace window. Restart creates a new world rather than mutating the completed round.
- Fatal UI errors may show copyable non-secret build, seed, tick, and state-hash metadata. They are not uploaded automatically.

## Success Gates

- At least 80% of observed first-time players move within five seconds without opening instructions.
- At least 60% use or correctly explain dodge by the end of their second round.
- At least 90% of observed deaths can be explained by the player immediately afterward.
- At least 60% restart within five seconds of their first defeat, and at least half play three rounds.
- The normal 16- and 24-participant builds target 60 fps on the named baseline device. The 32-participant Mayhem build must remain responsive at 45 fps or better.

These are pre-submission quality gates, not population-level market claims.

Human evidence for these gates must follow [04-playtest-protocol.md](04-playtest-protocol.md). A
developer check or five-person directional batch may identify problems but cannot claim the
pre-submission percentages have passed. Results from different behavior SHAs are not combined.

## Explicit Non-goals

- Online multiplayer, accounts, authentication, cloud saves, leaderboards, chat, or a database.
- Runtime LLMs, remote AI calls, advertising, analytics SDKs, or automatic error upload.
- Console or installed desktop support in the MVP.
- Progression, shops, unlocks, user-generated maps, skins, campaigns, or a mod API.
- User-facing replay upload, sharing, or long-term backward compatibility.

## Current Implementation Slice

Version `0.20.0` exposes four presets at 8, 16, 24, and 32 participants with enlarged `12×10`, `15×12`, `18×14`, and `20×15` arenas. The human selects light/normal/heavy base mass and two of Iron Boots, Feather, and Spring Glove. Normal speed is 3.3 tiles/second, lightweight reaches 4.455, and heavyweight is slower; a disabled-by-default local debug lab permits bounded next-round tuning. Space now creates a five-tick short hand hitbox instead of forcing body dash velocity. A shove credited within three seconds of irreversible falling grants one point for Power, Stability, Mobility, or Reflex; bots spend through the same command path. A completed result copies local playtest schema v3 with loadout, tuning, final human progression, seed, outcome, and state hash without upload. The focused 32-round bot screen measured no time-limit endings, 8/16/24/32 mean durations of `33.6646 / 40.5438 / 41.6750 / 30.4146` seconds, Aggressor-to-Survivor win rate `0.7875×`, and elimination rate `1.1509×`. Simulation is `6.0.0` and content is `4.0.0`. The legacy 200-round controlled audit exceeded its 300- and 420-second local limits after arena expansion, so controlled causal mass/item/pacing evidence remains unrefreshed. Human play, physical devices, cross-browser behavior, final-art readability, and hosted proof for this exact version remain pending.

Version `0.21.0` changes only the product and input/presentation layer. The public title is `바닥이 사라지는 술래잡기`; decorative English copy and numbered section ornaments are removed. Arrow-key, mouse-drag, virtual-joystick, and standard-gamepad adapters feed the same human command state as keyboard input. The normal HUD no longer exposes development identifiers; tick, rate, position, seed, and state hash sit in one collapsed `data-development-only` panel that must be removed or development-gated before the contest release. Simulation remains `6.0.0` and content remains `4.0.0`.

Version `0.22.0` changes the arena into a deterministic procedural island. Each seed produces a connected landmass with a smoothed irregular coast and one or two enclosed lakes; failed lake cuts are rejected rather than creating disconnected spawn islands. The 8/16/24/32 participant tiers expand to `16×13`, `20×16`, `24×19`, and `28×22` bounds before ocean and lakes are removed. Participants start on distinct supported interior tiles. Items retain their 3/2/1 edge bias but now treat both coast and lake shore as risk edges. Bots use the same current stable-tile shore depth for danger and target opportunity. Collapse removes only 80% of the tick-zero playable land and leaves a connected 20% core; time-limit draws remain honest instead of deleting the protected core to force a winner. Simulation is `7.0.0`, product is `0.22.0`, and content remains `4.0.0`.

Version `0.23.0` opens on a menu containing only `게임 시작` and `설정`; the start action always consumes the last saved settings, and the arena is not visible until the round begins. The camera follows the human through a local viewport instead of shrinking the whole island into one screen. The 8/16/24/32 bounds grow to `22×17`, `25×20`, `28×23`, and `31×26`; seeded coastlines keep their irregular outline while using a fixed tier land budget, so larger presets cannot accidentally contain less playable land. Simulation is `8.0.0`, product is `0.23.0`, and content remains `4.0.0`.
