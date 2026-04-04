# Clowder & Crest — Design Document v5

A cat guild management game set in a medieval fantasy world. Built with Phaser 3 + TypeScript + Capacitor for Android and web.

**What changed from v4:** Added 4 minigame types (Rush Hour, Sokoban, Chase, Fishing), removed auto-resolve, 24 job templates across 5 categories (pest control, courier, guard, sacred, detection), cat room assignments, furniture drag-to-rearrange and room transfer, interactive furniture with sleep animations, cat interaction (click to bond), fish crisis mechanic, pause button, ElevenLabs sound effects, job fit details, daily cost warnings, traveling merchant NPC, station crisis events, reputation system (Crest/Shadow), multi-cat group conversations, time-of-day town art, themed puzzle blocks, and comprehensive pixel art for all cats, furniture, and scenes.

---

## Overview

**Clowder & Crest** is a cozy-but-somber management game where the player — a wildcat stray arriving in a medieval town with nothing — takes jobs, recruits cats, solves puzzles, and builds a guild from rags to riches. **The player is the founding Wildcat** (*Felis lybica*), the first member and leader of the guild.

**Platform:** Android (Capacitor APK with OTA updates) + web browser at `https://clowder.stephens.page`.
**View:** Top-down pixel art for room interiors. Phaser-drawn townscape. HTML/CSS for all UI chrome.
**Tone:** Autumnal. Candlelit, misty, rain-on-stone. Cozy in a hearth-in-a-cold-world way. Think *Kingdom Two Crowns* palette meets *Redwall* medieval animal community.

**Narrative structure:** Christopher Booker's Rags to Riches:

1. **Initial wretchedness and the call** — A lone wildcat stray arrives at a crumbling settlement in a storm. Shelters behind the grain market. Sees a pest control notice on the board.
2. **Out into the world, initial success** — First mousing jobs. Enough coin to rent a room. A second stray arrives. The guild has a name.
3. **The central crisis — The Rat Plague** — A great plague of rats descends on the town. The guild must prove its worth. Drawing on the legend of St. Rosalia of Palermo and St. Gertrude of Nivelles.
4. **Independence and the final ordeal** — The guild must prove itself through a major contract or stand.
5. **Final union, completion and fulfillment** — The guild is established, renowned, and home.

---

## Tech Stack

### Architecture — Hybrid Phaser Canvas + HTML/CSS Overlays

```
┌─────────────────────────────────────────┐
│     HTML/CSS Overlay Layer              │
│   Status Bar · Bottom Nav · Town UI ·   │
│   Job Cards · Cat Panel · Dialogs ·     │
│   Menus · Result Screens · Name Prompt  │
├─────────────────────────────────────────┤
│         Phaser 3 Canvas                 │
│   Top-down Room View · Townscape ·      │
│   Puzzle Grid · Cat Sprites · Tweens    │
├─────────────────────────────────────────┤
│         Game Logic (main.ts)            │
│   Cat System · Job Board · Economy ·    │
│   Day Timer · Stationed Jobs ·          │
│   Puzzle Engine · Bond Tracker ·        │
│   Save Manager · Progression · Music    │
├─────────────────────────────────────────┤
│       Capacitor (Android Shell)         │
│   OTA Updates (@capgo/capacitor-updater)│
│   Local Storage · Offline Support       │
└─────────────────────────────────────────┘
```

**HTML/CSS overlay responsibilities:**
- Status bar (fish count, day number, time of day phase, chapter)
- Bottom navigation tabs (Guild, Town, Cats, Menu)
- Town view: job board cards, stationed cats section, recruit cards, End Day button
- Cat detail/profile panel with rename and recall buttons
- Conversation dialog (portraits with breed subtitles + text box)
- Menus (save, furniture shop, mute music, delete save)
- Job assignment overlay with stat details, choice overlay (Take Job / Station)
- Result screens, name prompts, toasts
- Pause button in status bar

