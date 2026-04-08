# Clowder & Crest — Room for Improvement - Claude Opus 4.6

Originally a senior-level review by **Gemini 3.1 Pro Preview** (2026-04-07) covering Architecture, Gameplay, and Polish/UX. Verified by Claude against the actual codebase the same day. The original Gemini analysis is preserved at the bottom; the verified verdict + corrected priorities are at the top.

## Status as of 2026-04-08

**Most of the do-now batch shipped on 2026-04-08.** What's done, what's left, and what's intentionally deferred:

### ✅ Done

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

### ⏳ Open

| Item | Why still open |
|---|---|
| **3a** Dialogue portraits via Midjourney | Needs the user to actually generate the 18 priority portraits in Midjourney (the prompts file at `todo/art/dialogue-portrait-prompts.md` is ready). The Conversations.ts scaffold with `setPortrait()` + pixel-sprite fallback was committed in `164644c` — drop the PNGs in and they appear automatically. |
| **2c** Big Cats (Lynx/Lion/Leopard) | Needs PixelLab generation + breed JSON entries + conversation scripts + chapter unlock gates. ~6-8 hours of focused work. Art prompts in `todo/art/art-prompts.md`. |
| **2b** Individual Cat Rooms | Bigger feature (~10-15 hours). New per-cat room data model in save schema, decoration UI, mood/stat tying logic, save migration. Worth doing after dialogue portraits land. |

### ⏸ Intentionally deferred

| Item | Trigger to revisit |
|---|---|
| **2a** Cloud Save Sync | When real multi-device players exist or a server backend is being added for another reason. Use Capacitor's native iCloud / Google Drive APIs, not a custom Firebase/Supabase backend. |
| **A4** Phaser tree-shaking | When the 1.18 MB chunk is causing actual load-time problems on real devices. Currently fine. |
| **O1** Capacitor plugin update cadence | Quarterly. Operational, not engineering. |
| **3c-stems** Suno stems experiment | The static music migration just landed — let it sit. Revisit when a real player says the chase/brawl/hunt music feels static, OR when stems support has matured further in Suno. Plan documented at `todo/ideas/music-stems-experiment.md`. |

### Skipped per the doc's own analysis

