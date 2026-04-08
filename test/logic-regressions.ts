import assert from 'node:assert/strict';

class MemoryStorage {
  store = new Map<string, string>();
  getItem(key: string) { return this.store.has(key) ? this.store.get(key) ?? null : null; }
  setItem(key: string, value: string) { this.store.set(key, value); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
  // Implementing the full Storage interface so iterators (length + key(i))
  // work — some SaveManager helpers use them to walk for .bak.* keys.
  get length() { return this.store.size; }
  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return index >= 0 && index < keys.length ? keys[index] : null;
  }
}

const localStorageMock = new MemoryStorage();
Object.assign(globalThis, {
  localStorage: localStorageMock,
  document: { getElementById: () => null },
  window: { devicePixelRatio: 1 },
});

const saveModule = await import('../src/systems/SaveManager.ts');
const jobBoardModule = await import('../src/systems/JobBoard.ts');
const progressionModule = await import('../src/systems/ProgressionManager.ts');
const playtimeModule = await import('../src/systems/PlaytimeTracker.ts');

const { createDefaultSave, loadFromSlot, loadGame, validateAndSanitizeSave, deleteSlot, getRecentBackup, restoreBackup, pruneExpiredBackups, saveToSlot } = saveModule;
const { generateDailyJobs, getAllJobs, getStatMatchScore } = jobBoardModule;
const { checkChapterAdvance, checkLongWinterStart, checkLongWinterResolution, getLongWinterDay } = progressionModule;
const { startPlaytimeSession, pausePlaytimeSession, getCurrentSessionMs, isPlaytimeRunning, commitSessionToSave, formatPlaytime } = playtimeModule;

function testSaveMigrationNormalizesTraits() {
  localStorageMock.clear();
  const save = createDefaultSave('Tester');
  save.cats[0].traits = ['Brave', 'Night Owl'];
  localStorage.setItem('clowder_and_crest_save', JSON.stringify(save));
  localStorage.setItem('clowder_save_slot_1', JSON.stringify(save));

  const loaded = loadGame();
  const slotLoaded = loadFromSlot(1);
  assert.deepEqual(loaded?.cats[0].traits, ['brave', 'night_owl']);
  assert.deepEqual(slotLoaded?.cats[0].traits, ['brave', 'night_owl']);
}

function testTraitScoringUsesNormalizedIds() {
  const save = createDefaultSave('Tester');
  save.chapter = 6;
  save.totalJobsCompleted = 60;
  const job = generateDailyJobs(save)[0];
  const cat = save.cats[0];
  cat.traits = ['brave', 'night_owl'];
  const boostedScore = getStatMatchScore(cat, { ...job, difficulty: 'hard', category: 'guard' });
  cat.traits = [];
  const baseScore = getStatMatchScore(cat, { ...job, difficulty: 'hard', category: 'guard' });
  assert.ok(boostedScore > baseScore, 'normalized brave/night_owl traits should improve job scoring');
}

function testContestedJobsDoNotLeakIntoStaticJobDefs() {
  const save = createDefaultSave('Tester');
  save.chapter = 6;
  save.totalJobsCompleted = 60;
  const jobs = generateDailyJobs(save);
  assert.ok(jobs.some((job) => job.contested), 'chapter 6 should generate contested jobs');
  assert.ok(getAllJobs().every((job) => job.contested !== true), 'static job definitions should remain uncontested');
}

function testChapterAdvanceStillRespectsSpecialFlags() {
  const save = createDefaultSave('Tester');
  save.chapter = 3;
  save.cats.push({ ...save.cats[0], id: 'cat_2', isPlayer: false, breed: 'tuxedo', name: 'Tux' });
  save.cats.push({ ...save.cats[0], id: 'cat_3', isPlayer: false, breed: 'maine_coon', name: 'Maine' });
  save.cats.push({ ...save.cats[0], id: 'cat_4', isPlayer: false, breed: 'siamese', name: 'Sia' });
  save.totalJobsCompleted = 15;
  save.totalFishEarned = 300;
  save.flags.ratPlagueResolved = false;
  assert.equal(checkChapterAdvance(save), false, 'chapter 4 should stay locked until the plague resolves');
  save.flags.ratPlagueResolved = true;
  assert.equal(checkChapterAdvance(save), true, 'chapter 4 should unlock once the plague resolves');
}