**Phaser canvas responsibilities:**
- Guildhall room overview with cat sprites and furniture
- Top-down room interior view (7x7 grid with wandering cats, interactive furniture)
- Town silhouette/skyline background
- Rush Hour puzzle grid (drag interactions)
- Sokoban crate-pushing puzzle (WASD/arrow/tap)
- Chase minigame (cat hunts rat in procedural maze)
- Title screen (rain particles, pixel art cat on stone wall)
- Cat sprites, walk animations, and interaction animations (scratch, sit, eat)

Communication between layers uses a shared `GameEventBus` singleton (`src/utils/events.ts`).

### Stack Details

- **Engine:** Phaser 3 with TypeScript
- **UI:** HTML/CSS overlays with TypeScript DOM manipulation
- **Packaging:** Capacitor 8+ for Android builds
- **OTA Updates:** `@capgo/capacitor-updater` v8.45.1 in manual mode — downloads and applies web asset bundles without app store reinstall
- **Build tooling:** Vite + TypeScript. `npm run build` outputs to `dist/`.
- **Persistence:** `localStorage` for save data and music mute preference
- **Music:** HTML5 Audio API (persists across Phaser scene changes)
- **Hosting:** Ubuntu server, Apache VirtualHost serving `dist/` directly. SSL via Let's Encrypt.
- **HiDPI:** Canvas rendered at device pixel ratio, camera zoom compensates so game coordinates stay at 390x844

### Commands

```bash
npm run dev          # Start Vite dev server on port 3200
npm run build        # Type-check + production build to dist/
npm run preview      # Preview production build locally
npm run ota:publish  # Build + zip dist/ + write updates/manifest.json
npm run release      # Alias for ota:publish
```

### OTA Update System

The Android APK ships with bundled web assets but checks for updates on launch:

1. App launches, `OtaUpdater.ts` runs
2. Fetches `https://clowder.stephens.page/updates/manifest.json` (served with `no-cache` headers)
3. Compares `manifest.version` against `__APP_VERSION__` (injected by Vite from package.json)
4. If newer, downloads the zip bundle
5. Calls `CapacitorUpdater.set()` to apply immediately (page reloads with new code)

**To push an update:**
1. Make changes, bump `version` in `package.json`
2. Also bump `versionCode` and `versionName` in `android/app/build.gradle` if rebuilding APK
3. Run `npm run ota:publish`
4. Installed apps pick it up on next launch

---

## Project Structure

