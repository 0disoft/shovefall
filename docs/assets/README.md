# Asset Provenance Ledger

- Status: Active; five generated PNG assets ship with procedural fallbacks
- Owner: Repository owner
- Visual gate: [../product/01-roadmap.md](../product/01-roadmap.md)
- Frontend boundary: [../frontend/FRONTEND_DESIGN.md](../frontend/FRONTEND_DESIGN.md)

## Current Inventory

Repository inspection on 2026-07-24 found two accepted owner-generated PNG atlases and three
Codex-generated single sprites. Six earlier multi-asset outputs
generated outputs were rejected before intake because their visible checkerboard was baked into
opaque RGB pixels rather than represented by alpha transparency.

| ID | Shipped surface | Implementation | External source | License / terms | Attribution |
|---|---|---|---|---|---|
| `procedural-world` | Arena, participants, items, and effects | Repository-owned PixiJS drawing code | None | Repository code terms | None |
| `procedural-shell` | Layout, controls, and telemetry | Repository-owned HTML and CSS using system fonts | None | Repository code terms | None |
| `procedural-audio` | Optional action cues | Repository-owned Web Audio oscillator synthesis | None | Repository code terms | None |
| `generated-character-variants` | Arena participants | `src/assets/generated/character-variants.png` | Owner-generated with ChatGPT image generation | OpenAI Terms of Use output-ownership clause; user remains responsible for the output | No service attribution requirement identified; generator is recorded here |
| `generated-item-icons` | Settings cards and map pickups | `src/assets/generated/item-icons.png` | Owner-generated with ChatGPT image generation | OpenAI Terms of Use output-ownership clause; user remains responsible for the output | No service attribution requirement identified; generator is recorded here |
| `generated-pirate-galleon` | Eight offshore pirate-ship positions | `src/assets/generated/pirate-ship-galleon.png` | Codex built-in image generation plus local chroma-key removal | OpenAI Terms of Use output-ownership clause; user remains responsible for the output | No service attribution requirement identified; generator and processing are recorded here |
| `generated-cannonball-projectile` | Cannon trajectories | `src/assets/generated/cannonball-projectile.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |
| `generated-lethal-boulder` | Protected-core rock trajectories | `src/assets/generated/lethal-boulder.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |

Dependencies are tracked by `package.json` and `bun.lock`; this ledger owns media and creative
assets, not dependency license inventory.

## Accepted Generated Assets

### `generated-character-variants`

| Field | Record |
|---|---|
| Asset ID and repository path | `generated-character-variants`; `src/assets/generated/character-variants.png` |
| Type and purpose | Transparent PNG atlas; sixteen participant appearances rendered cyclically for the fixed 50-player arena |
| Source | Repository owner generated the selected output with ChatGPT image generation |
| Snapshot | Received and inspected 2026-07-24 |
| Copy extent | Selected generated output copied verbatim into the repository; runtime crops are repository-owned atlas metadata |
| Rights evidence | [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) state that, as between the user and OpenAI and to the extent permitted by law, the user owns output; similarity and third-party-right limitations still apply |
| Attribution decision | No attribution requirement was identified in the cited ownership clause; voluntary generator provenance remains in this ledger |
| Prompt/source record | `docs/assets/prompts/character-variants.txt` |
| Modifications | Renamed; no pixel edits or recompression; sixteen measured alpha bounds become PixiJS texture frames |
| Technical contract | 1024×1024 RGBA PNG, 1,758,793 bytes, SHA-256 `d0bf8770a78c6758f865dfa5029e6bb901976215563ff07d6ae1a4a25d28a2ca`; asynchronous same-origin load; procedural participant geometry remains the failure fallback |
| Reviewer decision | Accepted 2026-07-24; final 50-player readability remains subject to browser capture and human review |

### `generated-item-icons`

