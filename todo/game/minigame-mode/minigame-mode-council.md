# Minigame Mode — Council Recommendation

A synthesis of three independent takes on whether (and how) to add a Practice / Arcade / Minigame Mode to Clowder & Crest.

**Sources:**
- `minigame-mode-implementation-plan-codex.md` — most concrete; treats the feature as a normal product to ship; assumes a public-secondary title-screen button
- `minigame-mode-gemini.md` — strongest "don't ship to players" stance; trusts the Dungeon Run as the existing player-side replay vector
- `minigame-mode-claude.md` — hybrid; URL params first, optional unlockable menu entry later, never on the title screen

**Reading order:** if you read only this file, you have the consensus, the two real disagreements, and the council's verdict on each. The source files are there when you want the granular reasoning.

---

## The one-line consensus

> **All three models agree the dev + portfolio use cases are real and worth solving, and that the highest-leverage answer is a hidden showcase URL — not a title-screen button. Where they split is on whether to ALSO build a player-facing surface, and the council's verdict is "not yet, and probably not ever in the shape Codex described."**

---

## Where all three unanimously agree

These are the points the council can treat as decided.

### 1. The dev iteration + portfolio review use cases are real

Codex names them as the project rationale. Gemini calls them out as the "utility need" that's distinct from the player need. Claude grades them as the highest-leverage of the four audiences. None of the three argue the feature is unnecessary as a *capability*.

### 2. The campaign is the main experience and must remain so

Codex: *"This should not be presented as a co-equal main way to play... The main campaign remains the primary experience."*
Gemini: *"Trying to serve both audiences with a single Arcade Mode button on the title screen will compromise the player experience."*
Claude: *"The campaign IS the game... any design choice that makes the minigames look like the product is a regression in product positioning."*

This is unanimous and the strongest decided point in the council. Whatever the feature looks like, it cannot reframe the game as a minigame collection.

### 3. No save-state mutation, no progression rewards, no persistent scoring

Codex: *"No story cutscenes... No campaign save data... No chapter progression... No permanent fish/reputation/cat rewards."*
Gemini: *"In a practice mode there are no stakes... if players practice until they master it without stakes, the campaign loses its tension."*
Claude: *"Practice mode rounds are purely sandbox. No save state changes... NO scoreboards, NO best times, NO completion percentage."*

Claude and Gemini are slightly more cautious here than Codex (Claude explicitly says "no scoreboards forever", Gemini calls scoring "the wrong kind of stake"); Codex leaves the door open for "score/time/performance" in result handling. The council sides with Claude/Gemini: **no scoring whatsoever**, even private. Scoring is the temptation that turns the mode into Practice.

### 4. The dev case is solvable without a player-facing button

Codex implies it (mentions hidden affordances as an open decision). Gemini explicitly recommends a Konami code on the logo and a `?showcase=true` URL. Claude explicitly recommends `?dev=1` and `?showcase=1` URL parameters.

All three converge on the principle: dev iteration doesn't need player-facing UI. The disagreement is only about whether to ALSO build something player-facing on top.

### 5. If a name is needed, it should not be "Arcade"

Codex puts "Arcade" last in its naming preference list. Gemini explicitly says "These words [Practice, Minigames, Arcade] shatter your storybook, melancholy tone." Claude rejects all three on the same grounds.

This is unanimous. "Arcade" is off the table.

---

## The two real disagreements

### Disagreement 1: Should there be a player-facing surface at all?

| Model | Position |
|---|---|
| **Codex** | **Yes**, as a visible-but-secondary title-screen button below New Game / Continue. Builds it as a normal feature with phases 1-3, file touch points, and a rollout plan. The most "ship it as a real product feature" stance. |
| **Gemini** | **No**. The Dungeon Run already exists as the player-side replay vector. *"You do not need a separate Arcade Mode for players when you already have a highly contextualized, mechanically rich way to grind minigames."* Build only the hidden showcase/debug menu and let the campaign + Dungeon Run carry the player experience. |
| **Claude** | **Yes, but unlockable and hidden from the title screen.** Player-facing "Day of Rest" lives in the in-game menu panel after chapter 5. Title screen has no awareness of the mode at all. Sequencing matters: URL params first, player-facing surface second, only after step 1 has been lived with. |

### Disagreement 2: If a player-facing surface exists, what should it be called and where should it live?