```
src/
├── main.ts                  # Entry point — Phaser config, game state, HTML overlay wiring,
│                            #   day timer, music system, all event handlers
├── scenes/
│   ├── BootScene.ts         # Asset preloading — cat sprites, walk animation creation
│   ├── TitleScene.ts        # Title screen — rain particles, pixel art cat, Continue/New Game
│   ├── GuildhallScene.ts    # Room overview — cat sprites (pixel art or fallback), furniture, lanterns
│   ├── RoomScene.ts         # Top-down room interior — 7x7 grid, wandering cats, furniture, ambience
│   ├── TownScene.ts         # Phaser townscape background only — UI is HTML overlay
│   ├── PuzzleScene.ts       # 6x6 Rush Hour grid — drag controls, undo, reset, win detection
│   ├── SokobanScene.ts      # 7x7 Sokoban crate-pushing puzzle with procedural generation
│   └── ChaseScene.ts        # 13x13 Pac-Man style rat chase in procedural maze
├── systems/
│   ├── SaveManager.ts       # Save/load to localStorage, SaveData interface, room assignments
│   ├── CatManager.ts        # Breed definitions, cat creation with variance, XP/leveling
│   ├── JobBoard.ts          # 15 job templates, daily generation, stat matching with trait/mood modifiers
│   ├── Economy.ts           # Fish earn/spend, stationed earnings with diminishing returns, station events
│   ├── PuzzleGenerator.ts   # Procedural Rush Hour generation + BFS solver
│   ├── BondSystem.ts        # Bond pairs, point accumulation, conversation unlock tracking
│   ├── ProgressionManager.ts # 5-chapter gates, progression hints, rat plague
│   ├── MusicManager.ts      # 8 BGM tracks + 2 puzzle tracks, pause/resume, mode switching
│   ├── DayTimer.ts          # 3-minute days, phase display, pause support
│   ├── SfxManager.ts        # ElevenLabs sound effects (8 SFX)
│   └── OtaUpdater.ts        # Capacitor OTA update checker
├── ui/
│   └── overlay.css          # All HTML overlay styles
├── data/
│   ├── breeds.json          # 5 breeds with base stats and stat biases
│   ├── jobs.json            # 8 job templates (5 pest control, 3 courier)
│   ├── puzzles.json         # 5 hand-designed puzzles, BFS-validated
│   ├── furniture.json       # 15 furniture items with costs, room assignments, effects
│   └── conversations.json   # 9 conversation scripts (3 pairs x 3 ranks: C/B/A)
└── utils/
    ├── constants.ts         # DPR, game dimensions, breed colors/names, stat names, bond thresholds
    ├── events.ts            # GameEventBus singleton for canvas <-> overlay communication
    └── helpers.ts           # clamp, randomInt, pick, shuffled

public/assets/
├── audio/                   # Background music (4 MP3 tracks)
│   ├── guildhall.mp3
│   ├── castle_halls.mp3
│   ├── dawn_parapets.mp3
│   └── market_stalls.mp3
└── sprites/                 # Pixel art cat sprites
    └── wildcat/
        ├── south.png, north.png, east.png, west.png    # Idle rotations (48x48)
        └── walk/{south,north,east,west}/frame_00X.png  # 6-frame walk animations

android/                     # Capacitor Android project
pixel_art/                   # Raw PixelLab exports (source files, not deployed)
```

---

## Core Loop

```
┌──────────────┐
│  CHECK BOARD  │ <- Job board refreshes each in-game day
└──────┬───────┘
       v
┌──────────────┐
│  ASSIGN CAT  │ <- Match cat stats to job; each cat limited to 1 job/day
└──────┬───────┘
       v
┌──────────────────────────────────┐
│  CHOOSE:                         │
│  • Solve Puzzle (best reward)    │
│  • Auto-Resolve (quick)         │
│  • Station Here (passive daily)  │
└──────┬───────────────────────────┘
       v
┌──────────────┐
│ COLLECT FISH │ <- Fish as primary currency
└──────┬───────┘
       v
┌──────────────────────┐
│  IMPROVE GUILDHALL   │ <- Buy rooms, furniture
└──────┬───────────────┘
       v
┌──────────────────────┐
│  RECRUIT / BOND      │ <- New cats, conversations
└──────┘
```

Each full cycle is completable in **1-3 minutes** for a quick session, or chained for longer play.

### Stationed Jobs (Passive Income)

Players can **station** a cat at a job for ongoing passive income:

- When accepting a job, a "Station Here" button shows estimated daily fish earnings
- Stationed cats earn `baseReward * 0.5 + baseReward * statMatch * 0.5` fish per day
- Stationed cats are unavailable for one-off jobs until recalled
- Recall via the Cats panel (stationed badge with Recall button)
- Stationed cats section visible in the Town view

### Day Timer

Each in-game day lasts **5 real-time minutes**:

- Status bar shows current phase: Dawn, Morning, Midday, Afternoon, Dusk, Night
- Day auto-advances when timer expires, collecting stationed earnings
- "End Day" button in Town view allows manual advancement
- Each cat can only do one job per day (tracked in-memory, resets on day advance)
- Timer resets when day advances (manual or auto)

---

## The Cat Roster

### The Player Character

**The player is the founding Wildcat** — the first cat, the guild founder, always present. Named at game start.

### Breeds (5 MVP)

