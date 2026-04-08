# Should Clowder & Crest add a Practice / Arcade / Minigame Mode?

A design opinion. Written without reading the parallel takes from Codex or Gemini in this directory.

---

## The one-line answer

**Yes, but not where you're thinking of putting it, and not under the names you're thinking of using.** The portfolio + dev + replay use cases are real and recurring, but the title-screen real estate is the strongest narrative signal the game makes — putting "Practice" or "Arcade" up there as a peer to "New Game" rewrites what kind of game Clowder & Crest *is* in the player's head before they've played a single second of it. The right shape is a quietly-framed sandbox space the player earns access to, plus a separate dev/showcase entry point that bypasses the player flow entirely.

---

## Reframe: there are four distinct audiences, and they want different things

Before answering whether the feature is good, look at who it's for. The use cases the question implies actually decompose into four very different humans, and the design that serves all four is not the same.

| Audience | What they want | Current friction |
|---|---|---|
| **You (developer)** | Iterate on a single minigame in <30s without playing through the campaign | High — you have to drive a save through the chapter that unlocks the minigame, then through the job board, then through the assignment overlay, then play |
| **Portfolio reviewer** | See the *range* of the game's mechanics in 2-3 minutes from a cold start | Very high — currently impossible without watching a video, and even then they won't *play* anything |
| **Casual / cold-start player** | Try a minigame in 5 minutes to decide whether to commit to the full game | Medium — the prologue + intro + tutorial + first job are a 5-10 minute commitment before any "fun" |
| **Returning campaign player** | Replay a specific minigame they liked, or revisit a chapter-locked one without starting over | High — once unlocked, minigames only fire when their job category surfaces on the daily board, which is random |

The argument for the feature is strongest for the first two and weakest for the last two. The argument *against* the feature is strongest for the campaign player audience — because if there's a "play minigames directly" button next to "New Game", the casual player who picks it bypasses the campaign entirely and walks away thinking Clowder & Crest is a minigame anthology with a story shell, which is exactly the mistake you're worried about.

The trick is that **the developer and the portfolio reviewer don't actually need the feature to live in the player-facing UI at all.** Both can be served by a separate entry point that doesn't show up in the title screen flow. That observation simplifies everything else.

---

## 1. Is the mode a good idea at all?

**Yes — but the version that matters is the one I just described, not the title-screen "Practice" button.** The "good idea" parts and the "bad idea" parts of your gut reaction are *both* correct because they're talking about different versions of the same thing:

- **A title-screen "Practice / Arcade / Minigame Mode" button** is a bad idea. It dilutes the campaign framing for every cold-start player and tells reviewers "this is a Bishi Bashi-style minigame collection with a story wrapper". You'd be punishing the campaign — which is the main experience — to serve audiences who don't actually need that placement.
- **A quiet, post-chapter-4 unlock framed in the game's own warm idiom**, paired with **a separate dev/showcase URL parameter** that bypasses the player UI, is a good idea. It serves all four audiences without any of the harms.

So my answer is "yes, but the version that matters is the second one." Don't let the binary framing of the question — practice mode yes/no — obscure that the *placement* and *framing* decisions matter more than the build-it-or-not decision.

---

## 2. Public, hidden, unlockable, or de-emphasized?

I'd do **all three at once**, by audience:

### For the player-facing flow: unlockable, around chapter 4-5

The player unlocks the mode by reaching the *Established* chapter. The framing in the unlock toast: *"The guild is settled enough that the cats can take a day off."*

Why chapter 4-5 specifically:
- It's the natural "the guild is now a real place" beat — the same beat that the chapter 5 narrative explicitly hits with "From a stray in a storm to home".
- By that point the player has experienced the *interlocking* of minigames + jobs + bonds + the day economy. The minigames have *meaning* because the player has lived through their context. Letting them replay a Sokoban level after they've seen what Sokoban *means* in the guild is fundamentally different from letting a cold player play Sokoban with no context.
- The chapter unlock is a *reward* — finishing the rags-to-riches arc earns the player the right to revisit. That's psychologically coherent with the game's tone.
- It preserves the chapter-by-chapter discovery of the minigame types (Patrol, Brawl, Heist, etc.) which is currently one of the game's better drip-feed mechanics.

