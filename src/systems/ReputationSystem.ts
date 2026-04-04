import type { SaveData } from './SaveManager';
import type { JobDef } from './JobBoard';

const CATEGORY_SHIFTS: Record<string, number> = {
  sacred: 3,
  guard: 2,
  pest_control: 0,
  courier: 0,
  detection: -2,
};

export function applyReputationShift(save: SaveData, job: JobDef): void {
  const shift = CATEGORY_SHIFTS[job.category] ?? 0;
  if (shift !== 0) {
    save.reputationScore = Math.max(-100, Math.min(100, save.reputationScore + shift));
  }
}

export function getReputationLabel(score: number): string {
  if (score >= 30) return 'Noble';
  if (score >= 10) return 'Respected';
  if (score > -10) return 'Neutral';
  if (score > -30) return 'Questionable';
  return 'Shadowed';
}

export function getReputationRecruitModifier(score: number): number {
  if (score >= 30) return 0.8;
  if (score >= 10) return 0.9;
  if (score > -10) return 1.0;
  if (score > -30) return 1.1;
  return 1.2;
}