| Breed | Temperament | Stat Bias | Recruit Cost |
|---|---|---|---|
| **Wildcat** | Fierce, independent, territorial | Hunting ++, Stealth + | (starter) |
| **Russian Blue** | Gentle, loyal, reserved | Stealth ++, Intelligence + | 30 fish |
| **Tuxedo** | Sharp, formal, focused | Intelligence +, Charm + | 40 fish |
| **Maine Coon** | Gentle giant, patient, social | Endurance ++, Hunting + | 50 fish |
| **Siamese** | Vocal, dramatic, intelligent | Intelligence ++, Charm + | 60 fish |

### Cat Stats (6 core, rated 1-10)

Hunting, Stealth, Intelligence, Endurance, Charm, Senses

### Cat Properties

- **Name** — player-assigned, renamable from the Cats panel at any time
- **Breed** — determines sprite, base stats, temperament
- **Level** — 1-5, gains XP from completed jobs
- **Mood** — Happy / Content / Tired / Unhappy — mechanically affects job performance (+10% when happy, -15% when unhappy). Recovers with daily food, drops when underfed.
- **Traits** — 1-2 from: Brave (+10% on hard jobs), Lazy (-8%), Curious (+8% courier), Pious (+5% pest control), Night Owl (+5%), Skittish (-10% hard), Loyal (+3%), Mischievous (random ±), Grumpy, Playful
- **Bond levels** with other cats — Stranger -> Acquaintance -> Companion -> Bonded

---

## The Job System

### Job Categories (2 categories, 15 templates)

**Pest Control** (9 jobs): Mill Mousing, Granary Patrol, Cathedral Mousing, Warehouse Clearing, Ship Hold, Tavern Cellar, Dockside Patrol, Bakery Guard, Castle Ratcatcher
**Courier** (6 jobs): Market Letter, Monastery Dispatch, Noble's Sealed Letter, Bell Tower Dispatch, Herbalist Delivery, Night Courier

Each job has: category, difficulty (easy/medium/hard), key stats, base/max reward, description. Assignment overlay shows key stats, individual cat stat values, trait/mood modifiers, and color-coded match percentage.

### Job Resolution

When a cat is assigned to a job, the player chooses:
1. **Take the Job** — Randomly selects one of 3 minigame types: Rush Hour (sliding blocks), Sokoban (crate pushing), or Chase (rat hunt in maze). Pest control jobs can get all 3; courier jobs get Rush Hour or Sokoban. Stars (1-3) determine reward multiplier.
2. **Station Here** (level 2+ only) — Cat earns passive daily income. Diminishing returns after 5 days. Random station events (~20% chance per day).

### Job Failure

Quitting a puzzle costs 30% of the job's base reward in fish, drops the cat's mood, and marks the cat as worked for the day. Chase minigame timeout also triggers failure.

### One Job Per Cat Per Day

- After completing or failing a job, the cat is marked as worked for the day
- Worked cats are filtered from the assignment list; town view shows availability
- List resets when the day advances
- When all cats are busy, game suggests ending the day

---

## Minigame System (3 Types)

### Rush Hour Sliding Blocks
6x6 grid, axis-constrained blocks. Slide the cat token to the exit. Touch-native drag controls. Cat breed sprite shown on the target block.

- **Procedural generation** with BFS validation (easy: 4-6 blocks, medium: 6-9, hard: 8-12)
- 5 hand-designed fallback puzzles
- Star rating: 3 stars (min moves), 2 stars (≤2x), 1 star (completed)
- Undo, Reset, Quit buttons

### Sokoban Crate Pushing
7x7 grid. Push crates onto target positions. WASD/arrow/tap controls.

- **Procedural generation** via reverse-play with BFS verification + deadlock detection
- 8 hand-crafted fallback levels (easy: 2 crates, medium: 3, hard: 4)
- Star rating based on move efficiency

### Chase Minigame
13x13 procedurally generated maze. Cat chases a rat with simple flee AI. Collect fish dots along the way.

- Timer: 60s easy, 55s medium, 45s hard. Rat speed scales with difficulty.
- Stars based on time remaining + dots collected
- Timeout = failure penalty
- Pest control jobs only (~33% chance)

