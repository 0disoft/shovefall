# Asset Provenance Ledger

- Status: Active; eighteen generated PNG assets and one repository-owned SVG atlas ship with fallbacks
- Owner: Repository owner
- Visual gate: [../product/01-roadmap.md](../product/01-roadmap.md)
- Frontend boundary: [../frontend/FRONTEND_DESIGN.md](../frontend/FRONTEND_DESIGN.md)

## Current Inventory

Repository inspection on 2026-07-27 found two accepted owner-generated PNG atlases, one
Codex-generated terrain atlas, fifteen Codex-generated single sprites, and one repository-owned
skill icon SVG atlas. Six earlier multi-asset
outputs were rejected before intake because their visible checkerboard was baked into
opaque RGB pixels rather than represented by alpha transparency.

| ID | Shipped surface | Implementation | External source | License / terms | Attribution |
|---|---|---|---|---|---|
| `procedural-world` | Arena, participants, items, and effects | Repository-owned PixiJS drawing code | None | Repository code terms | None |
| `procedural-shell` | Layout, controls, and telemetry | Repository-owned HTML and CSS using system fonts | None | Repository code terms | None |
| `procedural-audio` | Optional action cues | Repository-owned Web Audio oscillator synthesis | None | Repository code terms | None |
| `generated-character-variants` | Arena participants | `src/assets/generated/character-variants.png` | Owner-generated with ChatGPT image generation | OpenAI Terms of Use output-ownership clause; user remains responsible for the output | No service attribution requirement identified; generator is recorded here |
| `generated-item-icons` | Settings cards and map pickups | `src/assets/generated/item-icons.png` | Owner-generated with ChatGPT image generation | OpenAI Terms of Use output-ownership clause; user remains responsible for the output | No service attribution requirement identified; generator is recorded here |
| `repository-skill-icons` | Starting-skill cards | `src/assets/generated/skill-icons.svg` | Repository-owned vector drawing | None | None |
| `generated-pirate-galleon` | Eight offshore pirate-ship positions | `src/assets/generated/pirate-ship-galleon.png` | Codex built-in image generation plus local chroma-key removal | OpenAI Terms of Use output-ownership clause; user remains responsible for the output | No service attribution requirement identified; generator and processing are recorded here |
| `generated-cannonball-projectile` | Cannon trajectories | `src/assets/generated/cannonball-projectile.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |
| `generated-lethal-boulder` | Protected-core rock trajectories | `src/assets/generated/lethal-boulder.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |
| `generated-impact-explosion` | Bomb and rock impacts | `src/assets/generated/impact-explosion.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |
| `generated-seawater-impact` | Flooded-tile impacts | `src/assets/generated/seawater-impact.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |
| `generated-island-terrain` | Stable coast and warning tiles | `src/assets/generated/island-terrain-atlas.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |
| `generated-tree-obstacle` | Solid inland tree obstacles | `src/assets/generated/tree-obstacle.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |
| `generated-skill-vfx` | Eight active skill casts, hits, persistent zones, and shields; one retired source sprite retained outside the runtime map | `src/assets/generated/skill-vfx-*.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |

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
| Modifications | Renamed; no pixel edits or recompression; sixteen measured alpha bounds become PixiJS texture frames. The four bottom-row frames retain extra transparent headroom and a compensating display scale so hats and round heads are not clipped while visible character size stays aligned with the other twelve variants. |
| Technical contract | 512×512 RGBA PNG, 251,392 bytes, SHA-256 `078523241d2bd0cf389fb63eeaf646930913d8a1e8cdba26d07df8bd404e4524`; Lanczos-downsampled from the accepted source; asynchronous same-origin load; procedural participant geometry remains the failure fallback |
| Reviewer decision | Accepted 2026-07-24; final 50-player readability remains subject to browser capture and human review |

### `generated-item-icons`

| Field | Record |
|---|---|
| Asset ID and repository path | `generated-item-icons`; `src/assets/generated/item-icons.png` |
| Type and purpose | Transparent PNG atlas; eight active item illustrations plus one retired Hook illustration |
| Source | Repository owner generated the selected output with ChatGPT image generation |
| Snapshot | Received and inspected 2026-07-24 |
| Copy extent | Selected generated output copied verbatim into the repository; eight active alpha regions are referenced |
| Rights evidence | [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) output-ownership clause, with the same user-responsibility and non-uniqueness limits |
| Attribution decision | No attribution requirement was identified in the cited ownership clause; voluntary generator provenance remains in this ledger |
| Prompt/source record | `docs/assets/prompts/item-icons.txt` |
| Modifications | Renamed; no pixel edits or recompression; CSS background windows and PixiJS texture frames isolate the eight active icons |
| Technical contract | 512×512 RGBA PNG, 288,460 bytes, SHA-256 `e33ed70348e83616ea28e5bcf5b9096a359678fb09a68a8962aea738b9274782`; Lanczos-downsampled from the accepted source; text labels remain usable if CSS art fails, and procedural pickup symbols remain the canvas fallback |
| Reviewer decision | Accepted 2026-07-24; compression and physical-device readability remain pending |

### `repository-skill-icons`

| Field | Record |
|---|---|
| Asset ID and repository path | `repository-skill-icons`; `src/assets/generated/skill-icons.svg` |
| Type and purpose | Transparent SVG strip; eight active skill-card icons and one retired Stone Prison cell selected through CSS background windows |
| Source | Repository-owned vector drawing authored for the current skill definitions; no external image source |
| Snapshot | Authored and inspected 2026-07-26 |
| Copy extent | Original repository asset |
| Rights evidence | Repository code terms; no third-party source or generator output used |
| Attribution decision | None |
| Prompt/source record | The unused replacement-raster brief remains outside the repository at `prompts/shovefall-combat-skill-icons-v2.txt`; it is not provenance for this SVG |
| Modifications | None; CSS scales one 64×64 cell from the strip for each of the eight active cards |
| Technical contract | 576×64 transparent SVG, 4,446 bytes, SHA-256 `82e45d842eabfdec414cd8eb036cef0f0a8ce8f0e941690aa721121258f31a68`; skill names and full text remain visible if the decorative image fails |
| Reviewer decision | Accepted 2026-07-26 as the lightweight current asset; final browser-scale readability remains pending |

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
| Technical contract | 512×512 RGBA PNG, 247,227 bytes, SHA-256 `4f16e0b4dfe8c469835121a81d766deb31a0a94fca78cdcd4c03732e4265425b`; Lanczos-downsampled after alpha extraction; all four corner alpha values remain zero; asynchronous same-origin load with procedural ship fallback |
| Reviewer decision | Accepted 2026-07-24 after alpha and visual-edge inspection; final on-canvas scale, rotation, payload, and human readability remain pending |

### Projectile sprites

| Asset | Prompt | Processing and technical contract | Decision |
|---|---|---|---|
| `src/assets/generated/cannonball-projectile.png` | `docs/assets/prompts/cannonball-projectile-chroma.txt` | Built-in generation; border key `#04f90b`; soft matte, despill, and Lanczos downsample; 512×512 RGBA, 84,195 bytes, SHA-256 `158614de423742297b90fd82e9c970efdcdc02cd10f56e571c572fac2062cdc9`; transparent corners | Accepted 2026-07-24; rotated and scaled over the procedural trajectory and warning fallback |
| `src/assets/generated/lethal-boulder.png` | `docs/assets/prompts/lethal-boulder-chroma.txt` | Built-in generation; border key `#03f903`; soft matte, despill, and Lanczos downsample; 512×512 RGBA, 206,011 bytes, SHA-256 `878a37f2d3e8ae9a21c83af05b9782ef0e812caaedc0c745fa0c85cf24624199`; transparent corners | Accepted 2026-07-24; rotated and scaled over the procedural lethal-rock fallback |
| `src/assets/generated/impact-explosion.png` | `docs/assets/prompts/impact-explosion-chroma.txt` | Built-in generation; border key `#03f905`; soft matte, despill, and Lanczos downsample; 512×512 RGBA, 132,099 bytes, SHA-256 `43c108796a0a098107e3c401439954563c8f2f86cb22c86c45a5327a38ebf213`; transparent corners | Accepted 2026-07-24; fades over Bomb and rock-impact geometry |
| `src/assets/generated/seawater-impact.png` | `docs/assets/prompts/seawater-impact-chroma.txt` | Built-in generation; border key `#fc03fa`; soft matte, despill, and Lanczos downsample; 512×512 RGBA, 121,260 bytes, SHA-256 `8bfe7107ecab16ed5ac81b1ff1a58da5b3651cc339b9b68194546f6ddbacd41e`; transparent corners | Accepted 2026-07-24; fades over tile-flood geometry |

