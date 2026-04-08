import type { StatName } from '../utils/constants';
import { normalizeTraitId } from './CatManager';
import { commitSessionToSave } from './PlaytimeTracker';

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
  /** Total wall-clock playtime in milliseconds, accumulated across all
   *  sessions. Updated by saveGame() via PlaytimeTracker.commitSessionToSave().
   *  Old saves backfill to 0 in migrateSaveData. */
  totalPlaytimeMs?: number;
}

const SAVE_KEY = 'clowder_and_crest_save';
const SAVE_VERSION = 2;

// ──── Untrusted-save sanitization ────
//
// Saves loaded from localStorage are *trusted* — they were written by our
// own code on this machine and are subject to whatever escaping our own
// code applies. Saves coming in from outside (the Import Save button) are
// *untrusted* — they could be a tampered JSON file with malicious string
// payloads in cat names, journal entries, etc.
//
// The defense is layered:
//   1. Render-time escape via esc() at every innerHTML interpolation
//      (already in place across Panels.ts, Conversations.ts, TitleScene.ts,
//      onboarding.ts, main.ts as of the XSS-fix commit)
//   2. Sanitize-on-import: clamp string lengths and strip control chars
//      so even if a future overlay forgets to escape, the worst case is
//      a long-but-harmless string instead of an executable payload
//
// validateAndSanitizeSave() implements layer 2. It runs only on imported
// saves, NOT on the local autosave (which is trusted). It also runs from
// loadFromSlot defensively in case localStorage was tampered with via
// devtools, but the primary use case is the Import Save button.

const MAX_NAME_LEN = 32;
const MAX_FLAG_VALUE_LEN = 200;
const MAX_JOURNAL_TEXT_LEN = 200;
const MAX_JOURNAL_ENTRIES = 200;
const MAX_CATS = 20;

/** Strip control characters and clamp length. Defense in depth — the
 *  render layer escapes HTML entities, this strips characters that have
 *  no legitimate place in a cat name or text field. */
function sanitizeString(value: unknown, maxLen: number, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, maxLen);
}

/** Validate + sanitize a JSON-parsed object that claims to be a SaveData.
 *  Returns null if it's structurally invalid (missing critical fields).
 *  Returns a cleaned SaveData if it's salvageable, with all string fields
 *  length-capped and stripped of control characters.
 *
 *  This does NOT escape HTML entities — that's the render layer's job
 *  (esc() at every innerHTML interpolation). This is the belt to esc()'s
 *  suspenders: even if a future overlay builder forgets to call esc(),
 *  the worst case is a 32-character mangled string, not an executable
 *  payload. */
