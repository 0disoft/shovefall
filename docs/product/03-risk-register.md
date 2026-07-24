# Risk Register

- Status: Active for MVP submission
- Owner: Repository owner
- Product source of truth: [02-spec.md](02-spec.md)
- Delivery plan: [01-roadmap.md](01-roadmap.md)
- Human evidence procedure: [04-playtest-protocol.md](04-playtest-protocol.md)

## Rating Model

`Likelihood` and `Impact` use `Low`, `Medium`, or `High`. Status is `Open`, `Monitoring`,
`Mitigated`, or `Accepted`. Automated evidence may lower implementation risk, but only observed
human play can close a human-readability or fun risk.

## Active Risks

| ID | Risk | Likelihood | Impact | Current controls and evidence | Trigger and response | Status |
|---|---|---|---|---|---|---|
| R-01 | The deterministic combat is correct but does not feel responsive or satisfying to a person. | Medium | High | Fixed-tick scenario tests cover shove, dodge, stumble, simultaneous impulses, and falling. | Any repeated report of delayed input, weak impact, or unclear dodge outcome starts a same-seed reproduction before timing changes. | Open |
| R-02 | Bot rounds end quickly, so the default human round may feel too short after a few attempts. | High | High | Slow/Normal/Fast collapse is selectable. Paired bot seeds show useful aggregate separation, not a per-round guarantee. | Use the paired human pacing session. Prefer changing collapse cadence or arena pressure before participant count or unrelated mechanics. | Open |
| R-03 | Edge-weighted items become either ignored bait or an overpowering reward instead of a chosen risk. | Medium | High | The selector chooses edge, near-edge, or interior with topology-independent 3:2:1 band weights, then samples uniformly within that band; tests retain every band after the eight-lake expansion. Controlled grants reject an obvious fixed-sample skew. | Review when several people describe the same pickup as unavoidable, unreadable, or never worth pursuing. Separate placement, telegraph, and effect-strength causes. | Open |
| R-04 | Heavy mass or Iron Boots quietly dominates human play despite broad bot screens passing. | Medium | High | Accepted base-mass range is `0.85..1.25`; square-root impulse scaling and retuned passives pass controlled regression screens. These samples do not establish human balance. | Do not tune from the current winner table alone. Require repeated human behavior plus a controlled rerun that isolates the suspected variable. | Monitoring |
| R-05 | At the fixed 50 participants the player loses their identity or cannot explain the collision that killed them. | High | High | The human keeps its diamond and guard ring; 25+ bot rendering drops redundant decoration while retaining action color, facing, mass-scaled size, and stumble marks. The 48×40 headless profile passes, and the browser command now rejects host-contaminated samples before measuring; human readability remains unproven. | Test the exact 50-player candidate. Reduce nonessential effects, camera shake, or bot decoration before changing rules or the human marker. | Open |
| R-06 | Final art hides warning states, action windows, items, or the human marker. | Medium | High | Coal-Twilight is implemented with semantic tokens, procedural geometry, and reduced-motion behavior; automated smoke proves rendering, not first-time human readability. | Reject any visual pass that needs color alone, changes hit timing, or makes a gray-box-readable event harder to parse. | Open |
| R-07 | Generated or third-party assets create provenance, license, size, or loading problems. | Medium | Medium | Procedural visuals and audio are playable fallbacks; metered image generation is not required. | Record prompt/source, model or license, modifications, dimensions, and fallback before an asset enters the build. Optimize only approved assets. | Open |
| R-08 | Local Chrome evidence is mistaken for physical-device, cross-browser, hosted-CI, or deployed-site proof. | Medium | High | Validation documents name each proof boundary. [CI run 30055148110](https://github.com/0disoft/shovefall/actions/runs/30055148110) validated and deployed exact runtime SHA `c0ddda93e1d75520909c79888c342f4b57747d7f`; a cache-busted public Chrome session separately proved the active 50-player WebGL path with no browser log entries. Physical-device and cross-browser proof remain absent. | Before submission, capture a named-device browser matrix and final captures against the same runtime candidate; do not substitute local or hosted Chrome for those boundaries. | Open |
| R-09 | Balance tuning changes deterministic replay or content semantics without synchronized versions and fixtures. | Low | High | Product, simulation, content, and audit versions are explicit; replay fixtures and state hashes are checked. | Any rule, content, seed-policy, or replay change requires the owning version review, fixture regeneration, docs sync, and full configured validation. | Mitigated |
| R-10 | Contest pressure expands scope into more items, modes, or infrastructure before the core reversal is proven. | High | Medium | The roadmap makes human evidence, visual direction, and submission hardening the only active gates. | Reject features that do not fix a reproduced gate failure or materially improve the submission package. | Monitoring |

## Accepted Boundaries

- The fixed 50-participant round is intentionally dense, but it must keep deterministic rules,
  responsive input, visible warnings, a distinct human marker, and a recoverable result flow.
- Browser-only single-player means backend, API, authentication, database, migrations, and remote
  analytics risks are not applicable to the MVP.
- Bot-only statistics cannot prove fun, fairness, risky-pickup value, or first-time comprehension.
- Final art may remain partly procedural if generated assets do not improve the approved visual
  hierarchy.

## Review Cadence

Review this register after each external playtest batch, any physics or content change, visual-style
approval, exact-SHA hosted CI evidence, and final-host smoke. Close a risk only when its trigger can
no longer occur within the accepted MVP boundary or current evidence directly supports closure.
