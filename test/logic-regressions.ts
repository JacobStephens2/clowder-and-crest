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

const { createDefaultSave, loadFromSlot, loadGame, validateAndSanitizeSave, deleteSlot, getRecentBackup, restoreBackup, pruneExpiredBackups, saveToSlot } = saveModule;
const { generateDailyJobs, getAllJobs, getStatMatchScore } = jobBoardModule;
const { checkChapterAdvance } = progressionModule;

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

console.log('Logic regression tests passed.');
