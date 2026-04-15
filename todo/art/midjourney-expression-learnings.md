# Dialogue Portrait Generation — Midjourney Learnings

Lessons and patterns from the April 2026 portrait generation session for Clowder & Crest. Reference alongside `dialogue-portrait-prompts.md` and `dialogue-portraits-pipeline.md`.

---

## The Core Problem

Midjourney's `--cref` (character reference) is excellent at maintaining identity across generations — but it fights against expression changes. The neutral portrait's calm face gets baked into every variant, producing characters that look serene no matter how many emotion words you add to the prompt. This is especially pronounced with characters that have noble or stoic faces (Maine Coon, Bengal).

## The `--cw` Parameter

`--cw` (character weight) controls how much the `--cref` image influences the result. It ranges from 0 to 100.

| Value | Face control | Body/clothing control | When to use |
|-------|-------------|----------------------|-------------|
| `--cw 100` | Locked to reference | Locked to reference | Default. Good for neutral portraits and mild expressions like happy |
| `--cw 50` | Shared between prompt and reference | Mostly reference | First thing to try when an expression isn't coming through |
| `--cw 0` | Entirely prompt-driven | Reference only | Nuclear option for stubborn expressions. Use for angry, sad, surprised |

Start every expression variant at `--cw 0`. The detailed identity description in the prompt (breed, eye color, fur pattern, clothing) provides enough consistency. The face freedom is worth the minor identity drift.

## Expression Intensity Scale

We went through three rounds of prompt intensity before expressions read clearly at dialogue portrait size.

### Level 1 — Original prompts (too subtle)

`warm smile, soft laughing eyes, ears relaxed, rare moment of warmth`

Barely distinguishable from neutral. Fine for real portrait photography, not enough for a game UI.

### Level 2 — Intensified (better, not enough for some characters)

`beaming joyful grin showing teeth, eyes squeezed into happy crescents, ears perked high and relaxed, head tilted slightly, radiating warmth and genuine delight`

Added "highly expressive face with exaggerated anime-influenced emotion" to style block. Described physical mechanics of the expression rather than just naming the emotion. Worked for happy and some surprised variants. Not enough for sad/angry on stoic characters.

### Level 3 — Ultra intensified + `--cw 0` (what actually shipped)

`ANGRY, ENRAGED, FURIOUS, ROARING, face contorted in pure feral rage, mouth ripped wide open screaming showing all teeth and fangs and tongue, nose bridge deeply wrinkled in a vicious snarl, gold-green eyes narrowed to wild furious slits, brow crushed downward, ears completely flat pinned back against skull, every hair standing on end bristling, hackles fully raised, hissing spitting with unhinged explosive fury`

Added ALL CAPS emotion anchors, visceral action verbs, specific muscle/anatomy descriptions, body language cues. Use Level 3 as the starting point for all future expression work.

## Proven Expression Templates

Paste one of these into the expression portion of the prompt. Replace eye-color placeholders.

### Happy

`beaming joyful grin showing teeth, eyes squeezed into happy crescents, ears perked high and relaxed, head tilted slightly, radiating warmth and genuine delight`

### Sad

`SAD, GRIEF, DESPAIR, visible tear tracks streaking down both cheeks through fur, [eye-color] eyes glassy wet and red-rimmed looking downward, inner eyebrows raised high in classic grief triangle, lower lip pushed out trembling, corners of mouth pulled sharply downward, chin dimpled with strain, ears drooping low and flat, head tilted down, whole face crumpling, holding back a sob`

### Angry

`ANGRY, ENRAGED, FURIOUS, ROARING, face contorted in pure feral rage, mouth ripped wide open screaming showing all teeth and fangs and tongue, nose bridge deeply wrinkled in a vicious snarl, [eye-color] eyes narrowed to wild furious slits, brow crushed downward, ears completely flat pinned back against skull, every hair standing on end bristling, hackles fully raised, hissing spitting with unhinged explosive fury`

### Surprised

