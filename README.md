# Clowder & Crest

A cozy medieval cat guild management game. Recruit cats, take jobs, solve puzzles, and build your guild from a lone stray to a renowned clowder.

**Play now:** [clowderandcrest.com](https://clowderandcrest.com)

**Listen to the soundtrack:** [Clowder & Crest Suno playlist](https://suno.com/playlist/76de63b1-aa56-47a9-a2e8-f11499e93cf2)

## What it is

A hybrid daily-life sim and minigame anthology, framed as a Fire Emblem-style support drama between cats. You play the founding Wildcat of a fledgling guild, recruit other breeds, take jobs from the town board, and survive a 7-chapter narrative arc that builds from "stray under a tarp" to a Church Inquisition. Every job is a minigame; every cat has stats, mood, and bond conversations with the rest of the guild.

## Minigames

**14 distinct minigame types**, each authored against the design pillars of its genre. They're staggered across the chapter unlocks so the player learns the vocabulary one piece at a time:

| # | Minigame | Genre | Highlights |
|---|---|---|---|
| 1 | **Chase** | Maze-chase arcade (Pac-Man) | 2-dog pack with distinct AI archetypes (Tracker + Ambusher), Pac-Man-style ghost combo on catnip, archetype-specific death messages |
| 2 | **Hunt** | Whack-a-mole / reaction | Speed escalation, fake-out rats (peek + double-pop), poison rats with red tint, 5-chain combo bonus |
| 3 | **Sokoban** | Crate pushing | 8 themed hand-crafted levels with named concepts ("First Push", "Three Locks", "Pushed Out"...), BFS-validated, restart button |
| 4 | **Courier Run** | Endless runner / lane switcher | Linear speed escalation curve, 9 obstacle "phrases" instead of pure random spawns, 4 mission types per run, juice on lane changes/pickups/hits |
| 5 | **Brawl** | Top-down action | Telegraphed rat windups, hit-stop on kill, Skirmisher rat type with lunge attack, boss phase 2 transition at 50% HP, wave foreshadowing |
| 6 | **Patrol** | Attention management | Continuous threat escalation curve, prowler intruders as a second upkeep type, relight cooldown forcing triage, lantern-loss tracking |
| 7 | **Nonogram** | Picross / grid logic | 13 hand-crafted thematic images (cat face, fish, lantern, sitting cat), constraint-propagation validator, NO penalty feedback (pure deduction), undo button |
| 8 | **Ritual** | Sequence memory (Simon) | Per-candle pentatonic tones for dual-channel encoding, speed escalation across rounds, adaptive 1.4× slowdown on failure, near-fail messaging |
| 9 | **Scent Trail** | Hot/cold deduction | Exact Manhattan distance numbers (not buckets), Mastermind-style remote probes, constraint-ring overlay on revealed tiles |
| 10 | **Slide Blocks** | Constraint-satisfaction (Rush Hour) | 6 named themed puzzles ("Gridlock", "Three Locks"...), load-time BFS validation auto-corrects par drift, PERFECT! callout, axis-arrow indicators on blocks |
| 11 | **Fishing** | Reel-in tension | Three-phase structure (approach → bite → catch), 5 fish behaviors driving zone motion (steady/darting/diver/runner/lazy), 4-tier rarity system |
| 12 | **Pounce** | Projectile physics (Angry Birds) | Breed-specific mid-flight abilities (Power Shot, Heavy Drop, Triple Split, Whirlwind...), wood/stone/glass material variety, 4 hand-crafted structure templates |
| 13 | **Heist** | Lock picking | Per-ring "set" state with distinct sparkle SFX, counter-clockwise rotation via tap-side detection, trap notches on hard difficulty |
| 14 | **Stealth** | Top-down stealth | Graduated detection (alert + pursuit, not instant fail), grass-recovery loop, ghost run reward layer, alert spreading to nearby guards |

Plus the **Dungeon Run** roguelike meta-loop (Ch.5+) that chains random minigame floors with persistent HP, inter-floor upgrade picks (Slay-the-Spire model), and a Hades-style reactive narrative driven by run history.

## Other features

- **6 cat breeds** (Wildcat, Russian Blue, Tuxedo, Maine Coon, Siamese, Bengal) with PixelLab-generated pixel art — idle (4 directions), walk (6 frames × 4 dirs), scratch, sit, eat, sleep
- **35 jobs** across 6 categories — Pest Control, Courier, Guard, Sacred, Detection, Shadow (chapter-gated)
- **7 chapters** of narrative — stray, founding, Rat Plague, learning, established, Rival Guild, Inquisition
- **Bond system** — all 15 breed pairs, 48 conversation scripts (45 pair + 3 group), Fire Emblem-style C/B/A ranks with stat-grant rewards on rank-up
- **Reputation system** (Crest/Shadow) — Sacred + Guard work builds Crest, Detection builds Shadow; affects recruit costs, daily income, and bond growth
- **Guildhall + 3 unlockable rooms** — 15 furniture items, drag-to-rearrange, walk-into-furniture stat boosts
- **Town map** — explorable 8×10 grid with buildings, stray cats, walking NPCs
- **Real-time day cycle** — 5-minute days, dawn-to-night phases, time-of-day town art
- **Daily wishes**, **traveling merchant** (every 3rd day), **rotating festivals** (every 7 days)
- **3 save slots** with forward migration (saves never destroyed on updates)
- **Guild journal** — chapter beats, recruits, level-ups, bond rank-ups, dungeon runs
- **14 music tracks** + 22 sound effects + rain ambience (most via ElevenLabs)
- **Native Android features** (Capacitor build) — haptic feedback wired into every minigame's emotional beats, pause-on-background lifecycle so the day timer doesn't drain when the app is closed, daily "your cats are waiting" return notification, dark status bar matching the game theme
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
