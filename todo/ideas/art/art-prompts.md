# Art Prompts for Clowder & Crest

A workspace for generating more pixel art via the **PixelLab MCP server**. Mirrors the structure of `todo/ideas/music/music-prompts.md`: a shared identity block (style + technical specs that apply to every asset), followed by per-asset prompts grouped by category.

## What's already generated

Before adding to this file, check what already exists in `public/assets/sprites/`:

- **Cat breeds (6):** wildcat, russian_blue, tuxedo, maine_coon, siamese, bengal — each has 4-direction idles, walk-6-frames per direction, and interact poses (eat, scratch, sit, sleep)
- **Furniture (15):** straw_bed, woolen_blanket, cushioned_basket, fish_barrel, herb_rack, stone_hearth, notice_board, lantern, candle_stand, scratching_post, bookshelf, rug_wool, saints_icon, fish_bone_mobile, potted_catnip
- **Scenes (6):** guildhall, room, town, town_day, town_dusk, town_plague
- **Buildings (9):** castle, cathedral, docks, market, mill, monastery, night, ship, tavern
- **Dialogue backdrops (3):** granary, guildhall, rooftop
- **Puzzle blocks (5):** barrel, cart, crate, flour_sack, pew
- **Misc (4):** crest, dog, rat, fish, guard

The categories below are organized around **gaps** in this set — things the game has hooks for but doesn't yet have art for, or things that would visibly improve a scene.

---

## Shared Style Block

Every prompt should be consistent with this identity. Paste the style line into PixelLab prompts that don't already enforce it.

```
Late-medieval European setting (1300s-1400s), cozy-but-slightly-dark Redwall/medieval-tapestry tone. Warm muted earth-tone palette: browns (#8b7355, #6b5b3e), dark stone (#2a2520, #3a3530), warm amber (#c4956a, #dda055), blue-grey (#6b8ea6), deep green (#4a6a4a). Black background (#1c1b19) for sprites unless otherwise noted. Low-detail chunky pixel art, 2-3 color shading per object, no outlines or thin black outlines only. SNES/GBA RPG item-icon feel.
```

**Why this matters:** the existing 6 cat breeds, 15 furniture pieces, and scene backgrounds were all generated against this palette and tone. Anything new should sit next to them without looking like it's from a different game. The colors above are the same ones used in `src/utils/constants.ts` for UI chrome, so sprites and HTML overlays harmonize automatically.

---

## PixelLab MCP usage

The PixelLab MCP server exposes these tools (full names shown so they can be called directly from Claude):

| Tool | Use for |
|---|---|
| `mcp__pixellab__create_character` | Cat breeds, NPC characters with rotations + animations |
| `mcp__pixellab__animate_character` | Add a new animation (walk, idle, attack) to an existing character |
| `mcp__pixellab__create_isometric_tile` | Furniture, decor objects, single isometric tiles |
| `mcp__pixellab__create_topdown_tileset` | Floor/wall tilesets for room interiors |
| `mcp__pixellab__create_sidescroller_tileset` | Side-scrolling level tiles (none used yet — could power a Courier Run rework) |
| `mcp__pixellab__create_tiles_pro` | Higher-quality tile generation with explicit dimensions |
| `mcp__pixellab__create_map_object` | Standalone objects on a map (buildings, props) |
| `mcp__pixellab__list_characters` / `get_character` / `delete_character` | Manage existing characters |

**Standard parameters for cat breeds (matches what was used for the 6 existing breeds):**

```json
{
  "name": "calico",
  "size": { "width": 48, "height": 48 },
  "template_id": "cat",
  "directions": 4,
  "view": "high top-down",
  "description": "<see per-breed prompt below>"
}
```

After creation, follow up with `mcp__pixellab__animate_character` for each pose: `walk-6-frames`, `eat`, `sleep`, `sit`, `scratch`. Then export rotations into `public/assets/sprites/<breed>/{north,south,east,west}.png` and animation frames into the matching subfolders to match the existing layout the game already loads from.

**Standard parameters for furniture / map objects:**

