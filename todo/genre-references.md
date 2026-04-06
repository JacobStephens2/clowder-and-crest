# Clowder & Crest — Genre References

For each game-within-the-game, this doc identifies the closest genre, the
design principles that make that genre work, and 3–6 reference titles
considered best-in-class. Use this as a lookup when considering improvements
to any specific minigame — the reference games are fair game for Nia GitHub
searches (e.g. `nia github search phaserjs/examples "..."` or the open-source
projects listed below).

---

## Main Game — Clowder & Crest

**Genre:** Guild/shop management sim × daily life sim × narrative-driven support-conversation RPG.

**Why it works (when it works):**
- Tight **daily loop** — finite actions per day force interesting trade-offs.
- **Found-family cast** where characters grow, build relationships, and carry emotional weight.
- **Layered economy** that rewards both reactive (job-of-the-day) and strategic (long-term investment) thinking.
- Tone matters more than content depth. "Cozy but not trivial" is a real design goal, not a vibe.

**Best in genre:**
- **Stardew Valley** — daily rhythm, seasons, relationship building, genuinely unmissable as a reference for this game.
- **Recettear: An Item Shop's Tale** — shop management + dungeon delving, the original "manage-then-fight" hybrid.
- **Moonlighter** — modern Recettear descendant, shop days + dungeon nights.
- **Fantasy Life** — class-switching job system with fetch/craft progression. Great for how jobs-as-identity works.
- **Fire Emblem: Three Houses** — support conversations (C/B/A ranks) as a structural element. Clowder & Crest's bond system is directly descended from this.
- **Darkest Dungeon** — roster management, stress mechanics, grim but cozy-ish. Useful reference for risk/reward on missions.
- **Spiritfarer** — emotional management sim where characters are the content.
- **Cultist Simulator** — card-based occult manager; notable for how it frames economic decisions as storytelling.
- **Graveyard Keeper** — darker Stardew; good reference for how mundane tasks can be made compelling.

**What ours could learn:**
- The pace at which the player feels they're *progressing* vs. *surviving* is the key knob. Stardew tunes this carefully via seasons; we tune it via chapters. Watch that chapter gates don't feel grindy.
- Character conversations are worth more than they cost to write. Three Houses has hundreds of supports. Our 48 scripts are a strong start; more would pay off.

---

## PuzzleScene — Rush Hour / Sliding Block

**Genre:** Constraint-satisfaction sliding block puzzle.

**Why it works:**
- Finite state space makes every position theoretically solvable by brute force, but the **human path** is about pattern recognition, not search.
- **Minimum-moves scoring** turns casual solving into a mastery challenge.
- One set of simple rules → emergent variety via board generation.

**Best in genre:**
- **Rush Hour** (Nob Yoshigahara, 1996 board game) — the genre namesake. Card-based puzzle books, still the best problem curation.
- **Unblock Me** — mobile Rush Hour clone with clean UX.
- **Klotski** (1800s) — the oldest known sliding-block puzzle, asymmetric pieces.
- **Lunar Lockout / UFO** — related, with pieces that slide until they hit something.
- **Stephen's Sausage Roll** — not technically a sliding block, but the gold standard for "elegant puzzle design that teaches itself."

**What ours could learn:**
- Hand-curated puzzle sets beat generated ones for peak difficulty. Our BFS-validated generator is fine for easy/medium; the hardest tier should probably include hand-designed boards.
- Level intros that visually "explain themselves" without tutorial text (a Sausage-Roll lesson) are more satisfying than written instructions.

---

## SokobanScene — Crate Pushing

**Genre:** Sokoban / box-pushing puzzle.

**Why it works:**
- The **can't-pull** rule is brutally simple but creates genuinely hard logic.
- Mistakes are recoverable-via-restart only, so the player has to think before acting.
- Emergent "aha" moments when you realize a box you pushed 20 moves ago is now trapped.

**Best in genre:**
- **Sokoban** (Hiroyuki Imabayashi, 1981) — the original.
- **Stephen's Sausage Roll** — the masterpiece. Non-optional reference if you're making a box-pusher.
- **Baba Is You** — rule-manipulation Sokoban. Genre-bending.
- **Patrick's Parabox** — recursive boxes that contain boxes.
- **Snakebird** — creature-based pushing with gravity.
- **A Monster's Expedition** — modern, charming Sokoban with open-world structure.