| Model | Position |
|---|---|
| **Codex** | "Practice" or "Minigame Hall" — utilitarian, on the title screen, secondary visual treatment. |
| **Gemini** | "Memories", "Chronicles", "Guild Archives", "Tavern Tales" — in-universe retrospective framing. *"Recall the great rat hunt of Chapter 2"* rather than *"Hunt: Hard Mode"*. If on the title screen at all, tucked into Settings/Extras. Better location: an in-universe "Training Yard" room inside the guildhall itself. |
| **Claude** | "Day of Rest" — in-universe sandbox framing. *"No jobs today. The cats are playing pretend at their work."* Lives in the in-game menu panel, never the title screen. |

---

## Council synthesis

### On Disagreement 1 (whether to build a player surface)

**The council's verdict: Gemini is mostly right; Claude is half right; Codex is wrong on the title-screen position.**

Gemini's strongest argument is one Codex and Claude both undersold: **the Dungeon Run already exists as the player-side replay vector**. It's a roguelike meta-loop that chains minigames with persistent HP and inter-floor upgrade picks. It's literally the endgame replay sink the question is asking for. The fact that none of the other models leaned on this hard enough is a gap in their analysis. Gemini gets full credit for catching it.

That insight changes the calculus on the player-facing question:

- The "let returning players replay favorite minigames" use case is **already solved** by the Dungeon Run.
- The "let casual players sample the game" use case is **better solved by the cold-start onboarding** (the existing prologue + tutorial), not by an arcade mode bypass.
- That leaves only the **dev iteration + portfolio review** use cases needing a solution — and those don't need a player-facing surface at all.

So the player-facing version becomes a *nice-to-have*, not a *must-build*. It moves from "ship in the next sprint" to "consider after step 1 has been lived with for a month and you still feel the need."

If the player-facing surface ever does get built, **Codex's spec is wrong about title-screen placement** and **Claude's spec is right about hiding it in the in-game menu**. The framing risk Codex flags but doesn't fully mitigate is the same risk Claude and Gemini explicitly close with hidden-from-title-screen placement. The visual-hierarchy mitigation Codex proposes ("smaller secondary button below New Game") doesn't go far enough — even a smaller button on the title screen is still a button on the title screen, and the perception cost is paid by every cold-start player who sees it.

### On Disagreement 2 (naming and location, IF a surface exists)

**The council's verdict: in-universe naming wins (Gemini and Claude agreed); in-game menu placement wins (Claude); the Dungeon-Run-style "in-universe room inside the guildhall" angle is also strong (Gemini).**

Both Gemini's "Memories / Chronicles / Guild Archives" and Claude's "Day of Rest" are tonally correct in a way Codex's "Practice" is not. The pick between them depends on what the *scene* feels like:

- **Retrospective register** ("Memories", "Chronicles", "Tavern Tales") — works if the framing is "the cats remembering past jobs". Reads as nostalgic, slightly elegiac. Fits the melancholy register the game has been earning.
- **Sandbox register** ("Day of Rest") — works if the framing is "the cats taking a day off and playing at the work for fun". Reads as warm, unhurried. Fits the warm register.

Both are good. The council leans slightly toward **"Day of Rest"** because:
1. It's more honest about what the player is actually doing — they're picking a minigame from a list, not literally remembering anything.
2. "Memories" risks implying narrative content (like Fire Emblem support conversation re-views) which would create an expectation the mode doesn't deliver.
3. "Day of Rest" composes naturally with the chapter-5 unlock condition Claude proposed: the Established chapter is the moment the guild is "settled enough that the cats can take a day off."

But Gemini's **"Training Yard inside the guildhall"** location idea is also strong and underexplored. Putting the Day of Rest *in* the guildhall (a clickable furniture item or a visible NPC at the back of the room) rather than as a menu entry is a more diegetic placement than Claude's spec. **The council recommends investigating this in the design phase if the player-facing surface ever gets built.**

---

## The recommended action plan

In strict priority order. Each step is independently shippable. Don't skip ahead.

### Step 1 (highest priority — ship soon) — Hidden showcase URL parameter

Add a `?showcase=1` URL parameter to the web build. When present, the title screen is bypassed and the game lands directly in a brutally utilitarian minigame selection screen with all 14 minigames listed. Selecting one launches the minigame in sandbox mode (no save mutation, no XP, no fish, no progression). Each minigame's exit returns to the showcase menu. A small banner reads *"Showcase mode — play the full campaign at clowderandcrest.com"*.