export function validateAndSanitizeSave(data: unknown): SaveData | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  // Critical fields — if these are missing/wrong type, the save is invalid
  if (typeof d.day !== 'number' || d.day < 1 || d.day > 100_000) return null;
  if (typeof d.chapter !== 'number' || d.chapter < 1 || d.chapter > 100) return null;
  if (!Array.isArray(d.cats) || d.cats.length === 0) return null;

  // Sanitize cat array
  const cats = (d.cats as unknown[]).slice(0, MAX_CATS).map((rawCat) => {
    if (!rawCat || typeof rawCat !== 'object') return null;
    const c = rawCat as Record<string, unknown>;
    if (typeof c.id !== 'string' || typeof c.breed !== 'string') return null;
    return {
      id: sanitizeString(c.id, 64),
      name: sanitizeString(c.name, MAX_NAME_LEN, 'Unnamed'),
      breed: sanitizeString(c.breed, 32),
      level: typeof c.level === 'number' ? Math.max(1, Math.min(99, Math.floor(c.level))) : 1,
      xp: typeof c.xp === 'number' ? Math.max(0, Math.floor(c.xp)) : 0,
      mood: ['happy', 'content', 'tired', 'unhappy'].includes(c.mood as string) ? c.mood : 'content',
      traits: Array.isArray(c.traits) ? c.traits.filter((t) => typeof t === 'string').slice(0, 8) : [],
      stats: (c.stats && typeof c.stats === 'object') ? c.stats : {},
      isPlayer: c.isPlayer === true,
      assignedRoom: typeof c.assignedRoom === 'string' ? sanitizeString(c.assignedRoom, 32) : undefined,
      specialization: typeof c.specialization === 'string' ? sanitizeString(c.specialization, 32) : undefined,
    };
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  if (cats.length === 0) return null;

  // Sanitize journal entries (text is rendered into innerHTML)
  const journal = Array.isArray(d.journal)
    ? (d.journal as unknown[])
        .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
        .map((e) => ({
          day: typeof e.day === 'number' ? Math.max(1, Math.floor(e.day)) : 1,
          text: sanitizeString(e.text, MAX_JOURNAL_TEXT_LEN),
          type: ['chapter', 'recruit', 'level', 'bond', 'event', 'specialization', 'reputation'].includes(e.type as string)
            ? (e.type as JournalEntry['type'])
            : 'event' as const,
        }))
        .slice(-MAX_JOURNAL_ENTRIES)
    : [];

  // Sanitize flags — clamp string values to prevent giant payloads
  const flags: Record<string, boolean | number | string> = {};
  if (d.flags && typeof d.flags === 'object') {
    for (const [k, v] of Object.entries(d.flags as Record<string, unknown>)) {
      if (typeof k !== 'string' || k.length > 64) continue;
      if (typeof v === 'string') flags[k] = sanitizeString(v, MAX_FLAG_VALUE_LEN);
      else if (typeof v === 'number' || typeof v === 'boolean') flags[k] = v;
      // drop everything else
    }
  }

  // Construct the sanitized SaveData and let migrateSaveData fill in any
  // missing optional fields with defaults.
  const sanitized: SaveData = {
    version: typeof d.version === 'number' ? d.version : 1,
    day: Math.floor(d.day),
    chapter: Math.floor(d.chapter),
    fish: typeof d.fish === 'number' ? Math.max(0, Math.min(999_999, Math.floor(d.fish))) : 0,
    playerCatName: sanitizeString(d.playerCatName, MAX_NAME_LEN, 'Unnamed'),
    reputationScore: typeof d.reputationScore === 'number' ? Math.max(-100, Math.min(100, Math.floor(d.reputationScore))) : 0,
    totalFishEarned: typeof d.totalFishEarned === 'number' ? Math.max(0, Math.floor(d.totalFishEarned)) : 0,
    totalJobsCompleted: typeof d.totalJobsCompleted === 'number' ? Math.max(0, Math.floor(d.totalJobsCompleted)) : 0,
    cats: cats as SaveData['cats'],
    rooms: Array.isArray(d.rooms) ? (d.rooms as SaveData['rooms']) : [],
    furniture: Array.isArray(d.furniture) ? (d.furniture as SaveData['furniture']) : [],
    completedJobs: Array.isArray(d.completedJobs) ? (d.completedJobs as string[]).filter((s) => typeof s === 'string').slice(0, 1000) : [],
    bonds: Array.isArray(d.bonds) ? (d.bonds as SaveData['bonds']) : [],
    puzzlesCompleted: (d.puzzlesCompleted && typeof d.puzzlesCompleted === 'object') ? d.puzzlesCompleted as Record<string, number> : {},
    flags,
    availableRecruits: Array.isArray(d.availableRecruits) ? (d.availableRecruits as string[]).filter((s) => typeof s === 'string').slice(0, 100) : [],
    stationedCats: Array.isArray(d.stationedCats) ? (d.stationedCats as SaveData['stationedCats']) : [],
    journal,
    dungeonHistory: (d.dungeonHistory && typeof d.dungeonHistory === 'object') ? d.dungeonHistory as SaveData['dungeonHistory'] : undefined,
    lastPlayedTimestamp: typeof d.lastPlayedTimestamp === 'number' ? d.lastPlayedTimestamp : Date.now(),
  };

  return migrateSaveData(sanitized);
}

/** Walk a save through the version migration ladder.
 *
 *  Two phases:
 *
 *  1. **Explicit version migrations** (if version < SAVE_VERSION). Each
 *     `if (data.version < N)` block performs the rename / type change /
 *     restructure that the bump from N-1 to N introduced. Run them in
 *     order. Today there's only the v1→v2 step, which is a no-op
 *     because v2 was an additive schema bump (new fields, no renames).
 *     Future migrations follow the same pattern: add a new block, never
 *     remove an old one.
 *
 *  2. **Lazy field backfill** (always runs). Fills in optional fields
 *     that may be missing in older saves with sensible defaults. This
 *     is the safety net for additive schema changes that didn't get
 *     their own version bump.
 *
 *  After both phases the save is stamped with the current SAVE_VERSION
 *  so subsequent loads skip phase 1.
 *
 *  IMPORTANT: never destroy data in a migration. If a field is being
 *  retired, copy its value forward into the new field BEFORE deleting
 *  the old one, and prefer leaving the old field in place as a backup
 *  for one or two version cycles.
 */
function migrateSaveData(data: SaveData): SaveData {
  // ── Phase 1: explicit version migrations ──
  // Treat absent or non-numeric version as v1.
  const incomingVersion = typeof data.version === 'number' ? data.version : 1;

  if (incomingVersion < 2) {
    // v1 → v2 — additive schema bump (added dungeonHistory, journal,
    // totalFishEarned, totalJobsCompleted, reputationScore). All
    // additions are handled by phase 2 backfill below; nothing to
    // explicitly transform here. Block kept for documentation and
    // for future v2-only logic.
  }

  // Future migrations land here, e.g.:
  // if (incomingVersion < 3) {
  //   // v2 → v3 example: rename `playerCatName` to `playerName`
  //   if ((data as any).playerCatName && !data.playerName) {
  //     data.playerName = (data as any).playerCatName;
  //   }
  // }

  // ── Phase 2: lazy field backfill ──
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
  if (typeof data.totalPlaytimeMs !== 'number' || data.totalPlaytimeMs < 0) {
    data.totalPlaytimeMs = 0;
  }
  for (const cat of data.cats) {
    cat.traits = (cat.traits ?? []).map(normalizeTraitId);
  }

  // Stamp with the current version so subsequent loads skip phase 1.
  data.version = SAVE_VERSION;
  return data;
}

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
    totalPlaytimeMs: 0,
  };
}

