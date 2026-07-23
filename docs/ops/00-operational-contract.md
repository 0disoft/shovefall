# Operational Contract

- Status: Accepted for static MVP release preparation
- Primary owner: Repository owner
- Product boundary: [../product/02-spec.md](../product/02-spec.md)
- Release procedure: [release.md](release.md)
- Rollback procedure: [rollback.md](rollback.md)
- CI boundary: [ci.md](ci.md)

## Operating Model

Shovefall is a static browser application. A release consists of immutable HTML, JavaScript, CSS,
source maps, and any approved same-origin media produced from one exact Git commit. There is no
application server, worker, database, account, remote save, queue, scheduled job, runtime secret,
or application API.

The source repository and chosen static host are separate systems. A green local build does not
prove GitHub Actions, and a green workflow does not prove the final HTTPS URL. Each boundary needs
its own evidence for the same candidate SHA.

## Critical User Journeys

1. Open the HTTPS URL and reach a rendered setup screen.
2. `게임 시작` uses the last saved settings, reveals the arena, enters a visible countdown, and then accepts keyboard, mouse-drag, touch-joystick, and standard-gamepad input.
3. WebGL renders participants, items, tile warnings, collapse, falling, and the result state.
4. Defeat or victory offers an immediate fresh restart.
5. A completed result can copy a local playtest record; clipboard denial shows a manual fallback.
6. Renderer loss pauses the round and restoration resumes it without advancing hidden ticks.

Setup, play, result, and restart are release-critical. Optional audio is not. Final images may fall
back to procedural visuals only when the approved visual direction declares that fallback
acceptable.

## Dependency Tiers

| Tier | Dependency | Failure effect | Required response |
|---|---|---|---|
| 0 | Built same-origin HTML, JavaScript, and CSS | Application cannot boot | Stop release or roll back |
| 0 | Browser WebGL support | Arena cannot render | Show recoverable unsupported-renderer state; do not claim support |
| 1 | Static HTTPS host and DNS | Public link unavailable | Restore the last known-good artifact or host route |
| 1 | GitHub source and Actions | New candidate cannot be independently promoted | Keep the last released artifact; do not substitute local claims |
| 2 | Web Audio and clipboard APIs | Optional sound or record copy unavailable | Continue with silence or visible manual-copy guidance |

## Service Objectives and Evidence

No production availability SLA is promised before a host is selected. Submission readiness is a
binary evidence gate:

- the exact candidate SHA passes the configured local release checks;
- GitHub Actions reports the same SHA green;
- a named physical desktop/browser matrix passes the critical journeys;
- the final HTTPS URL passes a post-deploy smoke;
- external playtest, visual direction, and asset provenance gates are recorded.

RPO for user data is `NOT_APPLICABLE`: the MVP stores no user data. RTO cannot be promised until
the hosting provider, credential owner, immutable-artifact retention, and rollback control are
named.

## Observability and Privacy

There is no remote analytics, session replay, telemetry upload, automatic error reporting, or
server log contract. Local UI diagnostics expose only build-independent state such as seed, tick,
state hash, and normalized settings. Manual browser developer tools and host availability pages are
diagnostic aids, not product telemetry.

## Release Blockers

- Missing or failing exact-SHA local, hosted, device, or final-URL evidence.
- A required asset lacks source, license or generation terms, attribution decision, or fallback.
- A visual pass obscures human identity, actions, items, or collapse warnings.
- The deployed artifact makes an unexpected network request or requires a runtime secret.
- The host serves stale files, mixed content, a broken base path, or a non-HTTPS contest URL.
- Human-play gates have not passed or have not received an explicit risk acceptance.
