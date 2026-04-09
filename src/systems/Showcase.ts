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
import { validateAndSanitizeSave, saveToSlot, type SaveData } from './SaveManager';
import { eventBus } from '../utils/events';
import { showDayOfRestSpoilerWarning, showDayOfRestPanel } from '../ui/DayOfRestPanel';

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
 *  confirm load the demo save into the in-memory game state, navigate
 *  to the guildhall, and auto-open the fully-unlocked Day of Rest
 *  panel. The demo save is loaded VIA `game-loaded` (which sets
 *  in-memory state) but NOT written to any save slot, so the player's
 *  real saves stay untouched.
 *
 *  Per user feedback (2026-04-09): "move the day of rest - all
 *  unlocked menu item to the main title menu, and just call it day of
 *  rest there. Leave the spoiler warning."
 *
 *  After practice runs the puzzle-complete handler in main.ts routes
 *  back to GuildhallScene + re-opens the panel — same as the in-game
 *  Day of Rest flow. The transient demo state lives in memory until
 *  the player quits to title.
 *
 *  Returns true on success, false if the demo save fails sanitization
 *  or the player cancelled the spoiler warning. */
export function showTitleScreenDayOfRest(showToast?: (msg: string) => void): void {
  showDayOfRestSpoilerWarning({
    onCancel: () => {
      // Title screen has no menu to return to — bail silently.
    },
    onConfirm: () => {
      const sanitized = validateAndSanitizeSave(demoSaveJson as unknown);
      if (!sanitized) {
        showToast?.('Day of Rest demo save failed to load');
        return;
      }
      const save: SaveData = sanitized;
      save.flags = save.flags ?? {};
      save.flags.demoSave = true;
      // NOT writing to any slot — purely in-memory. The player's real
      // saves stay intact.
      eventBus.emit('game-loaded', save);
      eventBus.emit('navigate', 'GuildhallScene');
      // Wait for the scene transition to settle, then open the panel.
      setTimeout(() => {
        showDayOfRestPanel(true);
      }, 600);
    },
  });
}
