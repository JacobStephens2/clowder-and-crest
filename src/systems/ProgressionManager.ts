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
    // Chapter 7 requires rival defeated
    if (next.chapter === 7 && !save.flags.rivalDefeated) return false;

    save.chapter = next.chapter;
    eventBus.emit('chapter-advance', save.chapter);

    // Trigger chapter-specific events
    if (save.chapter === 3) {
      save.flags.ratPlagueStarted = true;
      eventBus.emit('rat-plague-start');
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
    case 5: return 'The guild is established, renowned, and home.';
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
