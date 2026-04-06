import type { SaveData, BondSaveData, CatSaveData } from './SaveManager';
import { BOND_THRESHOLDS, STAT_NAMES, type BondRank, type StatName } from '../utils/constants';

const BOND_PAIRS = [
  ['wildcat', 'russian_blue'],
  ['wildcat', 'maine_coon'],
  ['wildcat', 'tuxedo'],
  ['wildcat', 'siamese'],
  ['wildcat', 'bengal'],
  ['russian_blue', 'tuxedo'],
  ['russian_blue', 'siamese'],
  ['russian_blue', 'bengal'],
  ['tuxedo', 'siamese'],
  ['tuxedo', 'bengal'],
  ['maine_coon', 'tuxedo'],
  ['maine_coon', 'siamese'],
  ['maine_coon', 'russian_blue'],
  ['maine_coon', 'bengal'],
  ['siamese', 'bengal'],
];

function bondKey(a: string, b: string): string {
  return [a, b].sort().join('_');
}

export function getBondPairs(): string[][] {
  return BOND_PAIRS;
}

function findBond(save: SaveData, breedA: string, breedB: string): BondSaveData | undefined {
  const key = bondKey(breedA, breedB);
  return save.bonds.find((b) => bondKey(b.catA, b.catB) === key);
}

function getOrCreateBond(save: SaveData, breedA: string, breedB: string): BondSaveData {
  let bond = findBond(save, breedA, breedB);
  if (!bond) {
    bond = { catA: breedA, catB: breedB, points: 0, conversationsViewed: [] };
    save.bonds.push(bond);
  }
  return bond;
}

export function addBondPoints(save: SaveData, breedA: string, breedB: string, points: number): { rankUp: boolean; newRank: BondRank } | null {
  // Only track bonds for defined pairs
  const isPair = BOND_PAIRS.some(
    ([a, b]) => bondKey(a, b) === bondKey(breedA, breedB)
  );
  if (!isPair) return null;
  const bond = getOrCreateBond(save, breedA, breedB);
  const oldRank = getBondRank(bond.points);
  bond.points += points;
  const newRank = getBondRank(bond.points);
  return { rankUp: newRank !== oldRank, newRank };
}

export function getBondRank(points: number): BondRank {
  if (points >= BOND_THRESHOLDS.bonded) return 'bonded';
  if (points >= BOND_THRESHOLDS.companion) return 'companion';
  if (points >= BOND_THRESHOLDS.acquaintance) return 'acquaintance';
  return 'stranger';
}

export function getAvailableConversation(save: SaveData, breedA: string, breedB: string): string | null {
  const bond = findBond(save, breedA, breedB);
  if (!bond) return null;
  const rank = getBondRank(bond.points);
  const ranks: BondRank[] = ['acquaintance', 'companion', 'bonded'];
  const conversationRanks = ['C', 'B', 'A'];

  for (let i = 0; i < ranks.length; i++) {
    if (ranks.indexOf(rank) >= i && !bond.conversationsViewed.includes(conversationRanks[i])) {
      return conversationRanks[i];
    }
  }
  return null;
}

export function markConversationViewed(save: SaveData, breedA: string, breedB: string, rank: string): void {
  const bond = getOrCreateBond(save, breedA, breedB);
  if (!bond.conversationsViewed.includes(rank)) {
    bond.conversationsViewed.push(rank);
  }
}

export function processDailyBonds(save: SaveData): void {
  // Cats in the same guild earn passive bond points
  const catBreeds = save.cats.map((c) => c.breed);
  for (const [a, b] of BOND_PAIRS) {
    if (catBreeds.includes(a) && catBreeds.includes(b)) {
      addBondPoints(save, a, b, 1);
    }
  }
}

export interface BondRankReward {
  /** The stat each cat in the pair gained */
  stat: StatName;
  /** How much was added (1 or 2) */
  amount: number;
  /** A human-readable flavor line for the rank-up */
  flavor: string;
}

/**
 * Apply the mechanical reward for a bond rank-up to BOTH cats in the pair.
 *
 * The design goal (from todo/ideas/Great Guild Management Games.md):
 * "bond conversations change the playable economy/roster in noticeable ways."
 * Reaching a bond rank should make the cats visibly stronger, not just unlock
 * dialogue. Otherwise bonds are decorative and can be ignored without loss,
 * which is the failure mode all three model reviewers warned about.
 *
 * Reward schedule:
 *   - acquaintance: +1 to each cat's WEAKEST stat (rounds them out)
 *   - companion:    +1 to each cat's STRONGEST stat (doubles down)
 *   - bonded:       +2 to each cat's STRONGEST stat + mood set to 'happy'
 *
 * Stats are capped at 10. If both cats are already maxed, no stat grant
 * happens but the rank-up narrative still fires.
 */
export function grantBondRankReward(
  catA: CatSaveData,
  catB: CatSaveData,
  rank: BondRank,
): BondRankReward | null {
  if (rank === 'stranger') return null;

  // Pick the stat. Each cat may get a different stat applied to them, but for
  // the flavor message we describe the pair's shared direction.
  const pickStat = (cat: CatSaveData, mode: 'weakest' | 'strongest'): StatName | null => {
    const entries = STAT_NAMES.map((s) => ({ name: s, val: cat.stats[s] }));
    // Filter out maxed stats if we're adding to them
    const candidates = entries.filter((e) => e.val < 10);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => mode === 'weakest' ? a.val - b.val : b.val - a.val);
    return candidates[0].name;
  };

  let amount = 1;
  let mode: 'weakest' | 'strongest';
  let flavor: string;

  if (rank === 'acquaintance') {
    mode = 'weakest';
    flavor = 'learned from each other';
  } else if (rank === 'companion') {
    mode = 'strongest';
    flavor = 'sharpened each other';
  } else {
    // bonded
    mode = 'strongest';
    amount = 2;
    flavor = 'became inseparable';
    // At 'bonded' rank, both cats' mood jumps to happy
    catA.mood = 'happy';
    catB.mood = 'happy';
  }

  const statA = pickStat(catA, mode);
  const statB = pickStat(catB, mode);
  if (!statA && !statB) {
    return { stat: 'hunting', amount: 0, flavor: `${flavor} (already maxed)` };
  }

  if (statA) {
    catA.stats[statA] = Math.min(10, catA.stats[statA] + amount);
  }
  if (statB) {
    catB.stats[statB] = Math.min(10, catB.stats[statB] + amount);
  }

  // Report a representative stat (prefer A's since we have to pick one for UI)
  const displayStat = statA ?? statB ?? 'hunting';
  return { stat: displayStat, amount, flavor };
}
