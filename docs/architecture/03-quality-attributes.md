# Quality Attributes

- Status: Accepted initial contract
- Owner: Repository owner

## Determinism and Fairness

The same build, normalized configuration, master seed, and command sequence must produce the same quantized state hash and ordered gameplay facts on the supported engine range. Collision, dodge, mass, support, and winner decisions contain no probability roll. Same-tick shove impulses are collected before application so array order cannot silently select a winner.

## Readability and Recovery

Windup, active shove, recovery, dodge, stumble, unsupported grace, falling, and the human participant require visible non-color-only signals before the gray-box gate can pass. Fatal presentation failure leaves a DOM recovery path. A new round owns a new world; completed worlds are not resurrected.

## Performance

Rules run at 60 fixed ticks per second. Normal modes target 60 rendered frames per second and Mayhem targets at least 45 on the named desktop baseline. Details and evidence ownership live in `docs/engineering/03-performance-budget.md`.

## Security and Privacy

The static bundle contains no secrets and performs no application analytics, replay upload, remote inference, advertising, account, or authorization work. Replay JSON is bounded untrusted input. Asset and dependency provenance must remain reviewable.

## Maintainability

Product rules, runtime order, tuning, simulation versions, replay fixtures, and validations each have one named owner. PixiJS cannot leak into authoritative simulation types. A new framework, physics engine, runtime service, or persistent format requires an explicit decision rather than an incidental import.