| Field | Record |
|---|---|
| Asset ID and repository path | `generated-item-icons`; `src/assets/generated/item-icons.png` |
| Type and purpose | Transparent PNG atlas; nine selected item illustrations for settings cards and map pickups |
| Source | Repository owner generated the selected output with ChatGPT image generation |
| Snapshot | Received and inspected 2026-07-24 |
| Copy extent | Selected generated output copied verbatim into the repository; only nine documented alpha regions are referenced |
| Rights evidence | [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) output-ownership clause, with the same user-responsibility and non-uniqueness limits |
| Attribution decision | No attribution requirement was identified in the cited ownership clause; voluntary generator provenance remains in this ledger |
| Prompt/source record | `docs/assets/prompts/item-icons.txt` |
| Modifications | Renamed; no pixel edits or recompression; CSS background windows and PixiJS texture frames isolate the nine selected icons |
| Technical contract | 1024×1024 RGBA PNG, 1,929,395 bytes, SHA-256 `1fa86a2fa329b9b992e01c9722b402ec25d8c30a70ca480060e7194f6dd46ba8`; text labels remain usable if CSS art fails, and procedural pickup symbols remain the canvas fallback |
| Reviewer decision | Accepted 2026-07-24; compression and physical-device readability remain pending |

### `generated-pirate-galleon`

| Field | Record |
|---|---|
| Asset ID and repository path | `generated-pirate-galleon`; `src/assets/generated/pirate-ship-galleon.png` |
| Type and purpose | Transparent single-sprite PNG; rotated and slightly rescaled across the eight offshore ship positions |
| Source | Codex built-in image generation, requested and approved by the repository owner after multi-sprite transparency failures |
| Snapshot | Generated, processed, and inspected 2026-07-24 |
| Copy extent | Newly generated single sprite; repository runtime reuses it as eight presentation instances |
| Rights evidence | [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) output-ownership clause, with user responsibility and non-uniqueness limits |
| Attribution decision | No attribution requirement was identified in the cited ownership clause; voluntary generator provenance remains in this ledger |
| Prompt/source record | `docs/assets/prompts/pirate-ship-galleon-chroma.txt` |
| Modifications | Built-in output used a flat green background; the installed image-generation helper sampled border key `#03f804`, applied soft matte and despill, and wrote alpha PNG; no manual repainting |
| Technical contract | 1254×1254 RGBA PNG, 1,323,961 bytes, SHA-256 `5b59d0f3701738d0aca1eabe9ed995fa62572102e0c8a6ba8fc7c51e13b32b8b`; all four corner alpha values are zero; 984,556 pixels are fully transparent and 13,864 partially transparent; asynchronous same-origin load with procedural ship fallback |
| Reviewer decision | Accepted 2026-07-24 after alpha and visual-edge inspection; final on-canvas scale, rotation, payload, and human readability remain pending |

### Projectile sprites

| Asset | Prompt | Processing and technical contract | Decision |
|---|---|---|---|
| `src/assets/generated/cannonball-projectile.png` | `docs/assets/prompts/cannonball-projectile-chroma.txt` | Built-in generation; border key `#04f90b`; soft matte and despill; 1254×1254 RGBA, 432,427 bytes, SHA-256 `85178b76c572821e907c654190e14d541ced4e2e0ed55141f3d248403e9a3b04`; transparent corners | Accepted 2026-07-24; rotated and scaled over the procedural trajectory and warning fallback |
| `src/assets/generated/lethal-boulder.png` | `docs/assets/prompts/lethal-boulder-chroma.txt` | Built-in generation; border key `#03f903`; soft matte and despill; 1254×1254 RGBA, 1,173,264 bytes, SHA-256 `8d2829c42c8f6a8ee1e95830296f2e11abdca82cecd38823c606501b23cbe48f`; transparent corners | Accepted 2026-07-24; rotated and scaled over the procedural lethal-rock fallback |

The selected images contain no visible trademark, signature, watermark, named copyrighted
character, or named living-artist imitation. A metadata probe reported no container tags. This is a
repository review record, not a legal conclusion.

## Rejected Generated Outputs

The original multi-ship sheet, cannon-collapse VFX, lethal-rock VFX, island terrain, character
actions, and world props remain outside this repository. Although their visible canvas imitated transparency, the
files were opaque RGB PNGs with a baked checkerboard. They are not valid game sprites and were not
silently promoted. Replacement prompts require a real RGBA alpha channel, alpha-zero corner and
gutter pixels, fixed atlas cells, and explicitly forbid drawing a checkerboard.

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