// ──── New unit tests (T1) ────
//
// These cover the sanitizer + backup/recovery code added in the
// XSS-fix and save-safety pass. They're cheap, deterministic, and run
// in the same script as the existing logic regressions.

function testSanitizerClampsLongNames() {
  const longName = 'A'.repeat(100);
  const raw = {
    ...createDefaultSave('Tester'),
    playerCatName: longName,
    cats: [{ id: 'p', name: longName, breed: 'wildcat', level: 1, xp: 0, mood: 'content', traits: [], stats: {}, isPlayer: true }],
  };
  const result = validateAndSanitizeSave(raw);
  assert.ok(result, 'sanitizer should accept structurally-valid save');
  assert.equal(result!.playerCatName.length, 32, 'playerCatName should be clamped to 32 chars');
  assert.equal(result!.cats[0].name.length, 32, 'cat name should be clamped to 32 chars');
}

function testSanitizerStripsControlCharacters() {
  const malicious = 'Whisker\x00\x01\x07\x1Fs';
  const raw = {
    ...createDefaultSave('Tester'),
    playerCatName: malicious,
  };
  const result = validateAndSanitizeSave(raw);
  assert.ok(result);
  assert.equal(result!.playerCatName, 'Whiskers', 'control characters should be stripped');
}

function testSanitizerKeepsHtmlEntitiesAsLiteralText() {
  // The sanitizer is NOT supposed to escape HTML entities — that's the
  // render layer's job. It's supposed to keep them as literal text so
  // the render-time esc() can produce a properly-escaped innerHTML.
  const payload = '<img src=x onerror=alert(1)>';
  const raw = {
    ...createDefaultSave('Tester'),
    playerCatName: payload,
  };
  const result = validateAndSanitizeSave(raw);
  assert.ok(result);
  assert.equal(result!.playerCatName, payload, 'HTML in name should pass through (escape happens at render time)');
}

function testSanitizerRejectsInvalidStructure() {
  assert.equal(validateAndSanitizeSave(null), null);
  assert.equal(validateAndSanitizeSave(undefined), null);
  assert.equal(validateAndSanitizeSave('not an object'), null);
  assert.equal(validateAndSanitizeSave({}), null);
  assert.equal(validateAndSanitizeSave({ day: 'one' }), null);
  assert.equal(validateAndSanitizeSave({ day: 1, chapter: 1, cats: [] }), null, 'empty cats array should be rejected');
  assert.equal(validateAndSanitizeSave({ day: -5, chapter: 1, cats: [{ id: 'a', breed: 'b' }] }), null, 'day < 1 should be rejected');
  assert.equal(validateAndSanitizeSave({ day: 999999999, chapter: 1, cats: [{ id: 'a', breed: 'b' }] }), null, 'day > 100000 should be rejected');
}

function testSanitizerClampsDangerousNumericFields() {
  const raw = {
    ...createDefaultSave('Tester'),
    fish: 999_999_999_999,
    reputationScore: -9999,
    totalFishEarned: -100,
  };
  const result = validateAndSanitizeSave(raw);
  assert.ok(result);
  assert.equal(result!.fish, 999_999, 'fish should clamp to 999_999');
  assert.equal(result!.reputationScore, -100, 'reputationScore should clamp to -100');
  assert.equal(result!.totalFishEarned, 0, 'negative totalFishEarned should clamp to 0');
}

function testSanitizerLimitsCatArrayLength() {
  const oneCat = { id: 'a', name: 'A', breed: 'wildcat', level: 1, xp: 0, mood: 'content', traits: [], stats: {}, isPlayer: false };
  const cats = Array.from({ length: 50 }, (_, i) => ({ ...oneCat, id: `cat_${i}` }));
  const raw = { ...createDefaultSave('Tester'), cats };
  const result = validateAndSanitizeSave(raw);
  assert.ok(result);
  assert.ok(result!.cats.length <= 20, `cat array should be capped at 20 (got ${result!.cats.length})`);
}

function testSaveBackupOnDelete() {
  localStorageMock.clear();
  const save = createDefaultSave('Backup-Test-Player');
  saveToSlot(2, save);
  // Verify the slot exists
  assert.ok(loadFromSlot(2), 'slot 2 should have a save');
  // Delete it — should create a backup
  deleteSlot(2);
  // Slot should be gone
  assert.equal(loadFromSlot(2), null, 'slot 2 should be empty after delete');
  // Backup should be findable
  const backup = getRecentBackup(2);
  assert.ok(backup, 'a recent backup should exist after delete');
  assert.equal(backup!.summary.name, 'Backup-Test-Player', 'backup summary should match deleted save');
}

