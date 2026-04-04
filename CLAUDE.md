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
├── main.ts                  # Entry point — Phaser config, game state, all overlay event wiring
├── scenes/
│   ├── BootScene.ts         # Asset preloading (no external assets yet — generated graphics)
│   ├── TitleScene.ts        # Title screen with rain particles, cat silhouette, Continue/New Game
│   ├── GuildhallScene.ts    # Room view with cats, furniture, lantern glow animations
│   ├── TownScene.ts         # Town silhouette, job board cards, recruit section
│   └── PuzzleScene.ts       # 6x6 Rush Hour grid with drag controls, undo, reset, win detection
├── systems/
│   ├── SaveManager.ts       # Save/load to localStorage, SaveData interface, default save factory
│   ├── CatManager.ts        # Breed definitions, cat creation with variance, XP/leveling
│   ├── JobBoard.ts          # Job templates, daily generation (chapter-gated), stat matching
│   ├── Economy.ts           # Fish earn/spend, reward calculation with star multipliers
│   ├── PuzzleGenerator.ts   # Puzzle configs from JSON, BFS solver for validation
│   ├── BondSystem.ts        # Bond pairs, point accumulation, conversation unlock tracking
│   └── ProgressionManager.ts # 5-chapter gates, rat plague start/resolution checks
├── ui/
│   └── overlay.css          # All HTML overlay styles (status bar, nav, panels, dialogs, shop)
├── data/
│   ├── breeds.json          # 5 breeds with base stats and stat biases
│   ├── jobs.json            # 8 job templates (5 pest control, 3 courier)
│   ├── puzzles.json         # 5 hand-designed puzzles, BFS-validated (2 easy, 2 medium, 1 hard)
│   ├── furniture.json       # 15 furniture items with costs, room assignments, effects
│   └── conversations.json   # 9 conversation scripts (3 pairs x 3 ranks: C/B/A)
└── utils/
    ├── constants.ts         # Game dimensions, breed colors, stat names, bond thresholds, chapter triggers
    ├── events.ts            # GameEventBus singleton for canvas <-> overlay communication
    └── helpers.ts           # clamp, randomInt, pick, shuffled
```

## Game Flow

1. **Title Screen** — rain effect, cat silhouette, New Game / Continue
2. **Name Prompt** (HTML overlay) — player names their Wildcat
3. **Guildhall** — home base with rooms, cats, furniture
4. **Town** — job board (3-5 daily jobs), recruit stray cats
5. **Job Accept** — pick a cat, choose Puzzle or Auto-Resolve
6. **Puzzle** — Rush Hour sliding blocks, earn stars (1-3) for reward multiplier
7. **Results** — fish earned, XP gained, level ups
8. **Conversation** — triggers when bond thresholds are crossed (Fire Emblem-style)
9. **Loop** — advance day, check chapter progression, repeat

## Key Design Decisions

- **Player is the founding Wildcat** — always in the roster, named at game start, can't be dismissed
- **No external assets** — all visuals are Phaser graphics primitives (rectangles, circles, triangles, ellipses). Placeholder art approach per the design doc.
- **Puzzles are BFS-validated** — each puzzle in puzzles.json has a verified minMoves count. Easy: 4-5 moves, Medium: 5-8 moves, Hard: 16 moves.
- **Conversation keys** use `breedA_breedB` format matching the JSON keys in conversations.json. The lookup tries both orderings.
- **Chapter 3 is the Rat Plague** — triggers extra pest control jobs, tracks plague-era completions, resolves after 5 pest control jobs.
- **Fish economy** starts the player at 15 fish. Second cat recruitable by end of first session (~15 min).

## Deployment

Apache VirtualHost at `/etc/apache2/sites-available/clowder.stephens.page.conf` points DocumentRoot to `/var/www/clowder.stephens.page/dist`. SSL via Let's Encrypt (auto-renewing). FallbackResource handles SPA routing.

To redeploy after changes:

```bash
npm run build
# dist/ is already the Apache DocumentRoot — changes are live immediately
```

## What's Not Implemented Yet

Per the v2 design doc's "Not in MVP v1" list:

- Crest/Shadow moral reputation system (architecture placeholder in SaveData)
- Additional job categories (Guard, Detection, Healing, Sacred, Shadow)
- Big cats, additional breeds
- Nonogram and other puzzle types
- Procedural puzzle generation
- Guildhall furniture drag-to-place (currently auto-placed on purchase)
- Town map exploration (isometric overworld)
- Individual cat rooms
- Sound and music
- Capacitor Android build
- Cloud save sync
