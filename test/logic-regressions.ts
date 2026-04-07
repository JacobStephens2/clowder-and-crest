import assert from 'node:assert/strict';

class MemoryStorage {
  store = new Map<string, string>();
  getItem(key: string) { return this.store.has(key) ? this.store.get(key) ?? null : null; }
  setItem(key: string, value: string) { this.store.set(key, value); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
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

const { createDefaultSave, loadFromSlot, loadGame } = saveModule;
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

testSaveMigrationNormalizesTraits();
testTraitScoringUsesNormalizedIds();
testContestedJobsDoNotLeakIntoStaticJobDefs();
testChapterAdvanceStillRespectsSpecialFlags();

console.log('Logic regression tests passed.');
