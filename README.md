# Clowder & Crest

A cozy medieval cat guild management game. Recruit cats, take jobs, solve puzzles, and build your guild from a lone stray to a renowned clowder.

**Play now:** [clowderandcrest.com](https://clowderandcrest.com)

**Listen to the soundtrack:** [Clowder & Crest Suno playlist](https://suno.com/playlist/76de63b1-aa56-47a9-a2e8-f11499e93cf2)

## What it is

A hybrid daily-life sim and minigame anthology, framed as a Fire Emblem-style support drama between cats. You play the founding Wildcat of a fledgling guild, recruit other breeds, take jobs from the town board, and survive a 7-chapter narrative arc that builds from "stray under a tarp" to a Church Inquisition. Every job is a minigame; every cat has stats, mood, and bond conversations with the rest of the guild. Each breed has a unique recruitment scene, and the guild's reputation (Crest vs Shadow) shapes the available jobs and the town's perception of you.

## Minigames

**15 distinct minigame types**, each authored against the design pillars of its genre. They're staggered across the chapter unlocks so the player learns the vocabulary one piece at a time:

| # | Minigame | Genre | Highlights |
|---|---|---|---|
| 1 | **Chase** | Maze-chase arcade (Pac-Man) | 2-dog pack with distinct AI archetypes (Tracker + Ambusher), Pac-Man-style ghost combo on catnip, archetype-specific death messages |
| 2 | **Hunt** | Whack-a-mole / reaction | Speed escalation, fake-out rats (peek + double-pop), poison rats with red tint, 5-chain combo bonus |
| 3 | **Sokoban** | Crate pushing | 8 themed hand-crafted levels with named concepts ("First Push", "Three Locks", "Pushed Out"...), BFS-validated, restart button |
| 4 | **Courier Run** | Endless runner / lane switcher | Linear speed escalation curve, 9 obstacle "phrases" instead of pure random spawns, 4 mission types per run, juice on lane changes/pickups/hits |
| 5 | **Brawl** | Top-down action | Telegraphed rat windups, hit-stop on kill, 3 enemy types (Grunt, Skirmisher with lunge, Archer with ranged projectiles), boss phase 2 + minions, wave foreshadowing |
| 6 | **Patrol** | Attention management | Continuous threat escalation, 3 prowler types (normal tap, tough 2-tap, swipe gesture), relight cooldown forcing triage, lantern-loss tracking |
| 7 | **Nonogram** | Picross / grid logic | 13 hand-crafted thematic images (cat face, fish, lantern, sitting cat), constraint-propagation validator, NO penalty feedback (pure deduction), undo button |
| 8 | **Ritual** | Sequence memory (Simon) | Per-candle pentatonic tones for dual-channel encoding, speed escalation across rounds, adaptive 1.4× slowdown on failure, near-fail messaging |
| 9 | **Scent Trail** | Hot/cold deduction | Exact Manhattan distance numbers (not buckets), Mastermind-style remote probes, constraint-ring overlay on revealed tiles |
| 10 | **Slide Blocks** | Constraint-satisfaction (Rush Hour) | 6 named themed puzzles ("Gridlock", "Three Locks"...), load-time BFS validation auto-corrects par drift, PERFECT! callout, axis-arrow indicators on blocks |
| 11 | **Fishing** | Reel-in tension | Three-phase structure (approach → bite → catch), 5 fish behaviors driving zone motion (steady/darting/diver/runner/lazy), 4-tier rarity system |
| 12 | **Pounce** | Projectile physics (Angry Birds) | Breed-specific mid-flight abilities (Power Shot, Heavy Drop, Triple Split, Whirlwind...), wood/stone/glass material variety, 4 hand-crafted structure templates |
| 13 | **Heist** | Lock picking | Per-ring "set" state with distinct sparkle SFX, counter-clockwise rotation via tap-side detection, trap notches on hard difficulty |
| 14 | **Stealth** | Top-down stealth | Graduated detection (alert + pursuit, not instant fail), grass-recovery loop, ghost run reward layer, alert spreading to nearby guards |
| 15 | **Roof Scout** | Vertical climbing platformer | Two-zone touch + auto-lean, coyote time + jump buffer + wall coyote, proximity wall jumps off ledge edges, patrolling enemies on medium/hard, breed-directional sprites + walk animation, hand-crafted chunks across 3 difficulty tiers, no-fail easy mode |

Plus the **Dungeon Run** roguelike meta-loop (Ch.5+) that chains random minigame floors with persistent HP, inter-floor upgrade picks (Slay-the-Spire model), and a Hades-style reactive narrative driven by run history.

## Other features

- **6 cat breeds** (Wildcat, Russian Blue, Tuxedo, Maine Coon, Siamese, Bengal) with PixelLab-generated pixel art — idle (4 directions), walk (6 frames × 4 dirs), scratch, sit, eat, sleep
- **35 jobs** across 6 categories — Pest Control, Courier, Guard, Sacred, Detection, Shadow (chapter-gated)
- **7 chapters** of narrative — stray, founding, Rat Plague, learning, established, Rival Guild, Inquisition
- **Unique recruitment scenes** — each of the 5 recruitable breeds has a bespoke multi-panel arrival narrative reflecting their personality
- **Bond system** — all 15 breed pairs with C/B/A rank conversations (54 scripts: 45 pair + 9 group), Fire Emblem-style stat-grant rewards on rank-up, group conversations for partial rosters
- **Reputation system** (Crest/Shadow) — Sacred + Guard work builds Crest, Detection + Shadow work lowers it. A "shady stranger" temptation appears from Ch.3+ with boosted rewards. Reputation affects recruit costs, daily income, job availability, and town perception
- **Guildhall + 3 unlockable rooms** — 15 furniture items unlocked progressively by chapter, drag-to-rearrange, walk-into-furniture stat boosts. Kitchen: +1 passive fish/day. Operations Hall: daily job intel report
- **Building-locked jobs** — each job maps to a specific town building (mill, cathedral, docks, tavern, castle, market). Walk to the right building to start your accepted job
- **Town map** — explorable 8×10 grid with buildings, stray cats, walking NPCs
- **Real-time day cycle** — 5-minute days, dawn-to-night phases, time-of-day town art
- **Daily wishes** — fulfilled by owning the right furniture or interacting with cats. Room-based fulfillment prompt when entering a room with the wished-for item
- **Traveling merchant** (every 3rd day) — walk to the merchant sprite on the town map to browse their wares
- **Rotating festivals** (every 7 days, suppressed during crises)
- **Cats need beds** — unbedded cats lose morale at day-end. Buy sleeping furniture to keep the guild happy
- **Auto-save** at the end of each day + **3 save slots** with forward migration
- **Guild journal** — chapter beats, recruits, level-ups, bond rank-ups, stat improvements, dungeon runs
- **70+ music tracks** across every minigame, chapter, room, and event + 30+ sound effects with anti-repetition pools + rain ambience
- **Native Android features** (Capacitor build) — haptic feedback wired into every minigame's emotional beats (including haptic-only lock-picking in Heist), pause-on-background lifecycle, daily return notification + chapter milestone notifications, dark status bar matching the game theme
- **Day of Rest** — in-universe minigame archive. Each of the 15 minigames appears as a "memory" card the first time the player completes it in a job; tapping a card replays the game in a no-stakes sandbox (no fish, no XP, no penalties). The campaign-progress entry lives behind the menu so it never competes with the pacing. A separate fully-unlocked entry on the title screen (gated by a spoiler warning) lets new players browse the entire catalogue without committing to a save. A hidden showcase entry (`?showcase=1` URL parameter on web, five quick taps on the title-screen crest on web + APK) loads a fully-unlocked demo save for portfolio reviewers
- **Resilient playtest harness** — every minigame has a `test/*-playtest.mjs` script with hard timeouts, process group cleanup, and direct-method verification

## Tech stack

**Runtime**

- **Phaser 3** + TypeScript (canvas game scenes)
- **HTML/CSS overlays** (UI chrome — bottom nav, panels, dialogues)
- **Vite** (dev server + production build)
- **Capacitor** (Android packaging)
- **Apache** + Let's Encrypt (web deploy)

**Built with**

- **PixelLab** — AI pixel art (idle, walk, scratch, sit, eat, sleep animations × 6 breeds)
- **Midjourney** — illustrated dialogue portraits (5 expressions × 6 breeds)
- **ElevenLabs** — sound effects
- **Suno** — 70-track shared-leitmotif soundtrack (35 scenes × 2 variants)
- **Claude Code** with Claude Opus 4.6 — primary code authoring + design dialogue
- **Codex CLI** with GPT-5.4 Codex — secondary code authoring lane (`todo/codex-todo.md`)
- **Gemini CLI** with Gemini 3.1 Pro Preview — third coding lane (`todo/gemini-todo.md`)

## Development

```bash
npm run dev          # Dev server on port 3200
npm run build        # Type-check + production build to dist/
```

Each minigame has a Playwright-based playtest:

```bash
timeout 150s node test/chase-playtest.mjs
timeout 150s node test/sokoban-playtest.mjs
timeout 150s node test/brawl-playtest.mjs
# ...one per scene
```

## Architecture

See [CLAUDE.md](CLAUDE.md) for full project structure, scene-by-scene mechanic notes, and design decisions.

## License

CC BY-NC-SA 4.0 — See [LICENSE](LICENSE) for details.
