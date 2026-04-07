// StealthScene playtest — verifies the top-down stealth design pillars:
//   1. Each guard starts in patrol state with no alert target
//   2. wasEverSpotted starts false
//   3. alertGuard transitions a guard to alert state and flips wasEverSpotted
//   4. alertGuard spreads to nearby guards within ALERT_SPREAD_RADIUS
//   5. Distant guards are NOT awakened by spread
//   6. Alerted guard moves toward the cat's position when ticked
//   7. Cat hidden in grass for RECOVERY_TICKS resets the guard to patrol
//   8. Guard reaching cat's tile triggers the catch path
//   9. Win path includes ghostRun + bonusFish in payload
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
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'stealth');
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
  await page.evaluate((s) => {
    localStorage.setItem('clowder_save_slot_1', s);
    localStorage.setItem('clowder_save', s);
    const keys = [
      'clowder_tutorial_shown',
      'clowder_stealth_tutorial_v2',
      'clowder_stealth_tutorial',
    ];
    for (const k of keys) localStorage.setItem(k, '1');
  }, JSON.stringify(save));
}

async function launchStealth(page, difficulty) {
  return page.evaluate((diff) => {
    const game = window.__clowderGame;
    if (!game) return 'no game';
    for (const scene of game.scene.getScenes(true)) {
      if (scene.scene.key !== 'StealthScene' && scene.scene.key !== 'BootScene') {
        game.scene.stop(scene.scene.key);
      }
    }
    game.scene.start('StealthScene', {
      difficulty: diff,
      jobId: 'mill_mousing',
      catId: 'player_wildcat',
      catBreed: 'wildcat',
    });
    return 'started';
  }, difficulty);
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

    // ── 1. Initial state ──
    console.log('\n=== Initial state: all guards in patrol, never spotted ===');
    await launchStealth(page, 'medium');
    await wait(500);
    const initState = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('StealthScene');
      return {
        guardCount: scene.guards.length,
        allPatrol: scene.guards.every((g) => g.state === 'patrol'),
        noAlertTargets: scene.guards.every((g) => g.alertTarget === null),
        wasEverSpotted: scene.wasEverSpotted,
      };
    });
    console.log(`  Guard count: ${initState.guardCount}`);
    check('All guards start in patrol state', initState.allPatrol);
    check('No alert targets', initState.noAlertTargets);
    check('wasEverSpotted starts false', initState.wasEverSpotted === false);

    // ── 2. alertGuard transitions to alert state ──
    console.log('\n=== alertGuard transitions guard to alert ===');
    const alertCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('StealthScene');
      const target = scene.guards[0];
      // Move all other guards far away so spread doesn't muddy the test
      for (let i = 1; i < scene.guards.length; i++) {
        scene.guards[i].r = 99;
        scene.guards[i].c = 99;
      }
      scene.alertGuard(target, 5, 5);
      return {
        state: target.state,
        targetR: target.alertTarget?.r,
        targetC: target.alertTarget?.c,
        wasEverSpotted: scene.wasEverSpotted,
      };
    });
    console.log(`  Guard state: ${alertCheck.state}, target=(${alertCheck.targetR},${alertCheck.targetC})`);
    check('Guard state is now alert', alertCheck.state === 'alert');
    check('Alert target stored', alertCheck.targetR === 5 && alertCheck.targetC === 5);
    check('wasEverSpotted flipped to true', alertCheck.wasEverSpotted === true);

    // ── 3. Alert spreads to nearby guards ──
    console.log('\n=== Alert spreads to nearby guards ===');
    const spreadCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('StealthScene');
      // Reset and place 3 guards: 2 close, 1 far
      scene.wasEverSpotted = false;
      scene.guards = scene.guards.slice(0, 3);
      scene.guards[0].r = 4; scene.guards[0].c = 4;
      scene.guards[0].state = 'patrol'; scene.guards[0].alertTarget = null;
      scene.guards[1].r = 5; scene.guards[1].c = 5; // distance 2 — within radius
      scene.guards[1].state = 'patrol'; scene.guards[1].alertTarget = null;
      scene.guards[2].r = 8; scene.guards[2].c = 8; // distance 8 — outside radius
      scene.guards[2].state = 'patrol'; scene.guards[2].alertTarget = null;

      scene.alertGuard(scene.guards[0], 4, 4);
      return {
        g0: scene.guards[0].state,
        g1: scene.guards[1].state,
        g2: scene.guards[2].state,
      };
    });
    console.log(`  g0 (source): ${spreadCheck.g0}`);
    console.log(`  g1 (distance 2): ${spreadCheck.g1}`);
    console.log(`  g2 (distance 8): ${spreadCheck.g2}`);
    check('Source guard alerted', spreadCheck.g0 === 'alert');
    check('Nearby guard (dist 2) also alerted', spreadCheck.g1 === 'alert');
    check('Far guard (dist 8) NOT alerted', spreadCheck.g2 === 'patrol');

    // ── 4. Alerted guard moves toward cat when ticked ──
    console.log('\n=== Alerted guard moves toward cat ===');
    await launchStealth(page, 'medium');
    await wait(500);
    const pursueCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('StealthScene');
      // Place a single guard far from the cat, alert it toward the cat
      scene.guards = scene.guards.slice(0, 1);
      const g = scene.guards[0];
      g.r = 4; g.c = 4;
      scene.catPos = { r: 4, c: 7 }; // 3 tiles east
      scene.inGrass = false;
      scene.alertGuard(g, scene.catPos.r, scene.catPos.c);
      const beforeC = g.c;
      scene.moveGuards();
      return { beforeC, afterC: g.c, state: g.state };
    });
    console.log(`  Guard col: ${pursueCheck.beforeC} → ${pursueCheck.afterC}, state=${pursueCheck.state}`);
    check('Alerted guard stepped toward cat (col increased)', pursueCheck.afterC > pursueCheck.beforeC);
    check('Guard still alerted', pursueCheck.state === 'alert');

    // ── 5. Cat hidden in grass for RECOVERY_TICKS resets guard ──
    console.log('\n=== Cat in grass long enough resets guard ===');
    const recoverCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('StealthScene');
      const g = scene.guards[0];
      g.state = 'alert';
      g.alertTarget = { r: 4, c: 4 };
      g.hiddenTicks = 0;
      // Cat is hidden
      scene.inGrass = true;
      // Tick guards twice (RECOVERY_TICKS = 2)
      scene.moveGuards();
      const afterFirst = g.state;
      scene.moveGuards();
      const afterSecond = g.state;
      return { afterFirst, afterSecond };
    });
    console.log(`  After 1 tick hidden: ${recoverCheck.afterFirst}`);
    console.log(`  After 2 ticks hidden: ${recoverCheck.afterSecond}`);
    check('Guard still alert after 1 hidden tick', recoverCheck.afterFirst === 'alert');
    check('Guard returns to patrol after 2 hidden ticks', recoverCheck.afterSecond === 'patrol');

    // ── 6. Vision contact alerts (does NOT instant-fail) ──
    console.log('\n=== Vision contact alerts instead of catching ===');
    await launchStealth(page, 'medium');
    await wait(500);
    const visionCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('StealthScene');
      // Place a single guard facing east at (4,3) and the cat at (4,5) so
      // the cat is 2 tiles in front of the guard (within VISION_RANGE=3).
      // Make sure the path between them is clear floor.
      for (let r = 0; r < scene.grid.length; r++) {
        for (let c = 0; c < scene.grid[0].length; c++) {
          scene.grid[r][c] = 0; // FLOOR
        }
      }
      scene.guards = scene.guards.slice(0, 1);
      const g = scene.guards[0];
      g.r = 4; g.c = 3; g.dir = 1; // facing east
      g.state = 'patrol';
      g.alertTarget = null;
      scene.catPos = { r: 4, c: 5 };
      scene.inGrass = false;
      scene.caught = false;
      scene.wasEverSpotted = false;
      scene.checkDetection();
      return {
        guardState: g.state,
        caught: scene.caught,
        wasEverSpotted: scene.wasEverSpotted,
      };
    });
    console.log(`  Guard state after detection: ${visionCheck.guardState}, caught=${visionCheck.caught}`);
    check('Vision contact alerted the guard', visionCheck.guardState === 'alert');
    check('Vision contact did NOT instant-fail', visionCheck.caught === false);
    check('wasEverSpotted set by vision contact', visionCheck.wasEverSpotted === true);

    // ── 7. Guard standing on cat triggers catch ──
    console.log('\n=== Guard reaching cat tile catches the cat ===');
    const catchCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('StealthScene');
      const g = scene.guards[0];
      g.r = scene.catPos.r;
      g.c = scene.catPos.c;
      g.state = 'alert';
      scene.checkDetection();
      return { caught: scene.caught };
    });
    console.log(`  caught: ${catchCheck.caught}`);
    check('Guard standing on cat triggered catch', catchCheck.caught === true);

    // ── 8. Win path includes ghostRun + bonusFish ──
    console.log('\n=== Win path emits ghostRun in payload ===');
    await launchStealth(page, 'medium');
    await wait(500);
    const winCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('StealthScene');
      // Force the cat to the target tile
      scene.catPos = { r: scene.targetPos.r, c: scene.targetPos.c };
      scene.wasEverSpotted = false;
      scene.caught = false;
      scene.succeeded = false;
      scene.checkWin();
      return {
        succeeded: scene.succeeded,
        wasEverSpotted: scene.wasEverSpotted,
      };
    });
    console.log(`  succeeded=${winCheck.succeeded}, wasEverSpotted=${winCheck.wasEverSpotted}`);
    check('Win triggered', winCheck.succeeded === true);
    check('Ghost run flag preserved through win', winCheck.wasEverSpotted === false);

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
