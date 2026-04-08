// Per user feedback (2026-04-08): "the days feel pretty fast, making it
// feel I think a bit more rushed than it should be, as I spend some time
// reading and processing things". Bumped from 3 to 5 minutes per in-game
// day so the player has breathing room to read flavor text, plan, and
// react to events without feeling rushed. The phase indicator (Dawn /
// Morning / Midday / Afternoon / Dusk / Night) and pause behavior are
// unchanged — only the wall-clock duration of a full cycle.
const DAY_DURATION = 5 * 60 * 1000; // 5 minutes per in-game day
const TIME_PHASES = ['Dawn', 'Morning', 'Midday', 'Afternoon', 'Dusk', 'Night'];

let dayTimerStart = 0;
let dayTimerInterval: ReturnType<typeof setInterval> | null = null;
let onDayEnd: (() => void) | null = null;
let paused = false;
let pausedElapsed = 0;

const statusTime = document.getElementById('status-time');

export function setOnDayEnd(callback: () => void): void {
  onDayEnd = callback;
}

export function startDayTimer(): void {
  if (dayTimerInterval) clearInterval(dayTimerInterval);
  dayTimerStart = Date.now();
  paused = false;
  updateTimeDisplay();
  dayTimerInterval = setInterval(() => {
    if (paused) return;
    const elapsed = Date.now() - dayTimerStart;
    if (elapsed >= DAY_DURATION) {
      dayTimerStart = Date.now();
      onDayEnd?.();
    }
    updateTimeDisplay();
  }, 1000);
}

export function stopDayTimer(): void {
  if (dayTimerInterval) {
    clearInterval(dayTimerInterval);
    dayTimerInterval = null;
  }
}

export function resetDayTimer(): void {
  dayTimerStart = Date.now();
  paused = false;
  updateTimeDisplay();
}

export function pauseDayTimer(): void {
  if (paused) return;
  paused = true;
  pausedElapsed = Date.now() - dayTimerStart;
}

export function resumeDayTimer(): void {
  if (!paused) return;
  paused = false;
  dayTimerStart = Date.now() - pausedElapsed;
}

export function isPaused(): boolean {
  return paused;
}

export function updateTimeDisplay(): void {
  const elapsed = paused ? pausedElapsed : Date.now() - dayTimerStart;
  const progress = Math.min(elapsed / DAY_DURATION, 1);
  const phaseIndex = Math.min(Math.floor(progress * TIME_PHASES.length), TIME_PHASES.length - 1);
  if (statusTime) {
    statusTime.textContent = paused ? `${TIME_PHASES[phaseIndex]} (paused)` : TIME_PHASES[phaseIndex];
  }
}

export function getCurrentPhase(): string {
  const elapsed = paused ? pausedElapsed : Date.now() - dayTimerStart;
  const progress = Math.min(elapsed / DAY_DURATION, 1);
  const phaseIndex = Math.min(Math.floor(progress * TIME_PHASES.length), TIME_PHASES.length - 1);
  return TIME_PHASES[phaseIndex];
}
