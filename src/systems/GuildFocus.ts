import type { CatSaveData, SaveData } from './SaveManager';
import type { JobDef } from './JobBoard';
import { getCurrentFestival, getDailyWish, getComboMultiplier } from './GameSystems';
import { calculateDailyUpkeep, calculateStationedDailyIncome } from './GuildMetrics';
import { getStatMatchScore } from './JobBoard';
import { getNextChapterHint } from './ProgressionManager';
import { getReputationBonuses, getReputationLabel } from './ReputationSystem';

export interface FocusLine {
  color: string;
  text: string;
}

function cleanChapterHint(hint: string | null): string | null {
  if (!hint) return null;
  return hint.replace(/^Next chapter needs:\s*/i, 'Chapter pressure: ');
}

export function getGuildFocusLines(save: SaveData): FocusLine[] {
  const lines: FocusLine[] = [];
  const upkeep = calculateDailyUpkeep(save);
  const stationedIncome = calculateStationedDailyIncome(save);
  const net = stationedIncome - upkeep;
  const festival = getCurrentFestival(save.day);
  const wish = getDailyWish(save.day, save.cats, save.furniture.map((item) => item.furnitureId));
  const repLabel = getReputationLabel(save.reputationScore);
  const repBonuses = getReputationBonuses(save.reputationScore);
  const chapterHint = cleanChapterHint(getNextChapterHint(save));
  const nearSpecialist = save.cats.find((cat) => !cat.specialization && cat.level >= 4);

  if (festival) {
    lines.push({
      color: '#dda055',
      text: `${festival.name} is live. ${festival.bonus}`,
    });
  }

  if (wish && !save.flags[`wish_day_${save.day}`]) {
    lines.push({
      color: '#c4956a',
      text: `${wish.catName}'s wish is still open. Small morale swings stack over long runs.`,
    });
  }

  if (save.flags.ratPlagueStarted && !save.flags.ratPlagueResolved) {
    const progress = Number(save.flags.plaguePestDone ?? 0);
    lines.push({
      color: '#cc6666',
      text: `Rat Plague pressure: ${progress}/5 nests cleared. Pest-control work is your chapter gate right now.`,
    });
  }

  if (net < 0 && save.cats.length >= 2) {
    // Per user feedback: "It wasn't totally clear to me if I should have
    // gone into fish debt or something". Add a days-until-broke estimate
    // and a soft/urgent split so the player can judge severity at a glance.
    const daysUntilBroke = net !== 0 ? Math.floor(save.fish / -net) : 99;
    if (daysUntilBroke <= 2) {
      lines.push({
        color: '#cc4444',
        text: `Guild balance is ${net}/day and you have ${save.fish} fish — about ${daysUntilBroke} day${daysUntilBroke === 1 ? '' : 's'} of runway. Take a high-pay job or station a cat now.`,
      });
    } else if (daysUntilBroke <= 5) {
      lines.push({
        color: '#cc6666',
        text: `Guild balance is ${net}/day. You have ${save.fish} fish — that's about ${daysUntilBroke} days of runway. Worth working a job soon.`,
      });
    } else {
      lines.push({
        color: '#cc6666',
        text: `Guild balance is ${net}/day. ${save.fish} fish on hand is fine for now (${daysUntilBroke}+ days of runway), but the trend is downward — consider stationing a cat.`,
      });
    }
  } else if (net >= 0 && save.stationedCats.length > 0) {
    lines.push({
      color: '#4a8a4a',
      text: `Guild balance is +${net}/day. Stationed income is carrying the settlement right now.`,
    });
  }

  if (nearSpecialist) {
    lines.push({
      color: '#6b8ea6',
      text: `${nearSpecialist.name} is close to specialization. Repeating one category now will define a permanent role.`,
    });
  }

  if (save.reputationScore >= 10 || save.reputationScore <= -10) {
    lines.push({
      color: save.reputationScore >= 10 ? '#6b8ea6' : '#8a6a4a',
      text: `${repLabel} reputation is active. ${repBonuses.description}`,
    });
  }

  if (chapterHint) {
    lines.push({
      color: '#8b7355',
      text: chapterHint,
    });
  }

  return lines.slice(0, 3);
}

export function getJobMomentLines(save: SaveData, job: JobDef, cat: CatSaveData): string[] {
  const lines: string[] = [];
  const match = getStatMatchScore(cat, job);
  const festival = getCurrentFestival(save.day);
  const comboMult = getComboMultiplier(cat.id, job.category, save.day);
  const repBonuses = getReputationBonuses(save.reputationScore);

  if (festival && (festival.category === 'all' || festival.category === job.category)) {
    lines.push(`${festival.name} boosts this job today.`);
  }

  if (comboMult > 1) {
    lines.push(`${cat.name} can extend a ${job.category} streak to x${comboMult.toFixed(2)} reward.`);
  }

  if (cat.specialization === job.category) {
    lines.push('This cat is already specialized here, so this is one of your cleanest long-term assignments.');
  } else if (!cat.specialization && cat.level >= 4) {
    lines.push('This category is close to locking in the cat’s permanent role.');
  }

  if (save.reputationScore <= -10 && repBonuses.rewardBonus > 0) {
    lines.push('Shadow reputation is raising direct fish payouts, but it slows relationship growth.');
  } else if (save.reputationScore >= 10 && repBonuses.xpBonus > 0) {
    lines.push('Crest reputation is turning reliable work into better XP growth.');
  }

  if (match >= 0.75) {
    lines.push('This cat is an excellent stat fit, so the active clear should convert well into fish.');
  }

  return lines.slice(0, 3);
}
