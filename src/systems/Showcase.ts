// Showcase / demo-save entry. Two ways in:
//
//   1. URL parameter `?showcase=1` (or `?showcase=true`) — for portfolio
//      reviewers visiting the web build. Detected at title-screen create()
//      and triggered before the player ever sees the slot picker.
//
//   2. Five quick taps on the crest logo on the title screen — works on
//      both web and the Capacitor APK, since URL params are awkward to
//      pass into a launched Android app. The crest is the only sprite
//      that's always on screen during the title scene, and tapping a
//      logo five times to reach a hidden mode is a long-standing
//      convention from the arcade era and from `chrome://flags`.
//
// Both entry points funnel through `enterShowcase()` below, which:
//   - bundle-imports the demo save (`src/data/demoSave.json`),
//   - runs it through `validateAndSanitizeSave` so any future schema
//     additions get backfilled by the migrator,
//   - writes it to slot 1,
//   - emits `game-loaded` and navigates to GuildhallScene,
//   - shows a toast nudging the player to open the menu and visit
//     "Day of Rest" — the in-universe minigame archive that the demo
//     save unlocks completely.
//
// Day of Rest itself is a separate feature; this module's only job is to
// get the player into a fully-unlocked save quickly so they (or a
// reviewer) can poke around the whole game without playing through the
// 7-chapter campaign first.

import demoSaveJson from '../data/demoSave.json';
import { validateAndSanitizeSave, saveToSlot, createDefaultSave, type SaveData } from './SaveManager';
import { eventBus } from '../utils/events';
import { showDayOfRestSpoilerWarning, showDayOfRestPanel } from '../ui/DayOfRestPanel';

/** Module-level flag set when the puzzle-complete / puzzle-quit handler
 *  finishes a title-screen Day of Rest practice run. TitleScene checks
 *  this in create() and re-opens the catalogue immediately, bypassing
 *  the setTimeout race that previously left the player on a blank
 *  scene. Per user feedback (2026-04-10, third pass): "after i finish
 *  pounce in from the title day of rest menu, I click continue and am
 *  brought back to a blank town scene rather than the day of rest
 *  menu." */
let pendingTitleDayOfRestReopen = false;

export function setPendingTitleDayOfRestReopen(value: boolean): void {
  pendingTitleDayOfRestReopen = value;
}

export function consumePendingTitleDayOfRestReopen(): boolean {
  const v = pendingTitleDayOfRestReopen;
  pendingTitleDayOfRestReopen = false;
  return v;
}

/** Returns true if the current URL contains `?showcase=1` or
 *  `?showcase=true`. Used by TitleScene at create() time to bypass the
 *  slot picker and drop the user straight into the demo save. */
export function isShowcaseUrlRequested(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('showcase');
    return v === '1' || v === 'true' || v === 'yes';
  } catch {
    return false;
  }
}

/** Load the bundled demo save into slot 1, navigate to the guildhall,
 *  and show a toast pointing the player at Day of Rest.
 *
 *  Idempotent — calling it twice in a row just reloads the demo save and
 *  navigates back to the guildhall, which is the right behaviour if the
 *  player taps the crest five times by accident.
 *
 *  The toast nudges the player toward the menu so they discover the
 *  Day of Rest entry without us putting it on the title screen (which
 *  would shatter the storybook tone — see the council doc).
 *
 *  Returns true on success, false if the demo save fails sanitization
 *  (which would only happen if a schema migration broke the demo
 *  fixture and the playtests didn't catch it). */
export function enterShowcase(showToast?: (msg: string) => void): boolean {
  const sanitized = validateAndSanitizeSave(demoSaveJson as unknown);
  if (!sanitized) {
    showToast?.('Showcase save failed to load');
    return false;
  }

  // Mark the loaded save as a demo so the menu can render the Day of Rest
  // entry differently (and so the player can tell at a glance that they
  // are in the demo, not their real run). The flag survives sanitize +
  // migrate because flags is preserved through both.
  const save: SaveData = sanitized;
  save.flags = save.flags ?? {};
  save.flags.demoSave = true;

  saveToSlot(1, save);

  eventBus.emit('active-slot', 1);
  eventBus.emit('game-loaded', save);
  eventBus.emit('navigate', 'GuildhallScene');

  // Stagger the toast slightly so it lands after the guildhall fades in
  // rather than competing with the day-1 startup chrome.
  setTimeout(() => {
    showToast?.('Showcase save loaded \u2014 open the menu and visit Day of Rest.');
  }, 1200);

  return true;
}

/** Title-screen Day of Rest entry — show the spoiler warning, and on
 *  confirm set up a minimal in-memory game state and open the
 *  fully-unlocked Day of Rest panel directly over the title scene.
 *
 *  Per user feedback (2026-04-10): "for accessing the day of rest
 *  from the title screen, give player access to the minigame menu
 *  without creating a fully unlocked save." The earlier
 *  implementation loaded the full demo save (all 5 cats, all
 *  furniture, all chapters) and dropped the player into a fully
 *  unlocked guildhall after the panel closed. The new path uses
 *  `createDefaultSave('Demo')` — a Day 1 / Chapter 1 / one-cat stub
 *  — and stays on the title scene (the panel renders over it).
 *
 *  The stub save is flagged with `titleDemoState: true` so the
 *  puzzle-complete / puzzle-quit handlers in main.ts know to route
 *  back to TitleScene + clear the in-memory state when a practice
 *  run finishes, instead of dumping the player into the stub
 *  guildhall. Same flag is checked when the close button (X) on
 *  the panel is tapped.
 *
 *  Nothing is written to any save slot at any point; the player's
 *  real saves stay untouched. */
export function showTitleScreenDayOfRest(_showToast?: (msg: string) => void): void {
  showDayOfRestSpoilerWarning({
    onCancel: () => {
      // Title screen has no menu to return to — bail silently.
    },
    onConfirm: () => {
      // Minimal stub save: Day 1, one cat (the player wildcat), no
      // chapter unlocks, no furniture. The Day of Rest panel with
      // unlockAll=true ignores puzzlesCompleted so all 14 minigames
      // still show on the catalogue regardless of how empty this
      // stub is.
      const save: SaveData = createDefaultSave('Demo');
      save.flags.titleDemoState = true;
      // Lightweight setter — sets gameState in main.ts WITHOUT firing
      // the full game-loaded side-effect cascade (which would start
      // the day timer, switch BGM, fire offline-earnings checks, etc.).
      eventBus.emit('set-transient-game-state', save);
      // Open the panel directly over the title scene. The panel's
      // pauseActiveScenes() call pauses TitleScene; closing the
      // panel resumes it.
      showDayOfRestPanel(true);
    },
  });
}