### `generated-island-terrain`

| Field | Record |
|---|---|
| Asset ID and repository path | `generated-island-terrain`; `src/assets/generated/island-terrain-atlas.png` |
| Type and purpose | Transparent 4×4 PNG atlas; deterministic grass, coast, corner, water, and warning tile presentation |
| Source | Codex built-in image generation using the rejected opaque terrain sheet only as a style reference |
| Snapshot | Generated, processed, and inspected 2026-07-24 |
| Copy extent | New generated atlas; repository-owned frame metadata selects sixteen cells without altering simulation topology |
| Rights evidence | [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) output-ownership clause, with user responsibility and non-uniqueness limits |
| Attribution decision | No attribution requirement was identified in the cited ownership clause; voluntary generator provenance remains in this ledger |
| Prompt/source record | `docs/assets/prompts/island-terrain-atlas-magenta.txt` |
| Modifications | Built-in output used a flat magenta background; the installed image-generation helper sampled border key `#fb02fa`, applied soft matte and despill, and wrote alpha PNG |
| Technical contract | 1254×1254 RGBA PNG, 1,977,027 bytes, SHA-256 `6b8832ed16393d654895ff6e3fc45a166192215271ae9eae44629ab66c4a2bc9`; transparent corners; asynchronous same-origin load; procedural tile geometry remains beneath the atlas fallback |
| Reviewer decision | Accepted 2026-07-24 after alpha and visual-edge inspection; thirteen local production Chrome paths pass with camera-space terrain culling below 500 live sprites, while final coast alignment remains pending human capture review |

