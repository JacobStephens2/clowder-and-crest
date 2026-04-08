# Minigame Mode Implementation Plan

## Goal

Add a secondary title-screen mode that lets the player launch individual minigames directly, without starting or progressing the main guild-management campaign.

This mode exists for three reasons:

- faster testing and balancing during development
- easier portfolio/demo access for people who want to sample the game systems quickly
- a cleaner way to replay minigames in isolation without needing to navigate the full campaign loop

The intended result is not to replace the main game. The main campaign remains the primary experience.

## Product Positioning

This should not be presented as a co-equal "main way" to play Clowder & Crest.

Recommended framing:

- Keep `New Game` / `Continue` as the primary title-screen actions.
- Add a smaller secondary option such as `Practice`, `Minigame Mode`, or `Minigame Hall`.
- Include a short subtitle or helper line making it clear this is a side mode:
  - `Play minigames directly. Best experienced in the full guild story.`

This preserves the campaign-first identity while still making the mode discoverable.

## Recommended Scope

Initial version:

- Launch any implemented minigame directly from a selection screen.
- Do not attach story progression, chapter rewards, or save-state consequences.
- Treat the mode as self-contained and disposable.
- Allow quick restart and return-to-menu flow.

Not required in the first pass:

- scoreboards
- persistent rewards
- per-minigame unlock progression within this mode
- full campaign simulation around jobs or day flow

## Recommended Naming

Preferred names, in order:

1. `Practice`
2. `Minigame Hall`
3. `Minigame Mode`
4. `Arcade`

`Practice` is probably the safest. It communicates utility and replay without making the game feel like a minigame compilation.

## UX Recommendation

### Title Screen

Add a secondary button below the primary campaign buttons.

Suggested ordering:

1. `Continue` if a save exists
2. `New Game`
3. `Practice`

Visual treatment:

- same style family as the main buttons
- slightly less prominent than `New Game`
- optional smaller helper text below the button list

### Practice / Minigame Selection Screen

Create a dedicated selection panel or scene with:

- a title
- a short explanation of the mode
- one card/button per minigame
- optional metadata per minigame:
  - gameplay type
  - typical session length
  - touch complexity
  - chapter/job fantasy it normally belongs to

Each minigame card should support:

- `Play`
- optional short description

Bottom actions:

- `Back to Title`

### During Minigame Mode

Each minigame should have:

- restart
- return to minigame menu
- return to title

The player should never get trapped in campaign-specific flow after finishing.

## Design Rules

To keep this mode from weakening the main game:

- No story cutscenes should play automatically.
- No campaign save data should be modified.
- No chapter progression should be granted.
- No permanent fish/reputation/cat rewards should be saved.
- Use neutral framing instead of campaign-specific reward language where needed.

If a minigame needs surrounding context to make sense, provide that context as a short label rather than a full narrative wrapper.

Example:

- `Brawl: Defend the granary from plague rats`
- `Courier Run: Deliver messages through town traffic`
- `Stealth: Slip through a guarded route unseen`

## Technical Approach

## 1. Add a mode concept

Introduce a lightweight runtime distinction between:

- main campaign play
- minigame/practice play

This does not necessarily need to become a deep global system. A minimal mode flag may be enough, such as:

- current launch context
- current scene return target
- whether rewards/progression should be persisted

The cleanest first version is probably:

- a small runtime state object for title/menu/session context
- explicit `practice` launch options passed into minigame scenes

## 2. Add a dedicated selection scene or panel

Recommended:

- create a dedicated `PracticeScene` or `MinigameMenuScene`

Responsibilities:

- list all available minigames
- launch a selected minigame with practice-mode configuration
- provide back navigation to the title

This is cleaner than overloading the title scene or stuffing everything into a generic panel.

## 3. Standardize minigame launch contracts

Right now many minigames are likely launched from job/campaign flow with assumptions about:

- active cat
- job metadata
- reward hooks
- return targets
- save state

Each minigame should support a clean launch payload that can be satisfied in either mode.

Suggested input shape:

- mode: `campaign` or `practice`
- cat or cat preset
- optional job metadata
- optional difficulty or chapter-style variant
- callbacks or route targets for completion / exit

