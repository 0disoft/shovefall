# Product Specification

- Status: Accepted for MVP; gray-box implementation in progress
- Owner: Repository owner
- Technical owner: Repository owner
- Related decisions: `docs/adr/0001-initial-architecture-boundaries.md` and `docs/adr/0002-contract-source-of-truth.md`

## Product

Shovefall is a one-to-two-minute single-player browser party-action game. One human and deterministic rule-based bots shove each other from a collapsing tile arena. The game must explain itself through movement, telegraphs, impacts, and falling rather than a long tutorial.

The central promise is a readable comic reversal: a player can dodge an incoming shove so that the attacker stumbles into the void, or two attackers can collide on the same tick and both fly away. A result may be chaotic, but it must follow visible state and deterministic rules rather than a hidden probability roll.

## Core Loop

1. Quick Start begins with the recommended preset. Custom settings are secondary.
2. The human moves with `WASD`, shoves with `Space`, and dodges with `Shift`.
3. Mass continuously changes acceleration, turning, top speed, and impulse response without changing outcomes by chance.
4. Telegraphing tiles collapse and compress the arena.
5. The last active participant wins. A defeated human can restart immediately or watch no more than five seconds of accelerated resolution.

## Player and Mode Contract

- Supported participants: 4 through 32, including the human.
- Recommended default: 12.
- Normal competitive-quality range: 4 through 24.
- Participants 25 through 32 are explicitly labeled `Mayhem`; input stability and deterministic rules still apply, but normal balance and readability are not promised.
- Arena area, spawn spacing, item caps, and bot search bounds are derived from participant count and density rather than exposed as unrelated raw numbers.

## Gray-box Gate

The current gate uses flat shapes and no final art. It must prove movement, weak contact, shove windup/active/recovery, dodge, missed-shove momentum, simultaneous shove resolution, two mass extremes, support loss, falling, and restart with two to eight participants.

Collapse, formal bots, 32-participant scale, items, audio, and final art cannot be used to hide a failed core interaction. They are promoted only after the gray-box interactions are deterministic, readable, and covered by scenario tests.

## MVP Scope

- Quick Start plus bounded presets for participant count, item frequency, density, collapse speed, and bot difficulty.
- One human and up to 31 bots using the same `ActorCommandV1` contract.
- A 60 Hz fixed-tick simulation independent of PixiJS and browser time.
- Deterministic movement, shove, dodge, stumble, mass, collision, support, falling, and elimination.
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
- The normal 12-participant build targets 60 fps on the named baseline device. The 32-participant Mayhem build must remain responsive at 45 fps or better.

These are pre-submission quality gates, not population-level market claims.

## Explicit Non-goals

- Online multiplayer, accounts, authentication, cloud saves, leaderboards, chat, or a database.
- Runtime LLMs, remote AI calls, advertising, analytics SDKs, or automatic error upload.
- Mobile touch, gamepad, console, or installed desktop support in the MVP.
- Progression, shops, unlocks, user-generated maps, skins, campaigns, or a mod API.
- User-facing replay upload, sharing, or long-term backward compatibility.

## Current Implementation Slice

Version `0.3.0` implements the first headless gray-box combat slice: mass-sensitive acceleration and speed, weak circular contact, exact shove and dodge windows, missed-shove stumble, same-tick batch impulses, center-tile support grace, falling, elimination, finite caps, and regenerated replay fixtures under simulation version `2.0.0`. These numbers are an automated baseline, not final fun approval; the browser integration and external gray-box playtest still gate promotion to collapse and content.
