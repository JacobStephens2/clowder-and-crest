# Clowder & Crest — Room for Improvement

Originally a senior-level review by **Gemini 3.1 Pro Preview** (2026-04-07) covering Architecture, Gameplay, and Polish/UX. Verified by Claude against the actual codebase the same day. The original Gemini analysis is preserved at the bottom; the verified verdict + corrected priorities are at the top.

## Verified verdict (2026-04-07)

Of Gemini's 9 suggestions:
- **3 are correct and high-value** — act on these
- **2 are correct but premature** — on the roadmap, do later
- **1 is correct in principle but expensive in practice** — defer
- **3 are wrong, misdiagnosed, or wash** — skip

| # | Suggestion | Verdict | Priority |
|---|---|---|---|
| 1a | XSS in Panels.ts (unescaped `cat.name` in `innerHTML`) | ✅ **TRUE — real bug** | **Do now** |
| 1b | Use `this.scale.width/height` instead of `GAME_WIDTH/HEIGHT` | ❌ **WRONG — misdiagnosed** | Skip |
| 1c | Move minigame tuning numbers from TS to JSON | ⚠️ Trade-off doesn't favor it for a solo TS dev | Skip |
| 2a | Cloud Save Sync via Firebase/Supabase | ⚠️ Same arguments as the LLM plan we just held off | Defer |
| 2b | Individual Cat Rooms | ✅ Already on roadmap, real late-game sink | Do later |
| 2c | Big Cats (Lynx, Lion, Leopard) | ✅ Already on roadmap, art prompts ready | Do later |
| 3a | Dialogue Portraits via Midjourney | ✅ Already in flight, biggest visual win | **Do now** |
| 3b | CSS transitions / "juice" on HTML overlays | ✅ Cheap, high perceived-polish ROI | **Do now** |
| 3c | Dynamic music layering per minigame intensity | ⚠️ Higher cost than implied; Suno pipeline doesn't expose stems | Skip |

## Do now (high ROI)

### 1a — Fix XSS in `src/ui/Panels.ts` (~5 minutes)

**The bug:** `Panels.ts` doesn't import `esc()` and inlines `cat.name`, `item.name`, achievement names, and `catA.name`/`catB.name` into `innerHTML` and HTML attributes at 6+ sites:

- `Panels.ts:75` — cat-card-name in `showCatPanel`
- `Panels.ts:126` — bond pair display `${catA.name} & ${catB.name}`
- `Panels.ts:190, 192` — rename prompt: `<h2>Rename ${cat.name}</h2>` AND attribute values `placeholder="${cat.name}" value="${cat.name}"`
- `Panels.ts:486, 534` — shop item names

`CLAUDE.md` documents the `esc()` invariant; Panels.ts silently violates it. A player who renames a cat to `<img src=x onerror=alert(1)>` triggers execution every time the cat panel opens.

