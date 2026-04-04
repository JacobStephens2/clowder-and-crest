# Clowder & Crest — Art Style & Aesthetic Guide

## Overview

Clowder & Crest is a medieval cat guild management game set in an alternate-history Europe during the Age of Cathedrals and Crusades (roughly 1000–1300 AD). The visual identity draws from two primary sources: the warm, atmospheric pixel art of *Kingdom Two Crowns* and the playful marginalia of medieval illuminated manuscripts — a tradition that historically featured cats with surprising frequency.

The result should feel like a **candlelit storybook come to life** — somber but never bleak, charming but never saccharine. Think weathered parchment, warm amber light, and ink-drawn cats doing surprisingly dignified work.

---

## Setting

### Time Period

The Age of Cathedrals and Crusades, per Dr. Steve Weidenkopf's classification in *Timeless: A History of the Catholic Church*. This encompasses:

- Romanesque and early Gothic architecture — thick stone walls, round arches giving way to pointed ones
- Monasteries, guild halls, market squares, cathedrals under construction
- Crusader routes, pilgrim roads, port towns
- A world lit by candles, hearth fire, and stained glass

### Alternate History Conceit

This is an alternate Earth where domestic cats form guilds, take contracts, and build reputations — operating alongside (but slightly beneath the notice of) human society. Contemporary cat breed names are used intentionally despite the medieval setting. A Maine Coon is called a Maine Coon. This is a deliberate choice to leverage breed recognition and excitement over historical accuracy.

### Key Locations (MVP)

| Location | Visual Character |
|----------|-----------------|
| **The Guildhall** | A converted stone storehouse. Warm interior, hearth glow, straw bedding, wooden furniture. Grows from sparse to decorated as the player progresses. |
| **The Town** | A walled medieval market town. Cobblestone streets, timber-frame buildings, a cathedral in the distance, market stalls, a harbor or river. Shown as a simplified map/node screen, not a full explorable space. |
| **Puzzle Scenes** | Stylized interiors — a granary (pest control), a rooftop path (courier). The Rush Hour grid sits within a themed frame. |

---

## Art Style

### Pixel Art Direction

The game uses **top-down pixel art with a 3/4 angle** (the "Stardew Valley / Rimworld camera"), rendered on a 32×32 tile grid.

#### Resolution & Scale

- **Tile size:** 32×32 pixels
- **Cat sprites:** 16×16 or 20×20 within the 32×32 cell, leaving room for tails and ears
- **Furniture/objects:** 32×32 (single tile) or 32×64 / 64×32 (double tile) for larger pieces
- **Portrait art:** 64×64 or 96×96 for conversation scenes and cat detail cards
- **Target canvas:** 384×640 (portrait orientation, 12×20 tiles visible) scaled up with nearest-neighbor filtering

#### Color Palette

The palette is **muted, warm, and autumnal** — inspired by *Kingdom Two Crowns*' golden-hour atmosphere and the aged parchment tones of illuminated manuscripts.

- **Dominant tones:** warm ochre, burnt sienna, dusty gold, stone gray, deep brown
- **Accent tones:** candlelight amber, stained-glass blue, liturgical red (used sparingly — for crests, UI highlights, important items)
- **Shadow tones:** deep indigo and warm charcoal (never pure black)
- **Light source:** warm amber from hearth/candle. Exteriors lean overcast and cool with golden accent light

Aim for a **16–24 color master palette** shared across all assets for visual coherence. Reference palettes on Lospec tagged "medieval," "autumn," or "warm" as starting points.

#### Pixel Art Principles

