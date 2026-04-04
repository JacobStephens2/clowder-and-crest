import breedsData from '../data/breeds.json';
import type { CatSaveData, SaveData } from './SaveManager';
import type { StatName } from '../utils/constants';
import { randomInt, pick } from '../utils/helpers';

export interface BreedDef {
  id: string;
  name: string;
  temperament: string;
  roleAffinity: string;
  baseStats: Record<StatName, number>;
  statBias: StatName[];
  recruitCost: number;
  description: string;
}

const breeds: BreedDef[] = breedsData as BreedDef[];
const TRAITS = ['brave', 'lazy', 'curious', 'grumpy', 'playful', 'skittish', 'loyal', 'mischievous', 'pious', 'night_owl'];

export function getBreed(id: string): BreedDef | undefined {
  return breeds.find((b) => b.id === id);
}

export function getAllBreeds(): BreedDef[] {
  return breeds;
}

export function createCat(breed: string, name: string): CatSaveData {
  const def = getBreed(breed);
  if (!def) throw new Error(`Unknown breed: ${breed}`);

  const stats = { ...def.baseStats };
  // Individual variance: +/- 1 on each stat
  for (const key of Object.keys(stats) as StatName[]) {
    stats[key] = Math.max(1, Math.min(10, stats[key] + randomInt(-1, 1)));
  }

  const traits: string[] = [];
  const available = [...TRAITS];
  traits.push(pick(available));
  const remaining = available.filter((t) => t !== traits[0]);
  if (Math.random() > 0.3) traits.push(pick(remaining));

  return {
    id: `cat_${breed}_${Date.now()}`,
    name,
    breed,
    level: 1,
    xp: 0,
    mood: 'content',
    traits,
    stats,
    isPlayer: false,
  };
}

export function addXp(cat: CatSaveData, amount: number): boolean {
  cat.xp += amount;
  const threshold = cat.level * 100;
  if (cat.xp >= threshold && cat.level < 5) {
    cat.xp -= threshold;
    cat.level++;
    // Level up: +1 to a biased-random stat
    const def = getBreed(cat.breed);
    const pool: StatName[] = [...(def?.statBias ?? []), ...Object.keys(cat.stats) as StatName[]];
    const chosen = pick(pool);
    cat.stats[chosen] = Math.min(10, cat.stats[chosen] + 1);
    return true;
  }
  return false;
}

export function getAvailableRecruits(save: SaveData): BreedDef[] {
  const ownedBreeds = new Set(save.cats.map((c) => c.breed));
  return breeds.filter((b) => {
    if (ownedBreeds.has(b.id) || b.recruitCost <= 0) return false;
    // Bengal only available after Chapter 6 rival is defeated
    if (b.id === 'bengal' && (save.chapter < 6 || !save.flags.rivalDefeated)) return false;
    return true;
  });
}

export function getCatStatTotal(cat: CatSaveData, statNames: StatName[]): number {
  return statNames.reduce((sum, s) => sum + cat.stats[s], 0);
}
