// DungeonRunScene playtest — verifies the roguelike design pillars:
//   1. UPGRADE_CARDS library has the expected entries
//   2. pickUpgradeOffer returns 3 cards
//   3. applyDungeonUpgrade applies effects correctly (heal, +max HP, etc.)
//   4. Lucky Charm absorbs the first hit, clears after triggering
//   5. Second Wind rebounds from 0 HP to 1, clears after triggering
//   6. pickUpgradeOffer excludes already-active single-use passives
//   7. Run history is persisted in SaveData with proper migration
//   8. Reactive narrative differs between first attempt and repeat
//
// RESILIENCE: same multi-layer pattern (hard timeout, process group kill,
// signal handlers, finally cleanup, recommended outer `timeout 150s`).

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'dungeon');
const SAVE_PATH = path.join(__dirname, 'test_saves/test-save-everything-unlocked.json');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const BASE = 'http://localhost:3200';
const HARD_TIMEOUT_MS = 90_000;

const hardKill = setTimeout(() => {
  console.error(`\n!! FATAL: Playtest exceeded ${HARD_TIMEOUT_MS}ms — force exit`);
  emergencyCleanup();
  process.exit(3);
}, HARD_TIMEOUT_MS);
hardKill.unref();

let browser = null;
let server = null;

function killServerTree(signal = 'SIGTERM') {
  if (!server || server.killed) return;
  try {
    process.kill(-server.pid, signal);
  } catch {
    try { server.kill(signal); } catch {}
  }
}

function emergencyCleanup() {
  try { browser?.close(); } catch {}
  killServerTree('SIGKILL');
}
process.on('SIGINT', () => { emergencyCleanup(); process.exit(130); });
process.on('SIGTERM', () => { emergencyCleanup(); process.exit(143); });
process.on('uncaughtException', (e) => {
  console.error('uncaughtException:', e);
  emergencyCleanup();
  process.exit(4);
});

let shotIndex = 0;
async function shot(page, label) {
  shotIndex++;
  const n = String(shotIndex).padStart(2, '0');
  const safe = label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const p = path.join(SCREENSHOT_DIR, `${n}-${safe}.png`);
  await page.screenshot({ path: p });
  console.log(`  [${n}] ${label}`);
}

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await wait(500);
  }
  throw new Error('Dev server not ready');
}

async function loadTestSave(page) {
  const save = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf-8'));
  save.flags = { ...save.flags, tutorial_complete: true, clowder_intro_shown: true };
  // Make sure chapter is high enough to access the dungeon
  save.chapter = Math.max(save.chapter ?? 1, 5);
  await page.evaluate((s) => {
    localStorage.setItem('clowder_save_slot_1', s);
    localStorage.setItem('clowder_save', s);
  }, JSON.stringify(save));
}