### `generated-tree-obstacle`

| Field | Record |
|---|---|
| Asset ID and repository path | `generated-tree-obstacle`; `src/assets/generated/tree-obstacle.png` |
| Type and purpose | Transparent single-sprite PNG; deterministic solid trees rendered in arena depth order |
| Source | Codex built-in image generation requested by the repository owner |
| Snapshot | Generated, processed, and inspected 2026-07-25 |
| Copy extent | Newly generated single tree sprite reused for every deterministic tree obstacle |
| Rights evidence | [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) output-ownership clause, with user responsibility and non-uniqueness limits |
| Attribution decision | No attribution requirement was identified in the cited ownership clause; voluntary generator provenance remains in this ledger |
| Prompt/source record | `docs/assets/prompts/tree-obstacle-magenta.txt` |
| Modifications | Built-in output used a flat magenta background; local border-color chroma key, soft alpha edge, and magenta despill produced the shipped RGBA PNG |
| Technical contract | 1254×1254 RGBA PNG, 1,215,394 bytes, SHA-256 `1fca60d38063924015f8c9bb81059e8c20e202f5d28964a03e20c39b50aa023a`; alpha-zero corners; asynchronous same-origin load; procedural tree geometry remains the load-failure fallback |
| Reviewer decision | Accepted 2026-07-25 after alpha and edge inspection; public-scale occlusion and final browser capture remain pending |

### `generated-skill-vfx`

| Field | Record |
|---|---|
| Asset ID and repository path | `generated-skill-vfx`; eight active and one retired `src/assets/generated/skill-vfx-*.png` files |
| Type and purpose | Transparent single-sprite PNGs for all eight active reusable skills; transient casts and hits reuse bounded sprites, Meteor Mark and Frost Field decorate persistent zones, and Aegis remains visible while shield health remains |
| Source | Codex built-in image generation requested by the repository owner |
| Snapshot | Generated, processed, and inspected 2026-07-27 |
| Rights evidence | [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) output-ownership clause, with user responsibility and non-uniqueness limits |
| Attribution decision | No attribution requirement was identified in the cited ownership clause; voluntary generator provenance remains in this ledger |
| Prompt/source record | [prompts/skill-vfx-chroma.md](prompts/skill-vfx-chroma.md) |
| Modifications | Each built-in output used a flat green background; the installed image-generation helper sampled its border key, applied soft matte and despill, then Pillow cropped the visible alpha bounds and Lanczos-downsampled the result into a padded 512×512 RGBA canvas |
| Technical contract | Eight active 512×512 RGBA PNGs totaling 1,393,704 bytes; all four corners are alpha zero; asynchronous same-origin loading; at most fourteen transient skill sprites in the 25-plus-participant mode; procedural skill geometry remains the load-failure and targeting fallback |
| Reviewer decision | Accepted 2026-07-27 after alpha, corner, coverage, and visual-edge inspection; final live combat scale and simultaneous-effect readability remain browser and human-review gates |

| Asset | Bytes | SHA-256 |
|---|---:|---|
| `skill-vfx-force-palm.png` | 195,007 | `f387e20a508b4db7c4bab7c942f279814728011176179de1b8a178f9d32908a5` |
| `skill-vfx-blink-step.png` | 113,482 | `8872998feba75d5a1cf82f0e2141b0bfae2f750dc9bf245162cafb060bbf89fd` |
| `skill-vfx-arc-bolt.png` | 118,575 | `b08fc8fbfd597f8e41dfeb9079a255b9532edf7daf8f8968d2871fb582850faf` |
| `skill-vfx-chain-bind.png` | 86,354 | `60c3d47294df69e4a019c52d26ac28ea42274c79484028fa94c1297deb15f5dd` |
| `skill-vfx-stone-prison.png` | 269,838 | `f20965b3c2a17fb028d314f0bdd86854c96e562d1e04b686a4f9d42db513a831` (retired source asset; not loaded by the game) |
| `skill-vfx-meteor-mark.png` | 193,167 | `990a2d78139d56621384308b2018bc94f435be00a5f048529cf511b2fb210452` |
| `skill-vfx-frost-field.png` | 283,939 | `524ae0e576b4efcd38dc910cc764c5b11e93cc9495e0f0687cc4dd4c50130c7a` |
| `skill-vfx-tidal-charge.png` | 164,963 | `a811ea52e01e205673fd512a3fe7d1f61928c0f8fe74be8b10501d66331a24a6` |
| `skill-vfx-aegis.png` | 238,217 | `670d2286808489e52d2ea94f4235b0ae3f567ebb051ecbd05015fa9a7d8ae84c` |

The selected images contain no visible trademark, signature, watermark, named copyrighted
character, or named living-artist imitation. A metadata probe reported no container tags. This is a
repository review record, not a legal conclusion.

## Rejected Generated Outputs

The original multi-ship sheet, cannon-collapse VFX, lethal-rock VFX, island terrain sheet, character
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