### For the developer: a debug query parameter, not a button

`?dev=1` (or whatever flag you already use for dev builds) unlocks the mode immediately AND ungates every minigame regardless of campaign progress. This gives you instant iteration access without the unlock condition getting in your way during development. It also means the unlock condition can be set wherever feels right narratively, without cost to your dev workflow.

### For the portfolio reviewer: a `?showcase=1` URL on the web build

A reviewer who lands at `clowderandcrest.com?showcase=1` skips the title screen and lands directly in the minigame mode with everything unlocked. A small banner reads *"Showcase mode — play [clowderandcrest.com] for the full campaign."* You then put that URL in your portfolio page.

This is the best of both worlds: reviewers get *instant* hands-on access to the full range of mechanics in 30 seconds (faster than installing an APK), and regular cold-start players who just visit the home URL get the campaign-first experience untouched.

The cost is small — a query-param check on title scene start, plus a banner div. Maybe 30 lines of code.

---

## 3. How should it be framed on the title screen so the campaign still feels primary?

A few principles:

### Visual hierarchy is the most important signal

The title screen real estate is the loudest design statement the game makes. Whatever button is biggest, in the warmest color, and at the top, is what the player believes the game *is*. So:

- **Top, large, primary color**: New Game
- **Top, large, secondary color**: Continue (when a save exists)
- **Bottom, small, tertiary color**: any unlocked side modes

The unlocked Day of Rest button should feel like a footnote in size, not a peer.

### Naming matters more than position

"Practice", "Arcade", and "Minigame Mode" all signal "this is the part of the game that's about the minigames as standalone units". Each of those names *invites* the player to think of the game as a minigame collection with a campaign attached, instead of a campaign where minigames are one expression of the work the cats do.

Alternative names that fit the tone:

| Name | What it implies | Good for C&C? |
|---|---|---|
| Practice | Skill rehearsal — arcade mode | No — clinical, dev-flavored |
| Arcade | Pure score-chasing | No — wrong genre signal |
| Minigame Mode | Generic, technical | No — doesn't fit the storybook tone |
| Garden | A quiet space to wander | OK — fits the tone but vague |
| Reflections | Past moments revisited | OK — Fire Emblem-coded, leans nostalgic |
| **Day of Rest** | The guild has earned a quiet day | **Best fit** |
| The Old Routines | Going through the motions for muscle memory | OK |
| Wandering | Light, drifty | OK but unfocused |

I'd go with **Day of Rest**. The framing it carries:
- *"No jobs today."* Explicit that it's a non-narrative space.
- *"The cats are playing pretend at their work."* Lets the minigames exist outside the job flow without needing a new fiction.
- It's a *reward* tone, not a *catalog* tone.
- It lands on the warm/melancholy register the game has been earning.

### Frame each minigame as the cats playing at the work, not as standalone games

When the player picks a minigame from Day of Rest, the framing line that fades in shouldn't be *"Playing: Sokoban — Difficulty: Easy"*. It should be *"Tuxedo and Mist are sliding crates around the storeroom. No deadline today."*

That single framing decision — *the cats are doing the work for fun, not for the guild* — is what keeps the mode from feeling like a minigame collection. The minigames are still in their fictional context, just with the job-board scaffolding removed.

---

## 4. Risks for player experience, pacing, and perception

In rough order of severity:

### A. The "this is a minigame collection" perception risk (highest)

If the title screen has a button that says "Minigames" or "Practice" the same size as "New Game", a non-zero percentage of cold-start players will tap it instead of starting the campaign — because clicking 14 minigames is a lower-commitment promise than committing to a 7-chapter narrative. They'll then walk away with the wrong mental model of what Clowder & Crest *is*. Same applies to anyone who reviews the game or describes it to a friend after that experience.

