# Asset Provenance Ledger

- Status: Active; no external media assets currently shipped
- Owner: Repository owner
- Visual gate: [../product/01-roadmap.md](../product/01-roadmap.md)
- Frontend boundary: [../frontend/FRONTEND_DESIGN.md](../frontend/FRONTEND_DESIGN.md)

## Current Inventory

Repository inspection on 2026-07-23 found no project-owned PNG, JPEG, WebP, GIF, SVG, font, recorded
audio, or video file outside dependencies, generated output, and caches.

| ID | Shipped surface | Implementation | External source | License / terms | Attribution |
|---|---|---|---|---|---|
| `procedural-world` | Arena, participants, items, and effects | Repository-owned PixiJS drawing code | None | Repository code terms | None |
| `procedural-shell` | Layout, controls, and telemetry | Repository-owned HTML and CSS using system fonts | None | Repository code terms | None |
| `procedural-audio` | Optional action cues | Repository-owned Web Audio oscillator synthesis | None | Repository code terms | None |

Dependencies are tracked by `package.json` and `bun.lock`; this ledger owns media and creative
assets, not dependency license inventory.

## Intake Record

Add one row for every generated, commissioned, purchased, stock, third-party, or adapted asset
before it enters a public build:

| Field | Required value |
|---|---|
| Asset ID and repository path | Stable identifier and final shipped path |
| Type and purpose | Image, icon, font, audio, video, or animation; where it appears |
| Source | Generator/product and account tier, creator, marketplace, or direct URL |
| Snapshot | Generation date or source revision/download date |
| Copy extent | Original, verbatim, adaptation, translation, generated derivative, or loose reference |
| Rights evidence | License or generator terms and whether commercial/public web use is permitted |
| Attribution decision | Exact required text and placement, or evidence that none is required |
| Prompt/source record | Repository path to the exact prompt or source note; no private chat transcript |
| Modifications | Crop, cleanup, color, compression, animation, or compositing performed |
| Technical contract | Dimensions, format, encoded bytes, fallback, and reduced-motion behavior |
| Reviewer decision | Accepted, rejected, replaced, or pending, with date |

## AI-generated Asset Rules

- The implementation agent supplies a self-contained generation prompt to the repository owner;
  it does not invoke a metered image generator without a new user instruction.
- Record the exact generator/product, date, prompt, selected output, and material manual changes.
- Do not claim copyright ownership or license compatibility beyond the available service terms.
- Reject output that includes recognizable trademarks, signatures, watermarks, copyrighted
  characters, or suspicious imitation of a named living artist.
- Strip private metadata and verify file contents before committing. Never store account details,
  chat transcripts, or access tokens as provenance.

## Promotion Gate

An asset may ship only when its source and rights evidence are available, attribution is satisfied,
the visual direction approves it, same-origin loading and fallback are tested, and its bundle/frame
cost stays inside the project budgets. Unknown-license assets remain outside the repository.