```json
{
  "size": { "width": 32, "height": 32 },
  "view": "high top-down",
  "outline": "single color black outline",
  "shading": "basic shading",
  "transparent_background": true
}
```

Save into `public/assets/sprites/furniture/<name>.png` and add the entry to `src/data/furniture.json` so the shop and room renderer pick it up.

**Standard parameters for scene backgrounds (large, non-tileable):**

```json
{
  "size": { "width": 320, "height": 180 },
  "view": "side"
}
```

Save into `public/assets/sprites/scenes/<name>.png` and reference from `BootScene.ts` preload.

---

## New Cat Breeds

The game's `breeds.json` ships 6 breeds. CLAUDE.md flags **big cats** (Lynx, Lion, Leopard) as a known unimplemented category, plus there's room for more domestic breeds with distinct stat biases.

### Lynx (big cat — guard / pest control specialist)
A muscular wild lynx with a short tail, black ear tufts, spotted grey-brown fur, gold eyes, and a serious watchful expression. Moves like a soldier. **Template:** cat, 48×48, 4 directions, high top-down. **Stats bias:** strength + perception. **Where it fits:** unlocks at chapter 6 as a recruit-only big cat — premium fish cost. The guildhall sprite should clearly tower over the domestic breeds (use larger silhouette inside the same 48×48 canvas).

### Lion (big cat — sacred / leadership specialist)
A stoic young lion with a soft golden mane just starting to fill in, amber fur, regal posture. Looks like he'd lead a procession. **Template:** cat, 48×48, 4 directions. **Stats bias:** charisma + leadership. **Where it fits:** chapter 7 unlock, pairs with Cathedral / Castle jobs. Mane should read clearly even at 48px — use a darker tan halo around the head.

### Leopard (big cat — stealth / shadow specialist)
A sleek leopard with golden fur and dark rosettes, slim build, predator-low posture. Moves like a thief. **Template:** cat, 48×48, 4 directions. **Stats bias:** stealth + agility. **Where it fits:** Detection / Shadow jobs. Rosette pattern needs to be visible at 48px — use 4-6 well-placed dots rather than trying to render every spot.

### Calico (domestic — luck specialist)
A small calico cat with patches of white, orange, and black. Bright green eyes, cheerful posture. The "lucky cat" of folklore. **Template:** cat, 48×48, 4 directions. **Stats bias:** luck + perception. **Where it fits:** common stray recruit. Patches should be three clearly separated color zones, not a marble pattern.

### Black Cat (domestic — shadow / superstition specialist)
A solid black short-haired cat, glowing yellow eyes, sleek build, slightly suspicious posture. **Template:** cat, 48×48, 4 directions. **Stats bias:** stealth + intuition. **Where it fits:** Shadow jobs, possibly tied to a chapter event around Inquisition superstitions. The eyes need to glow visibly against the all-black silhouette — use bright amber/yellow pixels.

### Persian (domestic — comfort / sacred specialist)
A long-haired flat-faced Persian cat, cream-white fluff, blue eyes, dignified seated posture. **Template:** cat, 48×48, 4 directions. **Stats bias:** charisma + presence. **Where it fits:** Sacred jobs, monastery work. Silhouette should read distinctly different from Maine Coon (rounder, less tufted, flatter face).

---

## Furniture (extending the 15 existing pieces)

`src/data/furniture.json` is ready to accept new entries — each one needs a 32×32 sprite plus a JSON entry with stat bonuses and unlock cost. The existing 15 cover bedding, food, lighting, and a few decorative items. Gaps:

### Cat Tree (multi-level perch)
A tall wooden cat tree with two carpeted platforms and a hanging rope toy, medieval style — wood beams instead of modern carpet. **Stat boost:** athleticism. **Acoustic in-game:** perch idle animation hook for cats. **Spec:** 32×32, isometric, transparent background, basic shading.

### Stone Drinking Fountain
A small stone basin fed by a trickle from a carved fish-mouth spout. Medieval, mossy. **Stat boost:** mood (hydration). **Spec:** 32×32, isometric, transparent background.

