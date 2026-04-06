# Music Prompts for Clowder & Crest Minigames

Each minigame should have its own distinct music track. All tracks should be 30-45 seconds, loopable, MP3, volume-matched to existing tracks in assets/audio/.

## Existing Tracks
- **Ambient/Town** (10 tracks): Guildhall, Castle Halls, Dawn Parapets, Market Stalls (x2 each)
- **Puzzle** (2 tracks): Calm, methodical, thinking music
- **Fight/Brawl** (2 tracks): "Casks and Clashing Steel" — urgent Celtic combat

## Common Thread (include in every prompt)

All tracks for Clowder & Crest share a unified sonic identity:

- **Core palette:** Medieval/Celtic acoustic instruments — lute, cittern, fiddle, bodhrán, tin whistle, harp, hand bells. No electric instruments, no synths.
- **Tonal center:** D minor (Dorian mode). Every track should be rooted in or related to D Dorian — this creates a recognizable harmonic thread even across different tempos and moods. Tracks in major keys should use D Mixolydian.
- **Recurring motif:** A short 4-note descending phrase (D-C-A-G) should appear at least once in every track, however briefly — as a melodic fragment, a bass line moment, or a bell chime. This is the "guild motif."
- **Sonic texture:** Warm, slightly reverberant — as if played in a stone hall. No modern compression or EDM-style production. Think a small ensemble in a medieval guild hall.
- **Dynamic range:** Leave room for the game's SFX. Keep peak volume moderate. Avoid wall-of-sound arrangements.
- **Loop technique:** Final bar should thin out to 1-2 instruments, matching the opening bar's texture for seamless looping.

Pre-prompt (include with each track):
- Duration: 30-45 seconds per track
- Must loop seamlessly (end connects to beginning)
- Key: D Dorian (or D Mixolydian for bright tracks)
- Include the guild motif (D-C-A-G) at least once
- Medieval/Celtic acoustic instruments only

## Needed: One per minigame type

### Chase (Rat Maze) - done
Medieval chase theme. Quick fiddle melody over running drum rhythm. Minor key, 130 BPM. Tension of pursuit — the cat is hunting. Think tavern music sped up. Chiptune-influenced but organic. No vocals.

### Hunt (Whack-a-Mole) - done
Playful, percussive. Bodhrán and hand drums with staccato melody. Major key, 120 BPM. Light and bouncy — tapping rats is fun, not stressful. Short melodic loops. Think carnival game meets medieval fair.

### Fishing (Reel-In) - done
Calm, patient, flowing. Gentle harp arpeggios over soft pad. 80 BPM. Water sounds optional. Meditative but with subtle tension building (the fish is getting away). Think Stardew Valley fishing meets Celtic lullaby.

### Sokoban (Crate Pushing) 
Thoughtful, methodical. Soft lute or cittern with contemplative melody. 90 BPM. Minor key. The sound of thinking — unhurried but focused. Think medieval library or study.

### Nonogram (Grid Logic)
Minimal, clean. Plucked strings with occasional bell tones. 85 BPM. Quiet spaces between notes. The sound of careful deduction. Think monastery scribing room.

### Stealth (Guard Avoidance)
Tense, suspenseful. Low drone with occasional high-pitched string accents. 100 BPM. Lots of space — silence is part of the composition. The cat is holding its breath. Think medieval heist movie.

### Pounce (Physics Catapult)
Dramatic, anticipatory. Building percussion then silence before the launch. 110 BPM. Alternating between tense buildup and brief release. Think siege preparation.

### Slide Blocks (Rush Hour)
Light puzzle music. Wooden percussion (xylophone/marimba feel) with simple melody. 95 BPM. Satisfying clicks implied in the rhythm. Think wooden toy puzzle.

### Patrol (Lantern Watch)
Eerie, watchful. Low woodwinds with occasional owl-hoot accents. 70 BPM. Night atmosphere — crickets, distant wind. The sound of staying alert in darkness. Think medieval night watch.

### Ritual (Simon Says)
Sacred, reverential. Choir-like sustained tones with gentle bell chimes on each sequence step. 60 BPM. Ethereal and solemn. Think Gregorian chant distilled to its simplest elements.

### Scent Trail (Hot/Cold Search)
Mysterious, curious. Pizzicato strings with a wandering melody that doesn't resolve. 95 BPM. The sound of following a trail. Think detective noir meets medieval investigation.

### Heist (Lock Picking)
Clockwork, mechanical. Ticking percussion with metallic twangs. 105 BPM. The sound of precise, careful manipulation. Think music box crossed with a clock shop.

### Courier Run (Auto-Scroller)
Energetic, forward-driving. Fast strummed lute with running bass line. 140 BPM. Pure momentum — feet pounding cobblestones. Think medieval parkour montage.

## Technical Requirements
- Format: MP3
- Duration: 30-45 seconds per track
- Must loop seamlessly (end connects to beginning)
- Volume-matched to existing tracks (~0.35 in the MusicManager)
- File naming: `[type]_1.mp3` (e.g., `chase_1.mp3`, `patrol_1.mp3`)
- Place in: `public/assets/audio/`
