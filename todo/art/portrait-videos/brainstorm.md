# Portrait video brainstorm

**Source clip:** `wildcat-neutral-zoom-in_*.mp4` — slow zoom-in on the wildcat neutral portrait, with petals drifting through the wind in the foreground. ~5MB MP4.

The video is a *cinematic still*: the camera moves, the petals move, but the cat doesn't. That makes it the wrong fit for any UI surface that the player interacts with for more than 2-3 seconds (eyes glaze over once the loop reveals itself), and the right fit for **transitional moments** where the player is meant to *receive* something rather than *do* something.

## Strongest candidates

### 1. Title screen idle background (best fit)
Replace the static title-screen wildcat sprite-on-a-wall with the video, played as a looping `<video autoplay muted loop playsinline>` element behind the crest + slot picker. The petals add atmosphere; the slow zoom-in feels like the camera "noticing" the cat as the player arrives. The cat being neutral (rather than emoting) leaves room for the player to project onto it — exactly what a title-screen vibe wants.

- **Trade-off:** the existing wall-cat is randomized per breed (now per recruited breed after the 2026-04-08 fix). A video locks it to the wildcat. Could be worth it, since the wildcat IS the player's cat. Or layer the video as a parallax background and keep the sprite cat in front.
- **Capacitor performance:** modern WebView handles 1080p H.264 video fine; ~5MB asset is acceptable in the APK. Fade-in on first frame to hide any decoder warm-up flash.
- **Implementation:** add `<video>` to `index.html` between `#game-container` and `#overlay-layer`, default `display: none`, then `display: block` only on `TitleScene` start (toggle from `TitleScene.create` and the scene shutdown handler).

### 2. Intro story panel — opening shot
The intro story (`showIntroStory` in `onboarding.ts`) currently uses 6 static panels with rain ambience. Replacing the FIRST panel (the lone wildcat in the storm) with the video clip would set the cinematic register for the whole sequence — the camera *finds* the wildcat in the rain, then tap-to-advance moves on. Petals could be reframed as windborne debris in the storm.

- **Trade-off:** petals don't really fit a rainstorm tone unless we colour-grade or add a rain layer over the video.
- **Implementation:** the narrative overlay (`narrativeOverlay.ts`) takes a panel image; extending it to accept `videoSrc` instead is ~10 lines.

### 3. Bond conversation portraits — Wildcat C-rank reveal
When the player first reaches a C-rank bond with the wildcat (the founder), play the video as a one-shot reveal before the dialogue starts. The zoom-in says "you're really seeing this cat for the first time." Subsequent conversations use the static portrait so the moment doesn't lose impact.

- **Trade-off:** wildcat is always in the player's roster, so the founder bond is the easiest to reach — every player will see this. Keeps it short (3-4 seconds) and skip-on-tap.

### 4. Day of Rest — wildcat-themed memory
The Day of Rest panel could carry a "rest" feature where, between minigame cards, the wildcat video plays as a screensaver-style ambient loop. Adds quiet atmosphere matching the "sit a while" framing. Could even cycle through a video pool as more breed videos get generated.

- **Trade-off:** competes with the catalogue grid for attention. Better as the *background* of the panel than as a card.

### 5. Day-end / sleep transition
After the player ends a day, before the day-transition overlay, fade in the video as "the wildcat watches the day close." Reinforces the founder character at the daily rhythm point. Might be too frequent — once per day is ~30 plays per session, which would burn out quickly.

## Things to avoid
- **Job result screens** — too short, too transactional. Cinematic flourishes feel out of place when the player just wants their fish total.
- **Combat scenes** — wrong tone, distracts from gameplay.
- **Loading screens** — Phaser's preload is fast enough that a 5MB video would *add* loading time.

## Recommendation
Start with **#1 (title screen background)** because it's the lowest-friction integration and the highest visibility (every session starts there). If it lands well, extend to **#2 (intro story)** for new-game atmosphere. Hold #3-#5 for a future "video portraits" feature once we have one or two more clips to draw from — variety is the gating factor on those use cases.

Generate 2-3 more clips before committing to the bond/Day-of-Rest paths so the player isn't seeing the same ~5s loop everywhere.