**Mitigation**: don't put it on the title screen as a peer button at all. Unlock it AFTER chapter 4-5, framed as Day of Rest.

### B. The chapter-discovery erosion risk (high)

The drip-feed unlock of new minigame types across chapters is currently one of Clowder & Crest's best long-tail engagement hooks ("oh wow, Heist? When did I unlock that?"). A practice mode that exposes all 14 minigames from day 1 destroys this completely.

**Mitigation**: the practice mode only ever shows minigames the player has unlocked through the campaign. Even after unlocking Day of Rest, the menu only lists what they've actually played in the chapter flow.

### C. The save-coupling / progression-corruption risk (medium)

If a player completes a Sokoban round in practice mode, do they get fish? XP? A bond increase? If yes, the campaign progression becomes grindable through practice mode and the chapter triggers (which depend on totalJobsCompleted) become meaningless. If no, the player wonders why their actions don't have consequences.

**Mitigation**: practice mode rounds are *purely sandbox*. No save state changes. Frame it explicitly: *"This is a practice round — your guild is on a day off, no fish or XP today."* The player understands and the campaign integrity stays intact.

### D. The achievement/leaderboard temptation (medium)

The moment you have a practice mode, there's a strong temptation to add per-minigame "best score", "fastest time", "perfect run" stats. **Resist this.** The moment you add leaderboards, the framing tips from "warm storybook" to "competitive arcade". A best-time on Sokoban-easy is the wrong kind of stake for this game's tone.

**Mitigation**: explicitly NO scoreboards, NO best times, NO completion percentage. The minigames in Day of Rest are cosmetically identical to the campaign versions but emit zero permanent data.

### E. The dev-feedback-loop risk (low but real)

Having a debug-flag-gated practice mode for development is great. But there's a real risk that you start *only* iterating on minigames through the practice mode and stop testing the integrated campaign flow. This leads to bugs like "the brawl works fine in isolation but the result-screen-to-town-scene transition is broken" — exactly the bug we just fixed in `9808fe4`.

**Mitigation**: this is a process discipline issue, not a design issue. Make sure your playtest scripts (`test/*-playtest.mjs`) continue to drive the *integrated* flow, not just the minigame in isolation.

### F. The pacing inversion risk (low)

A player who plays 30 minutes of Day of Rest before returning to the campaign might find the campaign feels slow afterward — they've been getting the dopamine hit of pure minigame play and now they're back to the management layer. If Day of Rest is unlocked late enough (chapter 4-5), this is mitigated because by then the player has invested enough that the management layer feels meaningful.

**Mitigation**: chapter 4-5 unlock + the warm framing.

---

## 5. What does the best version of this feature look like?

A concrete spec.

### Unlock condition
Becomes available the first time the player advances to chapter 5 (Established). The unlock fires as a new entry in the menu panel — not as a celebratory popup, but as a quiet line in the journal: *"The guild is settled enough that the cats can take a day off. (You can now visit the Day of Rest from the menu.)"*

### Title screen presence
**None.** Day of Rest does not appear on the title screen. It lives in the in-game menu panel, alongside Achievements, Guild Journal, etc. This is the single most important framing decision — the title screen says "this is a campaign first" because it doesn't offer anything else.

### Menu panel entry
Below Achievements, above Save Game. Small text. Label: *"Day of Rest"*. Subtitle on hover/long-press: *"Take a day off. Play any minigame the guild has learned."*

### Day of Rest screen
A warm, parchment-toned panel. Top of the screen: *"Day of Rest at the Guildhall — no jobs today."* Below that, a grid of small cards, one per *unlocked* minigame type. Each card shows:
- The minigame name in the campaign's idiom (*"Mousing"* not *"Hunt"*)
- A line about which cat would normally do it
- The chapter the player first unlocked it (*"Learned in Ch. 3"*)

Locked minigames don't appear in the grid at all. The grid grows as the campaign progresses.