All minigames show the job name and assigned cat's sprite. Quitting triggers failure penalty.

---

## Support Conversations

Bond system with Fire Emblem-style support conversations:

- Cats build Bond Points from working on the same day (+3 per job)
- At thresholds (10/25/50), conversations unlock
- 3 pairings x 3 ranks = 9 conversation scripts
- Portrait circles show cat name + breed subtitle
- Speaker label shows "Name *Breed*" format
- Pairings: Wildcat↔Russian Blue, Tuxedo↔Siamese, Maine Coon↔Wildcat

---

## The Guildhall

### Overview Rooms (Phaser canvas)

3 rooms displayed in the guildhall overview, each clickable to enter top-down detail view:
- **Sleeping Quarters** — unlocked at start
- **Kitchen & Pantry** — 50 fish to unlock
- **Operations Hall** — 100 fish to unlock

Unlocked rooms show "Tap to enter" hint. Cat pixel art sprites (or fallback drawings) visible in sleeping quarters.

### Top-Down Room View (RoomScene)

- **7x7 rectangular grid** with checkerboard stone floor tiles
- Walls as thick borders with window (top) and flickering torch (right)
- Furniture as labeled rounded rectangles on grid positions
- Cats **wander** between open tiles:
  - Sprite cats: directional walk animations, idle poses between moves, staggered timing
  - Fallback cats: Phaser-drawn silhouettes that slide between tiles
  - Stationed cats: static, faded, "(away)" label
- Dust mote ambient particles

### Furniture (15 items)

Purchased from the Furniture Shop (Menu panel). Auto-placed on purchase (drag-to-place is deferred).

---

## Economy

**Fish** is the sole currency.

### Income

| Source | Amount |
|---|---|
| Easy job (auto-resolve) | 5-8 fish |
| Easy job (puzzle, 3 stars) | 10-16 fish |
| Medium job (puzzle, 3 stars) | 20-30 fish |
| Hard job (puzzle, 3 stars) | 36-50 fish |
| Stationed job (per day) | ~50-100% of base reward, scaled by stat match |

### Costs (Fish Sinks)

| Expense | Cost |
|---|---|
| Daily food (per cat) | 2 fish/day (deducted at day advance) |
| Recruit a new cat | 30-80 fish |
| Unlock Kitchen | 50 fish |
| Unlock Operations Hall | 100 fish |
| Furniture | 8-50 fish |

**Food upkeep** is the primary ongoing sink. If the player can't afford food, all cats' mood drops one tier (happy→content→tired→unhappy). Well-fed cats recover mood over time.

Starting fish: 15. Second cat recruitable within first session (~15 min).

---

## Progression

| Chapter | Trigger | Unlocks |
|---|---|---|
| 1 — The Stray | Game start | 1 cat, lean-to, basic pest control |
| 2 — The Crew | 2nd cat + 5 jobs | Kitchen, courier jobs |
| 3 — The Rat Plague | 200 fish + 3rd cat | Rat plague crisis, Operations Hall |
| 4 — The Name | 15 jobs + 4th cat | Guild name ceremony, 5th cat |
| 5 — Established | 30 jobs + 5 cats | End of MVP content |

---

## Audio

### Background Music

8 tracks that rotate randomly (never repeating back-to-back):
- Candle at the Old Hearth (1 & 2)
- Cat In The Castle Halls (1 & 2)
- Dawn Above the Parapets (1 & 2)
- Overcast Market Stalls (1 & 2)

Music starts when the player enters the game (Continue or New Game). Uses HTML5 Audio API so it persists across Phaser scene changes. Mute toggle in Menu panel, preference saved to localStorage.

---

## Pixel Art

### Current Assets

All 5 breeds have complete sprite sets:
- **Wildcat, Russian Blue, Tuxedo, Maine Coon, Siamese** — idle sprites (4 directions: N/S/E/W, 48x48)
- **All breeds** — 6-frame walk animations in all 4 directions
- Generated via PixelLab.ai MCP integration (automated character creation + animation queuing)

