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
[x] - The cats should wander around the guildhall on their own, shown in their assigned room in the overview