### Selecting a minigame
Cuts to a brief framing line: *"Tuxedo and Mist are practicing crate-sliding in the storeroom."* The player picks which of their cats to use (defaulting to a stat-fitting choice, but they can pick anyone). Then plays the minigame in standard form.

Explicit difficulty picker: easy/medium/hard. (In the campaign these are usually job-tied, but in Day of Rest the player chooses.)

### After the minigame
A brief outcome banner: *"Tuxedo solved the puzzle in 14 moves — three stars."* No XP, no fish, no bond change, no journal entry, no chapter trigger advance. *"Return to the guild?"* button.

### Persistence
Day of Rest tracks **nothing** outside the unlock flag. No "last played" times, no scores, no completion percentages. This is the line that prevents the mode from drifting toward arcade.

### Dev / showcase entry points
- `?dev=1` query parameter: title screen shows a small "DEV" badge; Day of Rest is accessible from the title screen directly with all minigames unlocked.
- `?showcase=1` query parameter: title screen is skipped entirely; the Day of Rest grid appears immediately with all minigames unlocked, plus a banner: *"Showcase mode — play the full campaign at clowderandcrest.com."*

Both flags are guarded by a build-time check so production web builds without the param land at the normal title screen. The implementation cost is roughly 30-50 lines.

---

## 6. Better alternatives to solve the testing/replay problem

**For the developer use case** — a dev menu. You don't need a player-facing feature for this; you need a `?dev=1` URL parameter that lets you launch any scene from a debug menu. Total cost: ~50 lines. This is independent of whether you ship the player-facing Day of Rest at all.

**For the portfolio reviewer use case** — three options, in order of effectiveness:

1. **A 60-second highlight video on the portfolio page.** This is the lowest-friction reviewer experience: zero installs, zero clicks, you control what they see. The downside is they don't *play* anything, so the game doesn't get to demonstrate its feel. But if the goal is "convince them to look further", a video does that better than a sampler mode.
2. **A `?showcase=1` URL on the web build** that drops them into a minigame sampler instantly. This gives them hands-on play without committing to the campaign. Combined with the highlight video on the portfolio page, this is the strongest pairing.
3. **A "Try a minigame" splash on the web build** that fires for first-time visitors, asking *"Want to try a minigame before starting the campaign?"* Costs ~half a day, makes the cold-start experience explicitly serve both audiences.

I'd ship #2 paired with #1. Skip #3 — it dilutes the cold start.

**For the casual player** — a tighter prologue is the right lever, not a practice mode. If the existing prologue + tutorial + first job is a 10-minute commitment, a player who isn't sure about the game has to spend 10 minutes deciding. Cutting that to 4-5 minutes by trimming the tutorial steps to one minigame's worth would do more for casual conversion than a practice mode would. (You may already have done this in the recent tutorial-cutting work — `5e96e8e`.)

**For the returning player** — Day of Rest is the right answer for this one. The dungeon run already exists for chained replay; Day of Rest is the answer for "I want to specifically replay the Sokoban level I liked."

---

## 7. If you were shipping this game, what would you do and why?

I'd do the following, in this order:

### Step 1 — Ship the dev/showcase flags first (1 day)

Add `?dev=1` and `?showcase=1` URL parameters that unlock the existing minigame scenes via a tiny new "Day of Rest" scene that's only reachable through those flags initially. No menu entry, no title screen change, no player-facing surface. You get the two highest-leverage benefits (faster dev iteration, better portfolio review) with zero risk to the campaign framing.

This ships in a single afternoon and gives you most of the actual value the question is about.

### Step 2 — Ship the unlockable Day of Rest second, after you've lived with step 1 (2-3 days)

Once the dev/showcase flags have been in place long enough to confirm they solve the dev iteration problem, add the player-facing Day of Rest as a chapter-5 unlockable. Spec per section 5 above. Frame it warmly. No title screen presence. No persistent scoring. This is the *generous* version of the feature for completionist players who want to revisit favorite minigames.

### Step 3 — Don't add scoreboards (forever)

The most likely mistake six months from now is to add "your best Sokoban time" tracking because someone asks for it. Don't. The moment scores show up the framing tips. Hold the line.

