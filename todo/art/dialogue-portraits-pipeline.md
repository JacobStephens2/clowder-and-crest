# Dialogue Character Portraits — Midjourney Pipeline

## Overview

The bond conversation system (`src/ui/Conversations.ts`) uses Fire-Emblem-style dialogue with two character portraits anchored bottom-left and bottom-right. Currently filled with scaled-up pixel sprites. This guide covers the manual Midjourney pipeline for generating proper illustrated portraits and the automated steps Claude Code handles.

---

## Art Direction

**Style:** Painterly cel-shading inspired by Fire Emblem: Path of Radiance and Awakening. Expressive faces, anthropomorphized animal characters in medieval garb, waist-up framing. NOT pixel art — this asset class intentionally breaks from the game's pixel register.

**Reference:** `todo/archive/dialogue-full-screen-style-inspiration/` — Fire Emblem Path of Radiance and Awakening character portraits.

**Resolution:** 480×640 pixels (3:4 aspect ratio).

---

## Pipeline

### Step 1 — Generate in Midjourney (Manual)

Open Midjourney via Discord or midjourney.com. Use the following base prompt template:

```
[breed] anthropomorphic [animal] character portrait, medieval fantasy garb,
waist-up framing, painterly cel-shading, expressive [expression] face,
Fire Emblem Path of Radiance style, warm lighting, detailed fabric textures,
soft background --style raw --ar 3:4 --v 6
```

**Per-expression variants.** For each character, generate at minimum:

| Expression key | Prompt modifier |
|---|---|
| `neutral` | calm composed expression, gentle eyes |
| `happy` | warm smile, bright eyes, soft laugh |
| `sad` | downcast eyes, slight frown, melancholy |
| `angry` | furrowed brow, intense eyes, clenched jaw |
| `surprised` | wide eyes, raised eyebrows, open mouth |

Add more expressions as needed per character's story beats. Check the conversation scripts in `src/data/conversations/` to see which emotions each character actually uses.

**Consistency tips:**

- Lock a seed (`--seed <number>`) once you have a base portrait you like for a character, then regenerate with expression modifiers.
- Use `--cref <url>` (character reference) with the neutral portrait URL to keep identity consistent across expressions.
- Keep clothing, accessories, and color palette identical across all expressions of the same character — only the face should change.
- Batch one character at a time: get neutral right first, then derive all expressions from it.

### Step 2 — Export from Midjourney (Manual)

1. Upscale the chosen variant (U1–U4).
2. Save the full-resolution image locally.
3. Drop raw files into a staging folder: `todo/portraits-raw/`.

### Step 3 — Process and Install (Claude Code)

Claude Code handles everything from here. Run the portrait processing task:

**Resize and crop** each raw image to exactly 480×640 pixels:
- Center-crop if the aspect ratio doesn't match exactly (Midjourney's 3:4 should be close).
- Use Lanczos resampling for quality downscaling.
- Output as optimized PNG.

**Rename and place** into the asset directory:

```
public/assets/sprites/portraits/
├── <breed>_neutral.png
├── <breed>_happy.png
├── <breed>_sad.png
├── <breed>_angry.png
├── <breed>_surprised.png
└── ...
```

Filename format: `<breed>_<expression>.png` — all lowercase, underscores, no spaces.

**Processing script** (Python with Pillow):

```python
from PIL import Image
import os
import sys

TARGET_W, TARGET_H = 480, 640

def process_portrait(input_path, output_path):
    img = Image.open(input_path).convert("RGBA")
    # Center-crop to 3:4 if needed
    w, h = img.size
    target_ratio = TARGET_W / TARGET_H
    current_ratio = w / h
    if current_ratio > target_ratio:
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        img = img.crop((left, 0, left + new_w, h))
    elif current_ratio < target_ratio:
        new_h = int(w / target_ratio)
        top = (h - new_h) // 2
        img = img.crop((0, top, w, top + new_h))
    img = img.resize((TARGET_W, TARGET_H), Image.LANCZOS)
    img.save(output_path, "PNG", optimize=True)

# Usage: process_portrait("todo/portraits-raw/corgi_happy.png",
#                         "public/assets/sprites/portraits/corgi_happy.png")
```

### Step 4 — Integration Check (Claude Code)

After portraits are placed, verify:

1. **Fallback still works.** `Conversations.ts` should already fall back to pixel sprites when a portrait file is missing. Confirm this path exists and functions.
2. **All conversation characters have portraits.** Cross-reference the character list used in `src/data/conversations/` against the files in `public/assets/sprites/portraits/`. Log any missing breed/expression combos.
3. **Expression coverage.** For each character, check which expressions are actually referenced in their conversation scripts. Flag any referenced expression that lacks a portrait file.

### Step 5 — Validation Checklist (Claude Code)

```
[ ] All portraits are exactly 480×640
[ ] All filenames follow <breed>_<expression>.png convention
[ ] No portrait exceeds 500KB (re-optimize if so)
[ ] Every character in the conversation system has at least a neutral portrait
[ ] Fallback to pixel sprite works when portrait is missing
[ ] Active-speaker highlight system in Conversations.ts works with new portraits
[ ] Portraits render correctly at the dialogue layout's display size
```

---

## Character Roster

<!-- Fill this in with your actual character list -->
<!-- Example: -->
<!--
| Breed | Required Expressions | Notes |
|---|---|---|
| corgi | neutral, happy, sad, angry | protagonist — needs most expressions |
| tabby | neutral, happy, surprised | side character — 2 conversations |
-->

Derive this list from `src/data/conversations/` — every unique character that appears in a bond conversation needs portraits.

---

## Budget

- Midjourney Standard plan: $30 for one month
- Estimated generations: ~20-30 unique characters × 3-5 expressions × 2-4 iterations each = 200-600 generations
- Standard plan with relaxed mode handles this comfortably

---

## Notes

- This is the ONLY asset class that uses illustrated art instead of pixel art. Everything else in the game stays pixel.
- PixelLab is NOT used for these assets.
- Gemini (Nano Banana 2) and GPT Image 1.5 can be used for quick ideation and expression variant exploration before committing to final Midjourney generations, but Midjourney is the source of truth for shipped art.
- The portrait slots and active-speaker highlight system already exist in `Conversations.ts`. The only missing piece is the art files.
