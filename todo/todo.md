# Clowder & Crest — To Do

This file now tracks only the meaningful improvement areas that are still open or intentionally deferred. Already-shipped review items were removed so this reads like a live backlog rather than a historical review log.

## Open

| Item | Why still open |
|---|---|
| **3a** Dialogue portraits via Midjourney | Needs the user to actually generate the 18 priority portraits in Midjourney. The prompts are ready in `todo/art/dialogue-portrait-prompts.md`, and the `Conversations.ts` portrait scaffold is already in place. |
| **2c** Big Cats (Lynx/Lion/Leopard) | Needs PixelLab generation, breed data, conversation scripts, and chapter unlock gates. Art prompts are in `todo/art/art-prompts.md`. |
| **2b** Individual Cat Rooms | Bigger feature with save-schema work, decoration UI, mood/stat hooks, and migration. Still a worthwhile late-game sink, but not as leverage-heavy as portraits or balance work. |
| **A5** Scene hotspot refactors | `main.ts` is no longer the only concentration risk. `ChaseScene.ts`, `BrawlScene.ts`, and `SokobanScene.ts` are each still 1.1k-1.2k lines and hold the densest remaining gameplay complexity. |
| **G1** Balance pass across the management loop | The economy now combines upkeep, stationed income, festivals, wishes, bonds, specialization, and reputation. It works, but it still needs deliberate tuning targets for pressure, break-even timing, and late-game fish sinks. |
| **T3** Release-gate playtests for the highest-risk minigames | Smoke/build coverage is decent, but the most likely regressions now are scene-specific fairness and pacing issues in Chase, Brawl, Sokoban, Stealth, and Heist. |
| **C1** Conversation/content QA after portraits land | Portraits solve the visual half of the bond-scene upgrade. The content side still needs a pass on breed voice consistency, expression-to-line fit, redundancy, and chapter/reputation reactivity. |
| **A1-rest** Extract `advanceDay` into a focused system module | Worth doing, but only after unit-test coverage exists for the day-loop edge cases. Right now it is still too risky to refactor quickly without stronger test protection. |

## Intentionally Deferred

| Item | Trigger to revisit |
|---|---|
| **2a** Cloud Save Sync | When real multi-device players exist or a server backend is being added for another reason. Use Capacitor's native iCloud / Google Drive APIs rather than a custom Firebase/Supabase stack. |
| **A4** Phaser tree-shaking | When the 1.18 MB Phaser chunk is causing actual load-time problems on real devices. |
| **O1** Capacitor plugin update cadence | Quarterly. Operational, not product-defining. |
| **3c-stems** Suno stems experiment | Revisit when a real player says the chase/brawl/hunt music feels too static, or when it becomes worth investing in layered audio playback. |
| **G2** Stationed-jobs polish (Majesty/Brotherhood/Frostpunk inspiration) | If stationed cats ever feel too "set and forget." Concrete levers: occasional station events that need intervention (Majesty-style autonomous unpredictability), diminishing returns on long stationing with rotation-bonus, daily cap on passive earnings, phase-sensitive station productivity (e.g. mousing pays more at Night). Folded in from the old `todo/history/Design/Improvements...` doc. |

## Working Notes

The highest-leverage remaining work is not more system breadth. It is:

1. asset completion for the highest-impact content already scaffolded
2. fairness and maintainability work in the biggest action scenes
3. explicit balance tuning across the systems already shipped

## Suggested Priority Order

1. **3a. Dialogue portraits** — biggest visual and emotional win still on the table.
2. **2c. Big Cats** — strong late-game roster expansion once art exists.
3. **G1. Balance pass** — tune economy, reputation, specialization pacing, and fish sinks before adding more systems.
4. **A5. Scene hotspot refactors** — reduce Chase/Brawl/Sokoban complexity before the next big tuning pass.
5. **T3. Release-gate playtests** — formalize fairness-heavy scene checks.
6. **A1-rest. `advanceDay` extraction** — only after better day-loop tests exist.
7. **2b. Individual Cat Rooms** — largest remaining feature, but not the highest leverage right now.
8. **C1. Conversation/content QA** — should follow immediately after portraits land.
