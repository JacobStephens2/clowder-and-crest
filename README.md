# Clowder & Crest

A cozy medieval cat guild management game. Recruit cats, take jobs, solve puzzles, and build your guild from a lone stray to a renowned clowder.

**Play now:** [clowder.stephens.page](https://clowder.stephens.page)

## Features

- **5 cat breeds** with pixel art sprites and walk animations (Wildcat, Russian Blue, Tuxedo, Maine Coon, Siamese)
- **3 puzzle/minigame types** per job: Rush Hour sliding blocks, Sokoban crate pushing, and Pac-Man style rat chase
- **15 job templates** across pest control and courier categories
- **Guildhall with 3 rooms** — place furniture, assign cats to rooms, drag to rearrange
- **Bond system** with 30 conversation scripts across all 10 cat pairings
- **Real-time day cycle** (3-minute days) with Dawn-to-Night phases
- **Economy** with daily food upkeep, stationed passive income, and fish crisis mechanics
- **8 background music tracks** + ElevenLabs-generated sound effects
- **Procedural puzzle generation** with BFS validation
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

All rights reserved.