let saveFailCount = 0;

export function saveGame(data: SaveData): void {
  try {
    // Roll the current playtime session's elapsed time into the running
    // total before serializing. PlaytimeTracker is the source of truth
    // for in-flight session time; saveGame is the chokepoint where it
    // gets persisted. See src/systems/PlaytimeTracker.ts for the rationale.
    commitSessionToSave(data);
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
    return migrateSaveData(JSON.parse(raw) as SaveData);
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
    // Same playtime commit hook as saveGame — both functions are
    // "persist the game state to storage" entry points and either
    // can land mid-session.
    commitSessionToSave(data);
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
    return migrateSaveData(JSON.parse(raw) as SaveData);
  } catch {
    return null;
  }
}

export function deleteSlot(slot: number): void {
  // Back up the slot's content to a timestamped .bak key BEFORE deleting
  // so a player who clicks "Overwrite" or "Delete" by mistake can recover.
  // Backups expire after 48 hours via pruneExpiredBackups().
  const key = `${SLOT_PREFIX}${slot}`;
  const existing = localStorage.getItem(key);
  if (existing) {
    try {
      localStorage.setItem(`${key}.bak.${Date.now()}`, existing);
    } catch (e) {
      // If localStorage is full, the backup is best-effort. Still delete
      // the original to free up space, since that's what the user asked for.
      console.warn('Save backup before delete failed (storage full?):', e);
    }
  }
  localStorage.removeItem(key);
}

const BACKUP_RETENTION_MS = 48 * 60 * 60 * 1000; // 48 hours
const BACKUP_PATTERN = new RegExp(`^${SLOT_PREFIX}(\\d+)\\.bak\\.(\\d+)$`);

/** Walk localStorage and remove `.bak.<ts>` entries older than 48 hours.
 *  Called from the title screen on load so the storage doesn't accumulate
 *  stale backups indefinitely. */
export function pruneExpiredBackups(): void {
  const now = Date.now();
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    const m = k.match(BACKUP_PATTERN);
    if (!m) continue;
    const ts = parseInt(m[2], 10);
    if (Number.isFinite(ts) && now - ts > BACKUP_RETENTION_MS) {
      toRemove.push(k);
    }
  }
  for (const k of toRemove) localStorage.removeItem(k);
}

/** List the most recent backup for a given slot, or null if none exist
 *  within the retention window. The result includes the backup key and
 *  the parsed save summary (name + day + chapter + cat count) so the
 *  title screen can render a meaningful "Recover" button. */
export function getRecentBackup(slot: number): { key: string; ageMs: number; summary: { name: string; day: number; chapter: number; cats: number } } | null {
  const now = Date.now();
  let bestKey: string | null = null;
  let bestTs = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    const m = k.match(BACKUP_PATTERN);
    if (!m) continue;
    if (parseInt(m[1], 10) !== slot) continue;
    const ts = parseInt(m[2], 10);
    if (!Number.isFinite(ts) || now - ts > BACKUP_RETENTION_MS) continue;
    if (ts > bestTs) {
      bestTs = ts;
      bestKey = k;
    }
  }
  if (!bestKey) return null;
  try {
    const raw = localStorage.getItem(bestKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      key: bestKey,
      ageMs: now - bestTs,
      summary: {
        name: typeof data.playerCatName === 'string' ? data.playerCatName : 'Unknown',
        day: typeof data.day === 'number' ? data.day : 1,
        chapter: typeof data.chapter === 'number' ? data.chapter : 1,
        cats: Array.isArray(data.cats) ? data.cats.length : 1,
      },
    };
  } catch {
    return null;
  }
}

/** Restore a backup to its original slot. Returns true on success. */
export function restoreBackup(slot: number, backupKey: string): boolean {
  try {
    const raw = localStorage.getItem(backupKey);
    if (!raw) return false;
    localStorage.setItem(`${SLOT_PREFIX}${slot}`, raw);
    localStorage.removeItem(backupKey);
    return true;
  } catch {
    return false;
  }
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
