import type { SaveData, BondSaveData } from './SaveManager';
import { BOND_THRESHOLDS, type BondRank } from '../utils/constants';

const BOND_PAIRS = [
  ['wildcat', 'russian_blue'],
  ['wildcat', 'maine_coon'],
  ['wildcat', 'tuxedo'],
  ['wildcat', 'siamese'],
  ['russian_blue', 'tuxedo'],
  ['russian_blue', 'siamese'],
  ['tuxedo', 'siamese'],
  ['maine_coon', 'tuxedo'],
  ['maine_coon', 'siamese'],
  ['maine_coon', 'russian_blue'],
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