This is the **highest-value, lowest-risk** action. All three models agree on it. It serves dev iteration, portfolio review, and casual sampling without paying any campaign-flow cost. Implementation cost is small (~50-100 lines).

**Sub-step**: also add a `?dev=1` URL parameter that exposes additional debug controls (unlock all chapters, set stats, jump to scenes). This is a strict superset of `?showcase=1` and is what you actually use during development.

### Step 2 (medium priority — only after Step 1 has been lived with for ~30 days) — In-game Day of Rest

Build an unlockable Day of Rest accessible from the in-game menu panel after the player advances to chapter 5 (Established). Spec per Claude's writeup:
- Lives in the menu, NOT the title screen
- Only shows minigames the player has unlocked through campaign progress
- Sandbox — no save state changes, no scoring, no leaderboards
- Warm framing per the cats-taking-a-day-off register
- Framing line on each minigame entry: *"Tuxedo and Mist are sliding crates around the storeroom. No deadline today."*

**Investigate Gemini's "Training Yard inside the guildhall" placement** as an alternative to the menu-panel placement. A clickable furniture item or NPC at the back of the guildhall room is a more diegetic answer than a menu entry. Either works; pick after a quick mockup pass.

### Step 3 (low priority — only if a real player asks) — Difficulty and cat selection

Give the player a difficulty picker (easy/medium/hard) and a cat picker for each Day of Rest minigame run. Codex's spec covers this. Hold this until step 2 has been live long enough that you have actual telemetry on whether anyone uses it.

---

## What the council says NOT to do

In rough priority order — the most important "don't" is at the top.

### 1. Don't put any player-facing minigame mode on the title screen

The single most important framing decision in the entire feature. All three models agree — even Codex, who allows a "secondary" button there, doesn't actually argue the title screen is the right home, just that it's an acceptable home. The council says it isn't. The title screen is the strongest design statement the game makes; the cost of putting any minigame button there is paid by every cold-start player and every reviewer who sees the title screen first.

### 2. Don't add scoreboards, best times, leaderboards, or completion percentages

Even private. Even just "best time on this device". Even just for analytics. The moment scoring shows up, the framing tips from storybook to arcade, and the recovery cost is high. Codex's spec explicitly leaves the door open for "score/time/performance"; the council closes it.

### 3. Don't ship the player-facing surface before the URL parameter

Codex's rollout plan starts with "add a Practice button to the title screen". The council says: invert this. Ship the URL parameter first because it's the higher-leverage, lower-risk piece. Living with the URL parameter for a month before deciding on the player-facing surface is the right pace.

### 4. Don't use "Practice", "Arcade", or "Minigame Mode" as the player-visible name

All three are arcade-coded and clash with the game's tone. Use an in-universe name — "Day of Rest", "Memories", "Chronicles", "Tavern Tales", "Training Yard" — whichever fits the scene framing the team picks.

### 5. Don't show locked minigames as greyed-out tiles

Even greyed-out tiles spoil the chapter discovery (the player sees "Heist" and "Pounce" exist before the campaign reveals them). Empty grid space until the player unlocks each minigame through the campaign is the right shape.

### 6. Don't unify Day of Rest with the Dungeon Run

The Dungeon Run is its own thing — chained roguelike floors with persistent HP and upgrade picks. Day of Rest is the *opposite* — sandbox, no chaining, no carry-over. Keep them mechanically and visually distinct so neither dilutes the other.

### 7. Don't gate the showcase URL behind any kind of authentication

Reviewers want to paste a URL and play. Friction kills the use case. The "showcase" mode is intentionally public — anyone with the URL gets in.

---

## What this council is NOT saying

