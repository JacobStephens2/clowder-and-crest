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