### Window Box with Catnip
A wooden window box hanging on a stone wall, sprouting fresh catnip. **Stat boost:** mood (small). **Spec:** 32×32, isometric, transparent background. Should clearly read as a *wall-mounted* item, not a floor object — the rendering layer treats wall-mounts differently.

### Tapestry of the First Clowder
A faded woven tapestry hanging on a stone wall, depicting cats in heraldic poses around a crest. Reds and golds. **Stat boost:** lore (small) + reputation. **Spec:** 32×32, the rectangle reading clearly even at small size.

### Wooden Weapon Rack
A small wooden rack holding a tiny wooden sword, a tiny shield, and a fish-bone spear — toy-sized weapons for cats. **Stat boost:** strength. **Spec:** 32×32, isometric.

### Globe Stand
A small medieval globe on a wooden stand showing painted continents. **Stat boost:** perception + lore. **Spec:** 32×32, isometric.

### Apothecary Shelf
A narrow wooden shelf with small clay jars labeled with herb sigils. Medieval apothecary aesthetic. **Stat boost:** healing (when implemented) + intuition. **Spec:** 32×32, isometric.

### Stone Bird Bath (or "Mouse Bath")
An ornamental stone basin shaped like a chalice, with a tiny carved mouse statue inside instead of birds. **Stat boost:** stealth (predator focus). **Spec:** 32×32, isometric.

### Hanging Fish Smoke-rack
A wooden rack hanging from a ceiling beam, with several whole fish smoking over an unseen fire. **Stat boost:** mood + economy (small daily fish income). **Spec:** 32×32, isometric, can include warm orange tint at the bottom suggesting heat.

### Crest Banner on Pole
A vertical fabric banner on a wooden pole bearing the guild crest in gold thread. Stands in a corner. **Stat boost:** reputation + leadership. **Spec:** 32×32, isometric, banner reads clearly.

### Wax-Sealed Letter Stack
A small stack of rolled scrolls bound with twine, one with a visible wax seal. **Stat boost:** lore. **Spec:** 32×32, isometric, smaller silhouette than other furniture.

### Bone Chime
A wind chime made from small fish bones strung on twine, hanging from a wooden hook. **Stat boost:** intuition + mood. **Spec:** 32×32, can include soft motion blur on the chimes to suggest swaying.

---

## Scene Backgrounds (320×180)

The game uses 6 scene backgrounds today. Several chapters and events still use a generic backdrop. Gaps:

### Chapter 3 — Rat Plague Town
The town in crisis — same cobblestone square as `town.png`, but rats visible scurrying in the gutters, shop windows shuttered, a thin haze of smoke from a distant fire, lanterns lit at dusk despite the time. Same color palette as `town.png` but darker and more saturated reds. **Spec:** 320×180, side view.

### Chapter 4 — The Naming Ceremony
A small outdoor square with a wooden dais, banners hung between buildings, a crowd of NPC silhouettes gathered. The guildhall visible at the back. Bright but not gaudy — late afternoon golden hour. **Spec:** 320×180, side view, can include soft particle hint of falling leaves or petals.

### Chapter 6 — Silver Paws Guildhall
A rival cat guildhall — sharper, cleaner stone than the player's, ornate iron gates, a silver-painted crest above the door, two banners flanking the entrance. Slightly intimidating. Same medieval idiom but a colder color shift (more blue-grey, less amber). **Spec:** 320×180, side view.

### Chapter 7 — Inquisition Cathedral Interior
The interior of a tall stone cathedral — vaulted ceiling, stained glass with red light filtering through, tall pillars, an altar at the back, a single Inquisitor cat silhouetted in robes. Dread without despair. **Spec:** 320×180, side view, dramatic lighting from the windows.

### The Cellar — Dungeon Run Entrance
A narrow stone staircase descending into darkness, a single iron-bracket torch on the wall, the cellar door slightly ajar at the top, faint glowing eyes visible at the bottom of the stairs. **Spec:** 320×180, side view. Used as the establishing shot for `DungeonRunScene`.

### Dungeon Floor — Generic Depths
A long stone corridor with chains hanging from the ceiling, scattered bones, a faint blue glow from somewhere out of frame, dripping water suggested by dark streaks. Used as the backdrop for any dungeon floor that doesn't have a more specific scene. **Spec:** 320×180, side view.

