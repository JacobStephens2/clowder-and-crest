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

export interface StationedResult {
  catName: string;
  jobName: string;
  earned: number;
  event?: string;
}

const STATION_EVENTS_PEST = [
  'Rats fought back — {cat} got scratched but held the line.',
  'A massive rat king appeared! {cat} earned a bonus.',
  '{cat} found a hidden stash of fish behind the grain sacks!',
  'The granary flooded — {cat} had to work twice as hard.',
];

const STATION_EVENTS_COURIER = [
  'A dog blocked the route — {cat} had to find a detour.',
  '{cat} delivered a letter to a grateful merchant — tip included!',
  'Heavy rain slowed deliveries. {cat} pushed through.',
  '{cat} discovered a shortcut through the bell tower!',
];

const STATION_EVENTS_GUARD = [
  '{cat} scared off an intruder — the estate owner is grateful.',
  'A quiet night. {cat} kept perfect watch.',
  'Thieves tested the perimeter — {cat} held firm.',
  '{cat} found a gap in the wall and reported it — bonus for vigilance!',
];

const STATION_EVENTS_SACRED = [
  '{cat} sensed something stirring near the relics — false alarm, but good instincts.',
  'The monks praised {cat}\'s devotion. Extra fish offered.',
  'A pilgrim left an offering near {cat}\'s post.',
  '{cat} dreamed of Saint Gertrude — the others say it\'s a good omen.',
];

const STATION_EVENTS_DETECTION = [
  '{cat} uncovered a hidden passage beneath the market.',
  'The trail went cold — {cat} had to start from scratch.',
  '{cat} found the missing item! A generous reward.',
  'A false lead cost time — {cat} doubled back and found the truth.',
];

export function collectStationedEarnings(save: SaveData): StationedResult[] {
  const results: StationedResult[] = [];

  for (const stationed of save.stationedCats) {
    const cat = save.cats.find((c) => c.id === stationed.catId);
    const job = getJob(stationed.jobId);
    if (!cat || !job) continue;

    const match = getStatMatchScore(cat, job);
    let earned = Math.max(1, Math.floor(job.baseReward * 0.5 + job.baseReward * match * 0.5));

    // Diminishing returns after 5 days at the same station
    const daysStationed = save.day - (stationed.dayStarted ?? save.day);
    if (daysStationed > 5) {
      const decay = Math.max(0.3, 1 - (daysStationed - 5) * 0.1);
      earned = Math.max(1, Math.floor(earned * decay));
    }

    // Station events (~20% chance per day)
    let event: string | undefined;
    if (Math.random() < 0.2) {
      const eventMap: Record<string, string[]> = {
        pest_control: STATION_EVENTS_PEST, courier: STATION_EVENTS_COURIER,
        guard: STATION_EVENTS_GUARD, sacred: STATION_EVENTS_SACRED, detection: STATION_EVENTS_DETECTION,
      };
      const events = eventMap[job.category] ?? STATION_EVENTS_PEST;
      const template = events[Math.floor(Math.random() * events.length)];
      event = template.replace('{cat}', cat.name);

      // Events can modify earnings
      if (template.includes('bonus') || template.includes('tip') || template.includes('stash') || template.includes('shortcut')) {
        earned = Math.floor(earned * 1.5);
      } else if (template.includes('twice as hard') || template.includes('fought back')) {
        earned = Math.floor(earned * 0.7);
        // Mood impact
        if (cat.mood === 'happy') cat.mood = 'content';
        else if (cat.mood === 'content') cat.mood = 'tired';
      }
    }

    // Lazy cats occasionally slack off
    if ((cat.traits ?? []).includes('Lazy') && Math.random() < 0.15) {
      earned = Math.floor(earned * 0.5);
      event = `${cat.name} napped on the job — half earnings today.`;
    }

    // Curious cats occasionally find extra
    if ((cat.traits ?? []).includes('Curious') && Math.random() < 0.1) {
      earned = Math.floor(earned * 1.3);
      event = `${cat.name} found something interesting — bonus fish!`;
    }

    earnFish(save, earned);
    results.push({ catName: cat.name, jobName: job.name, earned, event });
  }

  return results;
}

export function isCatStationed(save: SaveData, catId: string): boolean {
  return save.stationedCats.some((s) => s.catId === catId);
}