**Practical exploit risk is low** — the only attacker is the player attacking themselves (saves are local-only, no sharing, no cloud sync). But it's still a real bug:
- Violates a documented invariant
- Silently breaks rendering for any innocent name with `<` or `&` characters
- **Becomes a real exploit if save sharing or cloud sync are ever added** (and Gemini's #2a in this same review proposes cloud sync — fixing this first is the right ordering)

**Fix:** Import `esc()` (it's defined in `main.ts:65` — should be promoted to `src/utils/helpers.ts` and imported from there) and wrap each user-content interpolation. Build + smoke test.

### 3a — Dialogue Portraits via Midjourney (~ongoing)

Already pointed at this. The infrastructure is in place:
- `src/ui/Conversations.ts` `setPortrait()` helper with pixel-sprite fallback (no code changes needed as portraits are generated)
- `todo/ideas/art/dialogue-portrait-prompts.md` — 30 ready-to-paste Midjourney prompts (6 game breeds × 5 expressions)
- `todo/ideas/art/dialogue-portraits-pipeline.md` — workflow, processing script, validation checklist

**Action:** generate the 18 minimum-viable portraits (6 breeds × 3 core expressions: neutral / happy / serious-or-sad) via Midjourney. Drop into `todo/portraits-raw/`. Then someone (Claude Code) processes them with the Pillow script and installs into `public/assets/sprites/portraits/`. The dialogue overlay picks them up automatically.

**Why this is the #1 visual improvement:** Bond conversations are the emotional payoff of the entire game (45 pair conversations + 3 group conversations) and they currently render scaled-up pixel sprites instead of expressive character art. Fire Emblem itself uses this exact contrast (pixel battle sprites + painted dialogue art) and the visual register shift signals "this is a quiet moment that matters."

### 3b — CSS transitions on the HTML overlay layer (~2 hours)

Real point Gemini correctly identifies: the Phaser canvas has tight game-feel (haptics, hit-stops, particles, screen flash) but the HTML overlays are static. The contrast feels uneven.

**File:** `src/ui/overlay.css`

**Suggested additions:**
- `transition: transform 0.15s, opacity 0.15s` on `.nav-btn`, `.job-card`, `.cat-card`, `.shop-item`
- Hover scale: `transform: scale(1.02)` on hover for tappable elements
- Press feedback: `transform: scale(0.98)` on `:active`
- Panel entry: `@keyframes panel-fade-in` on `.panel`, `.cat-panel`, `.job-panel`, `.shop-panel`
- Status bar value changes: brief gold flash when fish count increases
- Toast slide-in from bottom instead of fade

Most of these are 5-line CSS additions. The whole pass is probably ~2 hours for a noticeable polish bump across every screen.

## Do later (medium effort, real value)

### 2c — Big Cats (Lynx, Lion, Leopard) (~6-8 hours)

Already on `CLAUDE.md`'s "What's Not Implemented Yet" list. Path:
1. Generate in-game pixel sprites via PixelLab (prompts already in `todo/ideas/art/art-prompts.md`)
2. Add to `src/data/breeds.json` with stat biases (Lynx → strength+perception, Lion → charisma+leadership, Leopard → stealth+agility)
3. Add to `src/scenes/BootScene.ts` preload
4. Write conversation entries (6 new pair bonds with each existing breed = 18 new pair conversations per big cat)
5. Wire chapter unlock gates per CLAUDE.md design (Lynx → ch.6, Lion → ch.7, Leopard → Detection jobs)

Easiest of the deferred items. Expands the cast meaningfully.

### 2b — Individual Cat Rooms (~10-15 hours)

On the roadmap. Real late-game economy sink. Real build cost:
- New per-cat room data model in save schema (with migration for existing players)
- New furniture-per-cat decoration UI
- Mood/stat tying logic per furniture combination
- Room navigation in the guildhall scene
- Possibly new room art for personalized themes

Bigger undertaking but well-defined. Worth doing after dialogue portraits + CSS juice land.

## Defer

### 2a — Cloud Save Sync

**Same arguments we just used to hold off the LLM integration plan:**
- Requires backend infrastructure that doesn't exist
- Creates ongoing ops surface (database, auth, conflict resolution)
- Real cost / quota management
- Cross-device players don't yet exist as a real audience
- The Capacitor offline experience is a positive to preserve

**One nuance Gemini missed:** there's a *cheaper* path Gemini didn't mention — **Capacitor's native iCloud / Google Drive cloud save APIs**. Those don't need a custom backend; they pipe to the OS-level cloud save service. They only work on the native app (not web), but they're zero-ops and free. If/when you do cloud save, do that, not Firebase/Supabase.

**Trigger to revisit:** when you actually have multi-device players asking for it, OR when you're adding a server backend for another reason and cloud save becomes incremental rather than greenfield.

## Skip

### 1b — Phaser magic numbers / `this.scale.width`

**Gemini misunderstood the Phaser scale system.** The game uses `Phaser.Scale.FIT` + `Phaser.Scale.CENTER_BOTH` (`src/main.ts:86-87`). This means the canvas is scaled to fit any screen while preserving the 390×844 design coordinate space. Letterboxing handles aspect ratio mismatches automatically.

`FIELD_TOP = 160` and `GAME_WIDTH / 2` are exactly the right pattern when using FIT mode — they're coordinates in the *design space*, and Phaser scales them to whatever viewport the device has. Switching to `this.scale.width / this.scale.height` would actually break the layout because those are runtime-dependent and would compute differently after FIT scaling.

The current code is correct. **Skip.**

### 1c — Tuning numbers from TS to JSON

True that minigame escalation curves are hardcoded in the TypeScript logic. The trade-off:
- **Pro:** faster iteration on game balance, designer-collaborator-friendly, no recompile needed
- **Con:** loses TypeScript type safety, loses IDE refactoring/jump-to-definition, adds JSON validation logic, JSON authoring is annoying for nested structures, slower runtime lookup

For a solo author who's comfortable in TypeScript and not iterating live in production with non-coder collaborators, the benefits are weak. Revisit if you ever take on a designer who doesn't write code.

### 3c — Dynamic music layering per minigame intensity

The idea is real (Stardew Valley does this well). But the implementation path is harder than Gemini implies:
- **Suno doesn't natively expose stems** for layering
- You'd need either a different generator (Stable Audio, Mubert) OR manually composed layered tracks in a DAW
- `MusicManager` would need new APIs for crossfade, layer add/remove, beat sync
- Each minigame would need 2-3 layered variants of its track

For a solo author with a Suno-based pipeline, this is a multi-week project, not a polish pass. The simpler alternative — composing tracks with built-in dynamic intensity (sparse opening → busier mid-track) — is what you're already doing per `todo/ideas/music/music-prompts.md`.

If you ever migrate away from Suno to a stems-capable generator, revisit.

---

## Claude's additional candidates (2026-04-08)

After verifying Gemini's review and fixing the XSS, I noticed several additional things worth considering. These come from working *inside* this codebase across the full session — different vantage point than a one-shot external review. Gemini didn't catch these because they're either operational, only visible after spending time in the code, or surfaced by the XSS regression test I just wrote.

### Architecture / correctness

**A1. `main.ts` is still the central god-file (1849 lines).** Down from ~2640 in the recent splitting pass — so you've already started — but it still does scene routing, save management, day-loop logic, journal entry construction, achievement detection, chapter progression hooks, panel orchestration, and ~15 different innerHTML overlay builders. The 5+ overlay builders (`suggestEndDay`, `showCrisisDialog`, the Inquisition exile picker, the wish banner, `showJobBoard`'s town view) could each move into `src/ui/overlays/<name>.ts` modules with a 30-minute extraction. Day loop logic (`advanceDay`, food cost, mood drops, plague escalation, stationed earnings) could move into `src/systems/DayLoop.ts`. The result would be a `main.ts` that's mostly wiring + event subscriptions, ~400 lines.

Why this matters more than the typical "split a big file" advice: every XSS site I just fixed was inside an overlay builder buried in `main.ts`. Splitting them out makes audits like the one I just did dramatically faster — instead of grepping the whole god-file, you grep one focused module per overlay.

**A2. Save export / import path needs the same XSS audit Panels.ts just got.** The menu has Export Save and Import Save buttons. The XSS regression test I wrote (`test/xss-regression-test.mjs`) plants payloads into a save and verifies the cat panel + rename prompt escape correctly — but it doesn't cover the *import* flow. If a player imports a JSON file from somewhere they shouldn't, the imported `gameState` flows into every overlay that renders cat names. Most are now safe after this commit, but a focused audit + a regression test that uses the actual Import Save button would prove it.

The simplest defense-in-depth: **sanitize untrusted save fields at import time** rather than trusting every render site to escape. A `validateAndSanitizeSave()` helper that strips/escapes known string fields (`cats[].name`, `playerCatName`, journal entries) on import would mean future overlay builders don't have to remember.

**A3. Save format versioning has `version: 2` but no visible migration code path.** `CLAUDE.md` documents "missing fields backfilled, saves never destroyed on updates" — that's true for *additive* schema changes (a new field defaulted to a sensible value). It's NOT true for renames or type changes. If you ever rename `playerCatName` to `playerName`, change `mood` from string to enum, or restructure `bonds[]`, the loaders need explicit migrations and the version number needs to bump. Worth a one-time audit: write `migrateSave(save: any): SaveData` with explicit `if (save.version === 1) {...}` blocks, and have it called from `loadGame` and `loadFromSlot`. Currently both call sites trust the schema.

**A4. Phaser chunk is still 1.18 MB ungzipped (314 KB gzipped) even after the recent code splitting.** That's the dominant chunk in the build. Phaser supports tree-shaking via its granular subpath imports (`phaser/src/scenes/Scene` instead of `phaser`), but you'd need to import only what you actually use. The current `import Phaser from 'phaser'` brings in particles, tilemaps, networking, video, audio decoders, etc. — most of which the game doesn't touch.

This is a meaningful effort (you'd refactor every scene's import statements), but it could plausibly cut the chunk by 30-50%. **Defer until you actually have a load-time problem** — currently the game's first paint is fast on the test phones I've seen.

### Tests / quality

**T1. Zero targeted unit tests for the gameplay-critical pure functions in `main.ts` and `systems/`.** The 14 minigame playtests are valuable but they're end-to-end — they exercise scene mechanics, not the day-loop math. Functions like `advanceDay`, `processDailyBonds`, `applyReputationShift`, `checkChapterAdvance`, `getDailyWish`, `getJobFlavor`, and the bond rank threshold logic are pure-ish and edge-case-prone. A `test/unit/` folder with focused tests for these (~200 lines total) would catch regressions faster than the slow end-to-end playtests.

Examples of edge cases that should be unit-tested:
- Broke 2 days in a row → cat leaves
- Plague active for 8 days → escalation cap behavior
- Bond hits exactly 25 (companion threshold) → rank-up reward applied once
- Reputation crosses 0 → tier flip
- Specialization choice locks in after N consecutive same-category jobs

These take seconds to run vs. ~30s per minigame playtest.

**T2. The XSS regression test should grow.** The version I just committed covers the cat panel and rename prompt. The same payload-planted save would also exercise:
- The achievement panel (already escaped, but no test verifies it)
- The shop panel (item names — already escaped, no test verifies it)
- The journal display (already escaped, no test verifies it)
- The conversation overlay (already escaped, no test verifies it)
- The town/job board view (cat name in stationed badges, already escaped, no test verifies it)

Each is a ~10-line addition to `xss-regression-test.mjs`. The hooks I installed (`__xssFired` setter trace + `Element.prototype.innerHTML` writer trace) make new assertions cheap. **Worth doing as a single follow-up batch** so the regression test is comprehensive rather than just covering the two flows we happened to look at.

**T3. The XSS regression test took 4 cycles to localize the bug because of stale state issues** (slot picker XSS fired during *guildhall load*, before the test ever opened the cat panel). The lesson: future security tests should add **localized assertions at every state transition** (post-title, post-load, post-tab-switch, etc.) rather than only at the end. The current test does this for the XSS flag but not for other invariants. Worth generalizing into a small helper.

### Polish / UX

**P1. Service Worker / PWA for the web build.** The Capacitor APK is fully offline-capable. The web version at `clowderandcrest.com` is not. Adding `vite-plugin-pwa` would give web players the same offline experience plus an "Add to Home Screen" install prompt. ~1 hour of work, would also improve return-visit load time via cache.

This is the closest thing to "making the web version match the native build" — and the native build is a real differentiator on the portfolio.

**P2. Haptic feedback on UI navigation.** The native haptic system fires on game beats (kills, perfects, fails, lock clicks). It does NOT fire on:
- Bottom nav button taps (Guild / Town / Cats / Menu)
- Panel opens
- Job card taps
- Shop item selections
- Cat selection
- Slot picker buttons

That's a one-line `haptic.tap()` per click handler. ~30 minutes for the whole UI layer. On a haptic-capable phone, this is the difference between "feels like a webview" and "feels like a native app."

**P3. "Save backup before overwrite" pattern.** When the player picks New Game on an occupied slot, the existing save is deleted via `deleteSlot()` after a single browser `confirm()` dialog. One slip and a hundreds-of-days save is gone. Safer pattern: on delete, rename the slot's localStorage key to `<key>.bak.<timestamp>`, keep it for 24-48 hours, surface a "Recover deleted save?" prompt on title screen if a recent .bak exists. ~30 minutes of code, prevents real player heartbreak.

**P4. The `/var/www/.cache` EACCES warning fires on every gemini-cli run AND every game playtest.** It's noise that pollutes test output and makes real warnings harder to spot. Two-minute fix:

```bash
sudo chown jacob:jacob /var/www/.cache
```

Or `cd ~ && gemini` if you want to keep that dir root-owned. Worth doing once just to clean up the test output.

### Operational

**O1. Capacitor plugin update cadence.** The 4 native plugins (`@capacitor/haptics`, `/local-notifications`, `/app`, `/status-bar`) are at 8.x. Capacitor releases monthly. Worth a quarterly check + `npm update @capacitor/*` + APK rebuild + native lifecycle smoke test.

**O2. Test screenshot folder cleanup.** `test/screenshots/` accumulates output from every playtest run (smoke, bond, brawl, hunt, courier, dungeon, fishing, heist, hunt, nonogram, patrol, pounce, puzzle, ritual, scent, sokoban, stealth, conversation, xss, portfolio = ~20 subfolders, each with multiple PNGs per run). Currently gitignored but grows unbounded locally. A `npm run clean:test` script that wipes `test/screenshots/*` would help, OR a `--clean` flag on the runner.

### Skipped (real but lower priority)

I considered and rejected these because the cost-benefit doesn't favor doing them now:

| Item | Why skip |
|---|---|
| TypeScript strict mode pass | The codebase is already mostly type-safe; the remaining `as any` and `!` assertions aren't bug sources. Real refactoring effort for marginal gain. |
| Accessibility audit (ARIA, keyboard nav, focus management) | Matters when shipping to a non-niche audience. Currently the audience is portfolio visitors who'll click around for 30 seconds. Revisit if the game gets a real player base. |
| i18n / localization readiness | Premature. Strings are scattered across TS + JSON; refactoring to a string table is meaningful work for zero current value. |
| Music volume normalization | Suno-side problem, not a code problem. The right fix is in the music generation prompts in `todo/ideas/music/music-prompts.md` (which the user is already iterating on). |
| Per-cat decoration rooms | This is Gemini's #2b which I already flagged as "Do later" — same item, no need to duplicate. |
| Replace innerHTML with Preact / Svelte (Gemini's #1a "fix") | Gemini suggested this as the proper fix for XSS. I rejected it because the actual fix (escape at interpolation sites) is 2 hours of work and 0 dependencies, vs. introducing a reactive framework which would be a multi-week port + a real bundle size cost. The XSS bug is now fixed without it. |

### Suggested new priority order

After Gemini's items + my additions, the do-now order I'd recommend:

1. ✅ **Fix XSS** (done, committed)
2. **A2. Save import sanitization** (closes the remaining XSS surface — same regression test pattern)
3. **3a. Dialogue portraits** (already in flight, biggest visual win, generate the 18 priority portraits via Midjourney)
4. **3b. CSS overlay juice** (~2 hours, big perceived polish gain)
5. **P2. UI haptic feedback** (~30 minutes, native app feel)
6. **T1. Unit tests for day-loop math** (~3 hours, catches future regressions cheaply)
7. **P1. Web PWA / Service Worker** (~1 hour, makes the web build match native offline capability)
8. **A1. Extract overlay builders from main.ts** (~3 hours of focused refactoring, makes future audits faster)
9. **2c. Big Cats** (already on roadmap, ~6-8 hours)
10. **2b. Individual Cat Rooms** (already on roadmap, ~10-15 hours)

The first 5 items (XSS done + items 2-5) are all high-ROI and total ~6-8 hours. Doing all of them as one focused pass would produce a noticeably more polished game without any large refactors.

---

## Original review (preserved verbatim)

The text below is Gemini 3.1 Pro Preview's original review as written, before the verification pass above. Kept for reference and attribution.

---

# Clowder & Crest - Room for Improvement

Based on a review of the `README.md`, TODO files, architecture notes, and the codebase (specifically `HuntScene.ts`, `CatManager.ts`, and `Panels.ts`), here is a senior-level assessment of the areas with the most room for improvement for **Clowder & Crest**. 

These are divided into Architecture, Gameplay/Content, and Polish/UX.

## 1. Architecture & Tech Debt

Your hybrid Phaser Canvas + HTML/DOM approach is an excellent choice for crisp UI, and your resilience testing (the Playwright playtest suite) is incredibly impressive. However, there are a few architectural strains starting to show:

*   **Manual DOM Construction & XSS Risks:** You are building complex DOM overlays (like `src/ui/Panels.ts`) using manual string concatenation (`html += ...`) and `innerHTML`. 
    *   *The issue:* This approach is fragile as the UI grows. More importantly, it creates XSS vulnerabilities. Your `CLAUDE.md` explicitly notes that user-provided names are escaped with `esc()` to prevent injection, but `src/ui/Panels.ts` skips the `esc()` wrapper in methods like `showCatPanel` and `showRenamePrompt` (e.g., `<div class="cat-card-name">${cat.name} ...`). If a player enters `<img src=x onerror=alert(1)>`, it will execute.
    *   *The fix:* Consider introducing a minimal reactive library (like **Preact** or **Svelte**) for the UI layer, or at least a strict DOM-building utility function. This will clean up the code, enforce escaping automatically, and make maintaining state-heavy panels (like the Shop or Cat Panel) much easier.
*   **Hardcoded Magic Numbers in Scenes:** In scenes like `HuntScene.ts`, you are using absolute positioning (`FIELD_TOP = 160`, `GAME_WIDTH / 2`). Because the game relies heavily on mobile/Capacitor, adopting dynamic anchoring (relative to `this.scale.width` and `this.scale.height`) will handle ultra-wide or exceptionally tall modern phone screens much better than standard canvas scaling.
*   **Hardcoded Tuning:** Minigame escalation curves (like `getVisibleTime()` in the Hunt scene) are hardcoded in the TypeScript logic. Moving these balance numbers into your existing `data/` JSON structure would allow you to quickly tweak game feel across all 14 minigames without recompiling the logic.

## 2. Gameplay & Feature Completeness

Based on your design goals and TODO lists, a few missing systems stand out as high-impact areas to tackle next:

*   **Cloud Save Syncing:** For a daily-life sim that players might play on their phone during a commute and desktop at home, relying strictly on `localStorage` with manual JSON export/import is a friction point. Adding a lightweight backend sync (via Firebase, Supabase, or Apple/Google's native cloud saves through Capacitor) would be a massive UX win.
*   **Guildhall Progression Sinks:** You have "Individual cat rooms" on the roadmap. Right now, the economy loop might stall in the late game once the player buys the main rooms. Letting players decorate individual rooms (and tying mood/stat bonuses to those specific furniture combinations) gives a fantastic late-game "fish sink."
*   **Completing the Roster:** Adding the "Big Cats" (Lynx, Lion, Leopard) mentioned in `claude-todo.md` will provide great late-game aspiration targets that require the player to heavily utilize the Shadow/Noble reputation systems.

## 3. Visual Polish & "Juice"

The game is mechanically rich, but the presentation could bridge the gap between "web game" and "premium mobile game":

*   **Dialogue Portraits:** You're already exploring this in `jacob-todo.md`—migrating from the tiny pixel art to the Midjourney-generated, screen-filling expression variants (Fire Emblem style) for the Bond conversations. This is the **#1 visual improvement** you can make. The emotional weight of the narrative will multiply when players see large, expressive character art during C/B/A rank conversations.
*   **DOM Layer "Juice":** While your Phaser canvas has great game feel (haptics, screen shakes, hit-stops, particle bursts), your HTML UI layer feels a bit static. Adding CSS transitions (e.g., slight `transform: scale(1.02)` on job card hover, smooth fade-ins for panels, or standardizing button press animations) will unify the feel between the Canvas world and the UI.
*   **Audio Variety:** The TODO mentions adding music into the folders. Expanding the `MusicManager` to dynamically switch layers or intensity based on the minigame's progression (e.g., adding a drum track to `CourierRunScene` as the speed escalates) would massively elevate the tension.

---

### Summary
Your foundation is incredibly strong—14 bespoke minigames unified under a cohesive management loop is no small feat. Suggested priorities:
1. Fix the `innerHTML` unescaped variable bugs in the UI.
2. Integrate the high-res Midjourney dialogue portraits to give the game a premium visual identity.
3. Build out the "Individual Cat Rooms" to solidify the late-game economy.