### Dawn Town (companion to `town_day.png` and `town_dusk.png`)
The town at first light — sky pale orange-pink, lanterns just being extinguished, mist on the cobblestones, a single figure (a cat) heading out for the morning's work. **Spec:** 320×180, side view, matches the existing town composition for continuity.

### Storm Town (companion to existing town variants)
The town in heavy rain — same composition, but with vertical rain streaks, puddles on the cobblestones, lanterns reflecting on wet stone, sky a deep blue-grey. Used during the prologue and any rain event. **Spec:** 320×180, side view.

### Festival Town
The town during a harvest or saint's-day festival — colorful banners strung between buildings, lanterns lit even though it's daytime, cats and townspeople in the square, a small bonfire in the center, market stalls with extra goods. **Spec:** 320×180, side view.

---

## Building Exteriors (32×32 or 48×48 sprites for the town map)

The town map has 9 building sprites today. Gaps based on the job categories in `jobs.json`:

### Apothecary
A narrow medieval shop with hanging dried herbs in the window, a wooden mortar-and-pestle sign over the door, smoke from a low chimney. **Spec:** 48×48, high top-down to match the existing town buildings.

### Bell Tower (standalone)
A tall stone bell tower with a single iron bell visible in the arched opening, a weathervane on top. Used for the ringing-the-bell minigame and any Patrol context. **Spec:** 48×48 or 64×64.

### Smithy
A stone forge with a glowing orange opening, anvil visible, hammer hanging on the wall. Smoke rising from the chimney. **Spec:** 48×48, high top-down.

### Library / Scriptorium
A two-story stone building with arched windows, scrolls visible in the windows, a wooden sign with a quill on it. **Spec:** 48×48, high top-down.

### Lighthouse
A short stone lighthouse on the docks, lit lantern at the top, waves at the base. Used for any ocean/dock job. **Spec:** 48×48 or 64×64 (taller than wide).

### Bath House
A stone building with a curling steam wisp coming out of a chimney, wooden door, a sign with a fish-shaped basin. **Spec:** 48×48, high top-down.

---

## Enemies & NPCs

The game has `dog.png`, `rat.png`, `guard.png` as generic enemies. Most minigames currently tint or scale a single rat sprite to convey variety. Distinct sprites would significantly improve readability.

### Rat Variants
- **Plague Rat** — sickly grey-green fur, milky eyes, slow lumbering posture. For Chapter 3 events. **Spec:** 32×32, 4 directions, top-down.
- **Golden Rat** — small, fast, gold-flecked fur. For Hunt minigame's high-value rats. **Spec:** 32×32, 4 directions.
- **Poison Rat** — distinct red/purple tint, glowing eyes, hunched. Already used in Hunt — currently a tinted regular rat. **Spec:** 32×32, 4 directions.
- **Brawler Rat** — larger, scarred, wearing a tiny helmet. The boss tier in Brawl. **Spec:** 48×48, 4 directions.
- **Skirmisher Rat** — lean, holding a tiny dagger, lunge-ready posture. For Brawl's lunging type. **Spec:** 32×32, 4 directions.
- **Prowler Rat** — silhouette-only, dark grey, almost invisible. For Patrol's lantern-extinguishers. **Spec:** 32×32, 4 directions.

### Dog Variants
- **Tracker Dog** — short legs, nose to the ground, brown coat. Pac-Man-style chase enemy that follows scent. Already used in Chase. **Spec:** 32×32, 4 directions.
- **Ambusher Dog** — taller, alert posture, mottled coat. Predicts player movement. **Spec:** 32×32, 4 directions.
- **Scared Dog** — both above with a comic green tint and "puff of air" icon for the catnip combo state. Could be a separate sprite or a tint applied to the existing one.

### Silver Paws Cats (rival guild — Chapter 6)
A small set of opposing cat sprites that look like the player's guild but with a colder palette and silver accents. Use the same `template_id: cat` parameters with a silver-grey + dark blue tint instead of the warm amber/brown of the player's breeds.

