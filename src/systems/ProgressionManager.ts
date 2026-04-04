import type { SaveData } from './SaveManager';
import { CHAPTER_TRIGGERS } from '../utils/constants';
import { eventBus } from '../utils/events';

export function checkChapterAdvance(save: SaveData): boolean {
  if (save.chapter >= 5) return false;

  const next = CHAPTER_TRIGGERS[save.chapter]; // 0-indexed: chapter N -> index N
  if (!next) return false;

  const catCount = save.cats.length;
  const jobCount = save.totalJobsCompleted;
  const fishTotal = save.totalFishEarned;

  if (catCount >= next.cats && jobCount >= next.jobs && fishTotal >= next.fish) {
    // Chapter 4 requires surviving the plague
    if (next.chapter === 4 && !save.flags.ratPlagueResolved) return false;

    save.chapter = next.chapter;
    eventBus.emit('chapter-advance', save.chapter);

    // Trigger chapter-specific events
    if (save.chapter === 3) {
      save.flags.ratPlagueStarted = true;
      eventBus.emit('rat-plague-start');
    }

    return true;
  }
  return false;
}

export function checkRatPlagueResolution(save: SaveData): boolean {
  if (!save.flags.ratPlagueStarted || save.flags.ratPlagueResolved) return false;

  // Plague resolves after completing 5 pest control jobs during chapter 3
  const plagueJobs = save.completedJobs.filter((id) => {
    return id.startsWith('plague_') || ['mill_mousing', 'granary_patrol', 'cathedral_mousing', 'warehouse_clearing', 'ship_hold'].includes(id);
  });

  // Need at least 5 plague-era pest control completions beyond what was done pre-plague
  const prePlagueCount = save.flags.prePlaguePestJobs as unknown as number ?? 0;
  const pestControlDone = save.completedJobs.filter((id) =>
    ['mill_mousing', 'granary_patrol', 'cathedral_mousing', 'warehouse_clearing', 'ship_hold'].includes(id)
  ).length;

  if (pestControlDone - prePlagueCount >= 5) {
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
    default: return '';
  }
}

export function getNextChapterHint(save: SaveData): string | null {
  if (save.chapter >= 5) return null;
  const next = CHAPTER_TRIGGERS[save.chapter];
  if (!next) return null;

  const needs: string[] = [];
  if (save.cats.length < next.cats) needs.push(`${next.cats} cats (have ${save.cats.length})`);
  if (save.totalJobsCompleted < next.jobs) needs.push(`${next.jobs} jobs done (have ${save.totalJobsCompleted})`);
  if (save.totalFishEarned < next.fish) needs.push(`${next.fish} total fish earned (have ${save.totalFishEarned})`);
  if (next.chapter === 4 && !save.flags.ratPlagueResolved) needs.push('resolve the Rat Plague');

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
    default: return '';
  }
}