### Integration

- BootScene loads all sprite PNGs and creates walk animations (8fps, looping)
- All 5 breeds use pixel art sprites — no fallback silhouettes needed
- Title screen shows wildcat sprite scaled 3x on stone wall with nearest-neighbor filtering
- Guildhall overview shows sprites at 1.5x scale
- Room view shows sprites at 1.2x scale with walk animations during wandering

### Planned Assets

- Additional poses per breed (sleep, work/pounce)
- 64x64 portraits for conversation scenes
- 32x32 furniture sprites
- Floor tiles, scene backgrounds, UI icons, puzzle block tiles

---

## UI Layout (Android Portrait)

```
+-----------------------------+
| Fish | Day N | Phase | Ch.N |  <- Status bar (HTML)
+-----------------------------+
|                             |
|     Phaser Canvas           |  <- Guildhall / Room / Townscape /
|     (or HTML Town overlay)  |     Puzzle grid
|                             |
|                             |
+-----------------------------+
| Guild | Town | Cats | Menu  |  <- Bottom nav (HTML, thumb-zone)
+-----------------------------+
```

### Scene Flow

```
Title Screen (pixel art cat, rain)
    |
    v
Guildhall Scene <──────────────────┐
    |                              |
    ├──> Room Scene (top-down)     |
    |       (tap room to enter,    |
    |        Back button returns)  |
    |                              |
    ├──> Town Scene ───────────────┤
    |       (HTML overlay)         |
    |       ├── Job Board cards    |
    |       │     └── Accept ──┐   |
    |       ├── Stationed Cats │   |
    |       ├── Stray Cats     │   |
    |       └── End Day button │   |
    |                          v   |
    |                   Assign Cat |
    |                      │       |
    |              ┌───────┼────┐  |
    |              v       v    v  |
    |          Puzzle   Auto  Station
    |           Scene  Resolve  │  |
    |              │       │    │  |
    |              v       v    │  |
    |           Results ────────┤  |
    |              │            |  |
    |              v            |  |
    |         Conversation? ────┘  |
    |                              |
    ├──> Cats Panel (HTML)         |
    |       ├── Cat cards + stats  |
    |       ├── Rename button      |
    |       ├── Recall button      |
    |       └── Bond list          |
    |                              |
    └──> Menu Panel (HTML)         |
            ├── Save Game          |
            ├── Furniture Shop     |
            ├── Mute/Unmute Music  |
            └── Delete Save        |
```

---

## Deployment

### Web

Apache VirtualHost at `/etc/apache2/sites-available/clowder.stephens.page.conf` points DocumentRoot to `/var/www/clowder.stephens.page/dist`. SSL via Let's Encrypt. `manifest.json` served with `no-cache` headers for OTA updates.

```bash
npm run build   # dist/ is the DocumentRoot — changes are live immediately
```

### Android APK

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
# APK at android/app/build/outputs/apk/debug/app-debug.apk
```

Bump `versionCode` in `android/app/build.gradle` for each APK upload. OTA updates push web changes without rebuilding the APK.

### GitHub

Repository: `https://github.com/JacobStephens2/clowder` (private)

---

## MVP Scope Summary

### Implemented

