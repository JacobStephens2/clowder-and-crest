import type { SaveData } from './SaveManager';
import { CHAPTER_TRIGGERS } from '../utils/constants';
import { eventBus } from '../utils/events';

export function checkChapterAdvance(save: SaveData): boolean {
  if (save.chapter >= 7) return false;

  const next = CHAPTER_TRIGGERS[save.chapter]; // 0-indexed: chapter N -> index N
  if (!next) return false;

  const catCount = save.cats.length;
  const jobCount = save.totalJobsCompleted;
  const fishTotal = save.totalFishEarned;

  if (catCount >= next.cats && jobCount >= next.jobs && fishTotal >= next.fish) {
    // Chapter 4 requires surviving the plague
    if (next.chapter === 4 && !save.flags.ratPlagueResolved) return false;
    // Chapter 5 requires surviving the Long Winter (the structural fall — see story-audit-council.md)
    if (next.chapter === 5 && !save.flags.longWinterResolved) return false;
    // Chapter 7 requires rival defeated
    if (next.chapter === 7 && !save.flags.rivalDefeated) return false;

    save.chapter = next.chapter;
    eventBus.emit('chapter-advance', save.chapter);

    // Trigger chapter-specific events
    if (save.chapter === 3) {
      save.flags.ratPlagueStarted = true;
      eventBus.emit('rat-plague-start');
    }
    if (save.chapter === 4) {
      // Stamp the start day so checkLongWinterStart knows when to fire.
      save.flags.chapter4StartDay = save.day;
    }
    if (save.chapter === 7) {
      save.flags.inquisitionStarted = true;
      save.flags.inquisitionDayStarted = save.day;
      save.flags.inquisitionSacredJobs = 0;
      save.flags.inquisitionShadowJobs = 0;
      save.flags.inquisitionGuardJobs = 0;
      eventBus.emit('inquisition-start');
    }

    return true;
  }
  return false;
}

// ──── Long Winter ────
//
// The structural fall stage that the rags-to-riches arc was missing
// (see todo/story/story-audit-council.md). Fires automatically once the
// guild has been settled in chapter 4 for ~5 days, runs for 5 winter days,
// and must resolve before the player can advance to chapter 5.
//
// The winter is non-conditional — every player encounters it regardless of
// reputation path. The point is that "Established" (chapter 5) is earned by
// surviving a forced loss-and-recovery, not by accumulating jobs.

const LONG_WINTER_TRIGGER_DAYS = 5; // Days after chapter 4 starts before winter hits
const LONG_WINTER_DURATION = 5;     // Days the winter lasts
const LONG_WINTER_FORCED_CHOICE_DAY = 3; // Winter day on which the granary choice fires
const LONG_WINTER_RELATIONAL_DAY = 4;    // Winter day on which a cat almost leaves

export function checkLongWinterStart(save: SaveData): boolean {
  if (save.chapter !== 4) return false;
  if (save.flags.longWinterStarted) return false;
  if (save.flags.longWinterResolved) return false;

  // Need a chapter-4-start day to count from. The chapter-advance handler
  // sets this; if missing on an old save, set it now and bail.
  const chapter4Start = Number(save.flags.chapter4StartDay ?? 0);
  if (!chapter4Start) {
    save.flags.chapter4StartDay = save.day;
    return false;
  }

  if (save.day - chapter4Start >= LONG_WINTER_TRIGGER_DAYS) {
    save.flags.longWinterStarted = true;
    save.flags.longWinterDayStarted = save.day;
    eventBus.emit('long-winter-start');
    return true;
  }
  return false;
}

export function checkLongWinterResolution(save: SaveData): boolean {
  if (!save.flags.longWinterStarted || save.flags.longWinterResolved) return false;

  const winterStart = Number(save.flags.longWinterDayStarted ?? save.day);
  const winterDays = save.day - winterStart;

  if (winterDays >= LONG_WINTER_DURATION) {
    save.flags.longWinterResolved = true;
    eventBus.emit('long-winter-resolved');
    return true;
  }
  return false;
}

/** Returns 0 if no winter active, otherwise the current winter day (1-indexed). */
export function getLongWinterDay(save: SaveData): number {
  if (!save.flags.longWinterStarted || save.flags.longWinterResolved) return 0;
  const winterStart = Number(save.flags.longWinterDayStarted ?? save.day);
  return Math.max(1, save.day - winterStart + 1);
}

export function isLongWinterForcedChoiceDay(save: SaveData): boolean {
  return getLongWinterDay(save) === LONG_WINTER_FORCED_CHOICE_DAY && !save.flags.longWinterChoiceMade;
}

export function isLongWinterRelationalDay(save: SaveData): boolean {
  return getLongWinterDay(save) === LONG_WINTER_RELATIONAL_DAY && !save.flags.longWinterRelationalDone;
}

// ──── Day of Rest ────
//
// Every 7 in-game days the cats observe a day of rest. The job board is
// closed, the day timer pauses (so the player can take their time and
// dip into the Day of Rest archive without burning real-time), and any
// stationed cats still earn their daily fish (resting from active work,
// not from their post). The next "End Day" advances normally.
//
// Day 7, 14, 21, 28… all qualify. Day 1 never does (the rest day is
// always at the END of a work week, not the start). Rest days are
// suppressed during narrative crises where a "weekend off" would feel
// tonally wrong: the Rat Plague (chapter 3), the Long Winter (chapters
// 4-5 transition), and the Inquisition investigation window (chapter 7).
// Those events have their own pacing already and the player doesn't
// need extra friction.

