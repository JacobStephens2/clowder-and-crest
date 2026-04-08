# Dialogue Portrait Prompts (Midjourney)

Ready-to-paste Midjourney prompts for the dialogue character portraits described in `art-prompts.md`. The workflow, processing pipeline, and validation checklist all live in `dialogue-portraits-pipeline.md` — this file is just the **prompts**.

Mirrors the structure of `music-prompts.md`: a shared style block (paste before every prompt) + per-character entries with explicit identity locks and one ready-to-paste line per expression.

## How to use

1. **Read `dialogue-portraits-pipeline.md`** once for the workflow, consistency tips (`--seed`, `--cref`), processing script, and validation checklist.
2. **Pick a character below.**
3. **Generate the Neutral prompt first.** When you have a base portrait you like, lock its `--seed <number>` and copy the Midjourney URL of the upscaled image to use as `--cref <url>` for the variant expressions. This is what keeps the same character recognizable across all 5 expressions.
4. **Generate the variant expressions** (happy, sad, angry, surprised) by pasting their prompts with the seed + cref appended.
5. **Save the upscaled chosen variant** to `todo/portraits-raw/<breed>_<expression>.png` and let Claude Code handle the resize-and-install per the pipeline file.
6. **Mark `[generated]`** next to each prompt as you complete it (mirrors how `music-prompts.md` tracks `- created`).

---

## Shared style block

Paste before every per-character description. Same purpose as the Suno shared block in `music-prompts.md` — it locks the genre + technical specs that apply to every prompt.

```
medieval fantasy character portrait, anthropomorphic cat, waist-up framing, painterly cel-shading inspired by Fire Emblem Path of Radiance and Awakening, expressive face, warm lighting, detailed fabric textures, soft background --style raw --ar 3:4 --v 6
```

