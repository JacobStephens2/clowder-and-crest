# Character Audit

An evaluation of the Clowder & Crest characters against the framework in `What Makes a Good Character in a Story.md`. The framework's six elements:

1. **Want** (surface goal) + **Need** (deeper emotional driver)
2. **Wound / false belief** (the psychological scar shaping behaviour)
3. **Authentic flaws** (consequences of the wound — not arbitrary weaknesses)
4. **Distinctive voice** (how they speak, what they notice, how they move)
5. **Real stakes** (what they stand to lose)
6. **Meaningful arc** (change / flat / negative)

Sources audited: `src/data/conversations.json` (45 pair + 7 group conversations), `todo/story/Story.md`, `src/main.ts` chapter event narratives, the bond rank-A passes from the founder-flaw spine work in v2.3.0.

Letter grade per element. The point of grades is to surface the *thinnest* element per character, not to rank characters against each other.

---

## The Wildcat (player / founder)

The protagonist. Always present. Named at character creation.

| Element | Grade | Notes |
|---|---|---|
| Want | **A** | "Build something out of nothing" — the founding stray finding shelter, then a partner, then a home. Surface goal aligns with player goals (recruit, do jobs, grow the guild). |
| Need | **A** | The founder-flaw spine I added in v2.3.0 (`5e96e8e`, `3be1b14`) gives the wildcat a deeper need: *learn how to be protected, not just protect*. This is the central wound and it lands clearly across the rank-A pair conversations. |
| Wound | **A** | "When you're a stray, the only paws you can count on are your own" (`maine_coon_wildcat` rank A). Explicit, unambiguous, and grounded in the prologue's storm scene. |
| Flaws | **A−** | Refusal to delegate, refusal to ask for help, brittleness against the cost of building alone. All consequences of the wound. The Long Winter day-4 persuasion conversation lets the player *act on* the flaw, not just hear about it. |
| Voice | **B+** | Stoic, terse, observational. "Speed keeps you alive when you're small." Strong distinct voice across conversations. The pronoun system (3be1b14) supports player gender choice without changing voice. |
| Stakes | **A** | The Long Winter (`64640ef`) added the missing structural fall — for the first time in the arc, the wildcat can *almost lose the family*. Before that, stakes were implied; now they're felt. |
| Arc | **A** | Change arc. Stray → founder → recognized leader → tested by winter → established. The founder-flaw spine gives it an *interior* dimension on top of the *exterior* progression. |

**Verdict: A−.** The strongest character in the project, intentionally so. No urgent fixes. Future work: add a few more pronoun-line swaps in narrative copy (the gender selector landed but only one user-flagged line was actually swapped).

---

## Russian Blue ("Mist")

The quiet observer. The first recruit in many playthroughs.

| Element | Grade | Notes |
|---|---|---|
| Want | **B** | "Watch and protect from the edges." Visible in `wildcat_russian_blue` C-rank ("I was watching the grain store"). Less articulated than the wildcat's. |
| Need | **B−** | Implied: she wants to be *seen*, not just to see others. The C-rank line "you don't have to build it alone" is gestural toward this but never named directly. |
| Wound | **C** | Not surfaced. We don't know why she's quiet, what she's running from, what made her watchful. Compare to the wildcat (storm + lean-to) or the bengal (defected from a corrupt guild) — Russian Blue has no equivalent backstory beat. |
| Flaws | **B−** | Reticence, watchful from a distance, slow to commit. These could be flaws if connected to a wound but they currently read as personality traits. |
| Voice | **B+** | Distinctly quiet — short sentences, observational, "the sound of water on stone" (B-rank "Rain on the Roof"). One of the most poetic voices in the cast. |
| Stakes | **C+** | What does she stand to lose? Her position as the wildcat's confidant? Unclear. |
| Arc | **B** | Flat arc by default — she's a steady presence whose values don't change. That's a valid arc shape but it could lean further into "catalyst who changes the wildcat" since she's the one teaching the wildcat to *receive* protection. |

**Highest-leverage fix: give Russian Blue a backstory wound.** A single line in her C-rank or in a chapter event scene about *why* she watches from the edges. Even a half-sentence — "I had a guild before. It didn't end well. I learned to watch first" — would convert her from a personality into a person. Doesn't require new narrative scenes, just one or two new lines in `wildcat_russian_blue` C or `russian_blue_*` opening lines.

