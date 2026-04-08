# Suno Stems Experiment — Dynamic Music Layering

Deferred from the 2026-04-08 music migration. The 68-track shared-leitmotif set is now wired through the game (each minigame plays its dedicated track via the new `MusicManager.TRACK_SETS` map). This doc captures the plan for the **next** music pass: swap one or two tracks for stem-layered versions that respond to in-game intensity.

## What the user provided

`todo/music/Chase 1 - Stone Alley Fur Stems/` contains 6 stem files exported from Suno for the Chase track:

| File | What it is |
|---|---|
| `0 Drums.mp3` | Bodhrán + hand drums |
| `1 Bass.mp3` | Cittern bass line |
| `2 Guitar.mp3` | Lute / strummed harmony |
| `3 Percussion.mp3` | Auxiliary percussion (woodblocks, taps) |
| `4 Synth.mp3` | (Suno-generated synth pad — may not fit the medieval palette) |
| `5 Other.mp3` | Fiddle melody + everything else |

Total ~16 MB for one track's stems. Each is the same length and synced to the same BPM, so they can be played simultaneously and mixed at runtime via Web Audio API.

## What "dynamic music" actually means here

The standard pattern (Stardew Valley, Hades, Cassette Beasts) is to play one base layer always-on and toggle additional layers in/out based on game state. For Chase specifically, the natural mapping is:

| Game state | Layers playing |
|---|---|
| **Idle / wandering** | Bass + Guitar |
| **Dog spotted (alert)** | Bass + Guitar + Percussion |
| **Active chase (dog pursuing)** | All except Synth |
| **Catnip combo (3+ dogs scared)** | All layers including Synth as a "power" cue |
| **Caught / fail** | Fade everything to silence over 200ms |

The reads come for free from the existing ChaseScene state — there's already an alert spreading + scared dog tracker.

## Why this is hard (and why it was deferred)

A naive implementation (6 separate `<audio>` elements with `play()` called simultaneously) **drifts** within seconds because browser HTML5 audio doesn't have sample-accurate sync. After ~10s the layers are noticeably misaligned.

The fix is **Web Audio API** (`AudioContext`, `AudioBufferSourceNode`, sample-accurate scheduling via `start(when)`). This has its own complications:

1. **Decoding cost.** Each stem must be decoded into an `AudioBuffer` upfront — for 6 stems × ~3 MB each that's a noticeable load hit. Pre-decode on scene transition into Chase, not on game start.
2. **Memory.** 6 decoded AudioBuffers × ~3 MB × 2 (decoded float32 vs compressed mp3) = ~36 MB resident in memory while Chase is active. Acceptable but worth watching on low-RAM devices.
3. **Loop sync.** When the loop point hits, all 6 sources must restart at the same scheduled time. `BufferSource.start(when)` handles this if the schedule is set carefully.
4. **Layer fade in/out.** Each layer needs its own `GainNode` with `linearRampToValueAtTime` for smooth transitions when the game state changes.
5. **First-run user-gesture requirement.** Web Audio API requires a user interaction before `AudioContext` can start. Wire it to start on the first scene click, not on page load.
6. **Pause / resume.** When the player backgrounds the app (Capacitor lifecycle hook already pauses music), Web Audio needs `audioCtx.suspend()` and `audioCtx.resume()`.
7. **Compatibility.** Safari has historically been picky about Web Audio. Test on iOS specifically.

## Suggested implementation order

1. **Spike**: Write a tiny `StemMixer` class in `src/systems/StemMixer.ts` that loads N stems, plays them in sync via Web Audio, and exposes `setLayerGain(index, gain, durationMs)`. Test with the Chase stems in isolation (a `test/stem-mixer-test.mjs` Playwright script that loads the page, instantiates the mixer, plays for 30s, asserts no drift).

2. **Wire to ChaseScene only**. Replace the existing `MusicManager.switchToTrackset('chase')` call in jobFlow with a `chaseScene.startStemMixer()` call inside ChaseScene.create(). Hook the existing alert / catnip state changes into `setLayerGain` calls.

3. **Verify on-device**. Test on a real Android phone (Capacitor APK) and a real iPhone (web). Watch CPU + memory in DevTools.

4. **Generalize if it works**. If the Chase experiment is good, generate stems for the other tense scenes (Brawl, Hunt, Patrol, Stealth) and extend `StemMixer` to handle them. If it's too expensive or too brittle, abandon and stick with the static per-scene tracks.

## What "if it doesn't work" looks like

Acceptable fallback: keep the static per-scene mp3 tracks the player just got. The game's music is already significantly improved by the migration; stems are a polish layer that doesn't have to ship.

## Why NOT to do this now

- The mp3 migration just landed — let it sit in production for a week or two before stacking another music change on top
- The 14 minigames don't all benefit equally from dynamic music; Chase, Brawl, Hunt, Patrol, Stealth are the obvious candidates but Sokoban / Nonogram / Heist are puzzle-paced and would actively be HURT by intensity-shifting layers
- Web Audio API integration is a real chunk of code (~150-200 lines for the StemMixer) plus the test scaffolding
- The game's emotional moments (bond conversations, day end) benefit more from dedicated character art and dialogue portraits than from stem-layered music

## Concrete trigger to revisit

Pick this up when at least one of these is true:
- A real player has said "the chase music feels static" or "I wish the music responded to what I'm doing"
- You've shipped the dialogue portraits and want a follow-up polish pass
- You're already in the audio code for another reason (e.g. adding a new minigame that needs custom music)
- Suno has improved the stem export quality / format / cost since today
