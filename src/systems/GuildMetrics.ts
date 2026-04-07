import type { SaveData } from './SaveManager';
import { getJob, getStatMatchScore } from './JobBoard';

export function calculateDailyUpkeep(save: SaveData): number {
  const unlockedRooms = save.rooms.filter((room) => room.unlocked).length;
  const chapterUpkeep = Math.max(0, save.chapter - 1) * 2;
  const catFoodCost = save.cats.reduce((sum, cat) => sum + 2 + Math.max(0, cat.level - 1), 0);
  return catFoodCost + unlockedRooms + chapterUpkeep;
}

export function calculateStationedDailyIncome(save: SaveData): number {
  let total = 0;
  for (const stationed of save.stationedCats) {
    const job = getJob(stationed.jobId);
    if (!job) continue;
    const cat = save.cats.find((entry) => entry.id === stationed.catId);
    if (!cat) continue;
    const match = getStatMatchScore(cat, job);
    total += Math.max(1, Math.floor(job.baseReward * 0.5 + job.baseReward * match * 0.5));
  }
  return total;
}

export function calculateOfflineStationedEarnings(save: SaveData, hoursPerGameDay = 1, maxDays = 5): { earnings: number; daysAway: number } {
  if (!save.lastPlayedTimestamp || save.stationedCats.length === 0) return { earnings: 0, daysAway: 0 };
  const hoursAway = (Date.now() - save.lastPlayedTimestamp) / (1000 * 60 * 60);
  const daysAway = Math.min(maxDays, Math.floor(hoursAway / hoursPerGameDay));
  if (daysAway < 1) return { earnings: 0, daysAway: 0 };

  let earnings = 0;
  for (const stationed of save.stationedCats) {
    const job = getJob(stationed.jobId);
    if (!job) continue;
    const cat = save.cats.find((entry) => entry.id === stationed.catId);
    if (!cat) continue;
    const match = getStatMatchScore(cat, job);
    const dailyEarn = Math.max(1, Math.floor(job.baseReward * 0.3 + job.baseReward * match * 0.3));
    earnings += dailyEarn * daysAway;
  }
  return { earnings, daysAway };
}
