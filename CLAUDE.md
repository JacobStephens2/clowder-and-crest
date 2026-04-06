# Clowder & Crest

Cat guild management game with Rush Hour sliding block puzzles. Built with Phaser 3 + TypeScript, deployed at https://clowder.stephens.page.

## Commands

```bash
npm run dev          # Start Vite dev server on port 3200
npm run build        # Type-check + production build to dist/
npm run preview      # Preview production build locally
npm run ota:publish  # Build + zip dist/ + write updates/manifest.json
npm run release      # Alias for ota:publish
```

Build output goes to `dist/`, which Apache serves directly.

## Architecture

Hybrid Phaser Canvas + HTML/CSS overlays:

- **Phaser canvas** renders the game world: guildhall rooms, town scene, puzzle grid, cat sprites, animations
- **HTML/CSS overlays** handle all UI chrome: status bar, bottom nav, job cards, cat profiles, conversation dialogs, menus, result screens, name prompt
- **Event bus** (`src/utils/events.ts`) bridges communication between the two layers

## Project Structure

```
src/
├── main.ts                  # Entry point — Phaser config, game state, HTML overlay wiring, event handlers
├── scenes/
│   ├── BootScene.ts         # Asset preloading — 300+ sprites, SFX, scenes, furniture, blocks
│   ├── TitleScene.ts        # Title screen — crest, rain, random breed cat, save slots
│   ├── GuildhallScene.ts    # Room overview — cat sprites, furniture sprites, chapter-aware naming
│   ├── RoomScene.ts         # Top-down room interior — 7x7 grid, wandering cats, furniture interaction with stat boosts
│   ├── TownMapScene.ts      # Explorable 8x10 town map — walkable streets, buildings, stray cat recruitment
│   ├── PuzzleScene.ts       # 6x6 Rush Hour grid — themed block sprites, drag controls
│   ├── SokobanScene.ts      # 7x7 Sokoban crate-pushing — procedural generation + 8 fallbacks + swipe controls
│   ├── ChaseScene.ts        # 13x13 Pac-Man style rat chase — guard dog, speed boosts, hold-to-move
│   ├── FishingScene.ts      # Fishing reel-in — rare golden fish, current surges
│   ├── HuntScene.ts         # Whack-a-mole rat hunting — golden/poison rats, 3 difficulties
│   ├── BrawlScene.ts        # Zelda-style combat — waves, Rat King boss, powerups, joystick, multi-touch
│   ├── NonogramScene.ts     # Grid logic puzzle — procedural with solvability validation
│   ├── StealthScene.ts      # Stealth/avoidance — guard patrol, grass hiding, vision cones
│   ├── PounceScene.ts       # Physics catapult — Matter.js, knock rats off crate stacks
│   ├── PatrolScene.ts       # Lantern watch — reveal hidden rats, guard jobs (Ch.3)
│   ├── RitualScene.ts       # Simon Says candle sequences, sacred jobs (Ch.4)
│   ├── ScentTrailScene.ts   # Hot/cold grid search, detection jobs (Ch.4)
│   ├── HeistScene.ts        # Lock-picking concentric rings, shadow jobs (Ch.6)
│   ├── CourierRunScene.ts   # 3-lane auto-scroller, courier jobs (Ch.2)
│   └── DungeonRunScene.ts   # Roguelike cellar — chain minigame floors with persistent HP (Ch.5+)
├── systems/
│   ├── SaveManager.ts       # Save/load to localStorage, 3 save slots, forward migration, failure notification
│   ├── CatManager.ts        # 6 breed definitions, cat creation with variance, XP/leveling, specialization
│   ├── JobBoard.ts          # 35 job templates across 6 categories, stat matching, procedural flavor text
│   ├── Economy.ts           # Fish earn/spend, stationed earnings, station events
│   ├── PuzzleGenerator.ts   # Procedural Rush Hour generation + BFS solver
│   ├── BondSystem.ts        # All 15 breed pair bonds, rank tracking, conversation triggers
│   ├── ProgressionManager.ts # 7-chapter gates, progression hints, rat plague, inquisition
│   ├── MusicManager.ts      # 14 tracks (10 ambient + 2 puzzle + 2 fight), 3 modes, fade transitions
│   ├── DayTimer.ts          # 3-minute days, phase display, pause support
│   ├── SfxManager.ts        # 22 sound effects with audio pooling for concurrent playback
│   ├── ReputationSystem.ts  # Crest/Shadow scoring, recruit cost modifiers, tier bonuses
│   ├── GameSystems.ts       # Combos, daily wishes, festivals, analytics
├── ui/
│   ├── overlay.css          # All HTML overlay styles
│   ├── Panels.ts            # Cat panel, menu, rename prompt, furniture shop
│   ├── Conversations.ts     # Fire Emblem-style bond dialogues + group conversations
│   ├── narrativeOverlay.ts  # Reusable tap-to-advance narrative scene overlay
│   └── sceneHelpers.ts      # Shared button, d-pad, tutorial helpers for scenes
├── data/
│   ├── breeds.json          # 6 breeds with base stats and stat biases
│   ├── jobs.json            # 35 job templates (pest control, courier, guard, sacred, detection, shadow)
│   ├── puzzles.json         # 5 hand-designed Rush Hour puzzles, BFS-validated
│   ├── furniture.json       # 15 furniture items with pixel art sprites
│   └── conversations.json   # 48 conversation scripts (45 pair + 3 group)
└── utils/
    ├── constants.ts         # ALL_BREED_IDS, SCENES, dimensions, colors, stats, bonds, chapter triggers
    ├── events.ts            # GameEventBus singleton for canvas <-> overlay communication
    └── helpers.ts           # clamp, randomInt, pick, shuffled
```