function testSaveBackupRestore() {
  localStorageMock.clear();
  const save = createDefaultSave('Restore-Test-Player');
  save.day = 42;
  saveToSlot(3, save);
  deleteSlot(3);
  const backup = getRecentBackup(3);
  assert.ok(backup);
  const ok = restoreBackup(3, backup!.key);
  assert.equal(ok, true, 'restoreBackup should return true on success');
  const restored = loadFromSlot(3);
  assert.ok(restored, 'slot 3 should have a save again after restore');
  assert.equal(restored!.day, 42, 'restored save should preserve day');
  assert.equal(restored!.playerCatName, 'Restore-Test-Player');
}

function testPruneExpiredBackupsRemovesOldOnes() {
  localStorageMock.clear();
  // Manually plant a backup with an old timestamp (49 hours ago)
  const oldTs = Date.now() - 49 * 60 * 60 * 1000;
  const recentTs = Date.now() - 1 * 60 * 60 * 1000;
  const sampleSave = JSON.stringify(createDefaultSave('Prune-Test'));
  localStorage.setItem(`clowder_save_slot_1.bak.${oldTs}`, sampleSave);
  localStorage.setItem(`clowder_save_slot_1.bak.${recentTs}`, sampleSave);
  pruneExpiredBackups();
  assert.equal(localStorage.getItem(`clowder_save_slot_1.bak.${oldTs}`), null, 'old backup should be pruned');
  assert.ok(localStorage.getItem(`clowder_save_slot_1.bak.${recentTs}`), 'recent backup should remain');
}

// ──── Long Winter regression tests ────
//
// The Long Winter is the structural fall added per story-audit-council.md.
// These tests pin the trigger window, the chapter 5 gate, and the resolution
// timing so future refactors don't accidentally break the rags-to-riches arc.

function makeChapter4Save() {
  const save = createDefaultSave('Winter-Test');
  save.chapter = 4;
  save.totalJobsCompleted = 30;
  save.cats.push({ ...save.cats[0], id: 'cat_2', isPlayer: false, breed: 'tuxedo', name: 'Tux' });
  save.cats.push({ ...save.cats[0], id: 'cat_3', isPlayer: false, breed: 'maine_coon', name: 'Maine' });
  save.cats.push({ ...save.cats[0], id: 'cat_4', isPlayer: false, breed: 'siamese', name: 'Sia' });
  save.cats.push({ ...save.cats[0], id: 'cat_5', isPlayer: false, breed: 'bengal', name: 'Ben' });
  return save;
}

function testLongWinterFiresAfterChapter4Settles() {
  const save = makeChapter4Save();
  save.day = 20;
  // First check stamps the start day; winter shouldn't fire immediately.
  let started = checkLongWinterStart(save);
  assert.equal(started, false, 'first check should only stamp chapter4StartDay');
  assert.equal(save.flags.chapter4StartDay, 20);
  assert.equal(save.flags.longWinterStarted, undefined);
  // Same day repeat: still doesn't fire.
  started = checkLongWinterStart(save);
  assert.equal(started, false);
  // Advance 4 days — still below the 5-day threshold.
  save.day = 24;
  assert.equal(checkLongWinterStart(save), false, 'winter should not fire on day 24 (4 days after chapter 4)');
  // Day 25 = 5 days after chapter 4 start — winter triggers.
  save.day = 25;
  assert.equal(checkLongWinterStart(save), true, 'winter should fire on day 25 (5 days after chapter 4)');
  assert.equal(save.flags.longWinterStarted, true);
  assert.equal(save.flags.longWinterDayStarted, 25);
}

