import jobsData from '../data/jobs.json';
import type { SaveData, CatSaveData } from './SaveManager';
import type { StatName } from '../utils/constants';
import { shuffled } from '../utils/helpers';

export interface JobDef {
  id: string;
  name: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  keyStats: StatName[];
  baseReward: number;
  maxReward: number;
  puzzleSkin: string;
  description: string;
}

const allJobs: JobDef[] = jobsData as JobDef[];

export function getAllJobs(): JobDef[] {
  return allJobs;
}

export function getJob(id: string): JobDef | undefined {
  return allJobs.find((j) => j.id === id);
}

export function generateDailyJobs(save: SaveData): JobDef[] {
  let available = [...allJobs];

  // Filter by chapter progression
  if (save.chapter < 2) {
    available = available.filter((j) => j.category === 'pest_control' && j.difficulty === 'easy');
  } else if (save.chapter < 3) {
    available = available.filter((j) => j.difficulty !== 'hard');
  }

  // Chapter 3 rat plague: add extra pest control jobs
  if (save.chapter === 3 && !save.flags.ratPlagueResolved) {
    const pestJobs = available.filter((j) => j.category === 'pest_control');
    available = [...pestJobs, ...pestJobs, ...available.filter((j) => j.category !== 'pest_control')];
  }

  const count = Math.min(3 + Math.floor(save.chapter / 2), available.length);
  return shuffled(available).slice(0, count);
}

export function getStatMatchScore(cat: CatSaveData, job: JobDef): number {
  if (job.keyStats.length === 0) return 0.5;
  const total = job.keyStats.reduce((sum, s) => sum + cat.stats[s], 0);
  const max = job.keyStats.length * 10;
  return total / max;
}

export function getDifficultyThreshold(difficulty: string): number {
  switch (difficulty) {
    case 'easy': return 4;
    case 'medium': return 6;
    case 'hard': return 8;
    default: return 5;
  }
}
