# Arcade Game → Clowder & Crest Minigame Brainstorm

> Brief: pick a classic arcade game whose core mechanic could be reskinned into a 16th minigame for Clowder & Crest. The pick has to (a) be cat-thematic, (b) not overlap mechanically with the existing 15 minigames, (c) work in portrait touch, and (d) resolve in 30-90 seconds.

## What's already covered

For reference, the current 15-minigame roster maps onto these arcade ancestors:

| Existing minigame | Arcade ancestor |
|---|---|
| Chase (rat maze) | Pac-Man |
| Hunt (whack-a-rat) | Whac-A-Mole |
| Courier Run | Frogger / Subway Surfers |
| Sokoban | Sokoban |
| Rush Hour (sliding blocks) | Rush Hour |
| Fishing | Reel-in fishing |
| Nonogram (Picross) | Picross |
| Stealth | Metal Gear |
| Pounce (slingshot) | Angry Birds |
| Brawl | Zelda / beat-em-up |
| Patrol (lantern watch) | Mini Metro / attention upkeep |
| Ritual (Simon Says) | Simon |
| Scent Trail (hot/cold) | Mastermind |
| Heist (lock rings) | Oblivion lockpicking |
| Roof Scout | Donkey Kong / Celeste |

The biggest gaps are: **paddle-and-ball games** (Breakout/Pong/Arkanoid), **tile-flipping games** (Q*bert, Painter), **continuous-pursuit-and-collect** (Snake), and **service-line games** (Tapper, Diner Dash).

## Candidates

### 1. **Yarn Ball Bash — Breakout / Arkanoid (top pick)**

**Cat metaphor:** A cat sits on a windowsill batting a ball of yarn back and forth, knocking pots, vases, and crates off the shelves above. Every broken object leaks a fish or coin onto the floor.

**Why it fits:**
- Cats batting things off shelves is the most universally recognizable cat behavior in the world. The metaphor sells itself with zero copy.
- Touch controls are trivial: drag horizontally to move the windowsill. One-finger play.
- Doesn't overlap with any existing minigame — Pounce is a one-shot slingshot, this is continuous batting with ball physics.
- Levels are easy to author (rectangular grid of objects) and easy to vary (stone pots are sturdy, glass vases are fragile, locked crates need 2 hits, gold coins are bonus targets).
- Job category fit: **shadow** or **detection** — the cat is "knocking valuables off a noble's high shelf to recover stolen guild property" or "rattling a merchant's stock to find the smuggled fish under the false bottom."

**Mechanical sketch:**
- 6-8 rows of breakable objects at the top of the screen
- Yarn ball bounces off the top, walls, and the windowsill
- Windowsill (paddle) is interactive — drag a finger left/right under the lower third of the screen
- Lose the ball off the bottom = -1 life (3 lives)
- Clear all objects = win
- Brick types: stone (sturdy, 2 hits), wood (1 hit, +1 fish), glass (1 hit, +1 fish + bonus pickup spawns), gold (1 hit, +5 fish), iron (indestructible obstacle)
- Power-up pickups: catnip (paddle widens 8s), milk (slow-mo 6s), claws (next 3 hits pierce through)

**Difficulty levers:** Ball speed, paddle width, brick density, indestructible obstacle count.

**Implementation cost:** Low. Phaser Arcade physics handles ball + paddle natively. ~600-line scene file. Reuses the existing victory/SFX patterns.

**The pillar this hits:** "Game feel via natural mapping" — the player's intent (move the cat) matches the input (drag the paddle) almost 1:1. Plus the *clack-clack-clack* of breakable objects has built-in dopamine.

---

### 2. **Rooftop Tag — Q*bert**

**Cat metaphor:** Cat hops across a grid of rooftop tiles, leaving a paw-print mark on each. Goal: mark every tile in a level. NPC alley dogs hop around trying to corner the cat.

**Why it fits:**
- "Marking territory" is a cat thing.
- Visually distinct from Roof Scout (this is tile hopping, not climbing).
- Touch controls: tap one of 4 diagonal directions, OR a 4-button d-pad in a corner.
- Job category fit: **guard** or **detection** — "marking the rooftops as guild territory" or "casing every approach to the cathedral."

**Mechanical sketch:**
- Isometric pyramid of ~20 tiles (or a rectangular grid)
- Cat starts at one corner, must visit every tile
- Each step lands on the next tile diagonally — like Q*bert's pyramid hops
- A blue paw-print appears when the cat lands. Hopping a tile a SECOND time un-marks it (twist on Q*bert)
- 1-2 dog sprites hop randomly toward the cat; collision = lose
- Power-up: a fish spawns on a random tile every ~10s. Pick up = +1 fish bonus.

**Cost:** Medium. Isometric rendering is more work than the existing top-down or side-scroll scenes. Phaser supports it but the project hasn't done it yet.

**Concern:** Q*bert is harder to read on a small portrait screen — depth ambiguity. Would need careful tile contrast.

---

### 3. **The Fish Counter — Tapper / Diner Dash**

