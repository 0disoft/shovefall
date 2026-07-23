# Routing and Rendering

- Status: Accepted for MVP
- Repository type: web-app
- Owner: Repository owner
- Frontend source: [../frontend/FRONTEND_DESIGN.md](../frontend/FRONTEND_DESIGN.md)
- Runtime source: [../architecture/02-runtime-flow.md](../architecture/02-runtime-flow.md)

## Route Model

Shovefall serves one static HTML document. Setup, settings, countdown, play, result, pause, and
fatal recovery are application states, not URL routes. Refresh creates a new local session. The MVP
does not expose query parameters, hash state, deep links, redirects, or shareable round settings.

Static hosting must return the built document and same-origin assets under both root and the
configured Vite base path. It does not need an application-router fallback because no nested route
is public.

## Rendering Ownership

Semantic HTML and CSS own loading, setup, settings, HUD text, result actions, fatal errors, live
status, and keyboard focus. PixiJS owns arena tiles, participants, items, world effects, and camera
transforms. The canvas does not replace buttons, form controls, status text, or error recovery.

The application layer advances the fixed 60 Hz simulation and hands read-only frames and events to
the presentation layer. RequestAnimationFrame timing may affect interpolation and visual quality,
but it cannot change authoritative ticks, hit windows, bot commands, or state hashes.

## Lifecycle States

1. Boot verifies required content and WebGL support.
2. The menu owns `게임 시작` and entry to custom settings; the start action always consumes the last saved in-memory settings.
3. Countdown renders the fresh arena while simulation and gameplay input remain at tick zero.
4. Active play samples held movement and edge-triggered actions once per fixed tick.
5. Blur, visibility loss, or renderer loss clears held input and pauses progression.
6. Result seals the completed world; restart constructs a fresh world and countdown.
7. Required failure shows non-secret local diagnostics and a retry path.

## Failure and Accessibility

Required renderer or content failure blocks round start. Optional audio or image failure falls back
to silence or procedural visuals. Reduced motion suppresses nonessential shake and flashes without
altering timing. Collapse, human identity, item type, and action readiness cannot rely on color
alone.

## Change Gate

Adding a route, URL state, durable browser storage, service worker, network fetch, or server-rendered
surface is an architecture change. It requires an explicit product need, ownership decision,
failure and migration contract, synchronized validation, and documentation before code.
