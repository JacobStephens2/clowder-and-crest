import type { StatName } from '../utils/constants';

export interface CatSaveData {
  id: string;
  name: string;
  breed: string;
  level: number;
  xp: number;
  mood: 'happy' | 'content' | 'tired' | 'unhappy';
  traits: string[];
  stats: Record<StatName, number>;
  isPlayer: boolean;
}

export interface BondSaveData {
  catA: string;
  catB: string;
  points: number;
  conversationsViewed: string[];
}

export interface FurniturePlacement {
  furnitureId: string;
  room: string;
  gridX: number;
  gridY: number;
}

export interface RoomSaveData {
  id: string;
  unlocked: boolean;
}

export interface StationedJob {
  catId: string;
  jobId: string;
  dayStarted: number;
}

export interface SaveData {
  version: number;
  day: number;
  chapter: number;
  fish: number;
  playerCatName: string;
  reputationScore: number;
  totalFishEarned: number;
  totalJobsCompleted: number;
  cats: CatSaveData[];
  rooms: RoomSaveData[];
  furniture: FurniturePlacement[];
  completedJobs: string[];
  bonds: BondSaveData[];
  puzzlesCompleted: Record<string, number>;
  flags: Record<string, boolean>;
  availableRecruits: string[];
  stationedCats: StationedJob[];
}

const SAVE_KEY = 'clowder_and_crest_save';
const SAVE_VERSION = 1;

export function createDefaultSave(playerCatName: string): SaveData {
  return {
    version: SAVE_VERSION,
    day: 1,
    chapter: 1,
    fish: 15,
    playerCatName,
    reputationScore: 0,
    totalFishEarned: 0,
    totalJobsCompleted: 0,
    cats: [
      {
        id: 'player_wildcat',
        name: playerCatName,
        breed: 'wildcat',
        level: 1,
        xp: 0,
        mood: 'content',
        traits: ['brave', 'independent'],
        stats: { hunting: 7, stealth: 5, intelligence: 4, endurance: 5, charm: 3, senses: 4 },
        isPlayer: true,
      },
    ],
    rooms: [
      { id: 'sleeping', unlocked: true },
      { id: 'kitchen', unlocked: false },
      { id: 'operations', unlocked: false },
    ],
    furniture: [],
    completedJobs: [],
    bonds: [],
    puzzlesCompleted: {},
    flags: {},
    availableRecruits: [],
    stationedCats: [],
  };
}

export function saveGame(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save game:', e);
  }
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== SAVE_VERSION) return null;
    // Migrate older saves missing stationedCats
    if (!data.stationedCats) data.stationedCats = [];
    return data;
  } catch {
    return null;
  }
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}
