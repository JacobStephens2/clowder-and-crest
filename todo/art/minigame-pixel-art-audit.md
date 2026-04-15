# Minigame Pixel Art Audit

Comprehensive audit of every visual element across all 15 minigame scenes. Each element is categorized as **sprite** (real pixel art) or **shape** (rectangle, circle, graphics primitive). The goal is to identify what needs pixel art generation to bring every minigame up to a consistent visual standard.

---

## Coverage Summary

| Tier | Scenes | Status |
|---|---|---|
| **Partial** | Chase, Hunt, Sokoban, Courier Run | Cat + enemy sprites exist; shapes for maze/grid/background |
| **Minimal** | Brawl, Scent Trail, Puzzle, Fishing, Pounce, Stealth | Player cat rendered; enemies/environment are rectangles/circles |
| **None** | Patrol, Nonogram, Ritual, Heist, Roof Scout | Pure graphics primitives |

---

## Priority 1: Roof Scout (all shapes)

| Element | Shape | Color | Size | Count | Sprite Needed |
|---|---|---|---|---|---|
| **Player body** | Rectangle | `#c4956a` tan (gold when clinging) | 22x32 | 1 | **Yes** -- the player IS a colored rectangle. A climbing cat sprite is table stakes. |
| **Wall-jump cue** | Triangle | `#fff8e0` cream, pulsing alpha | 14x16 | 0-1 | Optional -- could become a small arrow sprite but the geometric shape arguably reads well. |
| **Normal ledge platforms** | Rectangles | `#6b5b3e` brown | variable width x 12h | 15-30 | **Yes** -- a repeating stone/wood ledge tile (e.g. 24x12) tiled across the width. |
| **Tall wall platforms** | Rectangles | `#4a5060` cool slate | 18-26w x 60-110h | 0-3 | **Yes** -- a vertical brick/stone tile (e.g. 24x24) tiled vertically. |
| **Ground floor** | Rectangle | `#6b5b3e` brown | full width x deep | 1 | Low -- mostly off-screen; could use the same ledge tile. |
| **Summit platform** | Rectangle | `#dda055` gold | 200x14 | 1 | **Yes** -- a distinct "watchpoint" tile, could be a flagged/gilded ledge. |
| **Fish pickups** | Rectangles | `#dda055` gold | 12x8 | 5-10 | **Yes** -- `fish.png` already exists in the project but isn't used here. Wire it in. |
| **Brick-stripe parallax** | Graphics lines | `#2a2530` | full screen | 1 | Nice-to-have -- a repeating brick wall tile for the background parallax. |

### Roof Scout Sprite List
1. `roof_scout_player.png` -- climbing cat (or reuse breed idle sprites rotated/adapted)
2. `roof_ledge.png` -- tileable stone ledge, ~24x12
3. `roof_wall.png` -- tileable vertical brick/stone, ~24x24
4. `roof_summit.png` -- gilded/flagged watchpoint ledge, ~48x14
5. Wire existing `fish.png` for collectibles

---

## Priority 2: Patrol (all shapes)