`SURPRISED, extreme shock, [eye-color] eyes blown impossibly wide as dinner plates with pinprick pupils, jaw dropped completely mouth hanging wide open showing tongue and teeth, eyebrows shot up to the hairline, ears bolt straight up rigid and forward, fur standing on end, entire body frozen stiff, recoiling backward in total disbelief, dramatic anime gasp`

## Updated Style Block

Replace the style block in `dialogue-portrait-prompts.md` with this version for expression variants:

`medieval fantasy character portrait, anthropomorphic cat, waist-up framing, painterly cel-shading inspired by Fire Emblem Path of Radiance and Awakening, highly expressive face with exaggerated anime-influenced emotion, warm lighting, detailed fabric textures, soft background`

The addition of "highly expressive face with exaggerated anime-influenced emotion" is critical — it primes Midjourney to allow more dramatic facial deformation.

## Prompt Structure

```
[style block], [breed/identity description], [clothing/accessories], [EXPRESSION TEMPLATE] --style raw --ar 3:4 --v 6 --cref [neutral CDN URL] --cw 0
```

- Style block first (sets the overall aesthetic)
- Identity description next (breed, fur, eyes, build)
- Clothing/accessories after identity
- Expression LAST, right before the parameters — Midjourney weights the end of the prompt more heavily
- ALL CAPS emotion words act as strong anchors

## Character-Specific Notes

| Character | Difficulty | Notes |
|-----------|-----------|-------|
| Wildcat | Medium | Responds well to Level 2 intensity for most expressions |
| Russian Blue | Hard | Angry and surprised needed Level 3 + `--cw 0`. The slim, quiet face resists dramatic expression |
| Tuxedo | Medium | Spectacles add character but can obscure eye expressions. Push eye descriptions harder |
| Maine Coon | Hardest | The noble fluffy face absorbs emotion. Always use `--cw 0` and Level 3. Sad was the hardest single portrait in the project |
| Siamese | Hard | Sad needed `--cw 0`. The dramatic personality helps with angry/surprised |
| Bengal | Hard | Angry needed `--cw 0`. The athletic build helps convey emotion through body language |

## CDN URL Format

Midjourney image URLs follow this pattern:

```
https://cdn.midjourney.com/{job-id}/0_{variant-index}.png
```

The job ID is in the browser URL when you click on an image:

```
https://www.midjourney.com/jobs/{job-id}?index={variant-index}
```

Variant index is 0-based (variant 1 = index 0, variant 4 = index 3).

## Workflow for Future Characters

1. Generate neutral portrait first (no `--cref`, just the identity description)
2. Pick best variant, note the CDN URL
3. Generate **happy** with `--cref [url] --cw 50` (happy is usually achievable without `--cw 0`)
4. Generate **sad**, **angry**, **surprised** with `--cref [url] --cw 0` and Level 3 templates
5. If any expression doesn't read clearly at thumbnail size, regenerate — don't settle
6. Each generation gives 4 variants; pick the one where the emotion is most readable at small scale

## What Didn't Work

- **Subtle emotion descriptions** ("slight frown", "gentle sadness") — invisible at portrait scale
- **`--cw 100` for non-neutral expressions** — the reference face overrides everything
- **Named emotions without physical descriptions** ("angry expression") — too vague for Midjourney
- **Generating all expressions before validating neutral** — wastes generations if the base identity isn't right
- **Jumping between characters mid-batch** — loses visual continuity

## What Did Work

- **ALL CAPS emotion anchors** (SAD, ANGRY, SURPRISED) at the start of the expression block
- **Describing facial muscle mechanics** ("inner eyebrows raised in grief triangle", "nose bridge wrinkled", "corners of mouth pulled sharply downward")
- **`--cw 0`** for any expression beyond happy
- **"highly expressive face with exaggerated anime-influenced emotion"** in the style block
- **Visceral action verbs** ("ripped open", "crushed downward", "shot up") instead of adjectives
- **Body language** ("shoulders hunched", "recoiling backward", "frozen stiff") reinforcing the face
- **Batching one character at a time** — keeps identity consistent within a set