`1b` Phaser scaling (Gemini misdiagnosed), `1c` JSON tuning (trade-off doesn't favor it for solo TS dev), Gemini's "Replace innerHTML with Preact/Svelte" (the targeted `esc()` fix is 0 deps and 2 hours; a reactive framework port is multi-week + bundle cost), TypeScript strict mode pass, accessibility audit, i18n readiness, music volume normalization. Reasoning preserved in the original Claude's-additions section below.

---

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
| 3c | Dynamic music layering per minigame intensity | ⚠️ Suno now exposes stems (12-stem extraction, June 2025) — viable, with caveats | Try one track |

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

**Updated 2026-04-08:** The previous note here said *"Suno doesn't natively expose stems"* — that was outdated. Suno added stem extraction in mid-2024 and shipped 12-stem extraction in June 2025. This meaningfully changes the picture.

**What Suno's stem extraction actually does:**
- Up to **12 separated stems** from any generated track (vocals, backing vocals, drums, bass, guitar, keys, strings, brass, woodwinds, percussion, synth, FX)
- Download individual stems, mute/solo during playback, or download all at once
- Pricing: full 12-stem extraction = 50 credits; simpler Vocals + Instrumental split = 10 credits
- See `help.suno.com/en/articles/6141441` for details

**What this enables for Clowder & Crest:**
- Extract stems from e.g. Chase 1 - Stone Alley Fur and get isolated fiddle, bodhrán, and harp tracks as separate MP3/WAV files
- Use them in `MusicManager` as **independently controllable audio layers** — start with just bodhrán at low intensity, fade in fiddle at mid intensity, bring in the full ensemble at peak intensity
- Stardew Valley-style dynamic layering without needing a different generator or a DAW

**The catch — stem quality is imperfect:**
- Suno generates a single mixed audio file, then uses post-processing AI to split it afterward. It doesn't have access to the original "unmixed" layers
- Users report **bleed between stems** (instruments leaking into each other's tracks), comb filtering, and missing frequency information. The separation is AI estimation, not a true unmix
- For acoustic Celtic instruments (lute, fiddle, bodhrán) that overlap heavily in the mid-frequency range, bleed could be more pronounced than it would be for a pop track with distinct drums vs. vocals

**The workflow it unlocks:**
1. Generate a track → Extract 12 stems (50 credits)
2. Download the stems that matter (e.g., percussion-only, strings-only, full instrumental)
3. Load 2-3 of those stems into the game as layered audio sources
4. Crossfade or add/remove layers in `MusicManager` based on minigame intensity

**Revised assessment:** This is no longer a multi-week migration to a different generator — it's a **legitimate path** for the existing Suno-based pipeline. The implementation is still post-processing (not true native stems), so quality will vary, especially for the mid-heavy Celtic instrumentation, but it's worth a one-track experiment before committing.

The real remaining work is on the `MusicManager` side — adding crossfade and layer APIs — but you'd have actual stem files to work with from your existing tracks. That's no longer hypothetical.

**Suggested next step if you want to try it:** pick one minigame (Courier Run is the obvious candidate — it has explicit speed escalation), extract stems from its current Suno track for 50 credits, listen to the bleed quality on Celtic stems, and decide whether to invest in the `MusicManager` layer API. Total cost to validate: ~$1 of Suno credits + 30 minutes of listening.

**Update 2026-04-08:** the user *did* extract stems for the Chase track (`todo/music/Chase 1 - Stone Alley Fur Stems/`, 6 layers: drums, bass, guitar, percussion, synth, other). The stems experiment is now documented in detail at `todo/ideas/music-stems-experiment.md` with the Web Audio API approach, the StemMixer class sketch, the iOS compatibility risks, and a "when to revisit" trigger list. **Deferred** for now because the static 68-track migration just shipped (`26f331e`, `f3182ee`) — let it sit in production before stacking another music change on top.

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

**Original list (2026-04-07).** Items 1-7 from the original "do now" batch are all now committed. Updated remaining priority below.

1. ✅ **Fix XSS** (`9ea01a9` — also caught 7 sites Gemini didn't flag)
2. ✅ **A2. Save import sanitization** (`bc9af99`)
3. ⏳ **3a. Dialogue portraits** — needs Midjourney generations from the user
4. ✅ **3b. CSS overlay juice** (`5f09733`)
5. ✅ **P2. UI haptic feedback** (`3593b06`)
6. ✅ **T1. Unit tests for day-loop math** (`e7ca9ab` — partial: 10 new tests cover sanitizer + backup helpers, NOT yet the advanceDay edge cases)
7. ✅ **P1. Web PWA / Service Worker** (`5f09733`)
8. ✅ **A1. Extract overlay builders from main.ts** (`5dc291c` — partial: 2 of ~6 done, advanceDay extraction still pending)
9. ⏳ **2c. Big Cats** — still needs PixelLab + code work
10. ⏳ **2b. Individual Cat Rooms** — still ~10-15 hours of focused work

### Updated priority order (2026-04-08)

The do-now batch is essentially shipped except for the items that need user-generated assets (portraits, big-cat sprites). The honest next priorities:

1. **3a. Dialogue portraits** — user generates 18 portraits in Midjourney from `todo/art/dialogue-portrait-prompts.md`, drops them in `public/assets/sprites/portraits/`, the existing `setPortrait()` in Conversations.ts picks them up automatically. Biggest visual win on the table.
2. **2c. Big Cats** — user generates pixel sprites in PixelLab from prompts in `todo/art/art-prompts.md`, then ~4 hours of code (breeds.json, BootScene preload, conversation scripts for the new pair bonds, chapter unlock gates).
3. **A1-rest. Extract advanceDay → systems/DayLoop.ts** — but FIRST add unit-test coverage for advanceDay's edge cases (broke 2 days in a row, plague escalation cap, mood drop chain, starvation game over, chapter advance at exact threshold). Without that coverage the extraction is too risky to do quickly.
4. **2b. Individual Cat Rooms** — biggest remaining feature. Worth doing after dialogue portraits land.
5. **T1-rest. advanceDay edge-case unit tests** — listed as a sub-item of #3 above but worth doing standalone even without the extraction.

The "5-item batch ~6-8 hours" framing from yesterday is no longer the right shape — almost all of those items are done. The remaining work splits cleanly into "user-asset bottleneck" (3a, 2c) vs "needs more test coverage before refactor" (advanceDay).

---

## Original review (preserved verbatim)

The text below is Gemini 3.1 Pro Preview's original review as written, before the verification pass above. Kept for reference and attribution.

---

# Clowder & Crest - Room for Improvement - Gemini 3.1 Pro

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
