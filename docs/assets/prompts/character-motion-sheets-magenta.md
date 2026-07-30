# Character motion sheets

## Shared contract

- Use case: `stylized-concept`
- Asset: four 4×4 animation sheets for the sixteen accepted participant variants
- Reference: `src/assets/generated/character-variants.png`
- Columns: four character identities from one source-atlas row, left to right
- Rows: idle, walk, skill cast, hit reaction
- Camera: the existing 58-degree three-quarter top-down view
- Background: perfectly flat `#ff00ff`; no grid, shadow, text, scenery, or transparency pattern
- Framing: one complete centered character per equal cell, consistent scale and ground anchor

## Batch identities

1. Black cap and blue scarf; orange-red headwrap; brown explorer hat; lavender hood.
2. Teal beret and scarf; cream safari hat; brown low cap and visor; green laurel crown.
3. Black cap and goggles; black sunglasses; pale skull mask; visible brown-haired explorer.
4. Yellow rain hood; blue-and-white striped headwrap; cream safari hat and tan vest; pale round sack mask.

Each generated prompt required the four identities to retain costume, color, face visibility, body proportions, and silhouette across all rows. Walking required one visible forward foot and opposite arm swing; casting required an active two-hand forward pose; hit reaction required a backward recoil. Characters could not use the chroma color.