- **Silver Paw Wildcat Captain** — scarred, silver-grey, dark blue collar.
- **Silver Paw Scout** — sleek black, silver paws (literal — white "boots").
- **Silver Paw Enforcer** — large, intimidating, dark grey + silver collar.

### Inquisition Agents (Chapter 7)
Robed cat figures, very intimidating, ecclesiastical aesthetic.

- **Inquisitor Cat** — tall thin cat in dark red robes with a hood, golden cross around neck, candle held in one paw. **Spec:** 48×48, 4 directions.
- **Inquisition Scribe Cat** — smaller cat in plain robes carrying a scroll, follows the Inquisitor. **Spec:** 32×32, 4 directions.

### Townspeople / Job-givers
NPCs that hand out jobs in the town map. Currently jobs come from a generic "job board" sprite. Distinct NPCs would give the town life.

- **Miller** — stout cat with flour-dusted apron, standing at the mill door. **Spec:** 32×32, 1 direction (south).
- **Captain of the Guard** — armored cat with a tiny pauldron, by the castle gate. **Spec:** 32×32, 1 direction.
- **Abbot** — robed cat at the cathedral door with a tiny prayer book. **Spec:** 32×32, 1 direction.
- **Dock Master** — weatherbeaten cat in a cap with a rope coil over one paw. **Spec:** 32×32, 1 direction.
- **Merchant** — well-dressed cat with a small coin purse, by the market. **Spec:** 32×32, 1 direction. (Already partially covered by `merchant.mp3` SFX cue but no sprite.)

### Travelling Merchant (Chapter 5+ random visitor)
A foreign-looking cat in colorful robes with a small caravan-cart full of trinkets behind them. Used during the merchant visit event. **Spec:** 32×32 cat + 48×32 cart, two separate sprites composited in-game.

---

## Puzzle Block Themes (32×32 each)

`PuzzleScene` (Rush Hour) and `SokobanScene` use different blocks per location. Existing 5 are generic. Gaps for theme variety:

### Mill (pest control)
- Wooden flour sieve
- Bag of grain spilled at one end
- Stone millstone fragment

### Granary (pest control)
- Clay grain jar
- Wooden grain shovel
- Tarred barrel

### Cathedral (sacred / pest control)
- Bronze altar candlestick
- Wooden confessional door
- Folded prayer cloth

### Market (courier)
- Cloth bundle of textiles
- Wooden produce crate
- Wheel of cheese

### Docks (courier / fishing)
- Coiled rope
- Fishing net bundle
- Wooden lobster trap

### Castle (guard)
- Iron helmet
- Wooden practice dummy section
- Heavy oak chest

### Tavern (any)
- Wooden ale keg
- Stack of plates
- Lute case

Each block should be the same chunky 32×32 silhouette as the existing 5 (`barrel.png`, `crate.png`, etc.) so the puzzle scene's slide animations and collision boxes still work without code changes.

---

## UI Icons & Badges (16×16 unless noted)

The game's HTML overlay uses inline SVGs and emoji for most icons today. Pixel-art icons would unify the visual language. Gaps:

### Status / Stat Icons (16×16, transparent background)
- **Strength** — clenched cat paw with bicep curve
- **Stealth** — half-closed eye
- **Charisma** — speech-bubble with a heart
- **Perception** — wide-open eye
- **Luck** — four-leaf clover, gold
- **Lore** — tiny scroll with seal
- **Athleticism** — running cat silhouette
- **Intuition** — flame inside a circle
- **Healing** — tiny cross with a leaf

### Faction Emblems (32×32, transparent background)
- **Crest faction** — golden shield with a cat's head silhouette
- **Shadow faction** — black diamond with a cat's eye in the center
- **Silver Paws** — silver crescent with a paw print inside
- **Inquisition** — dark red cross with thorns

### Achievement Badges (48×48, circular)
- **First Job Done** — gold paw print on parchment
- **Recruited All Breeds** — wreath of cat silhouettes
- **Dungeon Cleared** — silver key crossed with a sword
- **Bond Rank A** — two paws forming a heart
- **Guild Founded** — small stone tower with a banner

