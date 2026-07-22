# Product Brief

- Status: Accepted for MVP submission work
- Product owner: Repository owner
- Technical owner: Repository owner
- Detailed scope: [02-spec.md](02-spec.md)
- Delivery gates: [01-roadmap.md](01-roadmap.md)
- Active risks: [03-risk-register.md](03-risk-register.md)

## The Game

Shovefall is a short single-player desktop-browser party-action game. One person and deterministic
rule-based bots fight on a collapsing tile arena. Movement, shove timing, dodge timing, changing
mass, item temptation, and the distance to the void decide the result. Hidden random combat rolls
do not.

The signature moment is a comic reversal the player can read: an attacker commits to a shove, the
target dodges, and the attacker stumbles into danger. Simultaneous shoves may also throw both
participants away. The game is successful when that chaos looks earned rather than arbitrary.

## Audience and Session

- A contest voter or casual desktop player who should understand the game within seconds.
- No installation, account, tutorial wall, backend, or online opponent.
- 8, 16, 24, and 32 participant presets; 16 is Quick Start and 32 is explicit Mayhem.
- A hard 75-second round limit with immediate restart after defeat or victory.
- WASD movement, Space shove, and Shift dodge.

## Product Bet

The build wins attention through one strong interaction, not a large feature list. Readable shove
commitment plus dodge reversal should create stories worth replaying. Edge-weighted Iron Boots,
Feather, and Spring Glove spawns add a second decision: accept visible positional danger for a
temporary physical advantage.

More participants, items, effects, or modes do not repair weak combat. New scope is justified only
when human evidence identifies a repeated problem that the current rules cannot solve.

## MVP Boundary

The MVP is a provider-neutral static HTTPS application using semantic DOM controls and a PixiJS
WebGL world. The renderer-independent 60 Hz simulation owns authoritative rules. Browser and
presentation layers consume versioned commands, frames, and events without mutating simulation
state.

Out of scope are online multiplayer, accounts, cloud saves, leaderboards, remote analytics,
runtime LLM calls, mobile touch, gamepad, progression, shops, user maps, and a database.

## Evidence Boundary

Automated tests and seeded bot audits prove determinism, bounded regressions, termination, and
local performance. They do not prove fun, fairness, first-time understanding, risky-item value,
physical-device support, cross-browser behavior, hosted CI, or deployment. Human quality gates use
[04-playtest-protocol.md](04-playtest-protocol.md); delivery evidence follows [VALIDATION.md](../../VALIDATION.md).

## Current State

The gray-box game, production presets, selectable bot difficulty and collapse speed, three items,
procedural feedback, local production smoke, balance screens, and 16/24/32 performance profiles are
implemented. Human playtest evidence, final visual direction, approved asset inventory, named
device/browser coverage, exact-SHA hosted checks, and final HTTPS hosting remain open release work.
