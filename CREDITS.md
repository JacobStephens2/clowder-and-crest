# Credits

Clowder & Crest stands on the shoulders of open-source software, generous creative communities, and AI tooling that made a one-person game possible. This page is the long-form thank-you note.

## Game Engine & Languages

- **[Phaser 3](https://phaser.io)** by [Photon Storm](https://www.photonstorm.com) — the HTML5 game framework that powers every scene, sprite, animation, and physics body in the game. Released under the MIT License.
- **[TypeScript](https://www.typescriptlang.org)** by Microsoft — the language the game is written in. Apache 2.0.
- **[Matter.js](https://brm.io/matter-js/)** by Liam Brummitt — the 2D rigid-body physics engine bundled with Phaser, powering the Pounce minigame's slingshot/structure simulation. MIT.

## Build Tooling

- **[Vite](https://vitejs.dev)** by Evan You and the Vite team — the dev server and production bundler. MIT.
- **[Node.js](https://nodejs.org)** — JavaScript runtime that runs the build, dev server, and playtest harness.
- **[npm](https://www.npmjs.com)** — package registry and dependency manager.

## Native Wrapper

The Android build is wrapped with **[Capacitor](https://capacitorjs.com)** by [Ionic](https://ionic.io), which lets the same web bundle ship as a real Android app. All Capacitor packages are MIT-licensed.

- `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` — the native bridge
- `@capacitor/haptics` — taptic feedback wired into every minigame
- `@capacitor/local-notifications` — daily "your cats are waiting" return reminder
- `@capacitor/app` — pause-on-background lifecycle so the day timer doesn't drain when the app is closed
- `@capacitor/status-bar` — dark status bar matching the game theme

## Testing

- **[Playwright](https://playwright.dev)** by Microsoft — the headless browser harness behind every `test/*-playtest.mjs`. Apache 2.0.

## Web Hosting & Security

- **[Apache HTTP Server](https://httpd.apache.org)** by the Apache Software Foundation — serves the web build at clowderandcrest.com and clowder.stephens.page. Apache License 2.0.
- **[Let's Encrypt](https://letsencrypt.org)** + **[Certbot](https://certbot.eff.org)** — free, auto-renewing TLS certificates for both domains. ISRG / EFF.

## Sound Effects (Freesound)

The game uses sound effects from the [Freesound](https://freesound.org) community. All sounds are used under the Creative Commons licenses indicated below, with attribution as required.

| File | Source | Author | License |
|---|---|---|---|
| `bark.mp3` | [freesound.org/s/630648](https://freesound.org/s/630648/) | haulaway | CC0 1.0 |
| `lock_click.mp3` | [freesound.org/s/457036](https://freesound.org/s/457036/) | 9159316 | CC0 1.0 |
| `lock_open.mp3` | [freesound.org/s/271726](https://freesound.org/s/271726/) | 4087368 | CC BY 4.0 |
| `bell_chime.mp3` | [freesound.org/s/549897](https://freesound.org/s/549897/) | 11663790 | CC0 1.0 |
| `sniff.mp3` | [freesound.org/s/528939](https://freesound.org/s/528939/) | 3302313 | CC0 1.0 |
| `match_strike.mp3` | [freesound.org/s/423811](https://freesound.org/s/423811/) | 2549846 | CC0 1.0 |

### License Notes

- **CC0 1.0** ([Public Domain](https://creativecommons.org/publicdomain/zero/1.0/)) — no attribution required, but credited here as a courtesy.
- **CC BY 4.0** ([Attribution](https://creativecommons.org/licenses/by/4.0/)) — attribution required, provided above.

All other sound effects (`fish_earn`, `block_slide`, `purr`, `day_bell`, `job_accept`, `chapter_complete`, `ui_tap`, `cat_hiss`, `victory`, `recruit`, `furniture_place`, `rat_caught`, `fail`, `fish_splash`, `thunder`, `room_unlock`, `cat_sad`, `sparkle`, `alarm`, `crate_push`, `merchant`) were generated via [ElevenLabs](https://elevenlabs.io) SFX.

## Music

All music tracks in `public/assets/audio/` were generated via [Suno](https://suno.com) based on prompts in `todo/ideas/music/music-prompts.md`. Every track shares a Celtic/medieval acoustic palette and a 4-note guild motif (D-C-A-G).

## Art

All sprites, characters, animations, and pixel art were generated via [PixelLab](https://pixellab.ai) using its MCP server interface — including idle/walk/scratch/sit/eat/sleep animations for all 6 cat breeds, furniture sprites, building exteriors, and the dungeon decor.

## AI Development

- **[Claude Code](https://claude.com/claude-code)** by [Anthropic](https://www.anthropic.com) — the agentic CLI that wrote, refactored, and playtested the majority of this codebase alongside its human author. The 14 minigame scenes, the resilient playtest harness, the Capacitor native-features integration, and the genre-pillar audit pass were all built collaboratively with Claude.

## Game

Clowder & Crest is © 2026 Jacob Stephens, licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). See [LICENSE](LICENSE) for details.
