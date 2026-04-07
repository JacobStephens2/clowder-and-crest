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
  assignedRoom?: string;
  specialization?: string;
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

export interface JournalEntry {
  day: number;
  text: string;
  type: 'chapter' | 'recruit' | 'level' | 'bond' | 'event' | 'specialization' | 'reputation';
}

/** Persistent dungeon-run history. Drives the Hades-style reactive
    narrative — early runs use the standard intro/outro, later runs branch
    on attempt count, best floor, and most recent failure. */
export interface DungeonHistory {
  totalRuns: number;
  totalClears: number;
  bestFloor: number;
  /** Floor index of the most recent failure, -1 if no prior failure. */
  lastFailFloor: number;
  /** Cause label of the most recent failure (minigame name or 'retreat'). */
  lastFailCause: string;
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
  flags: Record<string, boolean | number | string>;
  availableRecruits: string[];
  stationedCats: StationedJob[];
  journal: JournalEntry[];
  dungeonHistory?: DungeonHistory;
  lastPlayedTimestamp?: number;
}

const SAVE_KEY = 'clowder_and_crest_save';
const SAVE_VERSION = 2;

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
    journal: [],
    dungeonHistory: { totalRuns: 0, totalClears: 0, bestFloor: 0, lastFailFloor: -1, lastFailCause: '' },
  };
}

let saveFailCount = 0;

export function saveGame(data: SaveData): void {
  try {
    data.lastPlayedTimestamp = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    saveFailCount = 0;
  } catch (e) {
    saveFailCount++;
    console.error('Failed to save game:', e);
    // Notify player on first failure (avoid spamming)
    if (saveFailCount === 1) {
      const warn = document.createElement('div');
      warn.className = 'toast';
      warn.style.color = '#cc6666';
      warn.textContent = 'Save failed — storage may be full. Export your save from the menu.';
      document.getElementById('overlay-layer')?.appendChild(warn);
      setTimeout(() => warn.remove(), 5000);
    }
  }
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    // Migrate saves forward instead of destroying them
    if (!Array.isArray(data.cats)) data.cats = [];
    if (!Array.isArray(data.rooms)) data.rooms = [{ id: 'sleeping', unlocked: true }, { id: 'kitchen', unlocked: false }, { id: 'operations', unlocked: false }];
    if (!data.stationedCats) data.stationedCats = [];
    if (!data.bonds) data.bonds = [];
    if (!data.flags) data.flags = {};
    if (!data.availableRecruits) data.availableRecruits = [];
    if (!data.puzzlesCompleted) data.puzzlesCompleted = {};
    if (data.totalFishEarned === undefined) data.totalFishEarned = 0;
    if (data.totalJobsCompleted === undefined) data.totalJobsCompleted = 0;
    if (data.reputationScore === undefined) data.reputationScore = 0;
    if (!data.journal) data.journal = [];
    if (!data.dungeonHistory) {
      data.dungeonHistory = { totalRuns: 0, totalClears: 0, bestFloor: 0, lastFailFloor: -1, lastFailCause: '' };
    }
    data.version = SAVE_VERSION;
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

// ── Multi-slot save support ──
const SLOT_PREFIX = 'clowder_save_slot_';

export function saveToSlot(slot: number, data: SaveData): void {
  try {
    data.lastPlayedTimestamp = Date.now();
    localStorage.setItem(`${SLOT_PREFIX}${slot}`, JSON.stringify(data));
  } catch (e) {
    console.error(`Failed to save to slot ${slot}:`, e);
  }
}

export function loadFromSlot(slot: number): SaveData | null {
  try {
    const raw = localStorage.getItem(`${SLOT_PREFIX}${slot}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    // Apply same migration as loadGame
    if (!Array.isArray(data.cats)) data.cats = [];
    if (!Array.isArray(data.rooms)) data.rooms = [{ id: 'sleeping', unlocked: true }, { id: 'kitchen', unlocked: false }, { id: 'operations', unlocked: false }];
    if (!data.stationedCats) data.stationedCats = [];
    if (!data.bonds) data.bonds = [];
    if (!data.flags) data.flags = {};
    if (!data.availableRecruits) data.availableRecruits = [];
    if (!data.puzzlesCompleted) data.puzzlesCompleted = {};
    if (data.totalFishEarned === undefined) data.totalFishEarned = 0;
    if (data.totalJobsCompleted === undefined) data.totalJobsCompleted = 0;
    if (data.reputationScore === undefined) data.reputationScore = 0;
    if (!data.journal) data.journal = [];
    if (!data.dungeonHistory) {
      data.dungeonHistory = { totalRuns: 0, totalClears: 0, bestFloor: 0, lastFailFloor: -1, lastFailCause: '' };
    }
    data.version = SAVE_VERSION;
    return data;
  } catch {
    return null;
  }
}

export function deleteSlot(slot: number): void {
  localStorage.removeItem(`${SLOT_PREFIX}${slot}`);
}

export function getSlotSummary(slot: number): { name: string; day: number; chapter: number; cats: number } | null {
  try {
    const raw = localStorage.getItem(`${SLOT_PREFIX}${slot}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return { name: data.playerCatName ?? 'Unknown', day: data.day ?? 1, chapter: data.chapter ?? 1, cats: data.cats?.length ?? 1 };
  } catch {
    return null;
  }
}

export function addJournalEntry(save: SaveData, text: string, type: JournalEntry['type']): void {
  save.journal.push({ day: save.day, text, type });
  // Keep journal to a reasonable size (last 100 entries)
  if (save.journal.length > 100) save.journal.splice(0, save.journal.length - 100);
}