- **It's not saying the player-facing surface is wrong.** It's saying the *priority* of the player-facing surface is lower than the priority of the dev/showcase URL. If the team decides to ship both, the council's spec for the player-facing version is Claude's "Day of Rest" with the in-game menu placement, not Codex's title-screen button.
- **It's not saying Codex is wrong about implementation details.** Codex's section on launch payloads, result handling, and the engineering boundary between campaign and practice modes is the strongest *implementation* spec of the three. If/when the player-facing surface gets built, Codex's technical approach (sections "Technical Approach" and "Likely File / System Touch Points") is the right starting point.
- **It's not saying the Dungeon Run alone is sufficient.** Gemini implies it is. The council's slightly weaker version: the Dungeon Run is sufficient *for now*. If real players actually ask for "let me replay a specific minigame", the player-facing Day of Rest becomes worth building.
- **It's not saying you should never add scoring.** It's saying scoring should never be added to the *practice mode*. The campaign already has stars, fish rewards, combo bonuses, etc. — those are appropriate stakes in their context. Day of Rest is the wrong context for any of them.
- **It's not saying the URL parameter is just for portfolio reviewers.** The dev case is at least as important. The reason the council bundles them is that the URL parameter solves both with a single implementation.

---

## What's already excellent (don't undermine)

- The chapter-by-chapter drip-feed of new minigame types. Heist showing up in chapter 6 is one of the better long-tail surprises in the project. Don't let any version of this feature spoil that.
- The Dungeon Run as the existing player-side replay vector. Gemini correctly identifies this as already solving the "I want to replay minigames" need. Don't build a competing answer.
- The campaign-job-bond-economy interlock. The minigames mean what they mean *because* the player has lived through their context. Day of Rest and the showcase URL both work *because* they're the exception to the rule, not because the campaign integration was unnecessary.
- **The existing `test/test_saves/test-save-everything-unlocked.json`** — a fully-unlocked save the team already maintains for testing. Re-used as the demo save artifact below, this becomes the seed for the unified Guild Archives + demo save approach.

---

## Cross-platform delivery: gestures vs URL parameters

The council's first draft recommended a `?showcase=1` URL parameter as the dev/reviewer entry point. That works on web but **does not survive an APK launch** — Android opens the app via the launcher icon, which doesn't carry query strings, and there's no way for a player or reviewer to "type a URL" against an installed app. This was a real gap that the next two sections fix.

### Four candidate delivery mechanisms

| Approach | Web | APK | Dev iteration | Portfolio reviewer | Cost |
|---|---|---|---|---|---|
| **A. URL parameter only** (`?showcase=1`) | ✓ | ✗ | Web only | Web only | ~half day |
| **B. Deep link / intent filter** (`clowderandcrest://showcase`) | ✓ | ✓ but only via tapped link | Bookmark it | They tap a link you provide | ~1 day, App Links setup is fiddly and re-signing the APK breaks it |
| **C. Hidden gesture** (tap the crest 5x on title) | ✓ | ✓ | Tap-to-enter | They follow a one-line docs note | ~half day |
| **D. Separate showcase APK** (gradle build flavor) | n/a | ✓ | Sideload it | They install a different APK | ~half day per build, double release work forever |

### Council verdict: ship A + C together, skip B and D