## Game Flow

1. **Title Screen** — crest logo, rain particles, random breed cat, save slot selection
2. **Name Prompt** (HTML overlay) — player names their Wildcat
3. **Intro Story** — 6-panel narrative with rain ambience and music
4. **Tutorial** — 5-step guided walkthrough for new players
5. **Guildhall** — "Behind the Grain Market" (Ch.1) → "The Guildhall" (Ch.2+), rooms with cats and furniture
6. **Town Map** — explorable 8x10 grid with buildings, stray cats, NPC cats
7. **Job Board** — accept a job, walk to a building to start it
8. **Minigame** — 2+ choices per job category from 14 types, staggered unlock across chapters
9. **Results** — fish earned, XP, level ups, combo streak, perfect celebration
10. **Conversation** — Fire Emblem-style pair bonds (C/B/A) or group conversations at milestones
11. **Day End** — upkeep deducted, stationed earnings, reputation bonuses, crisis events, random expenses
12. **Guild Report** — returning player briefing after 24+ hours away
13. **Loop** — advance day, check chapter progression, repeat

## Key Design Decisions

- **Player is the founding Wildcat** — always in the roster, named at game start, can't be dismissed
- **All 6 breeds have PixelLab pixel art** — idle (4 directions), walk (6 frames x 4 dirs), scratch, sit, eat, sleep animations
- **14 minigame types** — Rush Hour, Sokoban, Chase, Fishing, Hunt, Brawl, Nonogram, Stealth, Pounce, Patrol, Ritual, Scent Trail, Heist, Courier Run (staggered unlock across chapters)
- **Roguelike dungeon run** — chain random minigame floors with persistent HP, unlocks Chapter 5+
- **35 jobs across 6 categories** — pest control, courier, guard, sacred, detection, shadow (chapter-gated)
- **Reputation system** — Sacred/Guard → Crest (noble), Detection → Shadow. Affects recruit costs and daily bonuses
- **Bond system** — all 15 breed pairs track bonds, 48 conversation scripts
- **Economy** — 15 fish start, 2/cat + 1/room daily upkeep, combo chains, merchant items
- **7 chapters** — including Rat Plague (Ch.3), Rival Guild (Ch.6), Inquisition (Ch.7)
- **Save migration** — missing fields backfilled, saves never destroyed on updates
- **ALL_BREED_IDS** and **SCENES** in constants.ts — single source of truth for breed lists and scene keys
- **3 save slots** — multiple saves with slot picker on title screen
- **Scene shutdown cleanup** — all scenes register shutdown handlers to prevent memory leaks
- **HTML escaping** — user-provided names escaped with esc() to prevent injection

## Deployment

Apache VirtualHost at `/etc/apache2/sites-available/clowder.stephens.page.conf` points DocumentRoot to `/var/www/clowder.stephens.page/dist`. SSL via Let's Encrypt (auto-renewing). FallbackResource handles SPA routing.

To redeploy after changes:

```bash
npm run build
# dist/ is already the Apache DocumentRoot — changes are live immediately
```

## Using Nia

Nia is installed as a CLI at `/usr/bin/nia`, authenticated for the `jacob` user. It provides indexing and search for external documentation, GitHub repos, packages, and research. **Prefer Nia over WebFetch/WebSearch** — Nia returns full structured content; web tools return truncated summaries.

Invoke Nia via the Bash tool. Key commands:

| Command | Purpose |
|---|---|
| `nia sources list` | List indexed documentation sources |
| `nia repos list` | List indexed GitHub repos |
| `nia github search <owner/repo> <query>` | Live code search in any public GitHub repo (no indexing needed; rate-limited to 10/min) |
| `nia github tree <owner/repo> [path]` | Browse a GitHub repo's file tree |
| `nia github read <owner/repo> <path> [--start N --end M]` | Read a file from GitHub |
| `nia github glob <owner/repo> <pattern>` | Find files by glob in a GitHub repo |
| `nia packages search <query>` | Search npm/PyPI/crates.io/Go packages |
| `nia tracer` | Autonomous GitHub code search without indexing |
| `nia search <query>` | Search across indexed sources |
| `nia sources add <url>` | Index a documentation site (root URL preferred) |
| `nia repos add <owner/repo>` | Index a GitHub repo |
| `nia oracle` | Autonomous AI research jobs (free plan: 0 available) |
| `nia usage` | Check plan quotas |

### Nia-first workflow

Before using WebFetch or WebSearch:

1. **Check `nia-sources.md`** at the repo root for sources already indexed in past sessions.
2. **For GitHub code questions** — use `nia github search/tree/read` directly (no indexing needed).
3. **For package APIs** — use `nia packages search`.
4. **For documentation sites** — check `nia sources list`; if the docs aren't indexed and we'll consult them again, add with `nia sources add <root-url>`. Indexing takes 1-5 minutes.
5. **After useful research** — append the source to `nia-sources.md` (URL, one-line purpose) so future sessions skip discovery.

### Free plan quotas (per month)

- queries: 50
- web_search: 20
- package_search: 50
- tracer: 10
- indexing: 3 sources
- contexts: 5
- deep_research / oracle: 0 (paid feature)

Use indexing sparingly — only for docs/repos we'll reference many times. GitHub live search is unlimited and should be the default for one-off code questions.

## What's Not Implemented Yet

- Big cats (Lynx, Lion, Leopard) and additional breeds
- Light-path puzzle type
- Individual cat rooms (personal decoration per cat)
- Cloud save sync
- Signed release APK (debug builds only)
