# Asset Provenance Ledger

- Status: Active; thirty-one generated PNG assets ship with text or procedural fallbacks
- Owner: Repository owner
- Visual gate: [../product/01-roadmap.md](../product/01-roadmap.md)
- Frontend boundary: [../frontend/FRONTEND_DESIGN.md](../frontend/FRONTEND_DESIGN.md)

## Current Inventory

Repository inspection on 2026-07-29 found two accepted owner-generated PNG atlases, four
Codex-generated character-motion atlases, one Codex-generated terrain atlas, sixteen Codex-generated single sprites, and six active Codex-generated
skill icon PNGs. Six earlier multi-asset
outputs were rejected before intake because their visible checkerboard was baked into
opaque RGB pixels rather than represented by alpha transparency.

| ID | Shipped surface | Implementation | External source | License / terms | Attribution |
|---|---|---|---|---|---|
| `procedural-world` | Arena, participants, items, and effects | Repository-owned PixiJS drawing code | None | Repository code terms | None |
| `procedural-shell` | Layout, controls, and telemetry | Repository-owned HTML and CSS using system fonts | None | Repository code terms | None |
| `procedural-audio` | Optional action cues | Repository-owned Web Audio oscillator synthesis | None | Repository code terms | None |
| `hyp-catch-me-if-you-can` | Continuous menu and arena background music | `src/assets/audio/hyp-catch-me-if-you-can.mp3` | [HYP MUSIC official distribution](https://bgmdesign.tistory.com/1) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ko); official page permits commercial use and requires attribution | `HYP - Catch Me If You Can`; `BGM provided by HYP MUSIC`; `https://youtu.be/LrTkfYqNJFU` |
| `generated-character-variants` | Arena participants | `src/assets/generated/character-variants.png` | Owner-generated with ChatGPT image generation | OpenAI Terms of Use output-ownership clause; user remains responsible for the output | No service attribution requirement identified; generator is recorded here |
| `generated-character-motion` | Participant idle, walk, cast, and hit states | `src/assets/generated/character-motion-1.png` through `character-motion-4.png` | Codex built-in image generation plus local chroma-key removal | OpenAI Terms of Use output-ownership clause; user remains responsible for the output | Generator and processing recorded here |
| `generated-item-icons` | Settings cards and map pickups | `src/assets/generated/item-icons.png` | Owner-generated with ChatGPT image generation | OpenAI Terms of Use output-ownership clause; user remains responsible for the output | No service attribution requirement identified; generator is recorded here |
| `generated-skill-icons` | Starting-skill cards | `src/assets/generated/skill-icon-*.png` | Owner-generated with ChatGPT image generation plus local chroma-key removal | OpenAI Terms of Use output-ownership clause; user remains responsible for the output | No service attribution requirement identified; generator and processing are recorded here |
| `generated-pirate-galleon` | Eight offshore pirate-ship positions | `src/assets/generated/pirate-ship-galleon.png` | Codex built-in image generation plus local chroma-key removal | OpenAI Terms of Use output-ownership clause; user remains responsible for the output | No service attribution requirement identified; generator and processing are recorded here |
| `generated-treasure-ship` | Orbiting treasure delivery ship | `src/assets/generated/treasure-ship.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |
| `generated-cannonball-projectile` | Cannon trajectories | `src/assets/generated/cannonball-projectile.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |
| `generated-lethal-boulder` | Protected-core rock trajectories | `src/assets/generated/lethal-boulder.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |
| `generated-impact-explosion` | Bomb and rock impacts | `src/assets/generated/impact-explosion.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |
| `generated-seawater-impact` | Flooded-tile impacts | `src/assets/generated/seawater-impact.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |
| `generated-island-terrain` | Stable coast and warning tiles | `src/assets/generated/island-terrain-atlas.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |
| `generated-tree-obstacle` | Solid inland tree obstacles | `src/assets/generated/tree-obstacle.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |
| `generated-skill-vfx` | Seven active skill casts, hits, persistent zones, and shields; two retired source sprites retained outside the runtime map | `src/assets/generated/skill-vfx-*.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |
| `generated-status-stunned` | Stunned-state feedback above participant heads | `src/assets/generated/status-stunned.png` | Codex built-in image generation plus local chroma-key removal | Same output-ownership evidence | Generator and processing recorded here |

Dependencies are tracked by `package.json` and `bun.lock`; this ledger owns media and creative
assets, not dependency license inventory.

### `hyp-catch-me-if-you-can`

| Field | Record |
|---|---|
| Asset ID and repository path | `hyp-catch-me-if-you-can`; `src/assets/audio/hyp-catch-me-if-you-can.mp3` |
| Type and purpose | 3:39 stereo MP3; continuous same-origin background music from the first browser gesture through menu and gameplay |
| Source | The MP3 attachment published on the composer's [official distribution page](https://bgmdesign.tistory.com/1), not a YouTube extraction |
| License and use record | The source page identifies CC BY 4.0, permits commercial use and monetization, requires attribution, and prohibits reselling or distributing an edited music work as a standalone product |
| Required attribution | `HYP - Catch Me If You Can`; `BGM provided by HYP MUSIC`; `https://youtu.be/LrTkfYqNJFU` |
| Modifications | Audio content is not remixed; the official MP3 was transcoded to 44.1 kHz stereo 112 kbps MP3 and source metadata was replaced with title and artist metadata to reduce the static-site payload |
| Technical contract | 3,075,381 bytes; duration 219.611429 seconds; SHA-256 `059F4AF8E5A354EEABCBA7D092C2A30CE44DDF9C559A5E5AB79B1CABBE8F6124`; looped by one `HTMLAudioElement`; missing or rejected playback never blocks the game |
| Reviewer decision | Accepted 2026-07-30 with visible settings credit and repository provenance; physical-device loudness and browser codec coverage remain manual gates |

## Accepted Generated Assets

### `generated-character-variants`

| Field | Record |
|---|---|
| Asset ID and repository path | `generated-character-variants`; `src/assets/generated/character-variants.png` |
| Type and purpose | Transparent PNG atlas; sixteen participant appearances retained as the fallback for the fixed 60-participant arena |
| Source | Repository owner generated the selected output with ChatGPT image generation |
| Snapshot | Received and inspected 2026-07-24 |
| Copy extent | Selected generated output copied verbatim into the repository; runtime crops are repository-owned atlas metadata |
| Rights evidence | [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) state that, as between the user and OpenAI and to the extent permitted by law, the user owns output; similarity and third-party-right limitations still apply |
| Attribution decision | No attribution requirement was identified in the cited ownership clause; voluntary generator provenance remains in this ledger |
| Prompt/source record | `docs/assets/prompts/character-variants.txt` |
| Modifications | Renamed; no pixel edits or recompression; sixteen measured alpha bounds become PixiJS texture frames. The four bottom-row frames retain extra transparent headroom and a compensating display scale so hats and round heads are not clipped while visible character size stays aligned with the other twelve variants. |
| Technical contract | 512×512 RGBA PNG, 251,392 bytes, SHA-256 `078523241d2bd0cf389fb63eeaf646930913d8a1e8cdba26d07df8bd404e4524`; Lanczos-downsampled from the accepted source; asynchronous same-origin load; procedural participant geometry remains the failure fallback |
| Reviewer decision | Accepted 2026-07-24; final 50-player readability remains subject to browser capture and human review |

### `generated-character-motion`

| Field | Record |
|---|---|
| Asset ID and repository paths | `generated-character-motion`; `src/assets/generated/character-motion-1.png` through `character-motion-4.png` |
| Type and purpose | Four transparent 4×4 PNG atlases; each atlas carries idle, walk, cast, and hit rows for four of the sixteen accepted participant identities |
| Source | Codex built-in image generation using the accepted static character atlas as the identity, style, camera, and palette reference |
| Snapshot | Generated, processed, and inspected 2026-07-28 |
| Rights evidence | [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) output-ownership clause, with user responsibility and non-uniqueness limits |
| Attribution decision | No service attribution requirement identified; voluntary generator provenance remains in this ledger |
| Prompt/source record | `docs/assets/prompts/character-motion-sheets-magenta.md` |
| Modifications | Four flat-magenta outputs were processed by the installed image-generation chroma helper with border sampling, soft matte, and despill, then resized with Pillow Lanczos to fixed 768×768 RGBA sheets. Transparent corners and non-empty alpha bounds are enforced by the repository intake script. |
| Runtime contract | Sixteen variants map to four fixed columns per sheet and four semantic rows. Damage events and action state choose frames without altering simulation. All four motion sheets must load before use; otherwise the original static atlas remains the fallback. |
| Reviewer decision | Accepted locally after grid, identity, pose, alpha-corner, and edge inspection; live 60-participant browser readability and payload performance remain pending gates |

| Asset | Bytes | SHA-256 |
|---|---:|---|
| `character-motion-1.png` | 407,570 | `d4fe8f210c245687b3f283cd3403346fd4103629c435c1db0dbcb915248f9094` |
| `character-motion-2.png` | 469,821 | `4c6106fa3f7be598cd9c5908864effaf56aca94066091dcb17cc63502342919d` |
| `character-motion-3.png` | 400,005 | `62630bbc84d0a0d1f1f9a9a2ab9c24ea3cbe4ed8f8fc95d63b1fa3d17d84b088` |
| `character-motion-4.png` | 492,291 | `f7a09d4361c5fd08add25160b378fc17e79153ca208ec7bf00fb563f44d9db7a` |

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

### `generated-skill-icons`

| Field | Record |
|---|---|
| Asset ID and repository paths | `generated-skill-icons`; six active `src/assets/generated/skill-icon-*.png` files |
| Type and purpose | Transparent 256×256 PNG cutouts used by the six starting-skill cards |
| Source | Codex built-in image generation, explicitly requested by the repository owner |
| Snapshot | Generated, processed, and inspected 2026-07-29 |
| Copy extent | Six individually generated single-object outputs; no sprite-sheet extraction |
| Rights evidence | [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) output-ownership clause, with user responsibility and non-uniqueness limits |
| Attribution decision | No service attribution requirement identified; voluntary generator provenance remains here |
| Prompt/source record | [prompts/skill-icons-magenta.md](prompts/skill-icons-magenta.md) |
| Modifications | Border-sampled green or magenta removal, soft matte, despill, one-pixel alpha contraction, residual key-color suppression, alpha-bound crop, Lanczos fit into a padded 256×256 canvas, and optimized PNG encoding |
| Technical contract | All six outputs are 256×256 RGBA PNGs with alpha-zero corners and at least 12px subject padding. Violet, gold, crimson, orange, blue-white, and emerald-gold palettes separate movement, projectile, control, impact, zone, and defense roles. The skill name and full effect text remain when decorative art fails. Total encoded size is 525,631 bytes. |
| Reviewer decision | Accepted locally after role-color separation, source-to-skill mapping, silhouette, alpha-corner, edge-spill, and at-scale inspection; final physical-device readability remains pending |

| Asset | Bytes | SHA-256 |
|---|---:|---|
| `skill-icon-blink-step.png` | 70,774 | `b035afbe1e74c7e0b4a38f6b6608b03eca146781d554ac2b1af0f8d14b73de8f` |
| `skill-icon-arc-bolt.png` | 81,556 | `d82581da678e147c10031d3b7c53a216829e233bfaaad69c5d7710742912c31f` |
| `skill-icon-chain-bind.png` | 126,535 | `1f4aae0d011b914b98f89699ed59056bcd0dacb3685ccf6582e15d7fc210dd42` |
| `skill-icon-meteor-mark.png` | 71,626 | `73f5b69d2e55310fab206daec20d9121d4d54c6d0b20541f28d1851d38b353d6` |
| `skill-icon-frost-field.png` | 96,487 | `40199231c0fb3d72555621a7a1baac0451d7643b38289e12a88262b0de934cb3` |
| `skill-icon-aegis.png` | 78,653 | `fbefd02cda0c20db8e06e56174c391194c19ceecfe1b031b7b7299e91825452f` |

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

### `generated-treasure-ship`

| Field | Record |
|---|---|
| Asset ID and repository path | `generated-treasure-ship`; `src/assets/generated/treasure-ship.png` |
| Type and purpose | Transparent single-sprite PNG; teal-and-gold treasure merchant vessel that launches visible item gifts |
| Source | Codex built-in image generation using the accepted pirate galleon only as a style, camera, material, and lighting reference |
| Snapshot | Generated, processed, and inspected 2026-07-28 |
| Copy extent | Newly generated distinct treasure vessel; not a recolor or crop of the pirate galleon |
| Rights evidence | [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) output-ownership clause, with user responsibility and non-uniqueness limits |
| Attribution decision | No attribution requirement was identified in the cited ownership clause; voluntary generator provenance remains in this ledger |
| Prompt/source record | `docs/assets/prompts/treasure-ship-magenta.txt` |
| Modifications | Built-in output used a flat magenta background; the installed image-generation helper sampled border key `#fb02fa`, applied soft matte and despill, then Pillow Lanczos-downsampled the result to 512×512 |
| Technical contract | 512×512 RGBA PNG, 353,105 bytes, SHA-256 `bd8412bbab08787f22367b1688758fca46eaa9909e350a3dd095a6c62f1b22fb`; all four corner alpha values are zero; asynchronous same-origin load; the procedural teal-and-gold vessel remains the load-failure fallback |
| Reviewer decision | Accepted 2026-07-28 after alpha, edge, silhouette, cargo-readability, and style inspection; final live browser scale remains pending |

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
| Asset ID and repository path | `generated-skill-vfx`; seven active and two retired `src/assets/generated/skill-vfx-*.png` files |
| Type and purpose | Transparent single-sprite PNGs for all seven active reusable skills; transient casts and hits reuse bounded sprites, Meteor Mark and Frost Field decorate persistent zones, and Aegis remains visible while shield health remains |
| Source | Codex built-in image generation requested by the repository owner |
| Snapshot | Generated, processed, and inspected 2026-07-27 |
| Rights evidence | [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) output-ownership clause, with user responsibility and non-uniqueness limits |
| Attribution decision | No attribution requirement was identified in the cited ownership clause; voluntary generator provenance remains in this ledger |
| Prompt/source record | [prompts/skill-vfx-chroma.md](prompts/skill-vfx-chroma.md) |
| Modifications | Each built-in output used a flat green background; the installed image-generation helper sampled its border key, applied soft matte and despill, then Pillow cropped the visible alpha bounds and Lanczos-downsampled the result into a padded 512×512 RGBA canvas |
| Technical contract | Seven active 512×512 RGBA PNGs; all four corners are alpha zero; asynchronous same-origin loading; at most fourteen transient skill sprites in the 25-plus-participant mode; procedural skill geometry remains the load-failure and targeting fallback |
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
| `skill-vfx-tidal-charge.png` | 164,963 | `a811ea52e01e205673fd512a3fe7d1f61928c0f8fe74be8b10501d66331a24a6` (retired source asset; not loaded by the game) |
| `skill-vfx-aegis.png` | 238,217 | `670d2286808489e52d2ea94f4235b0ae3f567ebb051ecbd05015fa9a7d8ae84c` |

### `generated-status-stunned`

| Field | Record |
|---|---|
| Asset ID and repository path | `generated-status-stunned`; `src/assets/generated/status-stunned.png` |
| Type and purpose | Transparent single-sprite PNG; golden stars and a cyan orbit displayed above every currently stunned participant |
| Source | Codex built-in image generation requested by the repository owner |
| Snapshot | Generated, processed, and inspected 2026-07-27 |
| Rights evidence | [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) output-ownership clause, with user responsibility and non-uniqueness limits |
| Attribution decision | No attribution requirement was identified in the cited ownership clause; voluntary generator provenance remains in this ledger |
| Prompt/source record | `docs/assets/prompts/status-stunned-chroma.txt` |
| Modifications | Flat green background removed with the installed chroma-key helper; soft matte and despill applied; result Lanczos-downsampled to the shipped canvas |
| Technical contract | 512×512 RGBA PNG, 82,902 bytes, SHA-256 `51c316df4e9f7db4c3c7d4431c8c6e2094c9388b3eb56abf3baad84a6c0289dc`; transparent corners; asynchronous same-origin load; no sprite is shown when the asset fails |
| Reviewer decision | Accepted 2026-07-27 after alpha and visual-edge inspection; final simultaneous-stun readability remains a browser and human-review gate |

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
