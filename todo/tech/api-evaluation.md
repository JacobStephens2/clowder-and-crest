# API Evaluation for Clowder & Crest

Evaluation of `additional-apis.md` — which APIs would actually help develop this game.

## Already Have (Skip)

- **PixelLab MCP** — Better than SEELE/Sprite AI/Pixie.haus for sprite generation. Already used for all 6 breed animations, rat, dog, fish, barrel, guard sprites. Integrated via MCP, not HTTP.
- **Suno** — Already used for music. Prompts now Suno-ready at <1000 chars (see music-prompts.md).
- **ImageMagick** — Installed at `/usr/bin/convert` (v6.9.12). Claude can already run it via Bash.
- **FFmpeg** — Installed at `/usr/bin/ffmpeg` (v6.1.1). Claude can already run it via Bash.

## Not Useful For This Game

- **Firebase / Supabase / PlayFab / Nakama** — Game uses localStorage for saves. No auth, no leaderboards, no multiplayer. Adding a backend would increase hosting complexity for zero player-facing benefit.
- **Tiled Map Editor / TexturePacker** — Scenes are procedurally coded, not tile-mapped. Sprite atlases aren't bottlenecking load time. Not worth the pipeline change.
- **ElevenLabs / Play.ht** — Game deliberately has no voice acting. Conversations are text-only (Fire Emblem style). Adding TTS would break the tone and bloat assets.

## Potentially Useful

### Freesound API — Low priority

The game already has 22 SFX covering all current minigames. But the 5 new minigames (Patrol, Ritual, Scent Trail, Heist, Courier Run) reuse existing SFX. Dedicated sounds (lock click for Heist, chanting for Ritual, scent sniff for Scent Trail) would add polish.

**Setup cost:** Register at freesound.org, get API key, add to environment. Claude could then search and download via curl.

**Recommendation:** Register an API key when you want to expand SFX. Not urgent — current SFX pool works.

### OpenGameArt.org / Kenney.nl — Already accessible

These don't need API keys. Claude can `curl` any asset URL directly. Already usable — no setup needed. Useful if you want a specific sound or texture that PixelLab can't produce (e.g., ambient loops, UI click sounds).

## Summary

**No new API integrations needed right now.** The toolchain is already well-equipped:
- PixelLab handles all sprite/character/tile generation via MCP
- Suno handles music (prompts ready)
- ImageMagick + FFmpeg are installed for local asset processing
- Free asset sites are accessible via curl/wget

**If you want to add one thing:** Freesound.org API key in your env for programmatic SFX search. Low effort, modest polish gain for the newer minigames.
