# System Boundary

- Status: Accepted
- Owner: Repository owner

## Owned Here

This repository owns the static Shovefall browser client, pure simulation, rule-based bots, PixiJS world presentation, semantic DOM shell, local assets, tests, build configuration, replay fixtures, and release evidence.

The simulation owns authoritative round state and rules. It receives versioned commands and produces immutable render frames and events. The application layer owns lifecycle, fixed-tick scheduling, input normalization, bot scheduling, replay capture, and coordination between presentation layers. PixiJS owns world drawing only. DOM and CSS own setup, settings, results, fatal errors, focus, and accessibility text.

## Excluded

The MVP has no backend, database, account, authorization surface, remote model, analytics SDK, runtime secret, or application network API. `contracts/backend-api/openapi.yaml` remains a non-runtime placeholder and cannot be treated as an implemented dependency.

## Dependency Direction

```text
DOM input ----\
               -> application -> simulation -> RenderFrameV1 / SimulationEventV1
bot decision -/                       |                     |
                                      +-> replay hash       +-> DOM/PixiJS/audio
```

Simulation modules cannot import PixiJS, DOM APIs, wall clocks, ambient randomness, presentation code, or platform adapters. Presentation consumes read-only snapshots and cannot mutate world entities.

## Trust and Failure Boundary

All browser-delivered code and assets are public and untrusted as an authority. No secret belongs in the bundle. Replay JSON is untrusted input even when used only by development tools, so size, type, version, bounds, ordering, actor ownership, and hashes are validated before or during replay.

A render, audio, or focus failure may pause or stop the application, but it cannot choose a simulation result. A malformed command or incompatible replay fails explicitly rather than silently changing game rules.
