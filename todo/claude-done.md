[x] - Build new debug APK at v2.5.20 (versionCode 47) — trivially easy Roof Scout easy mode — saved to `todo/clowder-and-crest-2.5.20-debug.apk`. Per user feedback "make the easy roof scout level trivially easy." Easy mode is now the no-fail tutorial climb. Stack of buffs (medium/hard unchanged): (1) tier 1 chunks the entire way up — wide stairs and forgiving ledges, no wall-cling pressure, no chimneys, no spikes; (2) no fall death — the cat teleports back to the highest checkpoint via a new `respawnAtCheckpoint()` with screen flash + camera shake instead of `endRun(false)`; (3) world gravity drops 1050 → 850 for longer hang time; (4) jumpVelocity gets an extra -60 boost on top of agility scaling (~-700 base vs -640 medium); (5) wallFallCap forced to 20 (the minimum, so wall clinging is essentially a free pause); (6) fall forgiveness widened to GAME_HEIGHT * 4 from 1.5x (the world-bottom catch is effectively unreachable in normal play).
[x] - Build new debug APK at v2.5.19 (versionCode 46) — Day of Rest moved to title screen — saved to `todo/clowder-and-crest-2.5.19-debug.apk`. Per user feedback "move the day of rest - all unlocked menu item to the main title menu, and just call it day of rest there. Leave the spoiler warning." TitleScene gains a purple-tinted "Day of Rest" button below Continue/New Game (always visible, regardless of save state). New `showTitleScreenDayOfRest()` in Showcase.ts shows the existing spoiler warning, and on confirm loads the demo save into in-memory game state via `game-loaded` (NO slot writes — the player's real saves stay untouched), navigates to GuildhallScene, and auto-opens the fully-unlocked panel after the scene transition settles. `showDayOfRestSpoilerWarning` now takes `{ onCancel?, onConfirm? }` so callers can override the default open-the-panel confirm action. Removed the in-game menu's "Day of Rest \u00B7 All Unlocked" entry — the campaign-progress-gated entry stays. createButton in TitleScene gained an optional `tint: 'purple'` for visual consistency with the in-game rest-day entry.
[x] - Build new debug APK at v2.5.18 (versionCode 45) — Roof Scout wall-jump teach pass — saved to `todo/clowder-and-crest-2.5.18-debug.apk`. Three coordinated changes per user feedback "add more clear visual cue when the player can wall jump", "add vertical walls / platforms really designed for wall jumping off of", and "modify the easy level of roof scout so it doesn't have walls completely lining the sides of the stage." (1) New `wallJumpCue` chevron — a small pulsing triangle drawn next to the cat on the wall side whenever a wall jump is currently authorized (proximity, contact, or wall-coyote). Points away from the wall, telegraphing the launch direction. Pulses 0.55..0.95 alpha twice a second. Hidden immediately when the wall jump fires. (2) Real vertical walls: PlatformDef gains an optional `height` field (default 12), tall walls (height >= 30) render in a cooler tone (#4a5060) so the player visually distinguishes "wall to bounce off" from "ledge to land on." Three new chunks: `t2-walljump-zigzag` (two-bounce zigzag), `t2-vault` (single decisive cross-screen vault off a tall left wall), `t3-twin-towers` (three-bounce parallel walls with no floor between them). (3) Easy-mode side walls removed — the full-height pillars from 2026-04-08 blocked the Pac-Man screen wrap and made easy mode feel claustrophobic; the new wall-jump chunks teach the mechanic without sealing the sides, and the proximity wall jump (v2.5.16) makes any vertical surface wall-jumpable.
[x] - Build new debug APK at v2.5.17 (versionCode 44) — Day of Rest · All Unlocked menu entry — saved to `todo/clowder-and-crest-2.5.17-debug.apk`. Per user feedback "add a fully unlocked Day of Rest link to the main menu, and when the player opens it, give a spoiler warning they have to click through." New always-visible menu entry "Day of Rest \u00B7 All Unlocked" (purple-tinted, sits right under the existing campaign-progress entry). Tapping it shows a spoiler warning overlay that explains the panel reveals every minigame including ones the campaign hasn't reached, with "Show me anyway" / "Cancel" buttons. Confirm fires `showDayOfRestPanel(true)` which renders the full MINIGAMES catalogue (title suffixed " \u00B7 All Unlocked", count line "N memories \u2014 spoilers ahead"). The unlockAll mode is remembered in `lastUnlockAll` so the difficulty picker's back button re-opens the same view. Cancel resumes paused scenes, restores wish banner, and re-opens the main menu.
[x] - Build new debug APK at v2.5.16 (versionCode 43) — Roof Scout proximity wall jump — saved to `todo/clowder-and-crest-2.5.16-debug.apk`. Per user feedback "any time I'm next to a vertical surface I should be able to tap to jump off it." The previous wall-jump path required actual body contact (or wall-coyote within 180ms of the last contact); on touch screens it was easy to tap from a few px off the wall and have nothing happen. New WALL_NEAR_PX = 16 proximity scan: each frame, walk every platform, check whether its vertical band overlaps the player and whether the wall face is within 16px of the player's left or right edge. If yes, set `nearWallSide`. attemptJump treats `nearWallSide !== null` as wall-jumpable; doJump uses it to pick the kick direction. The cling/wall-coyote/contact paths still work — proximity is purely additive. Tie-breaker prefers the closer side.
[x] - Build new debug APK at v2.5.15 (versionCode 42) — Roof Scout ease pass — saved to `todo/clowder-and-crest-2.5.15-debug.apk`. Across-the-board difficulty drop and juicier wall jumps in response to "make it easier to bounce off walls or slide down walls and jump off them": gravity 1200 → 1050, base jump velocity -600 → -640, wall kick 220 → 280 (wall jumps now clear the next platform instead of falling back into the same wall), wall fall cap 80 → 40 (slower slide so the player can hang and time the jump), lateral drag 120 → 90 (momentum carries further), corner-correction grace 10 → 18px (more forgiving ledge grab), agility scaling on wall fall cap loosened from max(40, ... -6*) to max(20, ... -4*), easy mode caps at tier-2 chunks (never sees the tier-3 chimney/spike chunks), easy mode fall forgiveness widened to GAME_HEIGHT * 1.5. Wall jumps got pop juice: +60 extra upward velocity over a ground jump, 80ms 0.005 camera shake, player visual flashes 0xfff8e0 then back to tan, SFX volume 0.08 → 0.18, haptic upgraded from tap to medium.
[x] - Build new debug APK at v2.5.14 (versionCode 41) bundling 6 fixes — saved to `todo/clowder-and-crest-2.5.14-debug.apk`. (1) Three Roof Scout wall-jump fixes per todo/tech/Wall Jump Advice.md: jump-buffer now consumes on first wall contact (was the main "I'm on a wall but can't jump" cause), wall coyote split into its own 180ms constant (ground stays at 120ms), player body widened from 14 → 18px so thin chimney stubs register contact. (2) TownMapScene isMoving safety reset (350ms backstop in case the tween onComplete is missed). (3) Dialogue expression label removed — portraits speak for themselves. (4) Memories panel now lists chapter intros + group conversations alongside the bond conversations; chapter scenes extracted to a shared src/data/chapterScenes.ts module so main.ts and the journal render identical beats; demo save flags all 7 group conversations as viewed. (5) TownMapScene sprite-null guard in movePlayer + 200ms camera fade-out before guildhall navigate (per Map Traversal doc recommendations).
[x] - Build new debug APK at v2.5.13 (versionCode 40) bundling 6 fixes — saved to `todo/clowder-and-crest-2.5.13-debug.apk`. (1) Bottom-nav now closes the cat panel when switching to guild/town (added .panel:not(#panel-overlay) to the cleanup sweep). (2) Fixed blank-guildhall-after-room-back: GuildhallScene was double-starting RoomScene (navigate emit + this.scene.start), now uses a single navigate emit with data forwarding through eventBus. (3) TownMapScene defensive resets in create() (walkingToBuilding=null, playerPos={4,8}) prevent the stuck-on-guildhall-door loop. (4) Cat portrait popup: tap a cat in the cats panel to view their high-res neutral portrait (gender-aware for the wildcat). (5) Memories: Relational Journal renamed to "Memories", moved below Day of Rest in the menu, demo save populated with all 15 bond pairs at max rank with all conversations viewed. (6) Tap a wandering guild cat in the town scene for a small interaction beat (mood-varied flavor lines + purr SFX).
[x] - Build new debug APK at v2.5.12 (versionCode 39) with the Roof Scout wall-jump revision per the implementation guide — saved to `todo/clowder-and-crest-2.5.12-debug.apk`. Adds wall coyote time (mirrors the existing ground coyote so a wall jump can fire for ~120ms after separating from the wall) and a visual cling indicator (player rectangle shifts from tan to bright gold while clinging). The two other items in the queue (easy patrol tuning, replay dialogues) were already shipped in v2.5.11 and v2.5.8 respectively — the Relational Journal panel is reachable from the Menu when there's at least one viewed conversation, which the everything-unlocked save satisfies.
[x] - Build new debug APK at v2.5.11 (versionCode 38) bundling 7 fixes — saved to `todo/clowder-and-crest-2.5.11-debug.apk`. (1) Android theme paints status bar + nav bar + window background with the brand color #1c1b19 — no more white strips. (2) Wish bubble in guildhall got a 44x44 invisible hit zone + stopPropagation so taps don't fall through to the room border. (3) Daily wish line under each cat in the cats panel (fourth wish surface). (4) Town map auto-enter no longer fires when walking THROUGH another building's door tile (fixes the "stuck after clicking guildhall" trap). (5) Roof Scout wall-cling engages on contact instead of waiting for apex — wall jumps fire immediately. (6) Heist trap-trigger feedback bumped: brighter flash, camera shake, big red "TRAP! Ring reset — +4 noise" callout. (7) Patrol easy mode tuned easier — 5 lives, 32s watch, 1.4x threat peak, slower dim rate.
[x] - Build new debug APK at v2.5.9 (versionCode 36) with 3 follow-up features — saved to `todo/clowder-and-crest-2.5.9-debug.apk`. (1) Wish thought-bubble above the wishing cat in the guildhall scene (third surface for the daily wish — joins the floating top banner and the inline panel under the rooms). (2) Walk-back-to-Guildhall building entry on the town map: new Guildhall building between Cathedral and Castle, auto-enters when the player steps onto its door tile. (3) BuildingInteriorScene: a single shared scene that takes a buildingId and renders themed interior content (title, prose, dust motes, vignette) for cathedral / castle / tavern / market / docks / mill. Routed via a new 'enter-building' event in main.ts; preserves the existing accept-job flow when there's an accepted job, otherwise opens the interior view.
[x] - Build new debug APK at v2.5.8 (versionCode 35) bundling 11 fixes — saved to `todo/clowder-and-crest-2.5.8-debug.apk`. Day of Rest list reordered by chapter unlock; new-game name prompt back button; Exit Minigame menu button (only when in a minigame scene); Roof Scout easy-mode side walls + corner correction + narrower hitbox; Relational Journal feature for replaying viewed bond conversations; Pounce practice-mode exit fix (no more blank screen); Pounce slingshot reload visibility (animated indicator + reloading text); Patrol relight cooldown removed; Sacred Rite per-candle mp3 SFX layered with the synth tones; Heist noise meter + trap notches on every difficulty; wish floating banner dismiss button + always-visible inline panel under the rooms.
[x] - Build new debug APK at v2.5.7 (versionCode 34) with female wildcat portraits + Roof Scout quit/wrap fixes — saved to `todo/clowder-and-crest-2.5.7-debug.apk`. Four items: (1) Web-vs-native analysis written to todo/tech/web-vs-native-only-analysis.md — recommendation: keep web. The 30 lines of platform conditionals aren't causing the tuning bugs, dropping web costs the showcase URL + iOS reach + Playwright pipeline. (2) Female wildcat portraits installed: 5 expressions resized 928x1232 → 362x480 with Lanczos and placed in public/assets/sprites/portraits/wildcat_female_*.png; Conversations.ts portraitSrc swaps to the female set when save.playerCatGender === 'female'. (3) Roof Scout Quit button moved from bottom-right (where the right tap zone fired jumps over it) to top-right HUD strip with a bigger bg-rect target; added an HUD-exclusion zone in the global tap handler so taps in the top 80px don't fire jumps. (4) Roof Scout screen wrap (Pac-Man style): widened the physics world bounds to GAME_WIDTH * 3 with -GAME_WIDTH offset so the cat can leave the visible area, then wrap the player x in update() — jump off the right edge and re-enter from the left.
[x] - Build new debug APK at v2.5.6 (versionCode 33) with the Roof Scout first-platform fix and silent jumps — saved to `todo/clowder-and-crest-2.5.6-debug.apk`. Two fixes: (1) the original t1-stairs first chunk was unreachable from the spawn — its closest platform was 35px right of the player and the lean velocity died after ~15px due to drag=400, so a new player got stuck on the ground floor on their very first attempt. Redesigned t1-stairs with a wide central platform directly above the spawn, and tuned physics for better momentum (jump velocity -560 → -600, lean 110 → 170, drag 400 → 120, max horizontal 220 → 260). (2) The constant tap SFX on every jump was annoying; removed it entirely (squash/stretch tween + haptic provide enough launch feedback) and dropped the wall-jump SFX volume 0.25 → 0.08.
[x] - Build new debug APK at v2.5.5 (versionCode 32) bundling 13 fixes — saved to `todo/clowder-and-crest-2.5.5-debug.apk`. Pronoun option removed, feminine wildcat prompts expanded, tutorial highlight fix, locked-game hiding in Day of Rest, scene pause to fix Day of Rest click-through, Pounce out-of-shots Continue button, courier run length bump, victory SFX 4-sound rotation pool, Roof Scout in Day of Rest catalogue + everything-unlocked save, replay-tutorial toggle, patrol prowler tap-zone bug fix, wishes hidden in Day of Rest, title-screen wall cat filtered to recruited breeds.
[x] - Brainstorm uses for the wildcat-neutral-zoom-in portrait video — written to todo/art/portrait-videos/brainstorm.md with 5 ranked candidates and a recommendation to start with the title screen background.
[x] - Filter title-screen wall cat to only show breeds the player has recruited across saves; default to wildcat only on a fresh install.
[x] - Hide the floating wish banner while the Day of Rest panel is open.
[x] - Patrol scene: fix the prowler tap-zone bug. The interactive zone wasn't following the moving visual, so taps that visually landed on intruders missed the hit-test target — making the game unwinnable in any phase that spawned them. One-line `p.zone.setPosition(p.x, p.y)` fix in tickProwlers.
[x] - Day of Rest: add Roof Scout entry to the catalogue and the everything-unlocked demo save, plus a "Replay tutorial" toggle on the difficulty picker that clears the relevant tutorial localStorage keys before launching.
[x] - SfxManager: rotate `playSfx('victory')` through a pool of 4 triumphant sounds (victory_fanfare, chapter, sparkle, bell_chime), never repeating the same one twice in a row. The single victory.mp3 was getting repetitive at the end of every minigame.
[x] - CourierRunScene: bump target distances ~40% (1800/2200/2600 → 2500/3100/3700) so runs land closer to 22-35 seconds and the player can pick up a few more fish.
[x] - PounceScene: add an explicit Continue button + tap-anywhere-to-continue on the out-of-shots failure screen so the player isn't stuck waiting for an auto-timer that may have been delayed by a paused scene or dropped event.
[x] - Day of Rest: pause every active Phaser scene while the panel is open so click-through bugs (like the recruit-cat prompt firing during a difficulty pick) can't happen. Resumed by the close button; switchScene tears down paused scenes naturally on practice-run launch.
[x] - Day of Rest: hide locked games entirely from the catalogue instead of showing them greyed out — surprises the player when a new card appears after a campaign first-clear instead of spoiling the catalogue.
[x] - Fix bottom-nav appearing at the top after the intro tutorial. Root cause: the tutorial highlight code in onboarding.ts forced `style.position = 'relative'` on the highlighted element to enable z-index, but only restored `style.zIndex` afterwards — leaving #bottom-bar permanently `position: relative` instead of `fixed`, which dropped it into document flow at the top of the overlay layer until the page reloaded. Now snapshots and restores both `position` and `zIndex`.
[x] - Expand the wildcat queen variant prompts in todo/art/dialogue-portrait-prompts.md from shorthand to copy-paste-ready Midjourney lines.
[x] - Remove the they/them pronoun option from the cat-naming prompt at game start. New games choose between he/him and she/her, defaulting to she/her. Legacy saves still resolve correctly via the pronouns helper (the 'they' branch is preserved in getPlayerPronouns).
[x] - Build new debug APK at v2.5.4 (versionCode 31) with the chase scene joystick fix — saved to `todo/clowder-and-crest-2.5.4-debug.apk`. Three root-cause fixes: (1) switched touchJoystick.ts from polling-based `pointer.worldX/Y` (which read stale lazy-evaluated camera-derived getters between events) to event-driven `pointer.x/y` (canvas pixel coords from the touch event itself), (2) replaced the dominant-axis comparison (which gave vertical 100° wedges and horizontal only 80° — a 25% bias toward up/down that combined with thumb-extension ergonomics to present as "stays mostly down") with atan2 + 90° equal-area wedges, and (3) added pac-man-style wall-slide in ChaseScene: when the input direction is blocked by a wall, the cat continues in its last open direction until the corridor turns, instead of stopping dead.
[x] - Build new debug APK at v2.5.3 (versionCode 30) with the centered Android launcher icon — saved to `todo/clowder-and-crest-2.5.3-debug.apk`. Regenerates ic_launcher_foreground.png at proper 108dp adaptive sizes (was 48dp legacy sizes) with the crest scaled to fit inside the inner 66dp safe zone, so no part of the crest is cropped by any launcher mask (circle, squircle, teardrop). Legacy ic_launcher.png + ic_launcher_round.png also regenerated with white background and 12% padding for Android < 8.0.
[x] - Build new debug APK at v2.5.2 (versionCode 29) with dedicated Roof Scout music — saved to `todo/clowder-and-crest-2.5.2-debug.apk`. Wires the new `roof_scout_1.mp3` + `roof_scout_2.mp3` (D Mixolydian climbing arpeggios per `todo/music/music-prompts.md`) into MusicManager so the trackset no longer aliases courier_run.
[x] - Build new debug APK at v2.5.1 (versionCode 28) with the Roof Scout vertical climbing platformer (15th minigame) — saved to `todo/clowder-and-crest-2.5.1-debug.apk`
[x] - Build RoofScoutScene.ts — vertical climbing platformer following `todo/game/platformer/4. Phaser 3 + TypeScript + Capacitor...md` with Arcade physics, two-zone touch, coyote time, jump buffer, wall cling/jump, variable jump height, squash/stretch tweens, 12 hand-crafted chunks across 3 difficulty tiers, guild-stat physics integration. Wired into the courier job category at chapter 3+.
[x] - Build new debug APK at v2.5.0 (versionCode 27) with showcase entry, Day of Rest archive, and weekly rest cadence — saved to `todo/clowder-and-crest-2.5.0-debug.apk`
[x] - Implement weekly rest day mechanic — every 7th in-game day (suppressed during plague/winter/inquisition) the cats observe a day of rest: day timer pauses, town job board closes, menu emphasizes the Day of Rest entry. Stationed cats still earn from their post.
[x] - Add hidden showcase entry (`?showcase=1` URL parameter on web + 5-tap crest gesture on web/APK) that loads a fully-unlocked demo save into slot 1 so portfolio reviewers can poke at every minigame without playing the campaign first.
[x] - Add Day of Rest minigame archive — in-universe replay mode lived behind the menu, progressive unlocks tied to first-completion of each minigame in the campaign, sandbox runs that never touch fish/XP/mood/penalty state.
[x] - Create new art for the player's cat / wildcat (all 5 breeds have PixelLab pixel art sprites)
[x] - Consider room for improvement to the story per `todo/ideas/What Makes a Great Rags to Riches Story.md` and write concrete notes in `todo/ideas/story-improvement-notes.md` (focus: clearer hidden value, stronger false summit before collapse, more emotionally legible reversals, and a final triumph centered on belonging rather than only fish)
[x] - Consider what files in the repo should be git ignored (`.gitignore` now covers `todo/.stfolder/`, `todo/*-capture.md`, and `todo/ideas/.DS_Store` so local sync markers and scratch capture files stop polluting status)
[x] - Consider how to respond to the public `CLAUDE.md` concern. Recommendation: leave it public for the portfolio-state repo because the source is already public and the file helps communicate design thinking; only split it into public/private docs if the project moves toward a commercial spoiler-sensitive release
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
[x] Complete Chapter 6 — rival guild resolution (win condition + narrative scene)
[x] Achievements/milestones screen in menu
[x] Overall game tutorial — guided first day for new players
[x] Harder late-game economy (scaling food cost per cat level, random expenses)
[x] Cat specialization at level 5 (permanent category bonus/penalty)
[x] Guild timeline/journal — scrollable log of major events
[x] More cat sounds per breed (unique vocalizations beyond wildcat)
[x] Chapter 7: The Inquisition (from vision doc)
[x] New breed: Bengal (Chapter 6 rivalry recruit)
[x] Develop the artwork for the rooms. Right now they look like chessboards, not pixel art places in this world
[x] create art for the rats in the pacman minigame
[x] prevent fishing from starting while the user is still reading the tutorial introduction (and so then them failing it in the background while still reading the intro text)
[x] limit the approaches to jobs, as some approaches don't make sense, like fishing to complete the mill mousing job doesn't thematically fit for example
[x] add a hunting mini game for jobs that are about hunting rodents
[x] show the furniture sprites / art in the guild overview (I'm not referring to the room specific views)
[x] add an end day button at the bottom of the guild view
[x] show wishes at the top of the guild view
[x] remove the undo button from the sokobond / crate pushing game, as it removes consequences of actions, remove the reset button too for the same reason
[x] put full screen art in the dialogues, either of the cat talking, or of the game's setting / an unlocked location in the game
[x] add a threat to the pac-man style game, something the cats have to avoid that can chase them, this can make failure more possible in this mini-game, something thematically that could injure the cat, like a dog or some or thing that could be antithetical to a cat
[x] my wildcat wished for a nap in a warm spot, this cost 5 fish, but this wish could have required the user has a bed / some fitting furniture to fulfill the request
[x] Playtest with real users
[x] make running into the guard dog in the pac man mini game cause losing the mini game
[x] use an emoji for the guard dog icon in the pac man mini game
[x] in the pac man mini game, keep your avatar moving if the player holds down a direction on the d pad
[x] keep the end day summary message on screen until the player dismisses it
[x] Make the goals to get to the next chapter more clear for the player to find in the game ui, maybe they are presented to the player at the start of each chapter? Or maybe better to let the player discover it themselves and not overtly say it? Decide which is better here
[x] add a quit to main menu game option from the menu
[x] allow multiple saves
[x] Add a mini-game where the cat fights rats, like a side scrolling beat em up kind of game, or perhaps like a top down zelda game style fight
[x] refine the fight mini-game
[x] refine the nonogram puzzles
[x] ensure there are jobs for all the mini-game types and all the puzzle types
[x] close the job board when the player leaves the job board 
[x] ensure the pac man puzzles are solvable without going through the dog
[x] generate pixel art for the dog in the pac man mini game
[x] add a barking sound effect to the pac man mini game 
[x] make a way to close the job board after it is opened
[x] prevent opening the job board from the tavern
[x] resolve console audio decode errors (only load wildcat audio, others use pitch-shift)
[x] resolve /var/www/clowder.stephens.page/todo/error in rat chase pac man game.png - the error in that screen shot
[x] Ensure the game is fun per /var/www/clowder.stephens.page/source_documents/Reports/What Makes Games Fun.md, and report how it is or is not in clowder.stephens.page/todo/fun.md, then work to improve its fun accordingly
[x] generate a music prompt for the fight mini game
[x] open the job board when the cat walks onto the job board on the town map
[x] increase the base attack radius or the hit box in the fight game, as i felt like rats were in my hit box, but yet they weren't getting hit
[x] open the town map view after a mini game or puzzle / job is resolved
[x] make sure the rat chase / pac man games can always be completed successfully. I had one where it seemed like there was no path around the dog to get to the rat, so I lost without a chance of winning
[x] where does the game have procedural generation / room for this? / room for LLM created content on the fly / on demand?
[x] add terrain to some fight mini games
[x] make it so that you can accept a job, but then you have to go to that location to do it
[x] have at least two paths to the rat in the rat chase game, this should help prevent cases where the player cannot get around the dog to get to the rat
[x] add a furniture shop to the town map so the player can actually go to it to open it
[x] in order to recruit a cat, show them walking around the town, and make the player talk to them to recruit them (still require the payment)
[x] use the /var/www/clowder.stephens.page/music/fight tracks for the fight background music
[x] ensure every part of the game has some pixel art unique to that part of the game
[x] in the [cat] appears screen, present an option to deny entry to the cat
[x] sometimes in trying to accept a job I get this in the console and can't accept it `clowder.stephens.page/:20  GET https://www.googletagmanager.com/gtag/js?id=G-81TZVKST2W net::ERR_BLOCKED_BY_CLIENT index-DYiVPUgx.js:2      Phaser v3.80.1 (WebGL | Web Audio)  https://phaser.io index-DYiVPUgx.js:6 Uncaught TypeError: Cannot read properties of undefined (reading 'sys') at initialize.setTexture (index-DYiVPUgx.js:6:27380) at initialize.callback (index-DYiVPUgx.js:119:21654) at initialize.update (index-DYiVPUgx.js:64:13191) at e.50792.s.emit (index-DYiVPUgx.js:2:3235) at initialize.step (index-DYiVPUgx.js:62:6653) at initialize.update (index-DYiVPUgx.js:61:22063) at initialize.step (index-DYiVPUgx.js:2:77460) at initialize.step (index-DYiVPUgx.js:2:81674) at t (index-DYiVPUgx.js:4:3019) setTexture @ index-DYiVPUgx.js:6 callback @ index-DYiVPUgx.js:119 update @ index-DYiVPUgx.js:64 e.50792.s.emit @ index-DYiVPUgx.js:2 step @ index-DYiVPUgx.js:62 update @ index-DYiVPUgx.js:61 step @ index-DYiVPUgx.js:2 step @ index-DYiVPUgx.js:2 t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:4 requestAnimationFrame t @ index-DYiVPUgx.js:41
[x] ensure there is a way to close the town job board when it opens
[x] ensure the rat fight game can be paused
[x] implement something or some things from /var/www/clowder.stephens.page/todo/procedural-and-llm-opportunities.md
[x] maybe jobs should have fewer approaches available? If any approach options at all?
[x] show rats in the town during the rat plague
[x] for the rat plague, after the scene happened, I went to the job board and it already showed 3/5 rat nests cleared. It should have been 0, as the rat plague just started and I hadn't done any jobs yet
[x] add a job that is transporting in the town itself
[x] with the hunting mini game, the repeated squeeky rat sounds from constantly hitting them gets a little annoying
[x] get different stats of the cats to impact how they perform in the fight game
[x] what would we need to setup LLM integration?
[x] the first nonogram I encountered was 8x8 and would have taken a while, maybe make the first one the player encounters smaller, and the resolution seemed a bit low too. I wonder if this nonogram game would be better rendered by HTML than by Phaser.
[x] add something the cat can pickup in the fight game that gives a new cat themed weapon
[x] winning fight mini games / jobs should count towards the resolution of the rat plague
[x] the fight game still doesn't pause when the player clicks the pause button at the top
[x] some of the rush hour puzzles seem too easy
[x] remove recruitment from the job board menu, make the only way to do it going to talk to the cat in town
[x] remove the furniture shop from the menu, make the only way to get to it by going to the carpenter on the town map
[x] add swipe animations for the fight game
[x] put a note / indicator on jobs which will progress the resolution of the rat plague. I'm having a tough time sometimes knowing what will help move that along
[x] remove wishes from the town board, showing them only in the guild view
[x] try to match room placement to wishes, so if the Maine Coon wants to scratch something for example, require that cat to be placed in the room with the scratching post
[x] resolve the bug in the rush hour puzzles where if you drag your cat to the exit, it can resolve, even if the path to the exit is not clear
[x] I don't know how solvable the nonograms are, some seem very tough, as I got one with a 5x5 grid where there were 1's along the entire top and 1's along the entire side except for one row which had a 2 at the end
[x] I feel like I can't resolve the rat plague. I took two tasks that were marked plague, and before I took both I was at 4/5 rat tasks, but I'm still at 4/5 after resolving both of those
[x] make it so that you can pick up jobs at the job board, but then to do them you have to go to the location where they are done and then start the job at that location.
[x] the fight game seems to start paused, and I need to click pause in the corner then unpause to get it moving. 
[x] make it so the player loses the game if they get down to the last cat (themself) and can't afford their upkeep, a loss from staving
[x] show the players what jobs they have accepted and not yet resolved below the town in the town view
[x] if the player hasn't yet successfully resolved any nonograms, make the first one pretty easy
[x] make the player movement smoother in the rat chase game if the player holds an arrow / direction key
[x] got `clowder.stephens.page/:20  GET https://www.googletagmanager.com/gtag/js?id=G-81TZVKST2W net::ERR_BLOCKED_BY_CLIENT
index-C0OXO78h.js:2      Phaser v3.80.1 (WebGL | Web Audio)  https://phaser.io
recruit.mp3:1  GET https://clowder.stephens.page/assets/sfx/recruit.mp3 500 (Internal Server Error)
`
[x] add a big rat enemy type to the fight game
[x] if a job was taken and failed, don't put it right back on the job board, leave it's absence as a consequence of failure
[x] show the job difficulty while the player is doing the job
[x] prevent days from turning over to the next day during a job
[x] enable boosting cat stats by interacting with furniture in the guild
[x] show a random angle of wildcat on the main menu screen where the user clicks continue or new game / restat game or something. Maybe show other cats here sometimes too, perhaps an animation now and then too
[x] display job difficulty while doing the puzzle / minigame
[x] add joystick on screen for mobile movement in fight game on mobile, and if player releasees hold on the joystick, stop their avatar's movement
[x] don't trigger cat conversations in town when walking over the cats, but only when clicking them
[x] on mobile in the fight game, let the player hold a press on the joystick (use the joystick), and press the attack button at the same time. Right now the player has to let go of the joystick in order to press the fight button.
[x] implement the advice in /var/www/clowder.stephens.page/todo/approaches-per-job.md
[x] update the readme, design doc, and story.md if needed
[x] look in /var/www/clowder.stephens.page/source_documents/Reports and consider the game per /var/www/clowder.stephens.page/source_documents/Design for inspiration for a new puzzle or mini game for jobs to add, and add it
[x] Make the first nonogram the player does really easy
[x] Consider /var/www/clowder.stephens.page/todo/ideas/new-library-for-games-or-puzzles.md for either refinement to an existing game or system, or to add a new mini game or puzzle or something
[x] look in /var/www/clowder.stephens.page for files that can be deleted and delete them
[x] add another mini game or puzzle or way of completing jobs, brainstorm partly taking the documents into /var/www/clowder.stephens.page/source_documents into account
[x] make dialogue with full screen art like Fire Emblem does it (keep the Clowder & Crest style though), here are inspiration screenshots: /var/www/clowder.stephens.page/todo/dialogue-full-screen-style-inspiration
[x] look for places to add art and sound effects
[x] add an indicator somewhere that summarizes the net daily costs - such as the total upkeep cost and the total daily income from stationed cats, and the net total. this will help the player know how much they have to earn that day
[x] Consider the ranges of fish rewards for tasks, if one task could give more fish, either make sure that correlates to higher difficulty, or could also give less fish, so is sort of more risky / higher reward higher risk than another job
[x] look for and resolve bugs
[x] add more pixel art to the rooms to make them seem more like distinct settings that fit the world
[x] improve the repository
[x] create music prompts for each mini game / puzzle so that each can have their own distinct tracks
[x] smooth out movement around the town and interactions in it
[x] consider how new games are presented as the player progresses through the chapters, ensure at least two new mini games / puzzles are added at each chapter
[x] Revise phaser movement according to this: /var/www/clowder.stephens.page/todo/ideas/What phaser.js games have the smoothest character movement.md
[x] Revise movement according to this: /var/www/clowder.stephens.page/todo/ideas/What Matter.js games have the smoothest character.md
[x] consider removing the % match by cat for job selection. I pretty much always just choose the highest percentage match, so perhaps the strength of each cat for the job should be a little more opaque, maybe just showing their relevant stat values or something?
[x] should the music prompts all share something common to help create a common thread between the game's music? (/var/www/clowder.stephens.page/todo/music-prompts.md)
[x] consider the codebase in relation to the Phaser.js documentation: https://docs.phaser.io/
[x] would the game benefit from Howler.js? Or is Phaser's built in audio manager sufficient? If Howler.js would help, implement
[] install the GitHub MCP server for yourself: https://github.com/github/github-mcp-server (needs Docker or Go build — Docker not installed on this server)
[x] install the Phaser Editor v5 MCP for yourself to use (evaluated and skipped — game is almost entirely procedural/code-driven, visual scene editor is a mismatch)
[] setup Nia as a Filesystem / Context MCP for yourself: https://www.trynia.ai/ (needs API key from app.trynia.ai)
[x] Update CLAUDE.md if useful
[x] Would ESLint + Prettier be useful? If so, run them (skipped — tsc handles type checking, style is consistent)
[x] check if anything in https://github.com/wshobson/agents would be useful for you and set it up if so (skipped — 182-agent orchestration framework is overkill for solo game dev)
[x] setup Nano Banana Pro / Tiny PRD for yourself if useful (skipped — Nano Banana Pro is Google's image gen model, Tiny PRD is a PRD generator; neither relevant)
[x] Consider setting up and using these tools (Vite already in use; Phaser Editor evaluated and skipped; Tiled/TexturePacker/Aseprite are desktop GUI tools for user to install)
[x] would any of the api's in /var/www/clowder.stephens.page/todo/ideas/additional-apis.md be useful for you to develop Clowder & Crest? (see /var/www/clowder.stephens.page/todo/ideas/api-evaluation.md — mostly already covered, Freesound API key is the only low-hanging fruit)
[x] I went to hire Tuxedo, but I got stuck on the name screen. Clicking Recruit and Turn Away - neither did anything, so I had to close the browser and re-open it to unfreeze the game (fixed: .name-prompt-overlay was position:absolute z-index:50 inside #overlay-layer's z-10 stacking context, so any position:fixed z-index>10 modal could block its clicks. Also, document.getElementById would return the first matching element when prompts stacked, attaching listeners to stale DOM. Switched to position:fixed z-index:9999, scoped lookups via querySelector, and clear stale prompts before creating new ones.)
[x] build a new apk (v2.0.1, versionCode 21, signed release at android/app/build/outputs/apk/release/app-release.apk — 61.6MB)
[x] rename 5.1 What Makes Deduction Hot-Cold Search Games Great to 4.3 What Makes Deduction Hot-Cold Search Games Great
[x] serve clowder & crest at https://clowderandcrest.com/ (Apache vhost + Let's Encrypt cert via certbot --apache; HTTP→HTTPS redirect; both clowderandcrest.com and clowder.stephens.page now serve the same dist/)
[x] update the readme, github repo, and design document based on the updates to the mini games / puzzles / main game (README rewritten with the 14-minigame table summarizing each scene's genre-pillar improvements; CLAUDE.md scene descriptions updated with each scene's key new mechanic; new test/ folder section listing all 14 playtest scripts; deployment section updated with both domains)
[x] Expand credits.md with more attributions and credits to the different technology communities that help made this project possible
[x] Using music-prompts.md, I'm putting together prompts like `# Chapter 3 — The Rat Plague

## distinct elements for this track
Urgent, oppressive. Low cittern drone under staccato bodhrán alarm bursts. 100 BPM, minor. The sound of a siege — the town falling, the guild rallying. Tension without relief. The guild motif played defiantly on a lone fiddle above the drone, refusing to be swallowed. Think: the sound of something precious under threat, and the people who refuse to lose it.

## common elements for all the tracks in the game
Medieval/Celtic acoustic only: lute, cittern, fiddle, bodhrán, tin whistle, harp, hand bells. No synths, no electric, no vocals. Key: D Dorian (or D Mixolydian if major). Include the 4-note guild motif D-C-A-G at least once — as melody, bass line, or bell chime. Warm, slightly reverberant — a small ensemble in a stone guild hall. Leave headroom for SFX; moderate peak volume. 30-45s, seamless loop — final bar thins to 1-2 instruments matching the opening texture.` for Suno AI music to generate, but I'm wondering if the common elements section is too constraining, or good for bringing a similar kind of theme to the sound of all the tracks and music in the game
[x] update portfolio in /var/www/stephens.page with clowderandcrest.com URL for this app replacing older clowder.stephens.page domain.

[x] Make a file like todo/ideas/music/music-prompts.md and put it in todo/ideas/art which I can use to create more art for the game
[x] there's a test save for everything in the game at test/test_saves/test-save-everything-unlocked.json, make a test save that is for mid-game
[x] does art-prompts.md have prompts for full screen artwork of the characters? For the dialogue scene? I'm imagining character art that is more detailed and can fill almost the entire phone screen, like a fire-emblem style dialogue as seen at /var/www/clowder.stephens.page/todo/archive/dialogue-full-screen-style-inspiration. I'm wondering if we should stick to pixel art here or move to something higher-res, like these fire emblem character art styles
[x] Consider which files and directories in /var/www/clowder.stephens.page would better fit in the /var/www/clowder.stephens.page/todo directory, and consider renaming /var/www/clowder.stephens.page/todo to /var/www/clowder.stephens.page/workspace
[x] for the clowder & crest entry at https://stephens.page/portfolio.html (/var/www/stephens.page), maybe it should be a screenshot from mid-game to give the sense of in progress? Such as using /var/www/clowder.stephens.page/test/test_saves/test-save-mid-game.json ?
[x] for the dialogue portrait art described in todo/ideas/art/art-prompts.md, I'm going to use Midjourney per todo/ideas/art/dialogue-portraits-pipeline.md. Given this decision, would it be worth updating art-prompts.md or creating a new file in todo/ideas/art to use to create these portraits with Midjourney?

| Item | Commit(s) | Notes |
|---|---|---|
| **1a** XSS fix in Panels.ts + 7 other sites | `9ea01a9` | Found and fixed XSS in Panels.ts, Conversations.ts, onboarding.ts (`showGuildReport`), TitleScene.ts (slot picker), and main.ts (wish banner action hint, crisis dialog). Promoted `esc()` to `src/utils/helpers.ts`. New `test/xss-regression-test.mjs` covers cat panel + rename prompt with payload-injected save (33 assertions, all passing). |
| **3b** CSS overlay juice | `5f09733` | ~150 lines added to `src/ui/overlay.css`. Universal transitions (120-180ms), hover scale 1.02, press scale 0.97, panel-fade-in keyframes, toast slide-up, prefers-reduced-motion escape hatch. |
| **3c** Music migration (static, not stems) | `26f331e`, `f3182ee` | 68-track shared-leitmotif set replaces the legacy 14-track 3-mode music. Every minigame, room, chapter event, and overlay has a dedicated D-C-A-G-leitmotif track. Brawl track added in follow-up commit. MusicManager rewritten with `TRACK_SETS` map + `switchToTrackset(name)` API. Legacy 3-mode functions kept as backward-compat wrappers. **Stems experiment deferred** — see `todo/ideas/music-stems-experiment.md`. |
| **A1** Extract overlay builders (PARTIAL) | `5dc291c` | 2 of ~6 extracted: `EndDaySuggestion` and `ExileChoice` are now in `src/ui/overlays/`. `advanceDay` (353 lines) is deferred until it has unit-test coverage. Pattern is established for future extractions. |
| **A2** Save import sanitization | `bc9af99` | New `validateAndSanitizeSave()` in SaveManager. Clamps name lengths to 32, journal text to 200, flag values to 200, cat array to 20. Strips control characters. Rejects malformed input. Threaded into the Import Save handler in Panels.ts. |
| **A3** Save migration ladder | `bc9af99` | Rewrote `migrateSaveData()` with explicit two-phase ladder (version-aware migrations + lazy backfill). v1→v2 is documented as a no-op (additive bump); future renames or type changes have a clear pattern. |
| **P1** Service Worker / PWA | `5f09733` | Hand-written `public/sw.js` (vite-plugin-pwa doesn't support vite v8). Network-first for HTML, cache-first for static assets. Versioned cache name. Registered from main.ts only when not running in Capacitor and not on Vite dev. Updated `manifest.json` for Add to Home Screen. |
| **P2** UI haptic feedback | `3593b06` | Global delegated click listener in main.ts fires `haptic.tap()` on every button-like element across the overlay layer. End Day button gets `haptic.medium()`. One handler covers every existing AND future button. |
| **P3** Save backup before overwrite | `bc9af99` | `deleteSlot()` now creates `.bak.<ts>` entries with 48h retention. Title screen surfaces green "Recover '<name>' — Day N, Ch.N (Xh ago)" buttons for empty slots with recent backups. New helpers: `pruneExpiredBackups`, `getRecentBackup`, `restoreBackup`. |
| **P4** chown /var/www/.cache | `3593b06` | EACCES warnings gone from playtests + gemini-cli. Two-minute fix that I should have done weeks ago. |
| **T1** Unit tests for new helpers | `e7ca9ab` | `test/logic-regressions.ts` grew from 4 to 14 tests. New: 6 sanitizer tests (length clamp, control-char strip, HTML pass-through, structure rejection, numeric clamps, cat-array cap), 3 backup/restore/prune tests, 1 migration test. Extended `MemoryStorage` mock with `length` + `key(i)` so iterators work. |
| **T2** Expand XSS regression test | `5f09733` | Test grew from 17 to 33 assertions. Added focused audits for town view, menu panel, achievement panel, and journal display (with payload injection). Reusable `auditDocumentForHostility(label)` helper. |
| **O2** clean:test script | `3593b06` | `npm run clean:test` wipes `test/screenshots/` between runs. |

[x] I added music per todo/music/music-prompts.md to todo/music/shared-leitmotif for the entire game. We may even want to replace all of our existing music with this new music to keep it all cohesive. Further, Suno does have a stems feature now, and I tested it with the tracks in todo/music/Chase 1 - Stone Alley Fur Stems for that song / track. Should we setup the mp3's through the game? Or experiment with the stems first? (discussed in the dynamic music section of todo/room-for-improvement.md) — DONE: 68 tracks copied to public/assets/audio with snake_case names, MusicManager rewritten with per-scene track sets (TRACK_SETS map), jobFlow.ts now calls switchToTrackset(gameType) so each minigame plays its dedicated track, TitleScene plays the title trackset on load. Stems experiment deferred — see todo/ideas/music-stems-experiment.md for the plan.
[x] consider the three model story-audit files and write a final recommendation to todo/story/story-audit-council.md