**Cat metaphor:** Cat tends a fish counter at the docks/tavern. Customers (sailors, monks, market-goers) slide up to one of 3-4 lanes; the cat slides a fish down to each. Customers leave plates that slide back; the cat must collect empties to make room.

**Why it fits:**
- Service-line genre is uncovered.
- The "balance multiple lanes simultaneously" challenge is distinct from Patrol (which is upkeep) and Hunt (which is reactive whack-a).
- Touch controls: tap a lane to send a fish; tap a returning plate to collect it.
- Job category fit: **courier** or new **service** category.

**Mechanical sketch:**
- 3-4 horizontal counter lanes
- Customers walk in from the right, stop at one of the lanes
- Cat at the left taps a lane to slide a fish across; if the fish reaches the customer in time, they take it and leave the empty plate sliding back
- Empties collide with new fish — must be collected before they fall off the counter
- Wave-based: each wave has more customers and faster patience timers
- 30-60s session

**Cost:** Medium. New asset class (counters, customers, plates) but the mechanics are simple.

**Concern:** Tapper is the most "video gamey" of the four — least diegetic, hardest to ground in the medieval cat-guild setting without feeling like a wedged-in arcade detour.

---

### 4. **The Kitten Parade — Snake**

**Cat metaphor:** A senior cat leads a line of stray kittens through the town to the guildhall. Each kitten picked up joins the tail. Hazards (carts, dogs, puddles) stop the parade if any kitten touches them.

**Why it fits:**
- Snake's growing-tail mechanic translates cleanly.
- Cats herding kittens is universally adorable.
- Touch controls: swipe to change direction.
- Job category fit: **courier** or **guard** — "delivering recruited strays from the docks to the guildhall safely."

**Mechanical sketch:**
- Top-down 12x12 grid of paths through the town
- Senior cat starts at one corner, kittens scattered on tiles
- Touch any open path tile to set a target — the cat moves continuously toward it
- Each kitten reached adds to the tail (1-tile delay per kitten so the line snakes behind)
- Hazards spawn on random tiles after wave 2
- Reach the guildhall with all kittens = win

**Cost:** Low-medium. Continuous-movement grid pathing is similar to Chase but the tail logic is new.

**Concern:** Snake's classic "you bumped your own tail" lose state needs reinterpretation — kittens shouldn't punish you for crossing them.

---

## Recommendation

**Build #1 — Yarn Ball Bash (Breakout/Arkanoid).**

It's the strongest pick on every axis:
- **Theme**: nothing is more cat than batting things off shelves.
- **Mechanical novelty**: the ball-and-paddle genre is genuinely missing from the current 15.
- **Touch ergonomics**: one finger, one drag axis. The most accessible control scheme of the four.
- **Implementation cost**: lowest. Phaser Arcade physics handles ball + paddle natively, the level data is just a 2D grid of brick types, and the per-brick reward system fits the existing fish economy with zero new code.
- **Session length**: tunable to 30-90s by varying brick density and lives.
- **Job category fit**: slots cleanly into shadow OR detection, both of which are slightly under-served compared to courier and pest_control.
- **Tutorial overhead**: minimal. "Drag the windowsill, don't drop the ball" is two sentences.

The other three are valid as future additions but each carries more risk: Q*bert needs isometric rendering the project hasn't built before, Tapper feels least diegetic, and Snake's lose state needs careful reinterpretation to not punish.

## What it doesn't replace

Yarn Ball Bash isn't a substitute for any existing minigame — it's an addition. The most natural cluster to put it in is the **shadow** category alongside Heist and Stealth, where the player is "creating chaos for cover" rather than "fighting" or "delivering." It would also work as a one-off event minigame (e.g. "the merchant's apprentice paid you 10 fish to wreck the hated competing stall — go bat their pots off the shelves").

## Implementation outline if approved

1. New scene file `src/scenes/YarnBallScene.ts` (~600 LOC)
2. Phaser Arcade physics for ball + paddle
3. `BrickDef[]` schema mirroring the existing Sokoban level format — 6-8 hand-crafted layouts
4. Brick subclasses: stone, wood, glass, gold, iron — each with a hit count and a reward function
5. 3 difficulties: easy (slow ball, wide paddle, sparse bricks) → hard (fast ball, narrow paddle, dense bricks + indestructible obstacles)
6. SFX: brick break (`crate_push` repurposed), ball bounce (a new soft `tap`), paddle hit (`block_slide`), level clear (`victory` pool), miss (`fail`)
7. Music trackset: a new entry in `MusicManager.TRACK_SETS` initially aliased to an existing playful track (e.g. `hunt_*` or `courier_run_*`) until a dedicated theme is composed
8. Add to the courier-job choice picker in `jobFlow.ts` AND/OR a new shadow-job choice
9. Add to `BootScene` preload (no new sprites needed; uses simple primitives like the early minigames did)
10. Day of Rest catalogue entry under whatever chapter the campaign first introduces it
11. Playtest at `test/yarn-ball-playtest.mjs` matching the existing per-scene playtest pattern

Total scope: 1-2 days of focused work, similar to the Roof Scout build.
