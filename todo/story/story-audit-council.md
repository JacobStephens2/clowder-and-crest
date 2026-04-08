# Story Audit — Council Recommendation

A synthesis of three independent audits of Clowder & Crest's narrative against the principles in `What Makes a Great Rags to Riches Story.md`.

**Sources:**
- `story-audit-claude.md` — most detailed; concrete options, granular grading, structural argument
- `story-audit-codex.md` — most concise; scorecard format, converges on the same fall
- `story-audit-gemini.md` — most lenient; reads existing moral content as already substantially fulfilling Booker

**Reading order:** if you read only this file, you have the council's consensus, the one substantive disagreement, and the prioritized action list. Read the source audits when you want the granular reasoning.

---

## The one-line consensus

> **The bones are right and the family-as-riches theme is exceptional. The single structural gap is the crisis stage — the guild rises and is tested, but is never truly brought low and forced to re-earn what it built. Fix that and the existing material around home, faith, and chosen family will land much harder.**

All three audits independently arrive at this finding. It is the only thing they all flag as the highest-priority improvement.

---

## Where the council unanimously agrees

### 1. The crisis stage is the structural gap (highest priority)

| Model | Stage 4 grade | Words used |
|---|---|---|
| Claude | **D** | "the structural gap is the crisis stage… none of these is a 'loss of everything' moment forced on the player regardless of choices" |
| Codex | **Weak** | "the rise is better than the collapse… not yet truly brought low" |
| Gemini | **Mixed/Divergent** | "uses external threats… to test the player, rather than forcing a mandatory loss" |

The Rat Plague is read by all three as a **test the guild passes**, not a fall. The rival poaching and Inquisition exile are conditional and late. The starvation game over is a wall, not a recoverable fall. **The arc currently moves rags → rise → tests → recognition rather than rags → rise → collapse → earned triumph.**

### 2. Hidden value needs to be made legible early — through other characters' eyes

All three call for the same fix: **at least one early moment where another character recognizes the wildcat's worth before the institution does.** Claude and Codex both specifically call for a recruit who joins because of admiration / reputation / sensed character, not because they were paid fish. Gemini notes that other cats in the guild already see it (Tuxedo's "first through the door, last to leave") but agrees this needs to extend out into NPCs/townspeople in chapters 1-3.

### 3. The prologue, the family-as-home theme, the Catholic mythlore, and the bond conversations are the game's strongest elements and should not be touched

This is unanimous and emphatic. All three audits specifically tell the team to **protect** these elements and use them as the standard against which new writing is measured. Claude singles out the wildcat-russian_blue C-rank conversation as the highest bar in the project.

### 4. "Riches" being relational rather than economic is the game's identity

Codex and Gemini both call this the game's defining strength. Claude grades it A- under "Transformation vs Wish-Fulfillment." Any future writing that drifts toward fish totals or institutional rank as the meaning of success will weaken what makes the story distinct.

### 5. A false summit is missing right before each major reversal

Claude and Codex both explicitly call for warm, low-conflict beats (a baker's wave, a monk's nod, an extra fish "on the house") immediately before any chapter event that threatens the guild — so the audience doesn't read the warmth as foreshadowing until *after* the loss, at which point it stings. Gemini implies this through the "false summit" row in its scorecard ("the 'everything seems stable now' phase is not emphasized enough before reversal").

---

## The one substantive disagreement

> **Is the moral collapse in `group_shadow_crisis` already enough to satisfy Stage 4, or is a non-conditional fall still needed?**

- **Gemini's reading:** The shadow_crisis group conversation ("What Have We Become?") *is* the structural crisis. The cats realize that despite earning more fish than ever, the bonds are fraying. The Wildcat admits "Maybe we lost our way." This is a moral/emotional fall — and since the game's "riches" are family, **the loss of family is the loss of everything.** Gemini grades this "Mixed/Divergent" rather than "Weak" precisely because the existing material does dramatize a real fall, just relationally rather than materially.
- **Claude and Codex's reading:** The shadow_crisis only fires for players who took heavy shadow paths. **A player on the Crest path never sees it.** Therefore it cannot be the structural Stage 4 — Stage 4 has to fire regardless of how the player chose to play. The current game has *no* fall that fires for all players.

**Council synthesis:** Both views are right at different scopes.

Gemini is right that the **mechanism for dramatizing a moral fall already exists in the project**, and it works well. The team has proven they can write a relational collapse that hits.

Claude and Codex are right that this mechanism is **conditional, mid-arc, and reversible** — not a structural Stage 4. Most players will not experience it. The arc is incomplete for them.

**The right fix builds on what already works rather than inventing a new style of fall.** The Long Winter event proposed below should hit the same emotional register as shadow_crisis (relational fracture, the wildcat doubting itself, a cat almost leaving) rather than a purely material loss (firewood doubles, mood drops). Claude's Long Winter idea is the structural skeleton; Gemini's reading is the emotional template.

---

## The recommended action plan

In priority order. Effort estimates are deliberately rough — they exist to compare items against each other, not to commit to a schedule.

### 1. Long Winter event between Chapter 4 and Chapter 5 (highest priority — fills the structural gap)

A non-conditional event that fires for all players ~5 days after Chapter 4 (The Name) is reached. Specs:

- **Duration:** ~3-5 in-game days
- **Mechanics:** job board closes ("the town shuts down for the storm"), upkeep doubles, every cat's mood drops one tier, the kitchen's stockpile is depleted
- **Day 3 forced choice:** the granary is locked. The wildcat can break in for 50 fish (Shadow +20, journal entry of shame) or wait it out (one cat — randomly selected from the lowest-bond cats — packs to leave that night)
- **Day 4 relational beat:** if a cat is leaving, the wildcat must persuade them to stay in a scripted conversation that lands the founding flaw (see item 5 below). If the wildcat broke into the granary, a different cat confronts them about it.
- **Resolution:** the storm breaks. The wildcat actively reassembles the family — through choice, not through accumulating jobs. Chapter 5 ("Established") is then *earned* by surviving the winter and choosing to hold the family together, not by the previous accumulation-of-jobs progression.

**Why this version of the fix:** it satisfies Claude's structural argument (a non-conditional fall fires for all players), Gemini's emotional template (the loss is relational — a cat almost leaves, the family almost fractures), and Codex's framing ("a winter or famine stretch after recognition"). It builds directly on the proven shadow_crisis material.

**Effort:** ~6-8 hours of code + ~2 hours of writing. Single biggest narrative ROI in the entire backlog.

**Cross-link:** this is the same Stage 4 fix referenced in `todo/todo.md` G2 / G1 territory. If anything in `todo/todo.md` should escalate from "balance pass" into "narrative milestone," this is it.

### 2. Hidden-value glimpses through NPC eyes (chapters 1-3)

3-5 short narrative beats — toast notifications, journal entries, or one-line NPC reactions — where a townsperson recognizes something in the wildcat *before* the institution does. Examples:
- The miller, after the first job: *"I didn't think a stray would actually come. Most don't."*
- A monk on the cathedral steps in chapter 2: *"You're not just a cat, are you. There's something old in your eyes."*
- The merchant, slipping an extra fish: *"For the one who's building something."*

**Effort:** ~2 hours of writing + ~1 hour wiring as toasts/journal entries.

### 3. One recruit who joins for character, not fish

At least one scripted exception to the transactional recruitment system. A cat shows up unprompted in (say) chapter 2 or 3 and explicitly says: *"I came because I heard about what you did at the granary"* or *"I watched you work for a week before I knocked."* All three audits specifically call for this; Claude calls it "the highest-leverage hidden-value addition for the lowest cost."

**Effort:** ~2-3 hours.

### 4. False summit beats before each major reversal

Add 1-2 warm, low-conflict micro-beats immediately before the Rat Plague intro, the Silver Paws intro, and the Inquisition intro. Visible gratitude from the town. A small celebration. The merchant slipping a free fish. These should not foreshadow — they should land as warmth at first, and only register as foreshadowing after the player feels the loss.

**Effort:** ~1-2 hours of writing per chapter event = ~4-6 hours total.

### 5. Wildcat founding flaw spine (the deepest improvement, lowest cost)

Apply the spine: **the wildcat doesn't believe in being protected.** Always tries to do everything alone. Refuses help. The bond conversations are then organized — going forward, including in any new writing — around different cats teaching the wildcat how to *receive* protection, not just give it. This makes the transformation characterological rather than circumstantial.

This is the spine that should drive the Long Winter day-4 conversation (item 1 above). It's also the spine for the rank-A bond conversations Claude flags as needing an editing pass — each rank-A line should name a specific way the speaker has been *changed* by the guild.

**Effort:** ~2 hours, mostly thinking. Costs nothing in code. **Highest depth-per-hour in the audit.**

### 6. Prologue callback in the Chapter 5 triumph scene

Add one panel to the Chapter 5 narrative scene: *"The notice is gone from the market wall. {catName} took it down weeks ago, after the third recruit arrived. It was the only thing left from the lean-to."*

**Effort:** ~5 minutes of writing.

---

## What the council says to defer or skip

- **Restructuring chapters 3-4 to hit Booker's false-summit ordering literally.** Claude raises this as Path B but recommends against it. Codex and Gemini don't push for it. The Long Winter fix in item 1 fills the structural gap additively, without invalidating existing chapter content.
- **Making Chapter 1 more mechanically wretched** (Claude's idea: cap fish at 15, disable the furniture shop, render the lean-to as visibly broken). Lower ROI than the Long Winter fix, and Codex/Gemini don't echo it. Worth doing eventually but not first.
- **Mid-game economic "tax day" squeeze.** Claude flags this as risky for player frustration. The council defers — test with 1-2 players first if pursued at all.
- **Reframing Chapter 5 vs Chapter 7 as "Quiet Triumph" / "Recognized."** Claude's suggestion. Naming-only change, very cheap, but only Claude raises it. Marginal value.

---

## What the council says NOT to touch

Unanimous across all three audits:
- The 6-panel prologue
- The 45 pair + 7 group bond conversations
- The Catholic mythlore framing (St. Gertrude, St. Rosalia, the Inquisition)
- The Crest/Shadow moral system
- The "guild as found family / home" theme
- The chapter event narrative scene structure (`main.ts:1624-1722`)

These are the elements every model graded at the top of its scale and explicitly told the team to protect. Any new writing should be measured against the wildcat-russian_blue C-rank conversation as the bar.

---

## What this council recommendation is NOT saying

- **The current story isn't bad.** All three models open with this. It is already a good rags-to-riches story; the question is whether it becomes a great one.
- **The fix is urgent.** It is the highest-leverage narrative addition, but the game ships and works. This is polish-pass priority, not fix-or-game-broken priority.
- **The shadow_crisis material is wasted.** It isn't — it's the proof-of-concept for the Long Winter fix. The team has already written exactly the kind of relational fall that needs to fire universally.

---

## Bottom line

**Build the Long Winter event, write it in the relational register of `group_shadow_crisis`, and the rags-to-riches arc is structurally complete.** Everything else in the priority list is incremental polish on top of an already strong story. The single decision to make is whether the Long Winter is the next narrative milestone — the council unanimously says it should be.
