# Clowder & Crest

A cozy medieval cat guild management game. Recruit cats, take jobs, solve puzzles, and build your guild from a lone stray to a renowned clowder.

**Play now:** [clowder.stephens.page](https://clowder.stephens.page)

## Features

- **6 cat breeds** with pixel art sprites, walk animations, and sleeping poses (Wildcat, Russian Blue, Tuxedo, Maine Coon, Siamese, Bengal)
- **7 minigame types** — 2 choices per job category: Rush Hour, Sokoban, rat chase, fishing, rat hunting, brawl combat, and nonogram puzzles
- **35 jobs** across 6 categories: Pest Control, Courier, Guard, Sacred, Detection, Shadow
- **7 chapters** of narrative content — from stray to established guild, rival guild conflict, and Church Inquisition
- **Guildhall with 3 rooms** — 15 furniture items with pixel art sprites, drag to rearrange, move between rooms
- **Bond system** with 48 conversation scripts (45 pair + 3 group) across all 15 cat pairings, with narrative cliffhangers
- **Reputation system** (Crest/Shadow) — temptation economics: Shadow pays more fish but erodes bonds; Crest grows slower but builds trust. Affects recruit costs, XP, daily income, and bond growth
- **Traveling merchant** every 3rd day with special items
- **Festival system** — 7 rotating themed bonus events every 7 days
- **Station crisis events** requiring player intervention
- **Job combo chains** for consecutive same-category work (+25% at 5-day streak)
- **Explorable town map** — walk your cat through streets, enter buildings, find stray cats to recruit
- **Daily cat wishes** with furniture and room requirements
- **Cat specialization** at level 5 — permanent +20% bonus to one job category
- **Guild journal** — scrollable log of chapters, recruits, level-ups, bonds, and events
- **Achievements** — 14 milestones tracking progress
- **Guided tutorial** for new players on first day
- **Offline stationed earnings** — cats accumulate fish while you're away (capped)
- **Real-time day cycle** (3-minute days) with Dawn-to-Night phases and time-of-day town art
- **Economy** with level-scaling food costs, random expenses, chapter-scaling upkeep, stationed passive income, fish crisis mechanics
- **Rat Plague siege** (Chapter 3) — dramatic narrative scenes, daily escalation (cat sickness, rising costs), progress bar, climactic St. Rosalia procession resolution
- **Chapter 6: The Rival** — Silver Paws rival guild contests jobs, poaches cats, resolved through sustained competition
- **Chapter 7: The Inquisition** — 5-day investigation by Bishop's Inquisitor, job choices determine verdict (Vindicated/Acquitted/Condemned)
- **Introductory story sequence** with rain ambience, music, and narrative panels
- **Cat stats affect all minigames** — Hunting (HP in brawl), Endurance (speed), Stealth (cooldown), Senses (range)
- **Brawl minigame** — Zelda-style combat with waves, Rat King boss, powerups (Fish Bone, Catnip, Yarn Ball), virtual joystick with multi-touch
- **Guard dog** in chase minigame — patrols the maze, instant game-over if caught
- **Golden/poison rats** in hunt, **speed boosts** in chase, **rare golden fish** in fishing
- **Breed-specific vocalizations** — pitch-shifted sounds for all 6 breeds
- **Furniture stat boosts** — interact with furniture to gain +1 to a stat daily
- **Starvation game over** — narrative ending if the guild collapses
- **Fight music** — dedicated combat tracks for the brawl minigame
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
