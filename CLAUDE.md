# Clowder & Crest

Cat guild management game with 14 minigame types and Fire Emblem-style bond conversations. Built with Phaser 3 + TypeScript, deployed at https://clowderandcrest.com (also at https://clowder.stephens.page).

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
│   ├── PuzzleScene.ts       # 6x6 Rush Hour — 6 themed named puzzles, BFS-validated par, PERFECT! callout, axis arrows on blocks
│   ├── SokobanScene.ts      # 7x7 Sokoban — 8 themed hand-crafted levels with named concepts, restart button, BFS validator
│   ├── ChaseScene.ts        # 13x13 Pac-Man style rat chase — Tracker + Ambusher dog AI, ghost combo on catnip
│   ├── FishingScene.ts      # Reel-in — three-phase approach/bite/catch, 5 fish behaviors, 4-tier rarity system
│   ├── HuntScene.ts         # Whack-a-mole rat hunt — speed escalation, fake-out rats, poison rats, 5-chain combo
│   ├── BrawlScene.ts        # Zelda-style combat — telegraphed rat windups, hit-stop, Skirmisher type, boss phase 2 + minions
│   ├── NonogramScene.ts     # Picross — 13 themed images, constraint-propagation validator, no penalty feedback, undo
│   ├── StealthScene.ts      # Top-down stealth — graduated detection (alert+pursuit), grass recovery, ghost run reward
│   ├── PounceScene.ts       # Matter.js slingshot — breed-specific mid-flight abilities, wood/stone/glass, 4 structure templates
│   ├── PatrolScene.ts       # Lantern watch — threat-escalation curve, prowler intruders, relight cooldown, lantern loss tracking
│   ├── RitualScene.ts       # Simon Says candles — pentatonic per-candle tones, speed escalation, adaptive replay slowdown
│   ├── ScentTrailScene.ts   # Hot/cold deduction — exact Manhattan distance, remote probes, constraint-ring overlay
│   ├── HeistScene.ts        # Lock picking — per-ring set state with sparkle SFX, counter-clockwise rotation, trap notches on hard
│   ├── CourierRunScene.ts   # 3-lane runner — speed escalation curve, 9 obstacle phrases, mission system, juice
│   └── DungeonRunScene.ts   # Roguelike chain (Ch.5+) — inter-floor upgrade picks, run history, Hades-style reactive narrative
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
│   ├── NativeFeatures.ts    # Capacitor facade — haptics, local notifications, app lifecycle, status bar (no-ops on web)
├── ui/
│   ├── overlay.css          # All HTML overlay styles
│   ├── Panels.ts            # Cat panel, menu, rename prompt, furniture shop
│   ├── Conversations.ts     # Fire Emblem-style bond dialogues + group conversations
│   ├── narrativeOverlay.ts  # Reusable tap-to-advance narrative scene overlay
│   └── sceneHelpers.ts      # Shared button, d-pad, tutorial helpers for scenes
├── data/
│   ├── breeds.json          # 6 breeds with base stats and stat biases
│   ├── jobs.json            # 35 job templates (pest control, courier, guard, sacred, detection, shadow)
│   ├── puzzles.json         # 6 themed Rush Hour puzzles (3 easy / 2 medium / 1 hard), each with name + concept, validated at module load
│   ├── furniture.json       # 15 furniture items with pixel art sprites
│   └── conversations.json   # 48 conversation scripts (45 pair + 3 group)
└── utils/
    ├── constants.ts         # ALL_BREED_IDS, SCENES, dimensions, colors, stats, bonds, chapter triggers
    ├── events.ts            # GameEventBus singleton for canvas <-> overlay communication
    └── helpers.ts           # clamp, randomInt, pick, shuffled

