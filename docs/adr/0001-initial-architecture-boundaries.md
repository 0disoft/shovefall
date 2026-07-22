# ADR 0001: Pure Simulation and Split Presentation

- Status: Accepted
- Date: 2026-07-22
- Owner: Repository owner

## Context

The game needs headless deterministic scenarios, up to 32 actors, browser rendering, accessible setup and result UI, and fast static deployment. Storing authoritative state in PixiJS display objects would couple game results to rendering and make replay and bot simulation difficult. A UI framework or general ECS would add a second ownership model before the product needs one.

## Decision

Implement authoritative rules as pure TypeScript with no PixiJS, DOM, browser clock, ambient randomness, audio, or network dependency. The simulation accepts versioned commands and emits immutable render frames and ordered events.

Use PixiJS with a WebGL preference for the world. Use semantic DOM and CSS for setup, settings, results, errors, focus, and accessibility text. The application layer coordinates input, bots, fixed ticks, lifecycle, replay, and both presentation surfaces. No general UI framework, game engine, physics engine, or ECS is adopted for the MVP.

## Consequences

- Headless replay, scenario, bot, and soak testing can run without a browser.
- Rendering and audio defects cannot choose a winner.
- The application must maintain explicit conversion and lifecycle boundaries.
- Snapshot allocation and application-layer growth must be measured before optimization or abstraction.

## Revisit When

- Approved product UI grows enough that framework-free DOM state becomes a measured defect source.
- Snapshot transformation is a demonstrated performance bottleneck.
- A second renderer or server simulation becomes an approved consumer.
- Direct circular physics cannot meet the gray-box correctness and performance gates.
