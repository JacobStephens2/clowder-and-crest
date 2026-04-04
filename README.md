# Clowder & Crest

A cozy medieval cat guild management game. Recruit cats, take jobs, solve puzzles, and build your guild from a lone stray to a renowned clowder.

**Play now:** [clowder.stephens.page](https://clowder.stephens.page)

## Features

- **5 cat breeds** with pixel art sprites, walk animations, and sleeping poses (Wildcat, Russian Blue, Tuxedo, Maine Coon, Siamese)
- **4 minigame types**: Rush Hour sliding blocks, Sokoban crate pushing, Pac-Man style rat chase, and fishing
- **30 jobs** across 5 categories: Pest Control, Courier, Guard, Sacred, Detection
- **Guildhall with 3 rooms** — 15 furniture items with pixel art, drag to rearrange, move between rooms
- **Bond system** with 33 conversation scripts (30 pair + 3 group) across all 10 cat pairings
- **Reputation system** (Crest/Shadow) — affects recruit costs and daily income
- **Traveling merchant** with special items (Catnip Elixir, Lucky Fishbone, Training Scroll, Saint's Blessing)
- **Station crisis events** requiring player intervention
- **Job combo chains** for consecutive same-category work
- **Daily cat wishes** for micro-goals and bonding
- **Real-time day cycle** (3-minute days) with Dawn-to-Night phases and time-of-day town art
- **Economy** with scaling upkeep, stationed passive income, fish crisis mechanics, and reputation bonuses
- **Introductory story sequence** setting up the Rags to Riches narrative
- **12 music tracks** (8 ambient + 2 puzzle + 2 cat sounds) + 14 ElevenLabs sound effects
- **Procedural puzzle generation** with BFS validation
- **Pause system** that halts timer and mutes audio
- **Save export/import** to protect against data loss
- **OTA updates** for the Android APK via Capacitor

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