(~250 chars; well under Midjourney's 1024-char prompt limit, leaves ample room for per-character details.)

## Expression modifiers

Append one of these to the per-character prompt body:

| Expression | Modifier phrase | When the dialogue uses it |
|---|---|---|
| neutral | calm composed expression, gentle eyes, mouth closed, ears forward | default opening line, listening |
| happy | warm smile, soft laughing eyes, ears relaxed | bond moments, success, affection |
| sad | downcast eyes, slight frown, ears flat, melancholy | loss, parting, regret |
| angry | furrowed brow, intense eyes, ears back, clenched jaw | confrontation, indignation |
| surprised | wide eyes, raised brows, mouth slightly open, ears forward alert | reveal moments, shock |

---

## Game Breeds (6 — generate first)

These are the 6 breeds the player can recruit today and that appear in `src/data/conversations.json`. All six have 15 unique pair conversations + group conversation lines.

### 1. Wildcat (player — protagonist) `[ ]`

**Identity (lock these on every prompt — never vary):**
brown tabby tomcat, dark stripes on warm umber base fur, fierce gold eyes, tufted lynx-like ears with one slightly notched at the tip from an old battle, muscular slightly broad build, simple worn leather collar with a single iron ring, rough green-grey wool cloak draped over one shoulder, no other accessories.

**Personality cue:** stoic guardian, the founding stray, eyes do most of the talking.

| Expression | Prompt |
|---|---|
| neutral `[ ]` | `medieval fantasy character portrait, anthropomorphic cat, waist-up framing, painterly cel-shading inspired by Fire Emblem Path of Radiance and Awakening, expressive face, warm lighting, detailed fabric textures, soft background, brown tabby tomcat with dark stripes on warm umber fur, muscular build, fierce gold eyes, tufted lynx-like ears with one notched tip, worn leather collar with iron ring, rough green-grey wool shoulder cloak, calm composed expression, gentle eyes, mouth closed, ears forward, stoic guardian --style raw --ar 3:4 --v 6` |
| happy `[ ]` | (same identity) `... warm smile, soft laughing eyes, ears relaxed, rare moment of warmth ...` |
| sad `[ ]` | (same identity) `... downcast gold eyes, slight frown, ears flat, weight of memory ...` |
| angry `[ ]` | (same identity) `... furrowed brow, blazing gold eyes, ears back, clenched jaw, ready to fight ...` |
| surprised `[ ]` | (same identity) `... wide gold eyes, raised brows, mouth slightly open, ears forward alert, caught off guard ...` |

---

### 2. Russian Blue ("Mist") `[ ]`

**Identity:** sleek blue-grey shorthaired cat, well-groomed fur, gentle pale-green eyes, small rounded alert ears, slim slightly hunched build, dark indigo silk scarf wrapped high around the neck with a small silver clasp.

**Personality cue:** quiet observer, sees more than she says, often looking sideways or down before speaking.

| Expression | Prompt |
|---|---|
| neutral `[ ]` | `medieval fantasy character portrait, anthropomorphic cat, waist-up framing, painterly cel-shading inspired by Fire Emblem Path of Radiance and Awakening, expressive face, warm lighting, detailed fabric textures, soft background, sleek blue-grey shorthair cat, gentle pale-green eyes, small rounded ears, slim slightly hunched build, dark indigo silk scarf wrapped high at the neck with silver clasp, calm composed expression, gentle eyes, mouth closed, ears forward, quiet observer --style raw --ar 3:4 --v 6` |
| happy `[ ]` | (same identity) `... soft barely-there smile, eyes crinkled with quiet warmth, ears relaxed ...` |
| sad `[ ]` | (same identity) `... eyes lowered to the side, faint frown, ears slightly back, withdrawn ...` |
| angry `[ ]` | (same identity) `... narrowed pale-green eyes, lips pressed thin, ears back, restrained anger ...` |
| surprised `[ ]` | (same identity) `... wide pale-green eyes, eyebrows lifted, mouth open, ears alert and forward ...` |

---

### 3. Tuxedo ("Inkwell") `[ ]`

**Identity:** crisp black and white tuxedo cat, glossy black fur with bright white chest white paws white chin, sharp intelligent yellow-green eyes, upright attentive ears, trim slightly tall build, small round wire spectacles balanced on the nose, silver guild office pin at the collar.

**Personality cue:** the guild's quartermaster, dryly funny, eyebrow raise > smile.

| Expression | Prompt |
|---|---|
| neutral `[ ]` | `medieval fantasy character portrait, anthropomorphic cat, waist-up framing, painterly cel-shading inspired by Fire Emblem Path of Radiance and Awakening, expressive face, warm lighting, detailed fabric textures, soft background, crisp black and white tuxedo cat, glossy black fur with white chest paws and chin, sharp yellow-green eyes, upright ears, trim slightly tall build, small round wire spectacles, silver guild office pin at collar, calm composed expression, gentle eyes, mouth closed, ears forward, dignified quartermaster --style raw --ar 3:4 --v 6` |
| happy `[ ]` | (same identity) `... amused half-smile, one eyebrow slightly raised, eyes warm behind spectacles ...` |
| sad `[ ]` | (same identity) `... eyes lowered behind spectacles, mouth pressed flat, ears slightly back, weary ...` |
| angry `[ ]` | (same identity) `... eyes narrowed sharp behind spectacles, lips thin, ears back, cold disapproval ...` |
| surprised `[ ]` | (same identity) `... eyes wide behind spectacles, eyebrows raised, mouth slightly open, ears forward ...` |

---

### 4. Maine Coon ("Thorne") `[ ]`

**Identity:** large fluffy Maine Coon cat, abundant orange-brown fur with a cream chest, prominent ear tufts and chin ruff, warm amber eyes, broad-shouldered gentle-giant build, big paws, woven dark-brown wool cloak with a small carved bone clasp, small carved wooden charm hanging on a leather cord around the neck.

**Personality cue:** gentle giant, the guild's heart, slow to anger, the rare obvious smile.

| Expression | Prompt |
|---|---|
| neutral `[ ]` | `medieval fantasy character portrait, anthropomorphic cat, waist-up framing, painterly cel-shading inspired by Fire Emblem Path of Radiance and Awakening, expressive face, warm lighting, detailed fabric textures, soft background, large fluffy Maine Coon cat, abundant orange-brown fur with cream chest, prominent ear tufts and chin ruff, warm amber eyes, broad shoulders gentle giant build, woven dark-brown wool cloak with bone clasp, small carved wooden charm on leather cord at neck, calm composed expression, gentle eyes, mouth closed, ears forward, kind protector --style raw --ar 3:4 --v 6` |
| happy `[ ]` | (same identity) `... wide warm smile showing teeth slightly, amber eyes crinkled, ear tufts relaxed ...` |
| sad `[ ]` | (same identity) `... amber eyes downcast, mouth turned down, ears flat against the head, deep sorrow ...` |
| angry `[ ]` | (same identity) `... amber eyes blazing, mouth open in a quiet snarl, ears back, fur slightly bristled ...` |
| surprised `[ ]` | (same identity) `... amber eyes wide, mouth open, ear tufts twitched forward, caught mid-thought ...` |

---

### 5. Siamese ("Oracle") `[ ]`

**Identity:** Siamese cat, cream body with dark sepia points (face mask, ears, paws, tail tip), vivid blue eyes, long pointed dark ears, slender elegant slightly long build, delicate gold chain at the neck with a small carved fish charm, tiny silver bell on the wrist.

**Personality cue:** dramatic, mystical, prone to monologue, the guild's oracle, uses the whole face.

| Expression | Prompt |
|---|---|
| neutral `[ ]` | `medieval fantasy character portrait, anthropomorphic cat, waist-up framing, painterly cel-shading inspired by Fire Emblem Path of Radiance and Awakening, expressive face, warm lighting, detailed fabric textures, soft background, Siamese cat with cream body and dark sepia points on face ears paws and tail, vivid blue eyes, long pointed dark ears, slender elegant build, delicate gold chain with carved fish charm at neck, tiny silver bell on the wrist, calm composed expression, gentle eyes, mouth closed, ears forward, mystical oracle --style raw --ar 3:4 --v 6` |
| happy `[ ]` | (same identity) `... bright warm smile, vivid blue eyes shining, ears relaxed, theatrical joy ...` |
| sad `[ ]` | (same identity) `... vivid blue eyes welling slightly, mouth turned down dramatically, ears flat, lamenting ...` |
| angry `[ ]` | (same identity) `... vivid blue eyes blazing, mouth open mid-declamation, ears back, righteous fury ...` |
| surprised `[ ]` | (same identity) `... vivid blue eyes huge, eyebrows raised dramatically, mouth open in a gasp, ears forward ...` |

---

### 6. Bengal ("Ember") `[ ]`

**Identity:** athletic Bengal cat, golden-tan base fur with bold dark rosettes and stripes (real Bengal pattern, not generic tabby), intense gold-green eyes, small alert ears, wiry restless build, simple red cloth bandana tied around one wrist, thin braided cord at the base of the tail.

**Personality cue:** the youngest, the troublemaker, the one with the best ideas and the worst timing, never quite still.

| Expression | Prompt |
|---|---|
| neutral `[ ]` | `medieval fantasy character portrait, anthropomorphic cat, waist-up framing, painterly cel-shading inspired by Fire Emblem Path of Radiance and Awakening, expressive face, warm lighting, detailed fabric textures, soft background, athletic Bengal cat with golden-tan fur and bold dark rosette pattern, intense gold-green eyes, small alert ears, wiry restless build, simple red bandana tied at one wrist, calm composed expression, gentle eyes, mouth closed, ears forward, restless troublemaker --style raw --ar 3:4 --v 6` |
| happy `[ ]` | (same identity) `... mischievous grin, gold-green eyes glittering, ears perked, leaning forward ...` |
| sad `[ ]` | (same identity) `... gold-green eyes downcast, mouth turned down, ears flat, uncharacteristic stillness ...` |
| angry `[ ]` | (same identity) `... gold-green eyes wild, teeth bared, ears flat back, fur on end, ready to pounce ...` |
| surprised `[ ]` | (same identity) `... gold-green eyes huge, mouth open, ears straight up, frozen mid-motion ...` |

---

## Big Cats (3 — future, after the breeds are added to the game)

These don't exist in `src/data/breeds.json` yet — they're flagged in CLAUDE.md "What's Not Implemented Yet". Generate portraits for them only after the in-game pixel sprites and conversation entries land. Listed here so the prompts are ready when you do.

### 7. Lynx (guard / pest control specialist — chapter 6 unlock) `[ ]`

**Identity:** muscular Eurasian lynx, short bobbed tail, prominent black ear tufts, spotted grey-brown fur, intense gold eyes, soldier-like watchful posture, leather pauldron over one shoulder, small wooden practice sword strapped across the back.

| Expression | Prompt |
|---|---|
| neutral `[ ]` | `medieval fantasy character portrait, anthropomorphic lynx, waist-up framing, painterly cel-shading inspired by Fire Emblem Path of Radiance and Awakening, expressive face, warm lighting, detailed fabric textures, soft background, muscular Eurasian lynx with spotted grey-brown fur, prominent black ear tufts, short bobbed tail, intense gold eyes, broad soldier build, leather pauldron on one shoulder, wooden practice sword strapped across back, calm composed expression, gentle eyes, mouth closed, ears forward, watchful soldier --style raw --ar 3:4 --v 6` |
| happy / sad / angry / surprised `[ ]` | (same identity, append the matching expression modifier from the table at the top) |

### 8. Lion (sacred / leadership specialist — chapter 7 unlock) `[ ]`

**Identity:** young male lion just growing into his mane, soft golden mane filling in around the head, amber fur, regal upright posture, wide noble face, ceremonial gold-and-red sash draped diagonally across the chest, small bronze sun pendant.

| Expression | Prompt |
|---|---|
| neutral `[ ]` | `medieval fantasy character portrait, anthropomorphic young lion, waist-up framing, painterly cel-shading inspired by Fire Emblem Path of Radiance and Awakening, expressive face, warm lighting, detailed fabric textures, soft background, young male lion with soft golden mane just filling in, amber fur, wide noble face, regal upright posture, ceremonial gold-and-red sash draped diagonally across chest, small bronze sun pendant, calm composed expression, gentle eyes, mouth closed, ears forward, dignified paternal --style raw --ar 3:4 --v 6` |
| happy / sad / angry / surprised `[ ]` | (same identity, append the matching expression modifier) |

### 9. Leopard (stealth / shadow specialist) `[ ]`

**Identity:** sleek leopard, golden fur with bold dark rosettes (4-6 well-placed rosettes visible at this scale), slim predator build, low watchful posture, dark hooded cloak partially shadowing the face, knowing eyes.

| Expression | Prompt |
|---|---|
| neutral `[ ]` | `medieval fantasy character portrait, anthropomorphic leopard, waist-up framing, painterly cel-shading inspired by Fire Emblem Path of Radiance and Awakening, expressive face, warm lighting, detailed fabric textures, soft background, sleek leopard with golden fur and bold dark rosettes, slim predator build, low watchful posture, dark hooded cloak partially shadowing the face, knowing yellow-green eyes, calm composed expression, mouth closed, ears forward, cool spy --style raw --ar 3:4 --v 6` |
| happy / sad / angry / surprised `[ ]` | (same identity, append the matching expression modifier) |

---

## Tracking

When a portrait is generated and dropped into `todo/portraits-raw/`, change its `[ ]` checkbox above to `[generated]`. Once Claude Code processes it into `public/assets/sprites/portraits/<breed>_<expression>.png`, change to `[installed]`. This mirrors how `music-prompts.md` uses `- created` to track which Suno tracks are done.

## Notes

- **Always batch one character at a time.** Get neutral right first (it's the seed reference), then derive the four variant expressions from that exact seed + `--cref`. Do not jump between characters mid-batch — you'll lose continuity.
- **The 30 game-breed prompts (6 × 5)** are the priority. The 9 big-cat prompts (3 × 5, mostly templated) are future work and don't need to ship until those breeds land in the game.
- **If a generation feels off,** regenerate with the same seed but tweak only one descriptor (e.g. "muscular" → "lean", or move the cloak from the shoulder to the chest). Hold everything else constant. Drift compounds fast otherwise.
- **The conversation system already supports this** — see `src/ui/Conversations.ts:setPortrait()`. Drop in any one PNG and the next conversation that involves that breed will use it. No code changes required as portraits trickle in.
- **For final shipping:** every game breed needs at minimum a `neutral` portrait. Without `neutral`, the fallback to the pixel sprite kicks in for that line. With `neutral` only, the listener always shows neutral and only the speaker's expression updates (acceptable). With all 5 expressions, the conversation system can drive full emotional range from `conversations.json` `expression` fields.