- **No anti-aliasing within sprites.** Clean pixel edges, nearest-neighbor scaling only.
- **Impressionist detail.** As the *Kingdom Two Crowns* creator describes it: "The viewer fills in the details with their imagination." A cat's face is 4–6 pixels across — suggest breed through color, ear shape, and body proportion, not fine detail.
- **Consistent light direction.** Light comes from the upper-left in all sprites and tiles. Shadows fall lower-right.
- **Limited animation.** Idle: 2–4 frames (tail swish, ear flick). Walking: 4 frames. Keep it simple — charm comes from timing, not frame count.
- **No sub-pixel movement or rotation.** Sprites always align to whole pixels.

---

## UI Aesthetic — Illuminated Manuscript

The UI is rendered in **HTML/CSS overlaid on the Phaser canvas**, styled to evoke illuminated manuscripts and medieval documents.

### Visual Language

| Element | Treatment |
|---------|-----------|
| **Backgrounds** | Parchment texture — warm cream with subtle fiber noise, slightly uneven edges |
| **Borders & frames** | Ink-drawn line borders with occasional foliate (vine/leaf) corner decorations. Never modern rounded rectangles — use slightly irregular, hand-drawn-feeling borders |
| **Headers & titles** | Blackletter or uncial-inspired display font. Drop caps on chapter/story text. Decorative initial letters where appropriate |
| **Body text** | Clean serif or humanist typeface for readability. The manuscript aesthetic lives in the frames and decoration, not in making body text illegible |
| **Buttons** | Parchment-colored with ink borders. On hover/press: slight darkening, as if the ink is freshening. Primary actions may use a wax-seal red accent |
| **Icons** | Simple ink-line style, as if drawn by a monk. Consistent stroke weight |
| **Dividers** | Decorative line rules — knotwork, vine scroll, or simple double-line |
| **Cat portraits** | Framed in an ornamental roundel or decorated initial, like a manuscript portrait miniature |

### Font Choices (Web)

| Role | Suggested Fonts | Fallback |
|------|----------------|----------|
| **Display / Headers** | UnifrakturCook, MedievalSharp, or IM Fell English SC (Google Fonts) | Georgia, serif |
| **Body text** | IM Fell English, Crimson Text, or Cormorant Garamond (Google Fonts) | Georgia, serif |
| **UI labels / stats** | Alegreya Sans or Source Sans 3 | system sans-serif |

### Marginalia References

Medieval manuscripts are rich with cat imagery — cats hunting mice, cats playing instruments, cats in armor, cats doing absurd things in the margins of sacred texts. This is historically documented across European manuscripts from the 12th through 15th centuries.

Key references:

- **The Maastricht Hours** (c. 1300) — contains numerous cat grotesques and drolleries in the margins
- **The Luttrell Psalter** (c. 1325–1340) — features cats among its famous marginal illustrations
- **Various Books of Hours** — Belgian and French manuscripts frequently depict cats with instruments, cats hunting, and cat-mouse chases in decorated borders

These marginalia should inform the decorative elements of the UI — vine borders with hidden cat silhouettes, corner decorations featuring tiny cats in surprising poses, loading screen drolleries. The game's aesthetic identity lives in the intersection of "serious medieval document" and "cats doing cat things in the margins."

---

## Mood & Tone

### What It Feels Like

- **A candle flickering in a stone room.** Warm but enclosed. Safe but aware of the dark outside.
- **A well-worn guild ledger.** Practical, ink-stained, handled daily — not a pristine showpiece.
- **A cat sitting in a cathedral window.** Dignity and absurdity coexisting. Sacred space, profane occupant.

### Emotional Arc (Tied to Rags-to-Riches Plot)

| Chapter | Mood | Visual Shift |
|---------|------|-------------|
| **1: Initial Wretchedness** | Cold, sparse, lonely | Muted palette. Empty guildhall. Rain. Few decorations. |
| **2: Out Into the World** | Hopeful, warming | Palette brightens slightly. First furniture. Market town opens. |
| **3: Central Crisis** | Tense, dark | Darker lighting. Plague imagery (rats, boarded windows). St. Rosalia crisis. Red/amber warning tones. |
| **4: Independence** | Determined, building | Full palette restored. Guildhall furnished. Multiple cats active. |
| **5: Final Union** | Warm, golden, complete | Golden-hour lighting. Full guildhall. Crest on the wall. Celebratory. |

