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
    // Chapter 1: only easy pest control
    available = available.filter((j) => j.category === 'pest_control' && j.difficulty === 'easy');
  } else if (save.chapter < 3) {
    // Chapter 2: pest control + courier, no hard
    available = available.filter((j) => ['pest_control', 'courier'].includes(j.category) && j.difficulty !== 'hard');
  } else if (save.chapter < 4) {
    // Chapter 3: all categories unlock, no hard for new ones
    available = available.filter((j) => j.difficulty !== 'hard' || ['pest_control', 'courier'].includes(j.category));
  }
  // Chapter 4+: everything available

  // Reputation-gated jobs
  // Shadow jobs only appear for Questionable/Shadowed guilds (score < -10)
  if (save.reputationScore >= -10) {
    available = available.filter((j) => j.category !== 'shadow');
  }
  // Saint's Vigil (crest_pilgrimage) only for Respected/Noble guilds (score >= 10)
  if (save.reputationScore < 10) {
    available = available.filter((j) => j.id !== 'crest_pilgrimage');
  }

  // Chapter 3 rat plague: add extra pest control jobs
  if (save.chapter === 3 && !save.flags.ratPlagueResolved) {
    const pestJobs = available.filter((j) => j.category === 'pest_control');
    available = [...pestJobs, ...pestJobs, ...available.filter((j) => j.category !== 'pest_control')];
  }

  const count = Math.min(3 + Math.floor(save.chapter / 2), available.length);
  const jobs = shuffled(available).slice(0, count);

  // Chapter 6+: Mark 1-2 jobs as contested by the Silver Paws rival guild
  if (save.chapter >= 6) {
    const contestCount = Math.min(2, Math.floor(jobs.length / 2));
    for (let i = 0; i < contestCount; i++) {
      (jobs[i] as any).contested = true;
    }
  }

  return jobs;
}

export function getStatMatchScore(cat: CatSaveData, job: JobDef): number {
  if (job.keyStats.length === 0) return 0.5;
  const total = job.keyStats.reduce((sum, s) => sum + cat.stats[s], 0);
  const max = job.keyStats.length * 10;
  let score = total / max;

  // Trait modifiers
  const traits = cat.traits ?? [];
  if (traits.includes('Brave') && job.difficulty === 'hard') score += 0.1;
  if (traits.includes('Lazy')) score -= 0.08;
  if (traits.includes('Curious') && (job.category === 'courier' || job.category === 'detection')) score += 0.08;
  if (traits.includes('Pious') && (job.category === 'pest_control' || job.category === 'sacred')) score += 0.08;
  if (traits.includes('Brave') && job.category === 'guard') score += 0.08;
  if (traits.includes('Loyal') && job.category === 'guard') score += 0.05;
  if (traits.includes('Night Owl')) score += 0.05;
  if (traits.includes('Skittish') && job.difficulty === 'hard') score -= 0.1;
  if (traits.includes('Loyal')) score += 0.03;
  if (traits.includes('Mischievous')) score += Math.random() > 0.5 ? 0.1 : -0.05;

  // Mood modifiers
  if (cat.mood === 'happy') score += 0.1;
  else if (cat.mood === 'tired') score -= 0.08;
  else if (cat.mood === 'unhappy') score -= 0.15;

  // Specialization bonus/penalty (level 5 choice)
  if (cat.specialization) {
    if (cat.specialization === job.category) {
      score += 0.2; // +20% in specialized category
    } else {
      score -= 0.05; // -5% in other categories
    }
  }

  return Math.max(0, Math.min(1, score));
}

export function getDifficultyThreshold(difficulty: string): number {
  switch (difficulty) {
    case 'easy': return 4;
    case 'medium': return 6;
    case 'hard': return 8;
    default: return 5;
  }
}
