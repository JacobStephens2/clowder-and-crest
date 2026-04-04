import type { SaveData } from './SaveManager';
import type { JobDef } from './JobBoard';

const CATEGORY_SHIFTS: Record<string, number> = {
  sacred: 3,
  guard: 2,
  pest_control: 0,
  courier: 0,
  detection: -2,
  shadow: -5,
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
  if (score >= 30) return 0.8;   // Noble: cats want to join — discount
  if (score >= 10) return 0.9;
  if (score > -10) return 1.0;
  if (score > -30) return 1.1;
  return 1.2;                     // Shadowed: cats are wary — premium
}

// Temptation economics: Shadow pays MORE fish but Crest gives better non-fish benefits
export function getReputationBonuses(score: number): {
  dailyFish: number;
  rewardBonus: number;
  moodProtection: boolean;
  bondBonus: number;
  xpBonus: number;
  description: string;
} {
  if (score >= 30) return {
    dailyFish: 1, rewardBonus: 0, moodProtection: true, bondBonus: 2, xpBonus: 0.2,
    description: 'Noble: +1 daily fish, mood protection, +2 bond/day, +20% XP',
  };
  if (score >= 10) return {
    dailyFish: 0, rewardBonus: 0, moodProtection: false, bondBonus: 1, xpBonus: 0.1,
    description: 'Respected: +1 bond/day, +10% XP',
  };
  if (score > -10) return {
    dailyFish: 0, rewardBonus: 0, moodProtection: false, bondBonus: 0, xpBonus: 0,
    description: 'Neutral: no bonuses or penalties',
  };
  if (score > -30) return {
    dailyFish: 0, rewardBonus: 0.15, moodProtection: false, bondBonus: -1, xpBonus: 0,
    description: 'Questionable: +15% fish rewards, but bonds grow slower',
  };
  return {
    dailyFish: 0, rewardBonus: 0.25, moodProtection: false, bondBonus: -2, xpBonus: -0.1,
    description: 'Shadowed: +25% fish rewards, but bonds decay, -10% XP, cats may leave',
  };
}
