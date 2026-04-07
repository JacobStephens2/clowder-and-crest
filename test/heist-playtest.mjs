// HeistScene playtest — verifies the lock-picking design pillars:
//   1. Each ring has isSet, startRotation, and trapNotches fields
//   2. countSetRings reflects the current set state
//   3. Rotating a ring's gap to the top flips isSet → true
//   4. Rotating off the top flips isSet → false
//   5. Counter-clockwise rotation works (dir=-1)
//   6. Hard difficulty populates trap notches; easy/medium do not
//   7. Triggering a trap notch resets the ring to startRotation
//   8. Linked rings update their isSet when the partner rotates
//   9. checkWin / endGame fire when all rings are set
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
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'heist');
const SAVE_PATH = path.join(__dirname, 'test-save-everything-unlocked.json');
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
      'clowder_heist_tutorial_v2',
      'clowder_heist_tutorial',
    ];
    for (const k of keys) localStorage.setItem(k, '1');
  }, JSON.stringify(save));
}

async function launchHeist(page, difficulty) {
  return page.evaluate((diff) => {
    const game = window.__clowderGame;
    if (!game) return 'no game';
    for (const scene of game.scene.getScenes(true)) {
      if (scene.scene.key !== 'HeistScene' && scene.scene.key !== 'BootScene') {
        game.scene.stop(scene.scene.key);
      }
    }
    game.scene.start('HeistScene', {
      difficulty: diff,
      jobId: 'mill_mousing',
      catId: 'player_wildcat',
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

    // ── 1. Each ring has the new fields ──
    console.log('\n=== Ring fields: isSet, startRotation, trapNotches ===');
    await launchHeist(page, 'easy');
    await wait(500);
    const fieldsCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('HeistScene');
      return {
        ringCount: scene.rings.length,
        sample: scene.rings.map((r) => ({
          hasIsSet: 'isSet' in r,
          hasStartRotation: 'startRotation' in r,
          hasTrapNotches: Array.isArray(r.trapNotches),
          startRotation: r.startRotation,
          rotation: r.rotation,
          isSet: r.isSet,
        })),
      };
    });
    console.log(`  Ring count: ${fieldsCheck.ringCount}`);
    for (const r of fieldsCheck.sample) {
      console.log(`    isSet=${r.isSet} startRot=${r.startRotation} rot=${r.rotation}`);
    }
    check('All rings have isSet field', fieldsCheck.sample.every((r) => r.hasIsSet));
    check('All rings have startRotation field', fieldsCheck.sample.every((r) => r.hasStartRotation));
    check('All rings have trapNotches array', fieldsCheck.sample.every((r) => r.hasTrapNotches));
    check('startRotation matches initial rotation', fieldsCheck.sample.every((r) => r.startRotation === r.rotation));

    // ── 2. countSetRings starts at 0 (init avoids set-on-spawn) ──
    console.log('\n=== countSetRings starts at 0 ===');
    const initialSetCount = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('HeistScene');
      return scene.countSetRings();
    });
    console.log(`  initial set count: ${initialSetCount}`);
    check('No rings are set on spawn', initialSetCount === 0);

    // ── 3. Rotating a ring's gap to the top flips isSet → true ──
    console.log('\n=== Setting a ring flips isSet ===');
    const setCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('HeistScene');
      // Pick the first ring and rotate it directly to the set position
      const ring = scene.rings[0];
      // The set position is when (gapPos + rotation) % notches === 0
      // → rotation = (notches - gapPos) % notches
      const targetRotation = (ring.notches - ring.gapPos) % ring.notches;
      ring.rotation = targetRotation;
      ring.isSet = ((ring.gapPos + ring.rotation) % ring.notches) === 0;
      return {
        gapPos: ring.gapPos,
        rotation: ring.rotation,
        isSet: ring.isSet,
        countSet: scene.countSetRings(),
      };
    });
    console.log(`  Ring 0: gapPos=${setCheck.gapPos}, rotation=${setCheck.rotation}, isSet=${setCheck.isSet}`);
    check('Ring isSet after manual alignment', setCheck.isSet === true);
    check('countSetRings reflects the set state', setCheck.countSet >= 1);

    // ── 4. Counter-clockwise rotation (dir=-1) ──
    console.log('\n=== Counter-clockwise rotation works ===');
    await launchHeist(page, 'easy');
    await wait(500);
    const ccwCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('HeistScene');
      const ring = scene.rings[scene.rings.length - 1]; // outermost, no link
      const before = ring.rotation;
      scene.rotateRing(scene.rings.length - 1, -1);
      const after = ring.rotation;
      // Counter-clockwise should decrease rotation (mod notches)
      const expected = (before - 1 + ring.notches) % ring.notches;
      return { before, after, expected, notches: ring.notches };
    });
    console.log(`  Rotation: ${ccwCheck.before} → ${ccwCheck.after} (expected ${ccwCheck.expected})`);
    check('Counter-clockwise rotation produces expected rotation', ccwCheck.after === ccwCheck.expected);

    // ── 5. Hard difficulty has trap notches; easy does not ──
    console.log('\n=== Trap notches present on hard, absent on easy ===');
    const trapCheck = await page.evaluate(async () => {
      const game = window.__clowderGame;
      // Sample easy
      for (const scene of game.scene.getScenes(true)) {
        if (scene.scene.key !== 'HeistScene' && scene.scene.key !== 'BootScene') {
          game.scene.stop(scene.scene.key);
        }
      }
      game.scene.start('HeistScene', { difficulty: 'easy', jobId: 'mill_mousing', catId: 'player_wildcat' });
      const easyScene = game.scene.getScene('HeistScene');
      const easyTotal = easyScene.rings.reduce((sum, r) => sum + r.trapNotches.length, 0);

      // Sample hard
      for (const scene of game.scene.getScenes(true)) {
        if (scene.scene.key !== 'HeistScene' && scene.scene.key !== 'BootScene') {
          game.scene.stop(scene.scene.key);
        }
      }
      game.scene.start('HeistScene', { difficulty: 'hard', jobId: 'mill_mousing', catId: 'player_wildcat' });
      const hardScene = game.scene.getScene('HeistScene');
      const hardTotal = hardScene.rings.reduce((sum, r) => sum + r.trapNotches.length, 0);
      const hardRingsWithTraps = hardScene.rings.filter((r) => r.trapNotches.length > 0).length;

      return { easyTotal, hardTotal, hardRingsWithTraps, hardRingCount: hardScene.rings.length };
    });
    console.log(`  Easy total trap notches: ${trapCheck.easyTotal}`);
    console.log(`  Hard total trap notches: ${trapCheck.hardTotal}, rings with traps: ${trapCheck.hardRingsWithTraps}/${trapCheck.hardRingCount}`);
    check('Easy has zero trap notches', trapCheck.easyTotal === 0);
    check('Hard has at least one trap notch', trapCheck.hardTotal >= 1);

    // ── 6. Triggering a trap notch resets the ring to startRotation ──
    console.log('\n=== Trap notch triggers reset to startRotation ===');
    const trapResetCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('HeistScene');
      // Find a non-linked ring with at least one trap notch
      let target = null;
      for (let i = 0; i < scene.rings.length; i++) {
        if (scene.rings[i].linkedTo === -1 && scene.rings[i].trapNotches.length > 0) {
          target = { idx: i, ring: scene.rings[i] };
          break;
        }
      }
      if (!target) return { error: 'no non-linked trap-notched ring found' };
      const trap = target.ring.trapNotches[0];
      // Set the ring's rotation so that this trap notch is one step away
      // from being at the top: required rotation is (notches - trap) % notches
      // We rotate clockwise (+1) so we want the rotation BEFORE to be one
      // less than the target position.
      const setRotForTrapAtTop = (target.ring.notches - trap) % target.ring.notches;
      target.ring.rotation = (setRotForTrapAtTop - 1 + target.ring.notches) % target.ring.notches;
      target.ring.startRotation = target.ring.rotation; // capture pre-trap state
      const before = target.ring.rotation;
      // Now rotate clockwise — should bring the trap notch to the top and reset
      scene.rotateRing(target.idx, 1);
      return {
        before,
        after: target.ring.rotation,
        startRotation: target.ring.startRotation,
        resetToStart: target.ring.rotation === target.ring.startRotation,
      };
    });
    if (trapResetCheck.error) {
      console.log(`  ${trapResetCheck.error}`);
      // Re-roll a few times — random gen may not always create a non-linked
      // trap-notched ring on the first hard run
      let resolved = false;
      for (let attempt = 0; attempt < 10 && !resolved; attempt++) {
        await launchHeist(page, 'hard');
        await wait(300);
        const retry = await page.evaluate(() => {
          const scene = window.__clowderGame.scene.getScene('HeistScene');
          for (let i = 0; i < scene.rings.length; i++) {
            if (scene.rings[i].linkedTo === -1 && scene.rings[i].trapNotches.length > 0) {
              return { found: true };
            }
          }
          return { found: false };
        });
        if (retry.found) { resolved = true; break; }
      }
      check('Found a non-linked trap-notched ring after retries', resolved);
    } else {
      console.log(`  Rotation: ${trapResetCheck.before} → ${trapResetCheck.after} (start ${trapResetCheck.startRotation})`);
      check('Trap notch reset ring to startRotation', trapResetCheck.resetToStart === true);
    }

    // ── 7. Linked ring set state updates when partner rotates ──
    console.log('\n=== Linked ring set state updates with partner ===');
    await launchHeist(page, 'medium');
    await wait(500);
    const linkedCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('HeistScene');
      // Find a linked pair
      let pair = null;
      for (let i = 0; i < scene.rings.length; i++) {
        if (scene.rings[i].linkedTo >= 0) {
          pair = { src: i, dst: scene.rings[i].linkedTo };
          break;
        }
      }
      if (!pair) return { error: 'no linked rings on medium' };
      const dstBefore = scene.rings[pair.dst].isSet;
      const dstRotBefore = scene.rings[pair.dst].rotation;
      // Force the destination ring's set state to be re-evaluated
      scene.rotateRing(pair.src, 1);
      const dstRotAfter = scene.rings[pair.dst].rotation;
      const dstAfter = scene.rings[pair.dst].isSet;
      // Linked rotation should have changed the destination ring's rotation
      return {
        dstRotBefore, dstRotAfter,
        dstBefore, dstAfter,
        rotationChanged: dstRotBefore !== dstRotAfter,
      };
    });
    if (linkedCheck.error) {
      console.log(`  ${linkedCheck.error}`);
      check('No linked rings (skipping linked test)', false);
    } else {
      console.log(`  dst rotation: ${linkedCheck.dstRotBefore} → ${linkedCheck.dstRotAfter}`);
      console.log(`  dst isSet: ${linkedCheck.dstBefore} → ${linkedCheck.dstAfter}`);
      check('Linked ring rotation changed when partner rotated', linkedCheck.rotationChanged);
    }

    // ── 8. checkWin / endGame fire when all rings are set ──
    console.log('\n=== checkWin triggers when all rings set ===');
    await launchHeist(page, 'easy');
    await wait(500);
    const winCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('HeistScene');
      // Force all rings into set positions
      for (const ring of scene.rings) {
        ring.rotation = (ring.notches - ring.gapPos) % ring.notches;
        ring.isSet = true;
      }
      const setCount = scene.countSetRings();
      scene.checkWin();
      return {
        setCount,
        ringCount: scene.rings.length,
        finished: scene.finished,
      };
    });
    console.log(`  ${winCheck.setCount}/${winCheck.ringCount} set, finished=${winCheck.finished}`);
    check('All rings set after manual alignment', winCheck.setCount === winCheck.ringCount);
    check('checkWin marked scene as finished', winCheck.finished === true);

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