export function isRestDay(save: SaveData): boolean {
  if (!save) return false;
  if (save.day < 7) return false;
  if (save.day % 7 !== 0) return false;
  // Suppress during active narrative crises — they have their own pacing
  // and the rest-day framing would clash with the tone.
  if (save.flags.ratPlagueStarted && !save.flags.ratPlagueResolved) return false;
  if (save.flags.longWinterStarted && !save.flags.longWinterResolved) return false;
  if (save.flags.inquisitionStarted && !save.flags.inquisitionResolved) return false;
  return true;
}

export function checkRatPlagueResolution(save: SaveData): boolean {
  if (!save.flags.ratPlagueStarted || save.flags.ratPlagueResolved) return false;

  // Plague resolves after completing 5 pest control jobs during the plague
  // Uses a counter that tracks every completion (not just unique job IDs)
  const plaguePestDone = Number(save.flags.plaguePestDone ?? 0);

  if (plaguePestDone >= 5) {
    save.flags.ratPlagueResolved = true;
    eventBus.emit('rat-plague-resolved');
    return true;
  }
  return false;
}

export function getChapterName(chapter: number): string {
  switch (chapter) {
    case 1: return 'The Stray';
    case 2: return 'The Crew';
    case 3: return 'The Rat Plague';
    case 4: return 'The Name';
    case 5: return 'Established';
    case 6: return 'The Rival';
    case 7: return 'The Inquisition';
    default: return '';
  }
}

export function getNextChapterHint(save: SaveData): string | null {
  if (save.chapter >= 7) return null;
  const next = CHAPTER_TRIGGERS[save.chapter];
  if (!next) return null;

  const needs: string[] = [];
  if (save.cats.length < next.cats) needs.push(`${next.cats} cats (have ${save.cats.length})`);
  if (save.totalJobsCompleted < next.jobs) needs.push(`${next.jobs} jobs done (have ${save.totalJobsCompleted})`);
  if (save.totalFishEarned < next.fish) needs.push(`${next.fish} total fish earned (have ${save.totalFishEarned})`);
  if (next.chapter === 4 && !save.flags.ratPlagueResolved) needs.push('resolve the Rat Plague');
  // Per playtest (2026-04-18): "i came to a point in chapter 4
  // where i felt like i was stuck... i didnt know how to trigger the
  // long winter." The hint now explains that the Long Winter triggers
  // automatically after several days in Ch.4.
  if (next.chapter === 5 && !save.flags.longWinterStarted) {
    needs.push('wait for the Long Winter (it arrives after a few days in Chapter 4)');
  } else if (next.chapter === 5 && !save.flags.longWinterResolved) {
    needs.push('survive the Long Winter (keep the guild fed and warm)');
  }
  if (next.chapter === 7 && !save.flags.rivalDefeated) needs.push('defeat the Silver Paws');

  if (needs.length === 0) return 'Chapter advancing soon...';
  return `Next chapter needs: ${needs.join(', ')}`;
}

export function getChapterDescription(chapter: number): string {
  switch (chapter) {
    case 1: return 'A lone wildcat arrives at a crumbling settlement in a storm.';
    case 2: return 'The guild grows. New cats join, new jobs appear.';
    case 3: return 'A great plague of rats descends on the town. The guild must prove its worth.';
    case 4: return 'The town recognizes the guild. A naming ceremony awaits.';
    case 5: return 'The guild has weathered its first winter and stands renowned. Home, at last.';
    case 6: return 'A rival guild, the Silver Paws, challenges your dominance.';
    case 7: return 'The Bishop sends an Inquisitor. Are these cats holy servants — or something darker?';
    default: return '';
  }
}

export function checkInquisitionResolution(save: SaveData): boolean {
  if (!save.flags.inquisitionStarted || save.flags.inquisitionResolved) return false;

  const startDay = Number(save.flags.inquisitionDayStarted ?? save.day);
  const daysPassed = save.day - startDay;

  // Investigation lasts 5 days
  if (daysPassed >= 5) {
    save.flags.inquisitionResolved = true;

    const sacredJobs = Number(save.flags.inquisitionSacredJobs ?? 0);
    const guardJobs = Number(save.flags.inquisitionGuardJobs ?? 0);
    const shadowJobs = Number(save.flags.inquisitionShadowJobs ?? 0);
    const goodWork = sacredJobs + guardJobs;

    let verdict: 'vindicated' | 'acquitted' | 'condemned';
    if (goodWork >= 4 && shadowJobs === 0) {
      verdict = 'vindicated';
    } else if (shadowJobs >= 3 || (shadowJobs > goodWork)) {
      verdict = 'condemned';
    } else {
      verdict = 'acquitted';
    }

    save.flags.inquisitionVerdict = verdict;
    eventBus.emit('inquisition-verdict', verdict);
    return true;
  }
  return false;
}
