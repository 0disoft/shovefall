# Web App Contract

- Status: Accepted for MVP
- Repository type: web-app
- Owner: Repository owner
- Product source: [../product/02-spec.md](../product/02-spec.md)
- Frontend source: [../frontend/FRONTEND_DESIGN.md](../frontend/FRONTEND_DESIGN.md)
- Architecture decision: [../adr/0001-initial-architecture-boundaries.md](../adr/0001-initial-architecture-boundaries.md)

## Ownership Boundary

This repository owns the single-page browser shell, normalized local settings, keyboard input,
fixed-step scheduling, semantic states, PixiJS presentation, accessibility behavior, local
diagnostics, static build, and browser validation. The pure simulation and AI remain browser-free
modules inside the same repository.

There is no server state. Backend API consumption, authentication, accounts, database storage,
remote analytics, and application network requests are outside the MVP.

## Public Surface

- One static document route that boots setup, settings, countdown, active round, result, pause,
  unsupported-renderer, and recoverable-error states.
- Quick Start plus bounded participant, item, bot-difficulty, and collapse-speed choices.
- WASD, Space, and Shift gameplay input after the canvas region receives gameplay focus.
- A provider-neutral `dist` artifact that supports the configured Vite base path.

URL state, hash routing, shareable query settings, service workers, cookies, and durable browser
storage are not public contracts.

## Validation and Release

Stable validation names and proof boundaries live in [../../VALIDATION.md](../../VALIDATION.md).
Local source checks, browser smoke, production-artifact smoke, and profiles are distinct from
hosted CI, a physical-device matrix, and final-host evidence. Release requires the gates in
[../product/01-roadmap.md](../product/01-roadmap.md), not merely a successful build.

## Compatibility

Replay and simulation compatibility are versioned explicitly. Browser UI layout and local setup
drafts are not promised as a backward-compatible storage format because the MVP persists no user
data. Any future URL, local-storage, save, or service-worker format requires a separate ownership
and migration decision before implementation.