| Element | Shape | Color | Size | Count | Sprite Needed |
|---|---|---|---|---|---|
| **Lantern flame** | Circle | `#dda055` amber (or `#cc4444` trap) | r18 (36x36) | 5-9 | **Yes** -- a pixel-art lantern with visible flame. Two variants: lit (amber) and trap (red). |
| **Lantern glow** | Circle | `#dda055` at 0.3 alpha | r28 (56x56) | 5-9 | Optional -- could keep as a radial glow effect behind the sprite. |
| **Lantern post** | Rectangle | `#6b5b3e` brown | 4x16 | 5-9 | Merged into the lantern sprite (the post is the base of the lamp). |
| **Prowler body** | Circle | `#1a1020` dark with `#aa44aa` purple stroke | r8 (16x16) | 0-3 | **Yes** -- a small crouching intruder figure. Dark with glowing purple eyes. |
| **Prowler eyes** | 2 Circles | `#aa44aa` purple | r1.5 (3x3 each) | 2 per prowler | Merged into the prowler sprite. |
| **Prowler kill ring** | Expanding circle | `#c88aff` purple | r8 to r28 | transient | Optional -- keep as a shape effect (it's a transient juice layer). |

### Patrol Sprite List
1. `lantern_lit.png` -- pixel-art standing lantern with amber flame, ~24x32
2. `lantern_dark.png` -- same lantern, extinguished/smoldering, ~24x32
3. `lantern_trap.png` -- same lantern with red/suspicious glow, ~24x32
4. `prowler.png` -- small dark crouching figure with purple eyes, ~16x16

---

## Priority 3: Heist (all shapes)

| Element | Shape | Color | Size | Count | Sprite Needed |
|---|---|---|---|---|---|
| **Ring segments** | Arcs via graphics | `#6b5b3e` normal, `#dda055` set/gap, `#8b6ea6` linked, `#cc4444` trap | 8px stroke, r50-162 | 3-5 rings, 12-16 segments each | **Considered** -- the arcs are the core gameplay; a sprite approach would need a full ring sprite per state, or keep as graphics with better visual detail. |
| **Keyhole body** | Circle | `#1a1a1a` | r20 (40x40) | 1 | **Yes** -- a pixel-art keyhole/lock body would anchor the scene visually. |
| **Keyhole slot** | Rectangle + circle | `#2a2a2a` | 8x20 + r6 | 1 each | Merged into the keyhole sprite. |
| **Noise bar** | 2 Rectangles | `#2a2520` bg, dynamic fill | 220x6 | 1 | Low priority -- HUD element, shapes are fine. |

### Heist Sprite List
1. `lock_body.png` -- ornate lock/keyhole center piece, ~48x48
2. Ring segments are better kept as graphics (they rotate, segment, and change state dynamically). Could add a decorative ring texture overlay but the arcs are functional.

---

## Priority 4: Ritual (all shapes)

| Element | Shape | Color | Size | Count | Sprite Needed |
|---|---|---|---|---|---|
| **Candle body** | Rectangle | `#d4c5a9` cream | 10x24 | 4-6 | **Yes** -- pixel-art candle on a small base. |
| **Candle glow** | Circle | Per-candle color (red/green/blue/gold/purple/orange) | r14 (28x28) | 4-6 | Optional -- keep as a radial glow effect behind the sprite. |
| **Candle flame** | Circle | Per-candle color | r6 (12x12) | 4-6 | Merged into candle sprite (or a separate animated flame overlay). |
| **Altar surface** | Rectangle | `#2a2520` dark brown | 300x40 | 1 | **Yes** -- a stone altar/table sprite. |

### Ritual Sprite List
1. `candle.png` -- pixel-art candle with wick (unlit base), ~12x28
2. `candle_flame_{color}.png` -- 6 color variants of a small flame overlay, ~8x12 each (or tint a single white flame sprite)
3. `altar.png` -- stone altar/table, ~128x24 (tiled or single piece)

---

## Priority 5: Brawl (mostly shapes)

Cat and barrel sprites exist but enemies are hand-drawn circles.

| Element | Shape | Color | Size | Count | Sprite Needed |
|---|---|---|---|---|---|
| **Arena floor** | Rounded rectangle | `#2a2820` | ~340x420 | 1 | **Yes** -- a stone/dirt arena tileset would set the scene. |
| **Floor specks** | Circles | `#2e2c24` | r2-5 | 20 | Low -- decorative scatter, could become part of arena tile. |
| **Grunt rat body** | Circle | `#8a5a4a` | r10 (20x20) | 3-7 | **Yes** -- `rat.png` exists but BrawlScene uses circles as fallback. Wire the existing sprite. |
| **Grunt rat eyes** | 4 Circles | white + black | r2 + r1 | 4 per rat | Merged into rat sprite. |
| **Skirmisher rat** | Circle | `#b04a4a` redder | r10 (20x20) | 1-3 | **Yes** -- tinted variant of rat sprite, or a distinct skirmisher sprite. |
| **Boss rat** | Circle | `#6a3a2a` | r18 (36x36) | 1 | **Yes** -- a larger, meaner rat sprite. |
| **Windup telegraph** | Circle | white/red glow | r14 or r24 | 1 per winding rat | Optional -- keep as a shape effect (it's a telegraph signal). |
| **Attack slash** | Arc + lines | `#dda055` gold | ~52px radius | transient | Optional -- keep as shape (claw-swipe effect). |
| **Joystick** | 2 Circles | `#2a2520` + `#6b5b3e` | r36 base + r14 knob | 1 each | Low -- UI control, shapes are standard. |
| **Attack button** | Rectangle | `#5a2a20` | 60x60 | 1 | Low -- UI control. |

### Brawl Sprite List
1. Wire existing `rat.png` for grunt rats (replace circle fallback)
2. `rat_skirmisher.png` -- redder/spikier rat variant, ~20x20
3. `rat_boss.png` -- larger menacing rat, ~36x36
4. `arena_floor.png` -- stone/dirt arena tile, ~64x64 (tiled)

---

## Priority 6: Fishing (mostly shapes)

| Element | Shape | Color | Size | Count | Sprite Needed |
|---|---|---|---|---|---|
| **Water background** | Rectangle | `#2a3a4a` blue | full width x 620h | 1 | **Yes** -- the biggest visual area. A water tile or gradient sprite. |
| **Dock** | Rectangles | `#5a4a3a` / `#6b5b4a` brown | platform 160x16, planks 30x14, posts 8x50 | 8 total | **Yes** -- a pixel-art wooden dock. |
| **Bobber** | Circle | `#dda055` gold | r6 (12x12) | 1 | **Yes** -- a small fishing bobber sprite. Focal point of the approach phase. |
| **Fish zone bar** | Rectangle | `#4a8a4a` green | 28x~108 | 1 | Low -- gameplay UI element, shapes work. |
| **Hook indicator** | Rectangle | `#c4956a` gold | 24x8 | 1 | Low -- gameplay UI element. |
| **Water ripples** | Circles | `#4a5a6a` | r2 | ~10 | Low -- ambient decoration. |

### Fishing Sprite List
1. `water_tile.png` -- repeating water tile, ~32x32 (with subtle wave detail)
2. `dock.png` -- wooden dock/pier, ~160x60 (single piece or tileable planks)
3. `bobber.png` -- small fishing bobber, ~12x16

---

## Priority 7: Pounce (partial shapes)

Cat and rat sprites exist. The main gap is the structure blocks.

| Element | Shape | Color | Size | Count | Sprite Needed |
|---|---|---|---|---|---|
| **Wood blocks** | Rectangles | `#4a3a28` | ~22x22 | 3-5 | **Yes** -- a wooden crate/plank tile. |
| **Stone blocks** | Rectangles | `#6a6a6a` | ~22x22 | 2-3 | **Yes** -- a stone brick tile. |
| **Glass blocks** | Rectangles | `#88aacc` | ~22x22 | 1-3 | **Yes** -- a glass pane tile with transparency/shine. |
| **Projectile** | Circle | `#c4956a` gold | r8 (16x16) | 1 | Could reuse the breed idle sprite (already done partially). |
| **Ground bar** | Rectangle | `#2a2520` | full width x 40 | 1 | Low -- background element. |

### Pounce Sprite List
1. `block_wood.png` -- wooden crate/plank, ~24x24
2. `block_stone.png` -- stone brick, ~24x24
3. `block_glass.png` -- glass pane with shine, ~24x24

---

## Priority 8: Scent Trail (mostly shapes)

| Element | Shape | Color | Size | Count | Sprite Needed |
|---|---|---|---|---|---|
| **Fog tiles** | Rectangles | `#1a1a2a` dark blue | ~37x37 | 49-81 | **Considered** -- a fog/mist tile could enhance atmosphere, but the flat dark tiles work as "unknown" squares. |
| **Wall tiles** | Rectangles | `#3a3530` grey | ~37x37 | 4-10 | Optional -- a stone wall tile would add texture. |
| **Mist particles** | Ellipses | `#3a3a4a` | ~12x4 | 7-12 | Low -- ambient decoration. |

### Scent Trail Sprite List
1. `fog_tile.png` -- dark misty square, ~32x32
2. `wall_tile.png` -- stone wall square, ~32x32

---

## Priority 9: Courier Run (almost there)

Already 50/50 sprite vs rectangle for obstacles. The gap is small.

| Element | Shape | Color | Size | Count | Sprite Needed |
|---|---|---|---|---|---|
| **Non-barrel obstacles** | Rectangles | earthy browns | 30x30 | varies | **Yes** -- fill in the non-barrel obstacle variants (cart, crate, flour sack sprites already exist in the project but aren't always wired). |
| **Lane backgrounds** | Graphics fills | alternating browns | full width x 80 | 3 | Low -- functional lane dividers. |

### Courier Run Sprite List
1. Wire existing obstacle sprites more consistently (barrel, cart, crate, flour_sack, pew)

---

## Priority 10: Puzzle / Slide Blocks (mostly covered)

Block sprites (barrel, crate, etc.) are already overlaid on the sliding blocks. The target block has a cat sprite. Minimal gaps.

| Element | Shape | Color | Size | Count | Sprite Needed |
|---|---|---|---|---|---|
| **Grid background** | Rectangle | `#2a2520` dark | ~300x300 | 1 | Low -- functional background. |
| **Exit marker** | Triangle | `#4a8a4a` green | ~16px | 1 | Optional -- a small door/gate sprite. |

---

## Priority 11: Nonogram (intentionally shapes)

The grid of filled/empty squares IS the art. Pixel art tiles would add visual noise without gameplay value. **Recommend keeping as shapes.** The only potential addition is a themed header image for each puzzle (the solution preview), but those are already text-described.

---

## Generation Workflow

For each scene in priority order:

1. **List the sprites needed** (above)
2. **Generate with PixelLab** using the MCP tools:
   - `create_map_object` for standalone objects (lanterns, candles, bobbers, locks)
   - `create_tiles_pro` for tileable surfaces (ledges, walls, water, arena floor)
   - `create_character` for characters (prowlers, boss rat, skirmisher)
3. **Save to** `public/assets/sprites/{scene_name}/` (e.g. `public/assets/sprites/patrol/lantern_lit.png`)
4. **Preload in BootScene** (`this.load.image('lantern_lit', 'assets/sprites/patrol/lantern_lit.png')`)
5. **Replace shapes in scene** (`this.add.rectangle(...)` -> `this.add.sprite(...)` with `texture.setFilter(Phaser.Textures.FilterMode.NEAREST)`)
6. **Test** via the Day of Rest title menu (fastest way to reach any minigame)

### Total Sprites Needed (Estimate)

| Scene | Count | Notes |
|---|---|---|
| Roof Scout | 4-5 | Player, ledge tile, wall tile, summit, (wire fish.png) |
| Patrol | 4 | Lantern lit/dark/trap, prowler |
| Heist | 1-2 | Lock body, optional ring texture |
| Ritual | 3 | Candle, flame overlay, altar |
| Brawl | 3-4 | Wire rat.png, skirmisher, boss rat, arena tile |
| Fishing | 3 | Water tile, dock, bobber |
| Pounce | 3 | Wood/stone/glass block tiles |
| Scent Trail | 2 | Fog tile, wall tile |
| Courier Run | 0 | Wire existing sprites more consistently |
| **Total** | **~23-25 new sprites** | Plus wiring 3-4 existing sprites that aren't connected |