**What ours could learn:**
- Removing Undo was the right call (we already did this per the todo history). Baba Is You and Sausage Roll don't have undo either — it's a feature, not a missing one.
- The puzzles should *feel different from each other*, not just "another crate board." Hand-designing a few levels with a theme (e.g. "push one crate without touching another") would elevate the feel.

---

## ChaseScene — Rat Maze

**Genre:** Maze-chase arcade.

**Why it works:**
- **Ghost AI personalities** create the illusion of teamwork and let the player learn enemy patterns.
- **Power pellets** flip the hunter/hunted dynamic, creating tension-release rhythm.
- **Simple controls, deep mastery** — anyone can move through a maze, but high scores require route optimization.
- Short runs + score chasing = infinite replayability.

**Best in genre:**
- **Pac-Man** (Toru Iwatani, 1980) — the genre.
- **Ms. Pac-Man** — improved ghost AI (they have randomness, so memorization alone doesn't win).
- **Pac-Man Championship Edition DX** — modern Pac-Man, scrolling mazes, ghost trains. Easily the best-feeling version.
- **Pac-Man 256** — endless vertical scrolling Pac-Man.
- **Lady Bug** (1981) — underrated deeper maze with turnstile gates.
- **Mr. Do!** (1982) — maze + power-crushing + bonus items.

**What ours could learn:**
- Our v2.0.2 update added catnip pellets and dog AI states (per the Pac-Man design doc). Next step up would be **multiple dogs with distinct behaviours** (Pac-Man has 4 ghosts; we have 1). The classic 4: chase, ambush, cut-off, wander.
- Pac-Man CE DX introduced "chains" of ghosts that follow you — this could be a mode for a rat plague minigame variant.

---

## FishingScene — Reel-In

**Genre:** Fishing / timing / tension mini-game.

**Why it works:**
- **Push-pull tension** — let the line go slack vs. pull too hard.
- **Rare catches** as a long-tail reward structure.
- Time-in-zone mechanics reward patience AND aggression.

**Best in genre:**
- **Stardew Valley** — keep the fish cursor inside the moving bar. The gold standard for a "one-minute minigame embedded in a bigger game."
- **Animal Crossing** — silhouette + timing → press at the right moment. Simpler, equally satisfying.
- **Cat Goes Fishing** — literally a cat-fishing game. Worth looking at for genre overlap.
- **Dave the Diver** — fishing + management hybrid (very Clowder-adjacent concept).
- **Sea of Stars** — timing-based fishing as a breather mini-game.
- **The Legend of Zelda: Twilight Princess** — the Hena fishing hole, surprisingly deep.

**What ours could learn:**
- Multiple fish varieties with different behaviours (aggressive, sneaky, big-hauler) would give the minigame more longevity. Dave the Diver does this well.
- Rare "mythical" fish appearing tied to specific story events or weather would make the minigame feel connected to the main game.

---

## HuntScene — Whack-a-Mole

**Genre:** Reaction / click-timing / target-clicker.

**Why it works:**
- **Immediate feedback loop** — tap, hit, score. Zero latency between action and reward.
- **Escalating target speed** keeps tension rising without new rules.
- **Punish buttons** (poison rats / bombs) raise the skill ceiling.

**Best in genre:**
- **Whac-A-Mole** (Aaron Fechter, 1976 arcade cabinet) — the original.
- **Rhythm Heaven / Rhythm Tengoku** — reaction mastered. The single best reference for reaction-based mini-games. Every one of its ~50 micro-games is a lesson in how to make 30 seconds compelling.
- **WarioWare** — rapid-fire micro-games. The spiritual godparent of every "mini-game compilation" that followed.
- **Fruit Ninja** — slicing reaction with combos.
- **Thumper** — rhythm + reaction, but deeply punishing.
- **Parappa the Rapper** — rhythm + timing, early genre codifier.

**What ours could learn:**
- Rhythm Heaven's trick is that every micro-game has a **one-sentence mental model** you learn in the first 3 seconds. Hunt should have the same clarity.
- Golden rats and poison rats are a good start, but Rhythm Heaven would add *timing variation* — e.g. rats that fake out by popping up then back down.

---

## BrawlScene — Rat Combat

**Genre:** Top-down action / beat-em-up / Zelda-like.

**Why it works:**
- **Movement + attack + dodge** creates a triangle of decisions every frame.
- **Wave structure** lets the designer teach enemies one at a time.
- **Boss fights** punctuate the rhythm and give mastery a ceiling to climb toward.

**Best in genre:**
- **The Legend of Zelda** (1986) — the pioneer. Every top-down action game descends from it.
- **The Legend of Zelda: A Link to the Past** — the refined version. Still widely considered the best top-down Zelda.
- **Hades** — the gold standard for moment-to-moment top-down combat feel. Responsive, readable, gorgeous.
- **Hyper Light Drifter** — pixel-art top-down action. Silent, brutal, elegant.
- **Enter the Gungeon** — bullet-hell roguelike with tight controls.
- **Tunic** — modern Zelda homage with combat that feels great.
- **Nuclear Throne** — extremely tight moment-to-moment combat.
- **Cadence of Hyrule** — rhythm Zelda; interesting hybrid to think about.

**What ours could learn:**
- Hades's combat is great because every enemy has a **telegraph** (wind-up animation before an attack) that the player can learn. Our rats could use clearer wind-ups.
- **Invincibility frames** during dodges or swipes are the difference between "I got hit unfairly" and "that was my fault." Worth auditing our hit detection.

---

## NonogramScene — Grid Logic Puzzle

**Genre:** Nonogram / Picross.

**Why it works:**
- **Pure logic** — no randomness, no luck, solvable with sufficient thought.
- **Picture reveals** as the reward make completion feel narrative, not just mechanical.
- Scales beautifully from tiny intro puzzles to 30×30 marathons.

**Best in genre:**
- **Picross** (Nintendo / Jupiter, 1995–present) — the gold standard. Picross S on Switch is the best pure-logic version ever made.
- **Pictopix** — clean modern Picross on Steam; its tutorial is masterclass.
- **Murder by Numbers** — Picross + narrative (visual novel detective game + picross). Useful as a "minigame-in-narrative" reference.
- **Islands of Insight** — meta-puzzle explorer that includes Picross among many logic puzzle types.
- **Mario's Picross** (Game Boy, 1995) — the original video-game Picross.
- **Logic Pic** — high-quality mobile variant.

**What ours could learn:**
- Picross's no-guessing guarantee is sacred — every solvable puzzle must be solvable by pure logic. Our BFS validator helps here, but we should verify this explicitly.
- Picture-reveal reward (the grid becomes a recognizable image) is the *entire point*. Our thematic images for the reveal should be guild-relevant — the cat's face, a scratching post, etc.

---

## StealthScene — Guard Patrol Avoidance

**Genre:** Top-down stealth.

**Why it works:**
- **Vision cones** make threat readable at a glance.
- **Cover mechanics** (our grass patches) give the player agency during risk.
- **Perfect runs are possible** — the best ending comes from being invisible, not from being fast.

**Best in genre:**
- **Metal Gear** (Hideo Kojima, 1987) — pioneered the genre on NES.
- **Metal Gear Solid** — refined it and made stealth a AAA genre.
- **Mark of the Ninja** — side-scrolling stealth but the clearest visual grammar in the genre.
- **Monaco: What's Yours Is Mine** — top-down stealth heist co-op. Directly relevant to our grid format.
- **Gunpoint** — puzzle-stealth hybrid. Short, sharp, satisfying.
- **Volume** — Metal Gear Solid VR-missions spiritual successor; pure stealth puzzles.
- **Hotline Miami** — top-down but stealth-adjacent (one-hit kills in both directions).

**What ours could learn:**
- Monaco's "seen by guard → alarm" cascading escalation is far more interesting than "instant fail." We could let the guards see the cat and *pursue* before the job is lost, giving the player time to escape to cover.
- Mark of the Ninja's trick: *always show the player what the guards can see and hear*. Fog-of-war and visible sound waves. A small addition for big readability.

---

## PounceScene — Physics Catapult

**Genre:** Projectile-physics / slingshot.

**Why it works:**
- **Aim, launch, watch** creates a natural tension-release rhythm.
- **Cascading destruction** — one shot causing a chain reaction is inherently satisfying.
- **Retry is instant and cheap**, so experimentation is rewarded.

**Best in genre:**
- **Angry Birds** (Rovio, 2009) — the genre-defining version. Still the best for "stupid simple to learn."
- **Crush the Castle** (Armor Games, 2009) — the Flash-era predecessor Angry Birds borrowed from.
- **Worms** series — turn-based projectile physics with destructible terrain.
- **Scorched Earth / Gorillas.bas** — ancient classics, cannons + physics.
- **Polygon Shredder / Totally Accurate Battle Simulator** — physics sandbox adjacents.
- **Cut the Rope** — not quite a projectile game, but same tactile satisfaction.

**What ours could learn:**
- Angry Birds's genius is **bird varieties** — each bird has a distinct special ability. Our cat could have breed-specific launch variants (wildcat = straight power shot, Maine Coon = heavy drop, Siamese = mid-air direction change).
- Star ratings based on shots-used push players to optimize. We already have 3-star scoring — good.

---

## PatrolScene — Lantern Watch

**Genre:** Attention management / multi-target upkeep.

**Why it works:**
- Splits the player's focus across multiple things they must *maintain*, not accomplish.
- Tension from "which will fail first" creates sustained pressure without action mashing.
- Naturally scales by adding more things to watch.

**Best in genre:**
- **Papers, Please** — attention + logic under time pressure. The masterpiece of "bureaucratic" gameplay.
- **Five Nights at Freddy's** — monitor multiple cameras, manage power, survive the night. Notorious but genuinely well-designed.
- **Overcooked** — parallel cooking tasks with increasing chaos.
- **Viscera Cleanup Detail** — methodical multi-target cleanup (surprisingly meditative).
- **Keep Talking and Nobody Explodes** — split attention + communication.
- **Mini Metro** — passive buildup that eventually overwhelms you if you don't triage.

**What ours could learn:**
- Papers, Please shows how mundane tasks become gripping through **consequence**. Failing a patrol could actually do something bad in the main game (cost fish, reputation, etc.) — we could tie it in more.
- Mini Metro's escalation curve is perfect. Our lantern game could ramp up the dim rate steadily instead of using fixed difficulty tiers.

---

## RitualScene — Simon Says Candles

**Genre:** Sequence memory.

**Why it works:**
- **Repeat-and-extend** loop is one of the oldest game patterns and still works.
- **Visual/audio pairing** means the player learns the sequence in two channels, like real memorization.
- **Near-fail moments** (getting 9 of 10 right) create intense focus.

**Best in genre:**
- **Simon** (Ralph Baer, 1978) — the toy, the namesake, the template.
- **Bop It** — rhythm + command memory + physical input.
- **Rhythm Heaven** — again: sequences under timing pressure.
- **Mario Party mini-games** — often Simon Says-style sequences.
- **Kirby's Adventure** bonus games — many are sequence memory.
- **Perfect Dark** sim mode / training games — some use memory sequences.

**What ours could learn:**
- Simon's design wisdom: **the machine's speed ramp is fixed**, so players learn over multiple failures rather than hitting a wall. Our Ritual could use this — each failed attempt plays slightly slower.
- Bop It's multi-modal input (rhythm + command + physical gesture) would be hard to replicate on mobile but worth considering — voice commands? Swipe patterns? Shake the phone?

---

## ScentTrailScene — Hot/Cold Grid Search

**Genre:** Deduction / hot-cold / minesweeper-adjacent.

**Why it works:**
- **Information accumulation** creates satisfying "aha" moments as the player narrows down possibilities.
- **Limited moves** forces efficient search strategies.
- **Visible feedback** turns guesses into logical steps.

**Best in genre:**
- **Minesweeper** (Microsoft, 1989) — the classic deduction game. Still the reference.
- **Return of the Obra Dinn** — deduction masterpiece using fragmentary evidence. Best deduction game ever made, full stop.
- **Hunt the Wumpus** (1973) — the original hot/cold search game.
- **Mastermind** — color-peg deduction with feedback per guess.
- **Her Story / Telling Lies** — narrative deduction via search and inference.
- **The Case of the Golden Idol** — recent deduction masterwork.

**What ours could learn:**
- Obra Dinn's genius is **partial-credit confirmation** — you lock in three guesses at once and it tells you if all three are right, but not which ones were wrong. Our scent trail could use a similar "report progress without giving away solution" idea.
- Minesweeper's big/small numbers are readable at a glance. Our hot/cold could use a numeric distance readout.

---

## HeistScene — Lock Picking

**Genre:** Timing / precision / tool manipulation.

**Why it works:**
- **Physical metaphor** — the player feels the lock through the controls.
- **Failure is visible** (the pick breaks / slips) and teaches without punishing hard.
- **Tiered difficulty** via lock levels scales naturally.

**Best in genre:**
- **The Elder Scrolls: Oblivion** — rotate tumblers one at a time. The classic "mini-game that's genuinely fun."
- **The Elder Scrolls: Skyrim** — simplified to a single pick. Less deep, more accessible.
- **Fallout 3 / 4 / NV** — shared pick-and-bobby-pin system. Still taught as an example of "fine motor mini-game that fits the world."
- **Thief: The Dark Project / Thief 2** — stealth + lockpicking, the genre's grandfather.
- **Dishonored** — stealth-tool use + infiltration, Thief's direct descendant.
- **Hitman** series — methodical "picking" at infiltration opportunities.

**What ours could learn:**
- Oblivion's key insight: the player should *feel* the lock mechanism. Audio feedback (click when a tumbler sets) and tactile-ish animations make lock-picking satisfying. Our ring-based UI is fine, but the `lock_click` SFX we added recently is doing real work here.
- Harder locks should require actually *different strategies*, not just more tumblers. Consider adding "trap" tumblers that reset the lock if rotated wrong.

---

## CourierRunScene — 3-Lane Auto-Scroller

**Genre:** Endless runner / lane switcher.

**Why it works:**
- **Forced forward motion** means the player is always committed — no stopping to think.
- **Three lanes** is the sweet spot: enough choice to be interesting, few enough that decisions are snap.
- **Pickup/obstacle pacing** creates the core rhythm.

**Best in genre:**
- **Temple Run** (Imangi Studios, 2011) — the 3-lane classic. Established the template most mobile runners still follow.
- **Subway Surfers** — refined Temple Run, arguably the best-selling mobile game in this genre.
- **Canabalt** — side-scroll auto-runner; the purist take.
- **Jetpack Joyride** — side-scroll runner with rhythm elements.
- **Alto's Odyssey / Alto's Adventure** — side-scroll with beautiful pacing and tone.
- **OlliOlli** — skating runner with trick system.
- **Tiny Wings** — rhythm + momentum runner.

**What ours could learn:**
- Temple Run's *difficulty ramp* is the key: the speed slowly increases, new obstacles appear, and the player's reactions have to keep up. Our courier could use this more explicitly.
- Alto's **tone** — relaxing music, beautiful backgrounds — makes it feel good to replay even after a crash. A runner doesn't have to be stressful.

---

## DungeonRunScene — Roguelike Chain

**Genre:** Roguelike / run-based gauntlet.

**Why it works:**
- **Persistent-but-temporary progress** — each run builds on the last through unlocks, not continuation.
- **Randomized encounters** ensure no two runs feel identical.
- **Death as a reset** normalizes failure and reframes it as learning.
- **Meta-progression** gives long-term players something to chase.

**Best in genre:**
- **Rogue** (Michael Toy, Glenn Wichman, 1980) — the genre namesake.
- **Spelunky 2** — arcade-perfect roguelike; the platonic ideal of "every run feels fair."
- **Hades** — narrative roguelike; characters change their dialogue based on how many times you've died. Incredible reference for how story and roguelike interact.
- **Slay the Spire** — deckbuilding roguelike. The most replayed roguelike of the last decade.
- **Dead Cells** — metroidvania × roguelike. Combat feel is exceptional.
- **Enter the Gungeon** — bullet-hell roguelike.
- **Risk of Rain 2** — 3D roguelike with stackable item synergies.
- **Into the Breach** — tactical roguelike; every decision is perfect-information chess.

**What ours could learn:**
- Hades's narrative trick: **the story progresses whether you win or lose**. Every death brings new dialogue. Our dungeon run treats failure as a flat loss — adding NPC dialogue that reacts to repeated attempts would make it feel alive.
- Slay the Spire's *card-based upgrades* during a run give players meaningful decisions every few encounters. Our dungeon could offer inter-floor upgrades (buff a stat, heal partially, pick a new tool) to give moment-to-moment agency.
- Spelunky 2 fairness rule: **the player must always be able to tell why they died**. Worth auditing our dungeon for fail states that feel random.

---

## Cross-cutting references

These games are worth studying regardless of which specific minigame you're improving:

- **Rhythm Heaven** — micro-game design at its peak. Every 30-second mini-game teaches its own rules via examples, not text.
- **Stardew Valley** — the tonal reference for everything Clowder wants to be.
- **Hades** — combat feel, narrative layering, moment-to-moment responsiveness. All top-tier.
- **Papers, Please** — making mundane tasks feel urgent and consequential.
- **Into the Breach** — perfect-information decision-making.
- **Obra Dinn** — fragmentary evidence + deduction + presentation.

---

## How to use this doc

When revisiting a minigame for improvement:
1. Open this doc, find the relevant section.
2. Check the "What ours could learn" notes first — those are the low-hanging-fruit ideas.
3. If you want to go deeper, pick one reference game and do a `nia github search` against its open-source implementations (or similar open-source clones) for specific techniques.
4. Playtest with `test/chase-playtest.mjs` or a similar scene-specific script to verify the improvement before shipping.
