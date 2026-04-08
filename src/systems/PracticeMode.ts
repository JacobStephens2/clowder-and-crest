// "Day of Rest" sandbox launch state.
//
// When the player launches a minigame from the Day of Rest panel we set
// `practiceActive = true`. The puzzle-complete and puzzle-quit handlers
// in main.ts read this flag at the very top of their bodies and short-
// circuit before any of the reward / XP / mood / job-flag mutation code
// runs. The result: a player can replay any unlocked minigame for fun
// without burning their cat-of-the-day, losing fish to the failure
// penalty, or messing with the campaign's economy state.
//
// The flag is module-scoped (not on SaveData) because it's purely a
// runtime concept — there is no such thing as "in practice mode" once
// the scene exits, and we never want to persist this through a save.
// The DayOfRest panel sets it before switchScene() and the result/quit
// handlers clear it after navigating back.

let practiceActive = false;
let lastLauncherTrack: string | null = null;

/** Mark the upcoming minigame launch as a Day of Rest practice run. */
export function beginPracticeRun(opts?: { resumeTrackset?: string }): void {
  practiceActive = true;
  lastLauncherTrack = opts?.resumeTrackset ?? null;
}

/** True if the currently-running minigame was launched from Day of Rest. */
export function isPracticeRun(): boolean {
  return practiceActive;
}

/** Clear the practice flag. Called by the result/quit handlers in main.ts
 *  after they've finished routing the player back to the Day of Rest
 *  panel. */
export function endPracticeRun(): string | null {
  practiceActive = false;
  const t = lastLauncherTrack;
  lastLauncherTrack = null;
  return t;
}