### Reputation Tier Icons (24×24)
- 5 ascending icons for Crest tiers (Stray → Recruit → Watcher → Captain → Guildmaster)
- 5 ascending icons for Shadow tiers (Lurker → Scout → Whisper → Cipher → Veil)

---

## VFX & Particle Sprites (8×8 to 16×16, transparent background)

The current `particle_pixel` is a generic single white pixel that gets tinted at runtime. Distinct particle textures would let the haptic moments hit harder.

- **Spark** — small 4-pointed star, white core, gold outer (for combo bonuses)
- **Rune Glow** — small purple rune fragment (for ritual minigame correct steps)
- **Blood Drop** — dark red teardrop (for brawl kills, used sparingly)
- **Fish Scale** — small iridescent oval (for fishing catch)
- **Lock Click Spark** — tiny gold burst (for heist tumbler set)
- **Catnip Petal** — small green leaf (for chase combo)
- **Lantern Ember** — tiny orange dot (for patrol relight)
- **Smoke Puff** — small grey cloud (for stealth detection / cat hiding)
- **Holy Light** — pale yellow radial (for ritual completion)
- **Dust Mote** — tiny brown speck (for sokoban crate push)

Each as a single 16×16 sprite — the game's existing particle emitter handles fade, scale, and rotation.

---

## Dialogue Backdrops (320×180)

Existing: granary, guildhall, rooftop. Bond conversations and group conversations could use more variety. Gaps:

- **Tavern Interior** — warm lantern light, wooden tables, distant fire
- **Cathedral Apse** — quiet side chapel with a single candle and a stone bench
- **Castle Battlements** — outdoor stone walkway at night, town visible below
- **Market Stall Behind** — quiet alley behind a market stall, crates and barrels
- **Mill Loft** — wooden loft above the mill, sacks of grain, dust motes in shafts of light
- **Docks at Dawn** — wooden pier, fishing boats, mist on the water
- **Sleeping Quarters at Night** — same as the room scene but with a single moonlit window and snoring cats
- **Cellar (entrance)** — same as the dungeon entrance scene but framed for dialogue (more horizontal)

All 320×180, side view, matching the warm-but-dark guildhall identity.

---

## Title & Menu Art (one-offs)

- **Chapter Card 1-7** — large painted-style chapter intro cards (480×270 or larger), each capturing the chapter's tone. Currently chapter intros use the narrative overlay with text only.
- **Game Over screen art** — solo wildcat in the rain, lean-to in the background, used by `Game Over / Starvation` scene.
- **Guild Founding panel** — the moment the player names the guild, used in chapter 4.
- **Save Slot avatars** — tiny portrait crops of the player's chosen Wildcat for the title screen save slot picker.

---

## Workflow

1. **Pick a category** above and a specific item to generate.
2. **Construct the prompt** by combining the **Shared Style Block** with the per-item description.
3. **Call the right PixelLab MCP tool** with the standard parameters listed in the *PixelLab MCP usage* section. For cats, use `mcp__pixellab__create_character` with `template_id: cat`. For furniture, use `mcp__pixellab__create_isometric_tile` (or `create_map_object` for free-form). For scene backgrounds, use the larger non-tileable tools.
4. **Save** to the right path under `public/assets/sprites/<category>/<name>.png` so the game's existing `BootScene.ts` preload patterns pick it up automatically.
5. **Wire up** in the relevant data file (`furniture.json`, `breeds.json`, etc.) or scene preload list.
6. **Mark `- created`** next to the item in this file when done, the same way `music-prompts.md` tracks generated tracks.

---

## What's intentionally NOT here

- **Floor tilesets** — the game uses solid-color floor rendering today; switching to tilesets would be a separate visual rework, not an additive art pass.
- **Cat portraits** — the in-game UI uses sprite crops, not separate portrait art. Adding portraits would also need code changes to render them.
- **Animations beyond walk/idle/eat/sleep/sit/scratch** — the existing animation set covers the gameplay needs. New animations would require new code in `BootScene.ts` to preload and `RoomScene.ts` to play.

If you want any of these, add them to this file with a clear note about the code changes they'd entail so the scope is visible upfront.
