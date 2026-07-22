# Backend API Integration

- Status: `NOT_APPLICABLE` for MVP
- Owner: Repository owner
- Product source: [../product/02-spec.md](../product/02-spec.md)
- System boundary: [../architecture/00-system-boundary.md](../architecture/00-system-boundary.md)

## Decision

Shovefall is a provider-neutral static browser game. The MVP makes no application API request and
has no backend, account, authentication, remote save, leaderboard, analytics upload, or database.
The seeded OpenAPI files remain inert scaffold references; they are not a consumed runtime contract
and cannot be cited as evidence that a server exists.

## Runtime Rules

- All game rules, settings, seeds, commands, frames, and results remain local to the page.
- Static JavaScript, CSS, and approved media may load from the same deployed origin.
- Optional asset failure falls back locally; it does not call a remote recovery service.
- Fatal diagnostics are shown for manual copying and are never uploaded automatically.
- No credential, API URL, token, retry policy, or network error state belongs in the current app.

## Promotion Gate

A future backend integration requires a new accepted product decision and architecture review. That
change must define data ownership, authentication and authorization, privacy, timeout and retry
behavior, offline and partial-failure UX, API compatibility, secrets, observability, deletion,
migration, and new browser/contract validations before the first runtime request is added.
