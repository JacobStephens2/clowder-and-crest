export const DPR = Math.min(window.devicePixelRatio || 1, 3);
export const GAME_WIDTH = 390;
export const GAME_HEIGHT = 844;
export const GRID_SIZE = 6;
export const TILE_SIZE = 54;
export const PUZZLE_OFFSET_X = (390 - 6 * 54) / 2; // 33, centered
export const PUZZLE_OFFSET_Y = 90;

// Single source of truth for breed IDs — used for sprite loading, art checks, etc.
export const ALL_BREED_IDS = ['wildcat', 'russian_blue', 'tuxedo', 'maine_coon', 'siamese', 'bengal'] as const;

export const BREED_COLORS: Record<string, string> = {
  wildcat: '#8B7355',
  russian_blue: '#6B8EA6',
  tuxedo: '#2C2C2C',
  maine_coon: '#C4956A',
  siamese: '#D4C5A9',
  bengal: '#C49A6C',
};

export const BREED_NAMES: Record<string, string> = {
  wildcat: 'Wildcat',
  russian_blue: 'Russian Blue',
  tuxedo: 'Tuxedo',
  maine_coon: 'Maine Coon',
  siamese: 'Siamese',
  bengal: 'Bengal',
};

export const STAT_NAMES = ['hunting', 'stealth', 'intelligence', 'endurance', 'charm', 'senses'] as const;
export type StatName = typeof STAT_NAMES[number];

export const BOND_RANKS = ['stranger', 'acquaintance', 'companion', 'bonded'] as const;
export type BondRank = typeof BOND_RANKS[number];

export const BOND_THRESHOLDS: Record<BondRank, number> = {
  stranger: 0,
  acquaintance: 10,
  companion: 25,
  bonded: 50,
};

export const CHAPTER_TRIGGERS = [
  { chapter: 1, jobs: 0, cats: 1, fish: 0 },
  { chapter: 2, jobs: 5, cats: 2, fish: 0 },
  { chapter: 3, jobs: 0, cats: 3, fish: 200 },
  { chapter: 4, jobs: 15, cats: 4, fish: 0 },
  { chapter: 5, jobs: 30, cats: 5, fish: 0 },
  { chapter: 6, jobs: 50, cats: 5, fish: 500 },
  { chapter: 7, jobs: 70, cats: 5, fish: 800 },
];

// Scene keys — use these instead of string literals to prevent typo bugs
export const SCENES = {
  BOOT: 'BootScene',
  TITLE: 'TitleScene',
  GUILDHALL: 'GuildhallScene',
  TOWN_MAP: 'TownMapScene',
  PUZZLE: 'PuzzleScene',
  SOKOBAN: 'SokobanScene',
  CHASE: 'ChaseScene',
  ROOM: 'RoomScene',
  FISHING: 'FishingScene',
  HUNT: 'HuntScene',
  NONOGRAM: 'NonogramScene',
  BRAWL: 'BrawlScene',
  STEALTH: 'StealthScene',
  POUNCE: 'PounceScene',
  PATROL: 'PatrolScene',
  RITUAL: 'RitualScene',
  SCENT_TRAIL: 'ScentTrailScene',
  HEIST: 'HeistScene',
  COURIER_RUN: 'CourierRunScene',
  DUNGEON: 'DungeonRunScene',
} as const;