function testLongWinterBlocksChapter5Advance() {
  const save = makeChapter4Save();
  // Meet all chapter 5 numerics — bumped to 45 jobs in the post-v2.4.0
  // pacing slowdown so the player can't speedrun chapter 5 by day 30.
  save.totalJobsCompleted = 45;
  save.totalFishEarned = 500;
  save.cats.push({ ...save.cats[0], id: 'cat_6', isPlayer: false, breed: 'russian_blue', name: 'Blue' });
  save.flags.ratPlagueResolved = true;
  // Without the winter being resolved, advance must fail.
  save.flags.longWinterResolved = false;
  assert.equal(checkChapterAdvance(save), false, 'chapter 5 should be locked until the Long Winter resolves');
  // Once resolved, advance succeeds.
  save.flags.longWinterResolved = true;
  assert.equal(checkChapterAdvance(save), true, 'chapter 5 should unlock once the Long Winter resolves');
  assert.equal(save.chapter, 5);
}

function testLongWinterResolvesAfterFiveDays() {
  const save = makeChapter4Save();
  save.flags.longWinterStarted = true;
  save.flags.longWinterDayStarted = 30;
  // Day 4 of winter — too early to resolve.
  save.day = 34;
  assert.equal(checkLongWinterResolution(save), false, 'winter should not resolve before day 5');
  assert.equal(save.flags.longWinterResolved, undefined);
  // Day 5 of winter — resolves.
  save.day = 35;
  assert.equal(checkLongWinterResolution(save), true, 'winter should resolve on day 5');
  assert.equal(save.flags.longWinterResolved, true);
}

function testGetLongWinterDayReturnsZeroWhenNotActive() {
  const save = createDefaultSave('Winter-Test');
  // Not started — day 0.
  assert.equal(getLongWinterDay(save), 0);
  // Started but already resolved — day 0.
  save.flags.longWinterStarted = true;
  save.flags.longWinterResolved = true;
  assert.equal(getLongWinterDay(save), 0);
  // Active and counting.
  save.flags.longWinterResolved = false;
  save.flags.longWinterDayStarted = 30;
  save.day = 32;
  assert.equal(getLongWinterDay(save), 3, 'day 32 - day 30 + 1 = winter day 3');
}

// ──── Playtime tracker regression tests ────
//
// The tracker holds module-level state, so each test pauses the session
// at the end to leave the module in a clean state for the next test.

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function testFormatPlaytime() {
  assert.equal(formatPlaytime(0), '0m');
  assert.equal(formatPlaytime(45_000), '0m', 'sub-minute rounds down to 0m');
  assert.equal(formatPlaytime(60_000), '1m');
  assert.equal(formatPlaytime(120_000), '2m');
  assert.equal(formatPlaytime(59 * 60_000), '59m');
  assert.equal(formatPlaytime(60 * 60_000), '1h 0m');
  assert.equal(formatPlaytime(60 * 60_000 + 30 * 60_000), '1h 30m');
  assert.equal(formatPlaytime(2 * 60 * 60_000 + 10 * 60_000), '2h 10m');
  assert.equal(formatPlaytime(-1), '0m', 'negative input clamps to 0m');
  assert.equal(formatPlaytime(NaN), '0m', 'NaN clamps to 0m');
}

async function testPlaytimeStartAndPauseRoundtrip() {
  pausePlaytimeSession(); // ensure clean state
  assert.equal(isPlaytimeRunning(), false);
  startPlaytimeSession();
  assert.equal(isPlaytimeRunning(), true);
  await sleep(20);
  const elapsed = pausePlaytimeSession();
  assert.equal(isPlaytimeRunning(), false);
  assert.ok(elapsed >= 15, `paused session should report ~20ms elapsed, got ${elapsed}`);
  assert.ok(elapsed < 200, `paused session shouldn't report wildly more than 20ms, got ${elapsed}`);
}

async function testStartIsIdempotent() {
  pausePlaytimeSession();
  startPlaytimeSession();
  await sleep(10);
  startPlaytimeSession(); // should be a no-op, NOT reset the session start
  await sleep(10);
  const elapsed = pausePlaytimeSession();
  assert.ok(elapsed >= 18, `idempotent start should preserve original timer (~20ms), got ${elapsed}`);
}

async function testCommitSessionFoldsIntoSave() {
  pausePlaytimeSession();
  const save: { totalPlaytimeMs?: number } = { totalPlaytimeMs: 5_000 };
  startPlaytimeSession();
  await sleep(20);
  commitSessionToSave(save);
  assert.ok(
    save.totalPlaytimeMs! >= 5_015 && save.totalPlaytimeMs! < 5_500,
    `commit should add ~20ms to existing 5000ms total, got ${save.totalPlaytimeMs}`,
  );
  // After commit, session should still be running (restarted with delta=0)
  assert.equal(isPlaytimeRunning(), true);
  // A second immediate commit should add roughly 0 more
  const before = save.totalPlaytimeMs!;
  commitSessionToSave(save);
  const added = save.totalPlaytimeMs! - before;
  assert.ok(added >= 0 && added < 50, `second immediate commit should add ~0ms, got ${added}`);
  pausePlaytimeSession();
}

