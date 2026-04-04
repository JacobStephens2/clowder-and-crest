const DAY_DURATION = 3 * 60 * 1000; // 3 minutes per in-game day
const TIME_PHASES = ['Dawn', 'Morning', 'Midday', 'Afternoon', 'Dusk', 'Night'];

let dayTimerStart = 0;
let dayTimerInterval: ReturnType<typeof setInterval> | null = null;
let onDayEnd: (() => void) | null = null;

const statusTime = document.getElementById('status-time');

export function setOnDayEnd(callback: () => void): void {
  onDayEnd = callback;
}

export function startDayTimer(): void {
  if (dayTimerInterval) clearInterval(dayTimerInterval);
  dayTimerStart = Date.now();
  updateTimeDisplay();
  dayTimerInterval = setInterval(() => {
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
  updateTimeDisplay();
}

export function updateTimeDisplay(): void {
  const elapsed = Date.now() - dayTimerStart;
  const progress = Math.min(elapsed / DAY_DURATION, 1);
  const phaseIndex = Math.min(Math.floor(progress * TIME_PHASES.length), TIME_PHASES.length - 1);
  if (statusTime) {
    statusTime.textContent = TIME_PHASES[phaseIndex];
  }
}

export function getCurrentPhase(): string {
  const elapsed = Date.now() - dayTimerStart;
  const progress = Math.min(elapsed / DAY_DURATION, 1);
  const phaseIndex = Math.min(Math.floor(progress * TIME_PHASES.length), TIME_PHASES.length - 1);
  return TIME_PHASES[phaseIndex];
}
