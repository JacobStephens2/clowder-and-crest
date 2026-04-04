import type { SaveData, CatSaveData } from './SaveManager';
import { getJob, getStatMatchScore } from './JobBoard';
import { eventBus } from '../utils/events';

export function earnFish(save: SaveData, amount: number): void {
  save.fish += amount;
  save.totalFishEarned += amount;
  eventBus.emit('fish-changed', save.fish);
}

export function spendFish(save: SaveData, amount: number): boolean {
  if (save.fish < amount) return false;
  save.fish -= amount;
  eventBus.emit('fish-changed', save.fish);
  return true;
}

export function canAfford(save: SaveData, amount: number): boolean {
  return save.fish >= amount;
}

export function calculateReward(baseReward: number, maxReward: number, stars: number): number {
  const base = baseReward + Math.floor(Math.random() * (maxReward - baseReward + 1));
  const multiplier = stars === 3 ? 2 : stars === 2 ? 1.5 : 1;
  return Math.floor(base * multiplier);
}

export function calculateAutoResolveReward(baseReward: number, maxReward: number, statMatch: number): number {
  // statMatch 0-1 representing how well the cat's stats match the job
  const range = maxReward - baseReward;
  return baseReward + Math.floor(range * statMatch * Math.random());
}

export function collectStationedEarnings(save: SaveData): { catName: string; jobName: string; earned: number }[] {
  const results: { catName: string; jobName: string; earned: number }[] = [];

  for (const stationed of save.stationedCats) {
    const cat = save.cats.find((c) => c.id === stationed.catId);
    const job = getJob(stationed.jobId);
    if (!cat || !job) continue;

    const match = getStatMatchScore(cat, job);
    // Stationed earnings: lower than one-off jobs but guaranteed daily income
    const earned = Math.max(1, Math.floor(job.baseReward * 0.5 + job.baseReward * match * 0.5));
    earnFish(save, earned);
    results.push({ catName: cat.name, jobName: job.name, earned });
  }

  return results;
}

export function isCatStationed(save: SaveData, catId: string): boolean {
  return save.stationedCats.some((s) => s.catId === catId);
}
