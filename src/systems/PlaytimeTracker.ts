// Playtime tracker — accumulates wall-clock play time across sessions.
//
// The total persists in SaveData.totalPlaytimeMs. This module owns the
// in-memory "current session start" timestamp and exposes start / pause /
// commit / live-read primitives. saveGame() in SaveManager calls
// commitSession() on every save so the running session's elapsed time
// folds into the save's running total — that means we never lose more
// than one save's worth of session time on a crash, which for a playtime
// stat is fine.
//
// Pause/resume hooks into the existing day-timer pause flow so that
// pausing the game (Escape, Capacitor backgrounding) also stops the
// playtime counter. Background tabs that don't fire the lifecycle hook
// will continue counting — that's an accepted edge case for the
// browser-tab use case.

let sessionStartTime: number | null = null;

/** Start the session timer. Called when entering the game world from the
 *  title screen, or resuming from a pause. Idempotent if already started. */
export function startPlaytimeSession(): void {
  if (sessionStartTime !== null) return;
  sessionStartTime = Date.now();
}

/** Stop the session timer. Returns the milliseconds elapsed since the
 *  session started, and clears the in-memory state. Returns 0 if the
 *  session wasn't running. */
export function pausePlaytimeSession(): number {
  if (sessionStartTime === null) return 0;
  const elapsed = Date.now() - sessionStartTime;
  sessionStartTime = null;
  return elapsed;
}

/** Read the current session's elapsed milliseconds without stopping the
 *  timer. Used for live display in the menu — the displayed playtime is
 *  saved-total + this value. Returns 0 if the session is paused. */
export function getCurrentSessionMs(): number {
  if (sessionStartTime === null) return 0;
  return Date.now() - sessionStartTime;
}

/** Returns true if the session timer is currently counting. Used by
 *  saveGame to decide whether commitSession needs to roll over the
 *  current session's elapsed time. */
export function isPlaytimeRunning(): boolean {
  return sessionStartTime !== null;
}

/** Commit the current session's elapsed time onto the save's running
 *  total, then restart the session timer so the next chunk starts from
 *  zero. Idempotent — no-op when the timer isn't running.
 *
 *  Called from saveGame() in SaveManager. Keeping this commit logic in
 *  one chokepoint means we don't have to remember to wire it at every
 *  save call site in main.ts. */
export function commitSessionToSave(save: { totalPlaytimeMs?: number }): void {
  if (sessionStartTime === null) return;
  const now = Date.now();
  const elapsed = now - sessionStartTime;
  save.totalPlaytimeMs = (save.totalPlaytimeMs ?? 0) + elapsed;
  // Restart the session from "now" so the next save's delta is fresh.
  sessionStartTime = now;
}

/** Format a millisecond playtime value as "Xh Ym" or "Ym" depending on
 *  length. Hours are unbounded (no day rollover). Used by the menu
 *  panel's Guild Statistics section.
 *
 *  Examples:
 *    formatPlaytime(0)        === "0m"
 *    formatPlaytime(45_000)   === "0m"     (sub-minute rounds down)
 *    formatPlaytime(120_000)  === "2m"
 *    formatPlaytime(3_600_000) === "1h 0m"
 *    formatPlaytime(7_200_000 + 600_000) === "2h 10m"  */
export function formatPlaytime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0m';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