### Step 4 — Don't put it on the title screen (also forever)

Same principle. The title screen is the strongest design statement the game makes. Whatever you put up there is what the game *is*. Day of Rest is one expression of the game; it isn't the game.

---

## Why this answer

A few things shaped the recommendation:

1. **The campaign IS the game.** Clowder & Crest is a story-shaped guild manager with minigames as the work the cats do. The minigames are not the product; the campaign is. Any design choice that makes the minigames look like the product is a regression in product positioning even if it's technically additive.

2. **Title screen real estate is irreversible signaling.** Adding a button there is the loudest thing you can do design-wise. A button labeled "Practice" reframes the entire game in the player's head before they've started playing. There's no way to add that button without paying that cost.

3. **The dev and reviewer use cases don't need the feature to live in the player UI.** Once you separate the "I'm building this game" use case from the "I'm playing this game" use case, the framing problem mostly evaporates. URL parameters are a perfectly fine answer for the first use case.

4. **The unlockable framing is the most coherent with the game's tone.** Clowder & Crest is a game about earning your place — the rags-to-riches arc is the central spine. Unlocking the practice mode by completing chapter 5 (Established) is the same emotional shape as everything else the game rewards. It would feel *wrong* for a game with this tone to hand the player every minigame on the title screen.

5. **You explicitly named "spoiling progression/discovery" as a risk.** That risk is real and it's the strongest argument against the prominent version. The unlockable version takes that risk completely off the table while still serving everyone who wants the feature.

6. **The portfolio reviewer use case is the most underserved by the current state of the project.** Reviewers can't currently sample your game's range without committing to a multi-minute install + walkthrough. The `?showcase=1` URL fixes this with the smallest possible footprint and no campaign-flow impact. If only one thing from this doc gets implemented, that one is the highest-value.

---

## What I'd specifically NOT do

Things to resist even though they sound reasonable:

- **Don't add a "Replay" button to the chapter selector.** You don't have a chapter selector currently and you shouldn't add one — the game's pace depends on the player living through the chapters in real time.
- **Don't add per-minigame leaderboards.** Even private ones. Even just "best time on this device". The temptation to rank-order play sessions is the temptation that turns Day of Rest into Practice Mode.
- **Don't unify Day of Rest with the dungeon run.** The dungeon run is its own thing with persistent HP and roguelike progression. Day of Rest is the *opposite* — sandbox, no stakes, no carry-over. Keep them mechanically and visually distinct.
- **Don't show minigames the player hasn't yet unlocked, even greyed out.** Even greyed-out tiles spoil the discovery. Empty grid space until they unlock through the campaign is the right shape.
- **Don't gate the showcase URL behind any kind of authentication.** You want reviewers to just paste it and play. Friction kills the use case.
- **Don't ship the player-facing Day of Rest *first* and the dev/showcase URLs second.** Build the dev path first because it's the higher-leverage, lower-risk piece. The player-facing Day of Rest is the optional sequel.

---

## TL;DR

- **Yes, build the feature.** No, not where you were planning to put it.
- **Title screen "Practice / Arcade / Minigame Mode" — bad idea.** Frames the game as a minigame collection.
- **Unlockable "Day of Rest" reached after Chapter 5, accessed from the menu — good idea.** Warm, on-tone, preserves chapter discovery.
- **`?dev=1` and `?showcase=1` URL params — best idea.** Serves the highest-leverage use cases (developer iteration, portfolio review) with zero campaign impact.
- **Build the URL params first, the player-facing Day of Rest second.** The URL params are higher leverage and lower risk.
- **No scoreboards. No best times. No leaderboards.** Ever. They tip the tone from storybook to arcade and there's no recovery.
- **No title screen button.** The title screen is the strongest design signal the game makes — protect it.

The feature is good if it's the version that respects what Clowder & Crest is trying to be. The feature is bad if it's the version that flattens Clowder & Crest into a minigame anthology with a story attached. Same code; different framing; opposite outcomes.
