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

## OTA Updates (Capacitor)

The Android APK ships with bundled web assets but checks for updates on launch via `@capgo/capacitor-updater` in manual mode. No app store reinstall needed.

**How it works:**
1. App launches, `src/systems/OtaUpdater.ts` runs
2. Fetches `https://clowder.stephens.page/updates/manifest.json`
3. Compares `manifest.version` against `__APP_VERSION__` (from package.json at build time)
4. If newer, downloads the zip, stages it via `CapacitorUpdater.next()`
5. Update activates on next app background or restart

**To push an update:**
1. Make changes, bump `version` in `package.json`
2. Run `npm run ota:publish`
3. That's it — installed apps pick it up on next launch

**Files:**
- `dist/updates/manifest.json` — version + zip URL
- `dist/updates/<version>.zip` — zipped dist/ contents
- `scripts/ota-publish.sh` — build script
- `src/systems/OtaUpdater.ts` — client-side update checker

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
│   ├── BootScene.ts         # Asset preloading — 255+ sprites, SFX, scenes, furniture, blocks
│   ├── TitleScene.ts        # Title screen — crest, rain particles, pixel art cat, Continue/New Game
│   ├── GuildhallScene.ts    # Room overview — cat sprites, furniture, lanterns, chapter-aware naming
│   ├── RoomScene.ts         # Top-down room interior — 7x7 grid, wandering cats, interactive furniture
│   ├── TownScene.ts         # Phaser townscape with time-of-day variants — UI is HTML overlay
│   ├── PuzzleScene.ts       # 6x6 Rush Hour grid — themed block sprites, drag controls, undo/reset
│   ├── SokobanScene.ts      # 7x7 Sokoban crate-pushing — procedural generation + 8 fallbacks
│   ├── ChaseScene.ts        # 13x13 Pac-Man style rat chase in procedural maze
│   └── FishingScene.ts      # Fishing reel-in minigame with tutorial overlay
├── systems/
│   ├── SaveManager.ts       # Save/load to localStorage, forward migration for missing fields
│   ├── CatManager.ts        # Breed definitions, cat creation with variance, XP/leveling
│   ├── JobBoard.ts          # 30 job templates across 5 categories, stat matching with trait/mood modifiers
│   ├── Economy.ts           # Fish earn/spend, stationed earnings with diminishing returns, station events
│   ├── PuzzleGenerator.ts   # Procedural Rush Hour generation + BFS solver
│   ├── BondSystem.ts        # All 10 breed pair bonds, rank tracking, conversation triggers
│   ├── ProgressionManager.ts # 5-chapter gates, progression hints, rat plague
│   ├── MusicManager.ts      # 12 tracks (10 ambient + 2 puzzle), pause/resume, mode switching
│   ├── DayTimer.ts          # 3-minute days, phase display, pause support
│   ├── SfxManager.ts        # 15 ElevenLabs sound effects
│   ├── ReputationSystem.ts  # Crest/Shadow scoring, recruit cost modifiers, tier bonuses
│   └── OtaUpdater.ts        # Capacitor OTA update checker
├── ui/
│   └── overlay.css          # All HTML overlay styles
├── data/
│   ├── breeds.json          # 5 breeds with base stats and stat biases
│   ├── jobs.json            # 30 job templates (pest control, courier, guard, sacred, detection)
│   ├── puzzles.json         # 5 hand-designed Rush Hour puzzles, BFS-validated
│   ├── furniture.json       # 15 furniture items with pixel art sprites
│   └── conversations.json   # 33 conversation scripts (30 pair + 3 group)
└── utils/
    ├── constants.ts         # ALL_BREED_IDS, dimensions, colors, stats, bonds, chapter triggers
    ├── events.ts            # GameEventBus singleton for canvas <-> overlay communication
    └── helpers.ts           # clamp, randomInt, pick, shuffled
```

## Game Flow

1. **Title Screen** — crest logo, rain particles, pixel art wildcat, Continue / New Game
2. **Name Prompt** (HTML overlay) — player names their Wildcat
3. **Intro Story** — 6-panel narrative with rain ambience and music
4. **Guildhall** — "Behind the Grain Market" (Ch.1) → "The Guildhall" (Ch.2+), rooms with cats and furniture
5. **Town** — job board (daily jobs), recruit cats, traveling merchant (every 3rd day), daily cat wish
6. **Job Accept** — pick a cat (stat/trait/mood details shown), take the job
7. **Minigame** — Rush Hour, Sokoban, Chase, or Fishing (random per job category)
8. **Results** — fish earned, XP, level ups, combo streak tracking
9. **Conversation** — pair bonds (C/B/A) or group conversations at milestones
10. **Day End** — upkeep deducted, stationed earnings collected, reputation bonuses, crisis events
11. **Loop** — advance day, check chapter progression, repeat

## Key Design Decisions

- **Player is the founding Wildcat** — always in the roster, named at game start, can't be dismissed
- **All 5 breeds have PixelLab pixel art** — idle (4 directions), walk (6 frames x 4 dirs), sleep (10 frames)
- **4 minigame types** — Rush Hour (procedural + BFS), Sokoban, Chase (procedural maze), Fishing
- **30 jobs across 5 categories** — pest control, courier, guard, sacred, detection (chapter-gated)
- **Reputation system** — Sacred/Guard → Crest (noble), Detection → Shadow. Affects recruit costs and daily bonuses
- **Bond system** — all 10 breed pairs track bonds, 33 conversation scripts
- **Economy** — 15 fish start, 2/cat + 1/room daily upkeep, combo chains, merchant items
- **Chapter 3 is the Rat Plague** — triggers extra pest control jobs, resolves after 5 completions
- **Save migration** — missing fields backfilled, saves never destroyed on updates
- **ALL_BREED_IDS** in constants.ts — single source of truth for breed lists

## Deployment

Apache VirtualHost at `/etc/apache2/sites-available/clowder.stephens.page.conf` points DocumentRoot to `/var/www/clowder.stephens.page/dist`. SSL via Let's Encrypt (auto-renewing). FallbackResource handles SPA routing.

To redeploy after changes:

```bash
npm run build
# dist/ is already the Apache DocumentRoot — changes are live immediately
```

## What's Not Implemented Yet

- Big cats (Lynx, Lion, Leopard) and additional breeds
- Nonogram and light-path puzzle types
- Town map exploration (isometric overworld)
- Individual cat rooms (personal decoration per cat)
- Shadow/Healing job categories
- Cloud save sync
- Signed release APK (debug builds only)