- 1 playable starter cat (Wildcat) + 4 recruitable cats (5 breeds total)
- Player is the founding Wildcat — names their cat at game start, can rename any cat
- 6 cat stats, traits, mood, levels (cap 5)
- Job board with 2 categories (Pest Control, Courier), **15 job templates**
- **3 minigame types**: Rush Hour (procedural), Sokoban (procedural + 8 fallback), Chase (procedural maze)
- **No auto-resolve** — all jobs require active gameplay
- **Job failure penalty** — fish loss, mood drop, cat used for the day
- **Job fit details** — key stats, trait/mood modifiers, color-coded match shown when assigning
- **Stationed jobs** — level 2+ requirement, diminishing returns after 5 days, random station events
- **One job per cat per day** — "All Cats Busy" prompt to end day when everyone has worked
- **Real-time day timer** — 3-minute days with Dawn→Night phases, auto-advance, pause button
- **Fish crisis** — 2 consecutive days broke causes unhappy cat to leave; warning on load/town view
- **End Day button** for manual day advancement
- Guildhall with 3 rooms (sleeping, kitchen, operations)
- **Clickable rooms** — tap to enter top-down detail view
- **Wandering cats** in room view with directional walk animations
- 15 furniture items with auto-placement on purchase
- Fish economy with balanced income/costs
- 5-chapter progression with Rat Plague as central crisis
- 3 bond pairs with 9 conversation scripts
- **Breed subtitles** in conversation portrait circles and speaker labels
- **Cat renaming** from the Cats panel
- **Background music** — 4 tracks rotating randomly, mute toggle in menu
- **Pixel art sprites** — all 5 breeds have idle (4 directions) + walk (4 directions x 6 frames)
- Pixel art on title screen, guildhall overview, and room detail view
- **Procedural puzzle generation** — BFS-validated random puzzles per difficulty tier
- **Daily food upkeep** — 2 fish/day per cat as ongoing fish sink
- **Mechanical traits and mood** — affect job stat matching and performance
- **Save export/import** — download/upload JSON save files from menu
- **Player cat control** — tap-to-move, WASD/arrow keys, golden diamond indicator
- **Walkable furniture** — cats can sit on beds, blankets, baskets, and rugs
- **Stationed job improvements** — level 2+ requirement, diminishing returns after 5 days
- **Progression hints** — menu shows next chapter requirements
- **Extracted MusicManager and DayTimer** — reduced main.ts god-file
- **All 10 conversation pairings** — 30 scripts total (up from 9)
- **Station events** — random daily events affect stationed cat earnings and mood
- **Interactive furniture** — click scratching post, catnip, beds, etc. to send player cat
- **Day transition overlay** — full-screen "Day N" indicator on day change
- **Continuous key movement** — holding WASD moves cat continuously
- **Trait tooltips** — hover shows mechanical effects in cat panel
- **Fish count flash** — status bar flashes green/red on fish changes
- HiDPI canvas rendering (device pixel ratio scaling)
- Hybrid UI: Phaser canvas for game world + HTML/CSS overlays for all UI
- **Town UI fully HTML** — native resolution text, scrollable cards
- Save/load to localStorage with migration for new fields
- Android APK via Capacitor with OTA update support
- Web build served at `https://clowder.stephens.page`
- Portrait orientation, thumb-zone UI

### Not in MVP v1 (Designed, Deferred)

- Crest/Shadow moral reputation system (architecture placeholder in SaveData)
- Sacred, Shadow, Guard, Detection, Healing job categories
- Big cats (Lynx, Lion, Leopard) and additional breeds
- Nonogram and other puzzle types
- Furniture drag-to-place (currently auto-placed on purchase)
- Town map exploration
- Individual cat rooms
- Cat stat effects on puzzles (Intelligence highlights, etc.)
- Sound effects (SFX)
- Signed release APK (currently debug builds)
- Cloud save sync
- Push notifications
- Haptic feedback

---

## Inspiration Credits

- **Historical cat roles:** Fertile Crescent mousers, Exeter Cathedral cat payroll, Catherine the Great's palace guard cats, WWI trench messenger cats, Chief Mouser to the Cabinet Office.
- **Catholic mythlore:** St. Gertrude of Nivelles, St. Rosalia of Palermo, St. Francis of Assisi, cats as agents of saints.
- **Game design references:** *Kingdom Two Crowns* (tone), *Stardew Valley* (daily rhythm, day timer), *Fire Emblem* (support conversations), *Redwall* (medieval animal community), *Meow Tower* (puzzle + decoration).
- **Plot structure:** Christopher Booker's Rags to Riches.
- **Name:** "Clowder" = a group of cats. "Crest" = heraldic achievement, aspiration.