test/                        # Resilient Playwright playtests — one per minigame
├── chase-playtest.mjs       # Verifies dog archetypes, ghost combo, death messaging
├── sokoban-playtest.mjs     # Verifies themed levels load, BFS solver finds them, restart works
├── courier-playtest.mjs     # Verifies speed ramp, obstacle phrases, mission generation
├── brawl-playtest.mjs       # Verifies windups, hit-stop, Skirmisher behavior, boss phase 2
├── patrol-playtest.mjs      # Verifies threat curve, prowler spawning, relight cooldown
├── nonogram-playtest.mjs    # Verifies validator, themed images, no penalty path, undo
├── ritual-playtest.mjs      # Verifies pentatonic frequencies, speed ramp, adaptive replay
├── scent-playtest.mjs       # Verifies numeric distance, probe consumption, constraint ring
├── puzzle-playtest.mjs      # Verifies BFS validation auto-correct, PERFECT, axis arrows
├── fishing-playtest.mjs     # Verifies three phases, fish behaviors, rarity tiers
├── pounce-playtest.mjs      # Verifies breed abilities, materials, structure templates
├── heist-playtest.mjs       # Verifies set state, counter-clockwise, trap notches
├── stealth-playtest.mjs     # Verifies graduated detection, alert spreading, ghost run
└── dungeon-playtest.mjs     # Verifies upgrade picks, run history, reactive narrative
```

All playtests use the same multi-layer resilience pattern: hard top-level setTimeout, process group kill (`kill -<pgid>`), signal handlers, finally cleanup. Recommended invocation is `timeout 150s node test/<name>-playtest.mjs` for a fourth outer kill switch.

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
- **Genre-pillar pass** — every minigame has been audited against `todo/ideas/game-genre-principles/scenes/*.md`. Each scene now expresses the doc's biggest implication for its genre (e.g. Hunt has speed escalation + fake-outs, Brawl has telegraphed windups + hit-stop, Stealth has graduated detection, Sokoban has named themed levels). The genre docs are the source of truth for "why does this scene work this way?"
- **Roguelike dungeon run** — chain random minigame floors with persistent HP, inter-floor upgrade picks (Slay-the-Spire model), and a Hades-style reactive narrative driven by `dungeonHistory` in SaveData. Unlocks Chapter 5+
- **35 jobs across 6 categories** — pest control, courier, guard, sacred, detection, shadow (chapter-gated)
- **Reputation system** — Sacred/Guard → Crest (noble), Detection → Shadow. Affects recruit costs and daily bonuses
- **Bond system** — all 15 breed pairs track bonds, 48 conversation scripts. Rank-ups grant a stat point to both cats in the pair.
- **Economy** — 15 fish start, 2/cat + 1/room daily upkeep, combo chains, merchant items
- **7 chapters** — including Rat Plague (Ch.3), Rival Guild (Ch.6), Inquisition (Ch.7)
- **Save migration** — missing fields backfilled, saves never destroyed on updates. Migration runs in both `loadGame` and `loadFromSlot`.
- **ALL_BREED_IDS** and **SCENES** in constants.ts — single source of truth for breed lists and scene keys
- **3 save slots** — multiple saves with slot picker on title screen
- **Scene shutdown cleanup** — all scenes register shutdown handlers to prevent memory leaks
- **HTML escaping** — user-provided names escaped with esc() to prevent injection
- **Per-scene resilient playtests** — every minigame has a `test/*-playtest.mjs` script. They use direct method calls and state inspection (not Phaser timer waits, which are unreliable under page.evaluate scene launches). Three layers of hang protection: top-level setTimeout, process-group kill for the dev server, and an outer `timeout 150s` wrapper. **When changing a scene, run its playtest.**
- **Native Capacitor features** — `src/systems/NativeFeatures.ts` is the single facade for all native plugins (`@capacitor/haptics`, `@capacitor/local-notifications`, `@capacitor/app`, `@capacitor/status-bar`). Every entry point checks `Capacitor.isNativePlatform()` and silently no-ops on web. Haptics are wired at high-leverage emotional beats across all 14 minigame scenes (kills, perfects, fails, lock clicks). The app lifecycle hook pauses the day timer and music when Android backgrounds the app. Day-end schedules a single ~16h "your cats are waiting" local notification (cancelled on next launch).

## Deployment

The game is served from two Apache VirtualHosts pointing at the same dist:

- `/etc/apache2/sites-available/clowderandcrest.com.conf` (+ `-le-ssl.conf`) — primary domain
- `/etc/apache2/sites-available/clowder.stephens.page.conf` (+ `-le-ssl.conf`) — legacy/secondary

Both have DocumentRoot `/var/www/clowder.stephens.page/dist` with SSL via Let's Encrypt (auto-renewing) and `FallbackResource /index.html` for SPA routing.

To redeploy after changes:

```bash
npm run build
# dist/ is already the Apache DocumentRoot — changes are live immediately on both domains
```

## Using Nia

Nia is installed as a CLI at `/usr/bin/nia`, authenticated for the `jacob` user. It provides indexing and search for external documentation, GitHub repos, packages, and research. **Prefer Nia over WebFetch/WebSearch** — Nia returns full structured content; web tools return truncated summaries.

Plan: **Startup** — generous quotas (5000 queries, 500 indexing slots, 200 deep_research, 200 oracle, unlimited package_search per month). Most practical workloads won't hit limits.

Invoke Nia via the Bash tool. Key commands:

| Command | Purpose |
|---|---|
| `nia sources list` | List indexed documentation sources |
| `nia repos list` | List indexed GitHub repos |
| `nia search query "..." --repos "<owner/repo>" --search-mode repositories --fast` | Semantic search in an indexed repo |
| `nia search query "..." --docs "<Name>" --search-mode sources --fast` | Semantic search in indexed docs |
| `nia search deep "<query>"` | Multi-step deep research (200/month) |
| `nia oracle` | Autonomous AI research jobs (200/month) |
| `nia github search <owner/repo> <query>` | Live code search in any public GitHub repo (no indexing needed) |
| `nia github tree <owner/repo> [path]` | Browse a GitHub repo's file tree |
| `nia github read <owner/repo> <path> [--start N --end M]` | Read a file from GitHub |
| `nia github glob <owner/repo> <pattern>` | Find files by glob |
| `nia packages hybrid <registry> <pkg> <query>` | Semantic/keyword search over package source (unlimited) |
| `nia sources index <url>` | Index a documentation site (root URL preferred) |
| `nia repos add <owner/repo>` | Index a GitHub repo |
| `nia usage` | Check plan quotas |

### Decision matrix

| Task | Best tool |
|---|---|
| Find a specific function/class by name | `Grep` (free, instant) |
| Read a known file | `Read` (free, instant) |
| "How does X relate to Y" across files in our repo | `nia search query --repos "JacobStephens2/clowder-and-crest"` |
| Phaser API question | `nia search query --docs "Phaser 3 Docs"` |
| Capacitor / Android build question | `nia search query --docs "Capacitor Docs"` |
| External repo code lookup | `nia github search` |
| Open-ended "figure out X" | `nia search deep` or `nia oracle` |
| Explore codebase structure (multi-step) | `Agent` (Explore) |

### Nia-first workflow

1. **Check `nia-sources.md`** at the repo root for sources already indexed.
2. **For semantic questions about our code** — use `nia search query --repos ours`.
3. **For Phaser/Capacitor docs** — both are indexed; query directly.
4. **For external repos** — use `nia github search/tree/read`.
5. **For new docs we'll use often** — `nia sources index <root-url>`. Indexing is abundant on Startup plan.
6. **Update `nia-sources.md`** after indexing a new source.

## What's Not Implemented Yet

- Big cats (Lynx, Lion, Leopard) and additional breeds
- Light-path puzzle type
- Individual cat rooms (personal decoration per cat)
- Cloud save sync
- Signed release APK (debug builds only)
