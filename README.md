# Clowder & Crest

A cozy medieval cat guild management game. Recruit cats, take jobs, solve puzzles, and build your guild from a lone stray to a renowned clowder.

**Play now:** [clowder.stephens.page](https://clowder.stephens.page)

## Features

- **5 cat breeds** with pixel art sprites, walk animations, and sleeping poses (Wildcat, Russian Blue, Tuxedo, Maine Coon, Siamese)
- **4 minigame types** — player chooses per job: Rush Hour sliding blocks, Sokoban crate pushing, rat chase maze, and fishing
- **30 jobs** across 5 categories: Pest Control, Courier, Guard, Sacred, Detection
- **Guildhall with 3 rooms** — 15 furniture items with pixel art, drag to rearrange, move between rooms
- **Bond system** with 33 conversation scripts (30 pair + 3 group) across all 10 cat pairings, with narrative cliffhangers
- **Reputation system** (Crest/Shadow) — temptation economics: Shadow pays more fish but erodes bonds; Crest grows slower but builds trust. Affects recruit costs, XP, daily income, and bond growth
- **Traveling merchant** every 3rd day with special items
- **Festival system** — 7 rotating themed bonus events every 7 days
- **Station crisis events** requiring player intervention
- **Job combo chains** for consecutive same-category work (+25% at 5-day streak)
- **Daily cat wishes** and **cat rest action** (work-vs-rest tradeoff)
- **Offline stationed earnings** — cats accumulate fish while you're away (capped)
- **Real-time day cycle** (3-minute days) with Dawn-to-Night phases and time-of-day town art
- **Economy** with chapter-scaling upkeep, stationed passive income, fish crisis mechanics
- **Rat Plague siege** (Chapter 3) — dramatic narrative scenes, daily escalation (cat sickness, rising costs), progress bar, climactic St. Rosalia procession resolution
- **Introductory story sequence** with rain ambience, music, and narrative panels
- **Cat stats affect minigames** — Hunting adds time in rat chase
- **Heraldic crest logo** on title screen, favicon, and guildhall
- **12 music tracks** + 15 ElevenLabs sound effects + rain ambience
- **Procedural puzzle generation** with BFS validation
- **Pause, save export/import, OTA updates** for Android via Capacitor

## Tech Stack

- **Phaser 3** + TypeScript (game engine)
- **HTML/CSS overlays** for UI (hybrid rendering)
- **Vite** (build tooling)
- **Capacitor** (Android packaging + OTA updates)
- **PixelLab** (AI pixel art generation)
- **ElevenLabs** (AI sound effects)

## Development

```bash
npm run dev          # Dev server on port 3200
npm run build        # Production build to dist/
npm run ota:publish  # Build + publish OTA update
```

## Architecture

See [CLAUDE.md](CLAUDE.md) for full project structure and design decisions.

## License

CC BY-NC-SA 4.0 — See [LICENSE](LICENSE) for details.