---

## Tuxedo (the clerk)

Methodical, organizing, the ledger-keeper. Recruited around chapter 2-3.

| Element | Grade | Notes |
|---|---|---|
| Want | **A−** | Order. "I've mapped the courier routes. Three optimal paths" (`tuxedo_siamese` C). Concrete, immediate, plot-actionable. |
| Need | **B+** | To make the wildcat *trust* him with the books. The rank-A "Two Kinds of Order" conversation (which I edited in `f7027ed`) lands this directly: "It was hard, you know. Letting you take the ledger." |
| Wound | **C+** | Implied perfectionism + need to be useful, but no explicit backstory. Why the obsession with order? What happens if he fails? Unanswered. |
| Flaws | **B+** | Pedantic, judgmental about disorder, slow to accept improvisation. All consistent with the want/need but could be sharpened with a wound. |
| Voice | **A** | The most distinctive voice in the cast after the wildcat. Dry, precise, slightly arch ("A crude metaphor. But accurate."). Reads as a specific person from the first line. |
| Stakes | **B** | His role is the ledger; if the wildcat takes it back, what is he? Implied but not landed. |
| Arc | **B+** | Change arc. Goes from "let me organize everything" to "I'm here to remind you it's allowed to put things down." Earned in the rank-A dialogue. |

**Highest-leverage fix: tuxedo's wound.** Same shape as Russian Blue's — one line about *why* he became the clerk. "I lost a guild once because no one wrote things down." Or "My brother was a guildmaster. He drowned the books in fish tea and then he drowned the guild." Specific, evocative, and converts the personality into a person.

---

## Maine Coon (the gentle giant)

Gentle, patient, the door-holder. Often the second or third recruit.