The 5-tap gesture on the crest logo (Gemini's underplayed suggestion from her original take) works on every platform with no extra infrastructure. Combined with the URL parameter for web, you get the best of both worlds:

- **Web cold-start reviewers**: paste `?showcase=1`, instant access. Document it on the portfolio page as a clickable link.
- **APK reviewers**: install the APK, tap the crest 5 times on the title screen. Document it on the portfolio page as a one-line note: *"Tap the crest 5 times on the title screen to access showcase mode."*
- **Dev iteration**: either path on either device. Iteration loop on the APK is now "tap tap tap tap tap → showcase" instead of "drive a campaign save through to the right chapter".
- **Cold-start players who don't know the gesture**: see the normal title screen, never discover the showcase, never have their experience polluted. The gesture is hidden by design.

The framing case for the gesture is *stronger* than the URL parameter alone. URL parameters are arguably a leak — anyone who shares a link with `?showcase=1` accidentally puts others into showcase mode. The gesture is intentional: only people who *know* to do it can do it. That keeps the campaign-first cold start clean for everyone who isn't deliberately seeking the back door.

**Why not deep links (B):** ~1 day to set up an intent filter + `assetlinks.json` + Digital Asset Links verification + signing fingerprint registration, plus permanent fragility (App Links break on re-sign with a different keystore). The 5-tap gesture solves the same problem in 30 lines with no infrastructure.

**Why not a separate showcase APK (D):** doubles release work, forces reviewers to figure out which APK to install, and the maintenance cost compounds with every release.

---

## The unified "Guild Archives + demo save" approach (refinement to the original recommendation)

The original council recommendation had two separate features:
1. A hidden showcase URL/gesture for dev + reviewer access
2. An optional player-facing Day of Rest, deferred until real players asked for it

A better refinement, raised after the first draft: **collapse both into a single feature** — a player-facing **Guild Archives** mode that progressively unlocks minigames as the player encounters them in the campaign — and serve the dev/reviewer use case via a **demo save** that already has every minigame unlocked.

### How the unified version works

1. **Build the Guild Archives** as a player-facing in-game feature, accessed from the menu panel (not the title screen). Opens to a card grid of minigames.
2. **Each minigame appears in the grid the first time the player completes it in the campaign.** Empty grid space until then. By chapter 1 the player has 1 entry; by chapter 7 they have all 14.
3. **The demo save artifact** (`test/test_saves/test-save-everything-unlocked.json`) is the same file already used for testing. It's a real save with all chapters cleared and all minigames unlocked. Loading it means Guild Archives is fully populated from the start.
4. **For the dev/reviewer use case**, the entry mechanisms (URL `?showcase=1`, 5-tap gesture) **load the demo save** instead of opening a separate showcase scene. The reviewer lands in the game world with everything unlocked and navigates to Guild Archives via the menu like any player would.
5. **For real players**, Guild Archives is just a normal in-game feature that grows with their campaign progression.

### Why this is better than the council's original two-feature approach

| Property | Two-feature original | Unified Guild Archives + demo save |
|---|---|---|
| Number of code paths to maintain | 2 (showcase scene + Day of Rest) | 1 (Guild Archives + a JSON file) |
| Reviewer experience | Brutal utilitarian sampler menu | The actual game world with everything unlocked |
| Player experience | Day of Rest unlocks late (chapter 5), separate from chapter discovery | Guild Archives grows organically with chapter progress, mirrors the project's existing unlock cadence |
| Demo save maintenance | Not needed | Required — must update when save schema changes (manageable via existing migration system) |
| Game-world fidelity for reviewers | Low — reviewer never sees the guild, the cats, the day timer | High — reviewer experiences the actual game UI, picks a minigame, sees the cats, returns to the guild |
| Spoiler risk for cold-start players | None (gated by URL/gesture) | None (same gating; cold players never see the unlocked state) |
| Title screen pollution | None | None (Guild Archives is in the menu, not the title) |
| Reuses existing project assets | No | Yes (`test/test_saves/test-save-everything-unlocked.json` already exists) |

The biggest single advantage is **reviewer experience fidelity**. A brutal utilitarian sampler menu shows the *minigames* but hides the *game*. Loading a fully-unlocked save shows the reviewer the actual guild, the actual cats, the actual day timer — and lets them taste the minigames *in their authored context*. That's a stronger demo of what Clowder & Crest actually is, even if it's one extra navigation step.

### Costs and trade-offs of the unified approach

This isn't free. Three real costs:

1. **The demo save is a content artifact.** It must stay in sync with the save schema. The project already has `validateAndSanitizeSave` and the migration ladder, so an old demo save will still load — but you'll want to refresh it occasionally so the demo represents a recent state of the game.
2. **Auto-import on URL/gesture is more code than auto-navigate.** The showcase scene was a single direct scene jump. Loading the demo save involves: read the JSON file (bundled with the build), validate via `validateAndSanitizeSave`, write to the active save slot, fire `game-loaded`, navigate to the guildhall. Maybe 60-80 lines instead of 30.
3. **Reviewers might miss Guild Archives if they don't navigate to it.** Mitigation: when the demo save loads, fire a one-time toast on landing: *"Showcase mode — open the menu and visit Guild Archives to play any minigame."* That's a one-line UX nudge that keeps the entry point discoverable.

### How the gesture/URL hooks fit into the unified approach

Both `?showcase=1` (web) and the 5-tap crest gesture (web + APK) do the same thing in the unified version:

```ts
// Pseudo-code for the showcase entry point
async function enterShowcase() {
  const demoSaveJson = await fetch('/test_saves/test-save-everything-unlocked.json').then(r => r.text());
  // Or: import as a bundled JSON via vite, so it ships with the APK
  const parsed = validateAndSanitizeSave(JSON.parse(demoSaveJson));
  if (!parsed) {
    showToast('Showcase save failed to load');
    return;
  }
  saveToSlot(1, parsed);
  saveGame(parsed);
  showToast('Showcase mode — open the menu and visit Guild Archives.');
  eventBus.emit('game-loaded', parsed);
  eventBus.emit('navigate', 'GuildhallScene');
}
```

The dev case and the reviewer case share the same entry point. The 5-tap gesture on the title screen calls `enterShowcase()`. The `?showcase=1` URL parameter calls `enterShowcase()` instead of rendering the normal title. Both land in the same fully-unlocked game state.

### What this means for the council's action plan

The action plan in the previous section was:

> 1. Ship `?showcase=1` URL parameter first
> 2. Live with it for ~30 days before deciding on a player-facing surface
> 3. Only if real players ask, build Day of Rest per Claude's spec

The unified approach replaces it with:

> 1. **Build Guild Archives as a player-facing menu entry** with progressive unlock-as-you-play. Empty grid at chapter 1; grows as the player completes each minigame for the first time.
> 2. **Maintain the existing `test/test_saves/test-save-everything-unlocked.json`** (already exists in the project) as the canonical demo save. Refresh on save-schema changes.
> 3. **Add the showcase entry point**: `?showcase=1` URL parameter on web AND a 5-tap gesture on the crest logo (works on both web and APK). Both call `enterShowcase()`, which imports the demo save into slot 1, fires `game-loaded`, and shows a one-toast nudge to visit Guild Archives.
> 4. **No title screen button. Ever.** Guild Archives lives in the in-game menu only.
> 5. **No scoring, no leaderboards, no save mutation from Guild Archives runs** — same forever-rules as the original council recommendation.

This is more work than the original showcase-only plan (~1.5 days vs. ~half day) but it ships ONE feature instead of TWO and serves the player audience properly while still serving the dev/reviewer audiences. The compounding maintenance cost is also lower because there's only one code path to maintain.

### Why the unified approach is the council's new recommendation

The original recommendation said "ship the URL parameter and stop there for now". The unified approach says "ship Guild Archives and the showcase entry point together because they're actually the same feature with two entry conditions". That's a strict improvement when:

- The team is willing to commit to building the player-facing surface eventually anyway (the user clearly is, since the question started there)
- The demo save artifact already exists in the repo (it does)
- The framing risks of the player-facing surface have been mitigated (they have, by the in-game menu placement and the in-universe naming)
- The reviewer experience benefits from seeing the actual game world (it does)

If any of those conditions weren't true, the original "ship the URL parameter and wait" recommendation would still be the right move. But in this project's actual state, the unified approach is strictly better.

---

## Bottom line (revised)

The council's previous bottom line was "build the URL parameter and stop there". The revised bottom line, after incorporating the cross-platform delivery problem and the unified Guild Archives + demo save idea:

**Build Guild Archives as a player-facing in-game menu feature with progressive minigame unlocks. Maintain the existing `test-save-everything-unlocked.json` as the canonical demo save. Add a `?showcase=1` URL parameter (web) and a 5-tap gesture on the crest logo (web + APK) — both load the demo save and land the user in Guild Archives. No title screen button. No scoring. No save mutation from Guild Archives runs.**

That single integrated feature solves:
- **Dev iteration**: 5-tap gesture on the title screen → instant access to all minigames in their actual game context
- **Portfolio review (web)**: paste `?showcase=1` URL → demo save loads → Guild Archives populated → instant access. Document on the portfolio page as a clickable link.
- **Portfolio review (APK)**: install APK → 5-tap gesture → same flow. Document on the portfolio page as a one-line note next to the APK download link.
- **Returning campaign players**: Guild Archives grows with their progress and gives them a place to revisit favorite minigames after they've earned them.
- **Cold-start players**: see the normal title screen, see Guild Archives in their menu starting at chapter 1, watch it grow with each new minigame they complete. The discovery cadence is preserved.

The single decision to make right now is: **commit to Guild Archives as a real feature, then build the showcase entry points on top of it**. The two halves are inseparable in the unified approach. ~1.5 days of work for the integrated version vs. ~half day for the URL-only version, but the integrated version retires the player-facing surface question entirely and serves every audience without compromise.

If only one piece of this can ship first, ship the **gesture** (it works on every platform) and have it call `enterShowcase()` even before Guild Archives exists — landing the user in a fully-unlocked guildhall is already a meaningful demo improvement over the current state, and Guild Archives can land in a follow-up commit.
