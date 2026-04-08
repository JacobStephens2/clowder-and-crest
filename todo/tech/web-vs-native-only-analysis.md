# Should we drop web support and ship native-only?

**Recommendation: Keep web. The friction you've felt isn't caused by web support — it's caused by mobile WebView quirks that would still exist in a native-only build.**

---

## What "web support" actually costs you

Searching the codebase for web/native branches turned up only **4 files** with platform conditionals:

| File | Web vs native code |
|---|---|
| `src/systems/NativeFeatures.ts` | The whole file is a facade — every export checks `isNative()` and silently no-ops on web. ~15 guard clauses. |
| `src/main.ts:177-185` | Service worker registration skipped on Capacitor + Vite dev. ~8 lines. |
| `src/scenes/TitleScene.ts:237` | One `isNative()` check for an Android-specific UI affordance. |
| `src/ui/Panels.ts:430` | One `isNative()` check for the export-save share-sheet path. |

**That's it.** Roughly 30 lines of conditional logic across the entire codebase. The Phaser game itself, the scenes, the save system, the music, the UI overlays — all run identically in both targets. There is no "web build" with different code; there is one bundle and the platform checks decide whether to try a native plugin or no-op.

Removing web support would let you delete those ~30 lines and the service worker. That's the entire savings.

## What's actually causing the bugs you've been tuning

Looking at the bugs we've fixed in the last few sessions:

| Bug | Cause | Would native-only have prevented it? |
|---|---|---|
| Joystick "stays pointing down" | Phaser's lazy `pointer.worldX` between touch events + dominant-axis bias | **No.** Same Phaser, same Capacitor WebView, same input quirks. |
| Patrol prowler tap zones don't follow visuals | Plain Phaser bug — interactive zones aren't auto-parented to containers | **No.** Pure game logic. |
| Day of Rest click-through to underlying scene | DOM overlay vs Phaser canvas pointer event ordering in Capacitor WebView | **No.** This IS a Capacitor-specific bug. |
| Tutorial highlight breaks #bottom-bar | DOM `style.position = relative` left set after cleanup | **No.** Plain DOM bug, same in both. |
| Pounce out-of-shots no exit | Auto-timer fragility, no explicit Continue button | **No.** Game logic. |
| Bottom nav at top after intro | Same as above — DOM cleanup bug | **No.** |
| Roof Scout first platform unreachable | Physics tuning + level layout mismatch | **No.** Game logic. |
| OTA stale manifest | Apache cache headers (we removed OTA) | **No** (and we already removed it). |
| Black screen after DPR scaling | Camera centering missed | **No.** Phaser config, same on both. |

**Zero of these bugs were caused by maintaining web support.** Almost all of them are either pure game logic OR Capacitor WebView quirks that would still happen in a native-only build. The few DOM-related ones (tutorial highlight, bottom nav) would be IDENTICAL in a Capacitor build because Capacitor IS a WebView — it runs the same DOM and CSS as a desktop browser.

## What you'd actually lose by dropping web

- **Distribution.** clowderandcrest.com is the showcase URL on your portfolio. Anyone — recruiters, friends, /r/incremental_games — can play in a browser without sideloading an APK that Android flags as "harmful".
- **iOS reach.** You can't ship to iOS without an Apple Developer subscription ($99/year) and a Mac for code signing. Web is the *only* path to iOS players right now.
- **Faster iteration.** `npm run dev` + Vite HMR vs. `cap sync && gradlew assembleDebug && adb install` (~60s loop vs ~5s loop).
- **Bug repro by URL.** Can share a link with a query string to reproduce a bug, can't share an APK hash.
- **The Playwright playtest pipeline.** All your `test/*-playtest.mjs` scripts drive a real Chromium browser. They'd break or need to migrate to a different runner if there's no web build to point at.
- **Service worker / PWA install.** Free "Add to Home Screen" install path on Android Chrome.
- **Discoverability.** Search engine crawlable; APKs aren't.

## What's the cost of *keeping* web?

- **Re-test surface.** Every change should ideally be tested in both. In practice, the playtests catch most issues and the APK build is ~30s, so you can defer device testing until milestones.
- **Service worker cache invalidation.** Has bitten us once (the OTA manifest). Now mitigated by Vite's content-hashed asset filenames + the `cache-control: no-cache` rule on the SW itself.
- **The 30 lines of platform branches** above. Trivial.

Net cost: **~30 minutes of testing surface per release**, in exchange for everything in the "what you'd lose" list.

## When it WOULD make sense to drop web

If any of these become true, revisit:
1. **You go commercial-only.** App Store + Play Store distribution, paid product. The web build becomes a piracy vector instead of a marketing channel.
2. **You start shipping plugins web can't host.** E.g., a native cloud-save provider with a real backend, or DRM, or ARCore. Right now you're not.
3. **The web bundle becomes a security/spoiler concern.** It currently isn't — the source is on GitHub anyway and the showcase save unlocks everything.

None of these are true today. Conclusion stands: keep web.

## What WOULD reduce the tuning headaches

The real wins (in priority order):

1. **Stop relying on Phaser's `pointer.worldX` for any input math.** It's a lazy getter that drifts. Use `pointer.x/y` (canvas coords) and translate at the boundary. We just did this for the joystick — same bug pattern could exist in other scenes (TownMap, Room, Brawl). One pass to audit and convert would prevent future copycats.
2. **Centralize DOM-overlay-vs-Phaser-canvas pointer event handling.** The Day of Rest click-through bug exists because DOM overlays don't pause the underlying Phaser scene. We added scene-pause for Day of Rest specifically. A reusable helper (`pauseScenesWhile(panel: HTMLElement)`) would prevent this from recurring on every new modal.
3. **Standardize the "scene exit" pattern.** The Pounce out-of-shots bug came from each scene rolling its own delayed-call exit logic. A `showSceneOutcomeBanner` exists in `sceneHelpers.ts` already; extending it to *also* handle the auto-timer + tap-anywhere-to-exit would mean future scenes can't have this bug.
4. **More tests at the input boundary.** The current playtests inspect game state but don't simulate touch input through Phaser's actual pipeline. A test that fires `pointerdown` events at known coordinates and asserts the resulting game state would catch input bugs before manual playtest.

None of those require dropping web support. They're code-quality improvements that pay off in both targets.

---

## TL;DR

Keep web. The ~30 lines of platform conditionals + service worker are not why you're tuning bugs. The bugs come from mobile touch input nuances and DOM/canvas event ordering that would still exist in a Capacitor-only build, because Capacitor *is* a WebView. Dropping web costs you the showcase URL, iOS reach, the playtest pipeline, and refresh-to-test iteration speed. Worth it only if you go fully commercial.