async function main() {
  console.log('Starting Vite dev server...');
  server = spawn('npm', ['run', 'dev'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: ROOT,
    detached: true,
  });
  server.stdout?.on('data', () => {});
  server.stderr?.on('data', () => {});
  await waitForServer(BASE);

  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (t.includes('google') || t.includes('analytics')) return;
      consoleErrors.push(t);
      console.log('  ERR:', t);
    }
  });
  page.on('pageerror', (e) => {
    consoleErrors.push(`pageerror: ${e.message}`);
    console.log('  PAGEERR:', e.message);
  });

  let allPass = true;
  function check(label, ok) {
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
    if (!ok) allPass = false;
  }

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await loadTestSave(page);
    await page.reload({ waitUntil: 'networkidle' });
    await wait(4000);

    // Navigate through the title flow to populate main.ts's gameState
    // module variable. The dungeon scene's startDungeon depends on
    // getGameState() returning a valid save, which only happens after the
    // continue/slot flow runs.
    const canvas = await page.$('#game-container canvas');
    const box = await canvas.boundingBox();
    const clickAt = async (x, y) => {
      await page.mouse.click(box.x + (x / 390) * box.width, box.y + (y / 844) * box.height);
    };
    await clickAt(195, 470); // Continue
    await wait(800);
    const slotBtn = await page.$('.slot-btn');
    if (slotBtn) await slotBtn.click();
    await wait(2500);

    // Verify gameState is now populated by checking via the debug hook
    const gameStateOk = await page.evaluate(async () => {
      const mod = await import('/src/main.ts');
      return mod.getGameState() != null;
    });
    if (!gameStateOk) {
      throw new Error('gameState not populated after title flow');
    }

    // ── 1. UPGRADE_CARDS library has expected entries ──
    console.log('\n=== Upgrade card library ===');
    const cardLib = await page.evaluate(async () => {
      const mod = await import('/src/scenes/DungeonRunScene.ts');
      return mod.UPGRADE_CARDS.map((c) => c.id);
    });
    console.log(`  Cards: ${cardLib.join(', ')}`);
    const expected = ['bandage', 'field_rations', 'whetstone', 'lucky_charm', 'second_wind', 'lantern'];
    check('All 6 expected upgrade ids present',
      expected.every((id) => cardLib.includes(id)));

    // ── 2. pickUpgradeOffer returns 3 cards from a fresh dungeon ──
    console.log('\n=== pickUpgradeOffer returns 3 cards ===');
    const offerCheck = await page.evaluate(async () => {
      const mod = await import('/src/scenes/DungeonRunScene.ts');
      // Stuff a fresh dungeon state via a private writable — we patch the
      // module's activeDungeon by importing the helpers and calling them.
      // The simplest way: call pickUpgradeOffer directly when activeDungeon
      // is null, and it should still return 3 cards (the early-return
      // branch in pickUpgradeOffer only EXCLUDES single-use passives).
      // For null state, all 6 cards are eligible.
      const offer = mod.pickUpgradeOffer();
      return { offerCount: offer.length, offerIds: offer.map((c) => c.id) };
    });
    console.log(`  Offer count: ${offerCheck.offerCount}, ids: ${offerCheck.offerIds.join(', ')}`);
    check('Offer returns exactly 3 cards', offerCheck.offerCount === 3);
    check('All offer ids are unique',
      new Set(offerCheck.offerIds).size === offerCheck.offerIds.length);

    // ── 3. applyDungeonUpgrade applies effects correctly ──
    // Construct a fake dungeon by directly importing DungeonRunScene's
    // activeDungeon variable via the exported helpers. We can't set
    // activeDungeon directly (it's a private module-scope let), but we CAN
    // launch a real dungeon via the scene's startDungeon path. Easier
    // approach: bootstrap a dungeon by calling the scene methods.
    console.log('\n=== applyDungeonUpgrade effects ===');
    const upgradeCheck = await page.evaluate(async () => {
      const mod = await import('/src/scenes/DungeonRunScene.ts');
      const game = window.__clowderGame;
      // Boot the dungeon scene
      for (const scene of game.scene.getScenes(true)) {
        if (scene.scene.key !== 'DungeonRunScene' && scene.scene.key !== 'BootScene') {
          game.scene.stop(scene.scene.key);
        }
      }
      game.scene.start('DungeonRunScene');
      // Get the cat to start a dungeon with
      const sceneInst = game.scene.getScene('DungeonRunScene');
      const save = JSON.parse(localStorage.getItem('clowder_save_slot_1'));
      const cat = save.cats[0];
      // Call startDungeon directly (it's a private method but accessible)
      sceneInst.startDungeon(cat);
      // Now activeDungeon should be set; sample its state
      const before = mod.getActiveDungeon();
      const beforeHp = before.hp;
      const beforeMaxHp = before.maxHp;

      // Bandage
      mod.applyDungeonUpgrade('bandage');
      const afterBandage = { hp: mod.getActiveDungeon().hp };

      // Restore for the field rations test
      mod.getActiveDungeon().hp = beforeHp - 1;
      mod.getActiveDungeon().maxHp = beforeMaxHp;

      // Field Rations
      mod.applyDungeonUpgrade('field_rations');
      const afterRations = {
        hp: mod.getActiveDungeon().hp,
        maxHp: mod.getActiveDungeon().maxHp,
      };

      // Lantern
      mod.applyDungeonUpgrade('lantern');
      const afterLantern = { lanternFloorsLeft: mod.getActiveDungeon().lanternFloorsLeft };

      // Whetstone
      mod.applyDungeonUpgrade('whetstone');
      const afterWhetstone = { pendingWhetstone: mod.getActiveDungeon().pendingWhetstone };

      return { beforeHp, beforeMaxHp, afterBandage, afterRations, afterLantern, afterWhetstone };
    });
    console.log(`  Bandage: hp ${upgradeCheck.beforeHp} → ${upgradeCheck.afterBandage.hp} (clamped to maxHp)`);
    console.log(`  Field Rations: hp ${upgradeCheck.beforeHp - 1} → ${upgradeCheck.afterRations.hp}, maxHp ${upgradeCheck.beforeMaxHp} → ${upgradeCheck.afterRations.maxHp}`);
    console.log(`  Lantern lanternFloorsLeft = ${upgradeCheck.afterLantern.lanternFloorsLeft}`);
    console.log(`  Whetstone pendingWhetstone = ${upgradeCheck.afterWhetstone.pendingWhetstone}`);
    check('Bandage healed (clamped at maxHp)',
      upgradeCheck.afterBandage.hp === Math.min(upgradeCheck.beforeMaxHp, upgradeCheck.beforeHp + 2));
    check('Field Rations bumped maxHp by 1', upgradeCheck.afterRations.maxHp === upgradeCheck.beforeMaxHp + 1);
    check('Lantern set lanternFloorsLeft to 3', upgradeCheck.afterLantern.lanternFloorsLeft === 3);
    check('Whetstone set pendingWhetstone', upgradeCheck.afterWhetstone.pendingWhetstone === true);

    // ── 4. Lucky Charm absorbs the first hit ──
    console.log('\n=== Lucky Charm absorbs first hit ===');
    const luckyCheck = await page.evaluate(async () => {
      const mod = await import('/src/scenes/DungeonRunScene.ts');
      mod.applyDungeonUpgrade('lucky_charm');
      const before = { hp: mod.getActiveDungeon().hp, charm: mod.getActiveDungeon().luckyCharmActive };
      mod.dungeonTakeDamage(2);
      const afterFirst = { hp: mod.getActiveDungeon().hp, charm: mod.getActiveDungeon().luckyCharmActive };
      mod.dungeonTakeDamage(2);
      const afterSecond = { hp: mod.getActiveDungeon().hp };
      return { before, afterFirst, afterSecond };
    });
    console.log(`  HP before: ${luckyCheck.before.hp}, charm active: ${luckyCheck.before.charm}`);
    console.log(`  After first 2 damage: hp=${luckyCheck.afterFirst.hp}, charm=${luckyCheck.afterFirst.charm}`);
    console.log(`  After second 2 damage: hp=${luckyCheck.afterSecond.hp}`);
    check('First hit absorbed (HP unchanged)', luckyCheck.afterFirst.hp === luckyCheck.before.hp);
    check('Lucky Charm cleared after triggering', luckyCheck.afterFirst.charm === false);
    check('Second hit lands normally', luckyCheck.afterSecond.hp === luckyCheck.before.hp - 2);

    // ── 5. Second Wind rebounds from 0 to 1 ──
    console.log('\n=== Second Wind rebounds from 0 HP ===');
    const swCheck = await page.evaluate(async () => {
      const mod = await import('/src/scenes/DungeonRunScene.ts');
      const d = mod.getActiveDungeon();
      d.hp = 2;
      d.luckyCharmActive = false; // ensure not absorbing
      mod.applyDungeonUpgrade('second_wind');
      mod.dungeonTakeDamage(5); // would drop to 0
      const afterFatal = { hp: mod.getActiveDungeon().hp, sw: mod.getActiveDungeon().secondWindActive };
      mod.dungeonTakeDamage(5); // now should die
      const afterSecond = { hp: mod.getActiveDungeon().hp };
      return { afterFatal, afterSecond };
    });
    console.log(`  After fatal hit: hp=${swCheck.afterFatal.hp}, secondWind=${swCheck.afterFatal.sw}`);
    console.log(`  After second fatal hit: hp=${swCheck.afterSecond.hp}`);
    check('Second Wind rebounded HP to 1', swCheck.afterFatal.hp === 1);
    check('Second Wind cleared after triggering', swCheck.afterFatal.sw === false);
    check('Second fatal hit kills the cat', swCheck.afterSecond.hp === 0);

    // ── 6. pickUpgradeOffer excludes already-active single-use passives ──
    console.log('\n=== pickUpgradeOffer excludes already-active passives ===');
    const exclusionCheck = await page.evaluate(async () => {
      const mod = await import('/src/scenes/DungeonRunScene.ts');
      const d = mod.getActiveDungeon();
      // Reset and activate lucky_charm + lantern
      d.luckyCharmActive = true;
      d.secondWindActive = false;
      d.lanternFloorsLeft = 3;
      // Pick offers many times — none should include lucky_charm or lantern
      const tally = { lucky_charm: 0, lantern: 0, second_wind: 0 };
      for (let i = 0; i < 30; i++) {
        const offer = mod.pickUpgradeOffer();
        for (const c of offer) {
          if (c.id === 'lucky_charm') tally.lucky_charm++;
          if (c.id === 'lantern') tally.lantern++;
          if (c.id === 'second_wind') tally.second_wind++;
        }
      }
      return tally;
    });
    console.log(`  Across 30 offers: lucky_charm=${exclusionCheck.lucky_charm}, lantern=${exclusionCheck.lantern}, second_wind=${exclusionCheck.second_wind}`);
    check('Active lucky_charm never offered again', exclusionCheck.lucky_charm === 0);
    check('Active lantern never offered again', exclusionCheck.lantern === 0);
    check('Inactive second_wind can still appear',
      exclusionCheck.second_wind > 0);

    // ── 7. Run history persists in SaveData ──
    // Read from the live in-memory gameState, not localStorage — startDungeon
    // mutates the in-memory save and calls saveGame, which writes to the
    // legacy single-save key. The slot key isn't kept in sync at runtime.
    console.log('\n=== Run history fields exist in SaveData ===');
    const historyCheck = await page.evaluate(async () => {
      const mod = await import('/src/main.ts');
      const save = mod.getGameState();
      return {
        hasHistory: save?.dungeonHistory != null,
        history: save?.dungeonHistory,
      };
    });
    console.log(`  dungeonHistory: ${JSON.stringify(historyCheck.history)}`);
    check('SaveData has dungeonHistory after starting a run', historyCheck.hasHistory === true);
    check('totalRuns incremented after startDungeon',
      historyCheck.history?.totalRuns >= 1);

    // ── 8. Reactive narrative differs between first run and repeat ──
    console.log('\n=== Reactive narrative differs by run history ===');
    const narrativeCheck = await page.evaluate(async () => {
      const game = window.__clowderGame;
      const sceneInst = game.scene.getScene('DungeonRunScene');
      // Get a cat for the test
      const save = JSON.parse(localStorage.getItem('clowder_save_slot_1'));
      const cat = save.cats[0];

      // Build "first attempt" intro
      const firstHistory = { totalRuns: 0, totalClears: 0, bestFloor: 0, lastFailFloor: -1, lastFailCause: '' };
      const firstIntro = sceneInst.buildIntroScenes(cat.name, 6, 0, firstHistory);

      // Build "returning after failure" intro
      const failHistory = { totalRuns: 3, totalClears: 0, bestFloor: 4, lastFailFloor: 4, lastFailCause: 'Combat' };
      const failIntro = sceneInst.buildIntroScenes(cat.name, 6, 3, failHistory);

      // Build "returning after clear" intro
      const clearHistory = { totalRuns: 5, totalClears: 2, bestFloor: 6, lastFailFloor: 4, lastFailCause: 'Combat' };
      const clearIntro = sceneInst.buildIntroScenes(cat.name, 6, 5, clearHistory);

      return { firstIntro, failIntro, clearIntro };
    });
    console.log(`  First attempt intro:`);
    narrativeCheck.firstIntro.forEach((line) => console.log(`    "${line}"`));
    console.log(`  After failure intro:`);
    narrativeCheck.failIntro.forEach((line) => console.log(`    "${line}"`));
    console.log(`  After clear intro:`);
    narrativeCheck.clearIntro.forEach((line) => console.log(`    "${line}"`));
    check('First-attempt intro mentions "Each one a test"',
      narrativeCheck.firstIntro.some((l) => l.includes('test')));
    check('Failure intro references the failure cause',
      narrativeCheck.failIntro.some((l) => l.includes('Combat')));
    check('Clear intro references prior clears',
      narrativeCheck.clearIntro.some((l) => l.includes('clear')));
    check('All three intros are distinct',
      JSON.stringify(narrativeCheck.firstIntro) !== JSON.stringify(narrativeCheck.failIntro) &&
      JSON.stringify(narrativeCheck.failIntro) !== JSON.stringify(narrativeCheck.clearIntro));

    await shot(page, 'final');
  } finally {
    try { await browser?.close(); } catch (e) { console.error('browser close failed:', e?.message); }
    browser = null;
    killServerTree('SIGTERM');
    await wait(500);
    killServerTree('SIGKILL');
    server = null;
  }

  console.log('\n========== SUMMARY ==========');
  console.log(`Console errors: ${consoleErrors.length}`);
  consoleErrors.forEach((e) => console.log('  -', e));
  console.log(`All checks pass: ${allPass}`);
  console.log(`Screenshots: ${SCREENSHOT_DIR}`);
  clearTimeout(hardKill);
  process.exit((allPass && consoleErrors.length === 0) ? 0 : 1);
}

main().catch((e) => {
  console.error('Fatal:', e);
  emergencyCleanup();
  clearTimeout(hardKill);
  process.exit(2);
});