### What It Is NOT

- **Not kawaii or chibi.** Cats are charming but grounded. No huge heads, sparkle eyes, or pastel rainbows.
- **Not grimdark.** The crisis is serious but the tone stays storybook. Think *The Name of the Rose* filtered through *Redwall*, not *Dark Souls*.
- **Not historically sterile.** The setting is evocative, not a documentary. Anachronisms in breed names are embraced. The aesthetic should feel *inspired by* medieval Europe, not constrained by it.
- **Not minimalist modern.** The UI has texture, ornament, and warmth. Flat design with thin sans-serif fonts would break the spell.

---

## Audio Aesthetic (Reference)

The visual style pairs with a specific audio direction (detailed in the Suno prompt guide):

- **Solo lute, harp, hurdy-gurdy** — warm acoustic instruments, never synthetic
- **Distant choir pads** — cathedral reverb, Gregorian undertones
- **Ambient texture** — rain, hearth crackle, distant bells
- **Somber but beautiful** — melancholy is the resting state, not sadness

The audio and visual palettes should feel like the same world — warm, enclosed, candlelit, contemplative.

---

## Breed Visual Differentiation (MVP Cats)

Each breed must be distinguishable at 16–20 pixels tall through **color, ear shape, and body proportion** — not fine facial detail.

| Breed | Key Visual Markers | Palette Notes |
|-------|-------------------|---------------|
| **Wildcat (player)** | Tabby stripes, slightly larger/scruffier than domestics, tufted ears | Brown-gray tabby tones. The "everyman" look. |
| **Russian Blue** | Solid blue-gray coat, slim build, large pointed ears | Cool silver-blue. Stands out against warm backgrounds. |
| **Maine Coon** | Large and fluffy, prominent ear tufts, bushy tail | Rich brown/red tabby. Noticeably bigger sprite. |
| **Siamese** | Cream body with dark points (face, ears, paws, tail), slim | Warm cream + chocolate. High contrast even at small size. |
| **Tuxedo** | Black and white bicolor pattern, standard build | Pure black + white. Reads clearly at any size. |

At 16px tall, breed identity comes down to **2–3 distinguishing pixels** — the ear tufts on a Maine Coon, the point coloring on a Siamese, the solid blue-gray of a Russian Blue. Silhouette and color do the heavy lifting.

---

## Asset Priority for MVP

Production order, from most to least critical:

1. **Cat sprites** — 5 breeds × idle + walk (4 directions) = 40 animation sets minimum
2. **Guildhall tileset** — stone floor, walls, doorways, hearth, basic furniture (bed, table, shelf, scratching post)
3. **Rush Hour puzzle blocks** — themed block sprites (rat blocks, path blocks, cat pawn), grid frame
4. **UI elements** — parchment backgrounds, ink borders, buttons, portrait frames, icons
5. **Town map nodes** — simplified building icons for the job board / location select
6. **Portrait art** — 64×64 or 96×96 close-up portraits for conversations and cat cards
7. **Decorative elements** — marginalia doodles, vine borders, loading screen art

---

## Tools

| Tool | Purpose |
|------|---------|
| **Piskel** (browser) or **Aseprite** ($20) | Sprite creation and animation |
| **PixelLab** / **Seele AI** | AI-assisted sprite generation for initial drafts |
| **Tiled** (mapeditor.org) | Tilemap layout for guildhall rooms and scenes |
| **Lospec** (lospec.com) | Palette selection and reference |
| **Suno** | Music generation (see Suno prompt guide) |

---

## Summary Sentence

Clowder & Crest looks like a **medieval manuscript that learned to move** — warm pixel art in a candlelit world, framed by ink-drawn borders where cats hide in the margins.