The key engineering goal is to remove hidden assumptions that a minigame only ever launches from the main campaign.

## 4. Add practice-safe result handling

Result screens currently may assume campaign outcomes such as:

- fish rewards
- reputation changes
- wishes or event hooks
- bond progression
- conversation checks
- return to town map

In practice mode, result handling should instead:

- show success/failure
- optionally show score/time/performance
- offer `Retry`
- offer `Back to Practice Menu`
- avoid campaign mutations

This may be the most important implementation boundary.

## 5. Provide default practice presets

Some minigames may need a selected cat or stat context.

For first pass, use simple defaults:

- one sensible cat preset per minigame
- or a generic balanced test cat

Later enhancement:

- let the player choose among a few cat archetypes
- let the player test low/medium/high skill variants

But the first version should optimize for speed, not configurability.

## 6. Handle unavailable or rough-fit minigames carefully

Not every existing minigame may be equally ready for isolated play.

For each minigame, decide whether it is:

- ready now
- needs a small wrapper adjustment
- should be omitted from the first release of practice mode

If a minigame strongly depends on campaign scaffolding, it is better to omit it initially than to ship a broken-feeling practice wrapper.

## Likely File / System Touch Points

These are the likely places to change, based on the current project structure:

- title/menu scene for the new entry point
- scene routing / launch flow
- result overlay helpers
- per-minigame launch and completion handling
- shared session/runtime state

Likely concrete files:

- `src/scenes/TitleScene.ts`
- `src/main.ts`
- `src/ui/sceneHelpers.ts`
- `src/ui/jobFlow.ts`
- individual scene files for minigame-specific assumptions

Depending on how current flow is wired, it may be cleaner to add a small `PracticeFlow` or `MinigameMode` system rather than spreading branching logic everywhere.

## Rollout Plan

### Phase 1: Structural foundation

- Add title-screen entry point.
- Add practice/minigame selection scene.
- Add a runtime mode flag or launch context.
- Make one or two minigames launch cleanly in practice mode.

Success condition:

- the architecture works without mutating campaign state

### Phase 2: Expand coverage

- Add practice support for the rest of the minigames that fit well.
- Normalize result/exit flows.
- Add retry/back/menu consistency.

Success condition:

- a reviewer can sample most minigames without touching the campaign

### Phase 3: Polish

- improve card descriptions and presentation
- add per-minigame metadata
- optionally add presets or difficulty variants
- optionally add "recommended in campaign first" messaging for spoiler-sensitive content

## Risks

### 1. The game starts to feel like a minigame compilation

Mitigation:

- keep campaign buttons primary
- keep practice mode secondary in visual hierarchy
- avoid over-marketing it on the title screen

### 2. Minigame scenes contain hidden campaign assumptions

Mitigation:

- make launch payloads explicit
- centralize result handling differences
- support minigames incrementally instead of all at once

### 3. Spoilers or late-game mechanical exposure

Mitigation:

- avoid story scenes entirely
- use neutral practice labels
- optionally group advanced/later-game minigames separately

### 4. Practice mode becomes a maintenance burden

Mitigation:

- reuse normal scene logic wherever possible
- keep mode differences narrow and explicit
- avoid adding separate duplicate implementations

## Recommended First Implementation Slice

The safest first slice is:

1. Add a `Practice` button to the title screen.
2. Add a simple minigame selection scene.
3. Support 3-5 strongest self-contained minigames first.
4. Add practice-safe success/failure/retry/menu flow.
5. Expand only after that feels clean.

Good first candidates are likely minigames that:

- already teach themselves clearly
- do not require much narrative context
- have satisfying short session loops

## Open Decisions

- Final name: `Practice`, `Minigame Hall`, or something else
- Whether every minigame should be available immediately
- Whether to include chapter labels or hide them
- Whether to expose cat/stat presets in the first version
- Whether to keep the mode fully public or hide it behind a smaller affordance

## Recommendation Summary

Implement this as a visible but secondary `Practice` mode.

Do not hide it entirely, because it has real value for:

- testing
- QA
- replay
- portfolio review

But do not frame it as the main way to experience Clowder & Crest. The campaign should remain the default and clearly intended path.