function testCommitOnPausedTrackerIsNoop() {
  pausePlaytimeSession();
  const save: { totalPlaytimeMs?: number } = { totalPlaytimeMs: 1_000 };
  commitSessionToSave(save);
  assert.equal(save.totalPlaytimeMs, 1_000, 'commit on paused tracker should not change the total');
}

function testCommitInitializesUndefinedTotal() {
  pausePlaytimeSession();
  const save: { totalPlaytimeMs?: number } = {};
  startPlaytimeSession();
  commitSessionToSave(save);
  assert.equal(typeof save.totalPlaytimeMs, 'number', 'commit should initialize undefined total to a number');
  assert.ok(save.totalPlaytimeMs! >= 0);
  pausePlaytimeSession();
}

async function testSaveGameCommitsPlaytimeViaIntegration() {
  // End-to-end: confirm saveGame in SaveManager folds the playtime via
  // the commit hook. This is the contract the menu panel relies on.
  localStorageMock.clear();
  pausePlaytimeSession();
  const save = createDefaultSave('Playtime-Integration');
  assert.equal(save.totalPlaytimeMs, 0, 'fresh save should start at 0 playtime');
  startPlaytimeSession();
  await sleep(20);
  saveToSlot(1, save);
  assert.ok(save.totalPlaytimeMs! >= 15, `saveToSlot should commit playtime, got ${save.totalPlaytimeMs}`);
  pausePlaytimeSession();
}

function testMigrationBackfillsTotalPlaytimeMs() {
  localStorageMock.clear();
  const v1Save = { ...createDefaultSave('Backfill-Test') };
  delete (v1Save as any).totalPlaytimeMs;
  saveToSlot(2, v1Save as any);
  const loaded = loadFromSlot(2);
  assert.ok(loaded);
  assert.equal(loaded!.totalPlaytimeMs, 0, 'missing totalPlaytimeMs should backfill to 0');
}

function testMigrationStampsCurrentVersion() {
  const v1Save = { ...createDefaultSave('Version-Test'), version: 1 };
  delete (v1Save as any).dungeonHistory; // simulate v1 schema (no dungeonHistory)
  delete (v1Save as any).journal;
  localStorageMock.clear();
  saveToSlot(1, v1Save as any);
  const loaded = loadFromSlot(1);
  assert.ok(loaded);
  assert.equal(loaded!.version, 2, 'loaded save should be stamped with current version');
  assert.ok(Array.isArray(loaded!.journal), 'missing journal should be backfilled to []');
  assert.ok(loaded!.dungeonHistory, 'missing dungeonHistory should be backfilled');
}

testSaveMigrationNormalizesTraits();
testTraitScoringUsesNormalizedIds();
testContestedJobsDoNotLeakIntoStaticJobDefs();
testChapterAdvanceStillRespectsSpecialFlags();
testSanitizerClampsLongNames();
testSanitizerStripsControlCharacters();
testSanitizerKeepsHtmlEntitiesAsLiteralText();
testSanitizerRejectsInvalidStructure();
testSanitizerClampsDangerousNumericFields();
testSanitizerLimitsCatArrayLength();
testSaveBackupOnDelete();
testSaveBackupRestore();
testPruneExpiredBackupsRemovesOldOnes();
testMigrationStampsCurrentVersion();
testLongWinterFiresAfterChapter4Settles();
testLongWinterBlocksChapter5Advance();
testLongWinterResolvesAfterFiveDays();
testGetLongWinterDayReturnsZeroWhenNotActive();
testFormatPlaytime();
await testPlaytimeStartAndPauseRoundtrip();
await testStartIsIdempotent();
await testCommitSessionFoldsIntoSave();
testCommitOnPausedTrackerIsNoop();
testCommitInitializesUndefinedTotal();
await testSaveGameCommitsPlaytimeViaIntegration();
testMigrationBackfillsTotalPlaytimeMs();

console.log('Logic regression tests passed.');
