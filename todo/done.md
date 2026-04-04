[x] - Create new art for the player's cat / wildcat (all 5 breeds have PixelLab pixel art sprites)
[x] - Work through the improvements to make:
  [x] - Procedural puzzle generation (BFS-validated)
  [x] - Finish breed sprites (all 5 breeds)
  [x] - Add fish sink (daily food upkeep: 2 fish/cat/day)
  [x] - Make traits and mood mechanical (affect job stat matching)
  [x] - Save export/import
  [x] - Break up main.ts (extracted MusicManager, DayTimer)
  [x] - Stationed job improvements (level 2+ gate, diminishing returns after 5 days)
  [x] - Show progression triggers to player (menu panel hints)
  [x] - 8 music tracks (up from 4)
  [x] - Add more conversation scripts (all 10 pairings now have C/B/A — 30 scripts total)
  [x] - Station events (rats fight back, bonus fish, lazy naps, curious finds)
  [] - Add more job templates beyond 8
[x] - Ensure the player can move their cat around spaces using keyboard WASD or arrow keys.
[x] - Enable cats in rooms to go on top of furnishings like the straw bed.
[x] - generate new pixel art / sprites for the player's cat so it better matches the style and size of the other cats
[x] - let the player move their cat diagonally by holding up right for example on the arrow keys, or by holding w d using WASD.
[x] - check improvements doc for more ideas (station events, conversations, all done)
[x] - make it clear to the player when the day ends (full-screen "Day N" transition overlay)
[x] - ensure that if a player holds a movement key their cat keeps moving in that direction (280ms repeat interval)
[x] - the player should be able to click a scratching post in a room view and then their cat goes and scratches it
[x] - consider yourself what other improvements could be made and make them (trait tooltips, fish flash, interactive furniture)
[x] - make art for the scratching post (included in furniture sprites batch)
[x] - make animation for wildcat to scratch scratching post (licking/scratch, sitting, eating anims via PixelLab)
[x] - when a player holds a direction movement key, keep the animation of that direction playing smoothly
[x] - make art for furniture (8 sprites via PixelLab)
[x] - make animations for interacting with furniture (scratch, sit, eat — plays on arrival)
[x] - modify the art for the straw bed so it doesn't have a cat in it
[x] - show furniture art in the furniture shop (sprite previews in shop cards)
[x] - let the player place cats into particular rooms of the guild hall (room dropdown)
[x] - ensure the player can scroll through the furniture shop on web / desktop
[x] - when the player buys furniture, let them choose which room (room picker overlay)
[x] - prevent puzzle moves from being obscured by header
[x] - put cat sprite on the cat block in the rush hour puzzle
[x] - let the player rearrange furniture in rooms (drag to reposition)
[x] - add art for the guildhall (PixelLab, background in guildhall scene)
[x] - make the art for the town different during the rat plague (PixelLab plague scene)
[x] - ensure town view returns after closing job screen
[x] - use puzzle music during puzzles (2 tracks, switches on enter/exit)
[x] - Move furniture between rooms (drag off grid to get room picker dialog)
[x] - Add more job templates (15 total, up from 8)
[x] - Ideate and implement improvement (day recap with food/station/event summary in transition)
[x] - Cats shown in assigned rooms on guildhall overview
[x] - Shorter days (3 minutes, down from 5)
[x] - Rat plague indicator on Town view (red warning banner)
[x] - Generate Suno Sound prompts for cat sounds (see todo/suno-prompts.md)
[x] - Scaling upkeep costs (2 fish/cat + 1 fish/room, shown in menu Daily Costs panel)
[x] - Add Sokoban puzzle type (7x7 grid, push crates to targets, WASD/tap, procedural + 8 fallback levels)
[x] - Add more puzzles (50/50 random between Rush Hour and Sokoban per job)
[x] - Wildcat meow sound effect (random ~30% chance every 8-23s when idle in room)
[x] - Cat availability indicator on town view (available/worked/stationed with color coding)
[x] - Chase minigame: Pac-Man style rat chase in procedural maze (pest control jobs, 1/3 chance)
[x] - ElevenLabs SFX: fish earn, block slide, purr, day bell, job accept, chapter fanfare, UI tap, cat hiss
[x] - Distribute cats across unlocked rooms (auto-spread when no assignments, respect assignedRoom when set)
[x] - Remove auto-resolve option (forces active gameplay via puzzles/minigames)
[x] - Room detail view matches guildhall overview (same cats per room, player cat always present)
[x] - Stationed cats hidden in room views (no more faded "away" ghosts)
[x] - Wildcat chirp sound added (50/50 with meow when idle in room)
[x] - Click cat in room to interact (player walks over, heart animation, +1 bond points, purr sound)
[x] - Cat artwork in cat list (breed sprite replaces colored circle)
[x] - Cat artwork in dialogue portraits (breed sprite in conversation)
[x] - Daily costs visible on town view (upkeep breakdown + fish warning)
[x] - Fish crisis: cat leaves guild after 2 consecutive days broke + warning on town view
[x] - README.md created with full feature list
[x] - GitHub repo description and topics updated
[x] - Pause button in status bar (pauses timer + mutes music, play button to resume)
[x] - New pixel art for town (PixelLab medieval street at night, replaces Phaser-drawn buildings)
[x] - New pixel art for rooms (PixelLab stone room interior, background layer)
[x] - Straw bed art replaced (empty bed, no cat)
[x] - Job fit details shown (key stats, individual values, trait/mood modifiers, color-coded match)
[x] - Fish warning on game load (toast if can't afford upkeep)
[x] - Design document updated to v5 (matches current game state)
[x] - Cat art on assign screen (breed sprites replace colored circles)
[x] - Russian Blue south walk frames fixed (regenerated character via PixelLab)
[x] - Chase minigame fish rebalanced (25% dot placement instead of 100%)
[x] - Bigger cat art in dialogues (72px portraits, 100px circles)
[x] - Pause blocks gameplay (full-screen "Paused" overlay, tap to resume)
[x] - Google Analytics tag installed (G-81TZVKST2W)
[x] - Fishing minigame (reel-in mechanic, difficulty-scaled fish zone + speed)
[x] - Job art on town cards (5 scene images: mill, market, cathedral, ship, monastery)
[x] - Add more puzzle/minigame types (Fishing added as 4th type)
[x] - Fishing tutorial on first play (hold to reel, keep hook in zone)
[x] - CC BY-NC-SA 4.0 license added
[x] - Google Analytics installed
[x] - Sleeping animations for all 5 breeds on beds (10 frames, looping)
[x] - Separate music and SFX mute toggles in menu
[x] - Skip dialogue button in conversations
[x] - Fish remaining shown in day transition recap
[x] - Town art changes with time of day (day/dusk/night variants, selected by current phase)
[x] - Themed Rush Hour blocks (crate, barrel, flour sack, cart, pew sprites per job category)
[x] - Dialogue scene art backgrounds (guildhall, rooftop, granary at 15% opacity)
[x] - APK export instructions documented (todo/export.md)
[x] - Added to portfolio at stephens.page/portfolio.html
[x] - The cats should wander around the guildhall on their own, shown in their assigned room in the overview