| Element | Grade | Notes |
|---|---|---|
| Want | **B+** | To protect. "I can hold a door all night" (`maine_coon_wildcat` C). Concrete. |
| Need | **B** | To be *seen* as more than a body. The B-rank "What We Protect" gestures at this ("you're more thoughtful than you look") but doesn't dig in. |
| Wound | **C+** | Not surfaced. The most "gentle giant" trope-coded character in the cast. He NEEDS a backstory beat that gives the trope weight. |
| Flaws | **B−** | Self-deprecation about his strength, willingness to suffer in silence (he held the door alone during the plague — that's both heroic and a flaw). The flaws exist but they're interpreted as virtues most of the time. |
| Voice | **B+** | Soft-spoken, plain, slightly slow. "Big body, big heart. It's a package deal." Distinctive but lower-resolution than Tuxedo's. |
| Stakes | **B+** | His scratches in the plague rank-A are real. The implication that he could break is the stakes-shaped hole in his arc. |
| Arc | **B** | Flat arc with one moment of shift — the rank-A "you don't have to carry everything alone" beat that I sharpened in the founder-flaw spine pass. |

**Highest-leverage fix: actually let Maine Coon hurt.** His "I held the door alone" line is the strongest thing he has but it's framed as quiet heroism, not damage. A single chapter scene where he visibly limps from old wounds, or a B-rank line where he admits the cathedral fight scared him more than he showed, would convert him from "gentle giant" to "gentle giant with cracks."

---

## Siamese (the believer)

The mystic. Sees omens. Talks to saints. Recruited in chapter 3-4.

| Element | Grade | Notes |
|---|---|---|
| Want | **A−** | To witness — to be the one who sees patterns others miss. "Ash means grief. Lavender means someone wants to forget" (`tuxedo_siamese` B). |
| Need | **A−** | To have the wildcat believe — at least a little. The wildcat's skepticism is the obstacle, and the rank-A "What the Storm Brought" lands on a near-miracle the wildcat almost accepts. Strong tension. |
| Wound | **B** | Implied by the bell tower setting and the Saint Gertrude devotion — she's a former monastery cat? Not stated directly. There's room for one line of backstory. |
| Flaws | **B+** | Magical thinking, superstitious in the wrong moments, slightly imperious about her gifts. The flaws are consistent with the want. |
| Voice | **A** | The most poetic voice in the cast. "Possibly. But my way is more interesting, isn't it?" Immediately recognizable. |
| Stakes | **B+** | Her stakes are spiritual: if the wildcat never believes her, has she failed? The shadow_crisis group conversation lands this beautifully but only for shadow-path players. |
| Arc | **B+** | Flat arc. She's the catalyst who shifts the wildcat's worldview slightly toward "maybe the saints chose us." Earned across the C/B/A progression. |

**Highest-leverage fix: surface the monastery backstory.** One line in her C-rank: "Before the bell tower I lived in a monastery. The monks died first." Or: "I came from a chapel that burned. The candles outside it still light themselves at dusk." Converts the believer from a trope into a survivor.

---

## Bengal (the defector)

The restless, brilliant ex-Silver-Paws cat. Late recruit (chapter 6+).

| Element | Grade | Notes |
|---|---|---|
| Want | **A** | Freedom from the "rules" of the Silver Paws + a real fight. "I want to see what that looks like from the inside" (revised C-rank in 4575b94). |
| Need | **A−** | To learn how to *choose* — the rank-A "Where I Belong" lands this directly: "I miss the certainty. Someone always told you what to do." |
| Wound | **A−** | The Silver Paws specifically. "They promised glory. They delivered politics." This is the cleanest backstory wound in the cast — it's named, it's specific, and it has a face (the rival guild). |
| Flaws | **A** | Restlessness, hunger for problems, can't sit still, distrustful of softness. All consistent with the wound. The B-rank "Restless Energy" is the best flaw-as-personality moment in the project. |
| Voice | **A** | Sharp, self-aware, slightly bitter. "The best kind." Distinct from every other cat. |
| Stakes | **B+** | What does he lose if he fails the wildcat's guild? Going back to the Silver Paws? Becoming a stray again? Implied but not crystallized. |
| Arc | **A−** | Change arc with strong specificity. Bengal goes from "give me orders" to "I'm learning to choose." The rank-A line "we're broken in opposite directions" is the project's best two-character mirror. |

**Verdict: A−.** Bengal is the project's second-strongest character after the wildcat. No urgent fixes. He benefits from being a *late* recruit — by the time the player meets him the writer (the team) has had practice with characterization.

---

## The Silver Paws (antagonist guild)

The rival guild that arrives in chapter 6. The collective antagonist.

| Element | Grade | Notes |
|---|---|---|
| Want | **C** | To dominate the town's contracted work? Specifics aren't fleshed out. We hear ABOUT them (sleek, well-funded, ornate) but rarely from them directly. |
| Need | **C−** | Unknown. The doc says "the best antagonists believe they are right" — we don't know what the Silver Paws believe. |
| Wound | **D** | None given. They are "rival guild" without psychology. |
| Flaws | **C+** | Shown indirectly through bengal's defection (politics, broken promises) but no antagonist scene where the Silver Paws speak in their own voice. |
| Voice | **D** | Faceless. They have no named member who speaks. The chapter 6 narrative scene refers to them collectively. |
| Stakes | **B** | Their threat to the guild is real (poach a cat at high rival influence) but it's mechanical, not relational. |
| Arc | **D** | They appear, get defeated, leave. Flat antagonist arc. |

**Highest-leverage fix: give the Silver Paws a NAMED leader.** A single antagonist character — call him *Silvermane* or *Gris* or whatever — who shows up in the chapter 6 standoff narrative and speaks for the rival guild. He should have:
- A *want* that mirrors the wildcat's distorted (wants to build a guild, but built it on hierarchy and politics instead of belonging)
- A *belief* he holds that the wildcat could ALMOST agree with ("the only way to protect the cats is to make sure they can never refuse you")
- A defeat scene where he's not destroyed but *exposed* — the wildcat's vision wins not through fighting but through proving a different way

The chapter 6 standoff art prompt I added (`05c0e94`) anticipates this scene exists but the dialogue doesn't yet. Adding ~6-8 lines of dialogue between Silvermane and the wildcat in the chapter 6 narrative would convert the Silver Paws from a faceless antagonist to a real one. **This is the single biggest character improvement available.**

---

## Brother Aldric (Inquisitor)

The chapter 7 antagonist. Shows up at the guildhall gate at dawn.

| Element | Grade | Notes |
|---|---|---|
| Want | **B+** | To determine what the cats truly are. Concrete, mission-driven. |
| Need | **B** | Implied: he wants to find a holy guild because his faith depends on it. The Vindicated verdict has a real warmth ("I have seen enough") that suggests this. |
| Wound | **C** | Not surfaced. Why is he the Inquisitor? Was he sent because he's a believer or a skeptic? |
| Flaws | **B** | His judgment is binary — vindicated, acquitted, or condemned. Real characters have more shades. |
| Voice | **B+** | Formal, observational, judicial. "Are you servants of the saints? Or something... else?" Distinct enough. |
| Stakes | **B** | His report goes to the Bishop. His own career rides on the verdict. Implied. |
| Arc | **B+** | Flat arc with one of three landing patterns based on the player's reputation choices. Each landing is character-consistent. |

**Highest-leverage fix: give Aldric ONE moment of doubt.** A single line in the inquisition observation period where he says or thinks something that hints he WANTS the verdict to be vindicated — that he came hoping the cats would prove holy, not hoping to condemn them. Tilts him from "cold judge" to "judge with skin in the game." Could land in any of the inquisition daily-progression toasts.

---

## Group dynamics observations

The **shadow_crisis** group conversation is the project's strongest character moment. It's the closest thing to a chapter 4-5 ensemble scene where each cat has a recognizable voice and the wildcat has to acknowledge a moral fall. If the team writes more group conversations, this is the model.

The **plague_aftermath** group conversation is also strong. The cathedral procession beat lands.

The other group conversations are thinner. They tend to have one cat lead and the rest assent. Pushing more of them toward the shadow_crisis structure (each cat speaks from their *own* characterization, not as a chorus) would benefit the project.

---

## Prioritized recommendations

In order of leverage:

### 1. Give the Silver Paws a named leader (highest leverage)
The single biggest character gap in the project. The chapter 6 antagonist is faceless. A named rival cat with ~6-8 lines of dialogue in the chapter 6 standoff scene would transform the chapter from "rival appears, rival defeated" into a thematic argument about *what kind of guild is worth building*. The art prompt is already in `art-prompts.md` for this scene; the dialogue is what's missing.

**Effort:** ~1 hour of writing + the chapter 6 narrative scene needs an extension. ~30-60 lines of code in main.ts.

### 2. Add backstory wounds to Russian Blue, Tuxedo, Maine Coon, Siamese
Four characters share the same gap: clear personalities, no scars. One line each in their C-rank conversations is enough. Each line should:
- Be specific and concrete (a place, a guild, a person)
- Connect to a flaw the player has already seen
- Be ~12-20 words

**Effort:** ~30 minutes of writing for all four. Edit `src/data/conversations.json`.

### 3. Sharpen Maine Coon's flaw-as-cracks
Currently his "I held the door alone" reads as quiet heroism. A B-rank line where he admits the fight scared him would convert him from gentle-giant trope into gentle-giant-with-cracks. The wildcat-maine_coon rank-A already has the prescription line; the wound side needs reciprocity.

**Effort:** ~10 minutes. Edit `maine_coon_wildcat` rank B in conversations.json.

### 4. Give Brother Aldric one doubt line
A single moment where he reveals he WANTS the cats to be holy. Could land as a toast during one of the inquisition observation days. Tilts him from cold judge to judge with skin in the game.

**Effort:** ~10 minutes. Edit the inquisition daily progression in main.ts.

### 5. Push more group conversations toward the shadow_crisis structure
Less concrete than the others. A future content pass on the existing group conversations to make sure each cat speaks from their own voice rather than as a chorus.

**Effort:** ~1-2 hours of editing. Edit `group_*` entries in conversations.json.

---

## What this audit is NOT saying

- **The current characters aren't bad.** Most fall in the B+ to A− range. The framework is being applied at a high standard — most game characters wouldn't even rate this far. The audit identifies *thin spots*, not failures.
- **All characters need to be A.** Some characters working as flat-arc personalities (Russian Blue, Maine Coon as written) is fine. The fixes above sharpen them, not replace them.
- **The Silver Paws fix is urgent.** It's the highest *leverage* fix because it's the only place where the framework reveals a structural absence (a real antagonist has psychology; ours doesn't). But it isn't blocking anything — the chapter 6 mechanic works fine as-is.

---

## What's already excellent (don't touch)

- The wildcat's founder-flaw spine
- Bengal's defector wound + arc
- Tuxedo's voice
- Siamese's voice
- The shadow_crisis group conversation
- The plague_aftermath group conversation
- The Long Winter day-4 persuasion conversation (the project's single best character moment, in my opinion — it lets the player *feel* the wildcat's flaw rather than just hear about it)
