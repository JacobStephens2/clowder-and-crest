// NonogramScene playtest — verifies the nonogram/picross design pillars:
//   1. Themed images load and validate (uniquely solvable by pure logic)
//   2. The validator correctly accepts a uniquely-solvable puzzle and
//      rejects an ambiguous one
//   3. Penalty-based feedback is GONE — clicking a wrong cell is silent
//      (no fail SFX, no mistake counter increment, no visual penalty)
//   4. Win check requires exact match — over-filling does NOT trigger win
//   5. Undo restores the previous cell state
//   6. Grid sizes are multiples of 5 (5/10/15)
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
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'nonogram');
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

async function inspectNonogram(page) {
  return page.evaluate(() => {
    const game = window.__clowderGame;
    if (!game) return { error: 'no game instance' };
    const scene = game.scene.getScene('NonogramScene');
    if (!scene || !scene.sys.isActive()) return { error: 'NonogramScene not active' };
    const s = scene;
    return {
      gridSize: s.gridSize,
      imageName: s.imageName,
      solved: s.solved,
      fillMode: s.fillMode,
      hasMistakeField: 'mistakes' in s,
      filledCount: s.playerGrid.flat().filter((v) => v === 1).length,
      markedCount: s.playerGrid.flat().filter((v) => v === 2).length,
      solutionFilledCount: s.solution.flat().filter(Boolean).length,
    };
  });
}

async function loadTestSave(page) {
  const save = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf-8'));
  save.flags = { ...save.flags, tutorial_complete: true, clowder_intro_shown: true };
  await page.evaluate((s) => {
    localStorage.setItem('clowder_save_slot_1', s);
    localStorage.setItem('clowder_save', s);
    // Mark first nonogram as completed so init picks the requested difficulty
    localStorage.setItem('clowder_nonogram_completed', '1');
    const keys = [
      'clowder_tutorial_shown',
      'clowder_nonogram_tutorial_v2',
      'clowder_nonogram_tutorial',
    ];
    for (const k of keys) localStorage.setItem(k, '1');
  }, JSON.stringify(save));
}

async function launchNonogram(page, difficulty) {
  return page.evaluate((diff) => {
    const game = window.__clowderGame;
    if (!game) return 'no game';
    for (const scene of game.scene.getScenes(true)) {
      if (scene.scene.key !== 'NonogramScene' && scene.scene.key !== 'BootScene') {
        game.scene.stop(scene.scene.key);
      }
    }
    game.scene.start('NonogramScene', {
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

    // ── 1. Grid sizes are multiples of 5 ──
    console.log('\n=== Grid sizes are multiples of 5 ===');
    for (const diff of ['easy', 'medium', 'hard']) {
      await launchNonogram(page, diff);
      await wait(400);
      const state = await inspectNonogram(page);
      if (state.error) throw new Error(`launch ${diff} failed: ${state.error}`);
      console.log(`  ${diff}: ${state.gridSize}x${state.gridSize} (${state.imageName})`);
      check(`${diff} grid size is multiple of 5`, state.gridSize % 5 === 0);
      check(`${diff} has an image name`, state.imageName.length > 0);
    }

    // ── 2. The validator accepts good puzzles and rejects bad ones ──
    console.log('\n=== Constraint-propagation validator ===');
    await launchNonogram(page, 'easy');
    await wait(400);
    const validatorCheck = await page.evaluate(async () => {
      // Import the scene module directly to access the exported helpers
      const mod = await import('/src/scenes/NonogramScene.ts');
      // Pure-logic uniquely solvable: a 3x3 plus
      const plus = [
        [false, true, false],
        [true, true, true],
        [false, true, false],
      ];
      // Ambiguous: a 2x2 checkerboard with [1] [1] clues — multiple valid
      // solutions exist (any cell can be the lone fill on each line)
      const ambiguous = [
        [true, false],
        [false, true],
      ];
      return {
        plusUnique: mod.isUniquelySolvable(plus),
        ambiguousUnique: mod.isUniquelySolvable(ambiguous),
      };
    });
    console.log(`  Plus sign: ${validatorCheck.plusUnique ? 'unique' : 'ambiguous'}`);
    console.log(`  2x2 checkerboard: ${validatorCheck.ambiguousUnique ? 'unique' : 'ambiguous'}`);
    check('Validator accepts uniquely-solvable plus', validatorCheck.plusUnique === true);
    check('Validator rejects ambiguous 2x2 checkerboard', validatorCheck.ambiguousUnique === false);

    // ── 3. Every themed image validates (no broken hand-crafted puzzles) ──
    console.log('\n=== All themed images are uniquely solvable ===');
    const allValidate = await page.evaluate(async () => {
      const mod = await import('/src/scenes/NonogramScene.ts');
      // Spawn each difficulty several times and verify pickValidatedImage
      // always returns something. Direct access to the THEMED_IMAGES const
      // would be cleaner but it's not exported — instead we trigger the
      // scene's init which calls pickValidatedImage internally.
      const game = window.__clowderGame;
      const seen = { easy: new Set(), medium: new Set(), hard: new Set() };
      for (const diff of ['easy', 'medium', 'hard']) {
        for (let i = 0; i < 12; i++) {
          const scene = game.scene.getScene('NonogramScene');
          for (const s of game.scene.getScenes(true)) {
            if (s.scene.key !== 'NonogramScene' && s.scene.key !== 'BootScene') {
              game.scene.stop(s.scene.key);
            }
          }
          game.scene.start('NonogramScene', {
            difficulty: diff,
            jobId: 'mill_mousing',
            catId: 'player_wildcat',
          });
          // Brief sync wait — init runs synchronously inside scene.start
          const s2 = game.scene.getScene('NonogramScene');
          if (s2 && s2.imageName) {
            seen[diff].add(s2.imageName);
            // Re-validate this exact solution to be sure
            if (!mod.isUniquelySolvable(s2.solution)) {
              return { failed: true, name: s2.imageName, diff };
            }
          }
        }
      }
      return {
        easy: [...seen.easy],
        medium: [...seen.medium],
        hard: [...seen.hard],
      };
    });
    if (allValidate.failed) {
      console.log(`  ✗ ${allValidate.diff} image "${allValidate.name}" did NOT validate`);
      allPass = false;
    } else {
      console.log(`  Easy:   ${allValidate.easy.join(', ')}`);
      console.log(`  Medium: ${allValidate.medium.join(', ')}`);
      console.log(`  Hard:   ${allValidate.hard.join(', ')}`);
      check('Easy surfaces multiple themed images', allValidate.easy.length >= 2);
      check('Medium surfaces multiple themed images', allValidate.medium.length >= 2);
      check('Hard surfaces multiple themed images', allValidate.hard.length >= 2);
    }

    // ── 4. NO penalty feedback: clicking a wrong cell is silent ──
    console.log('\n=== No penalty feedback (clicking wrong cell is silent) ===');
    await launchNonogram(page, 'easy');
    await wait(400);
    const penaltyCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('NonogramScene');
      // Find a cell that should be EMPTY in the solution and click it in fill mode
      let target = null;
      for (let r = 0; r < scene.gridSize; r++) {
        for (let c = 0; c < scene.gridSize; c++) {
          if (!scene.solution[r][c]) { target = { r, c }; break; }
        }
        if (target) break;
      }
      if (!target) return { error: 'no empty cell' };
      // Verify mistakes field doesn't exist (or is undefined/0)
      const mistakesField = scene.mistakes;
      // Click the wrong cell in fill mode
      scene.fillMode = true;
      scene.handleCellClick(target.r, target.c);
      return {
        mistakesField,
        mistakesAfter: scene.mistakes,
        cellState: scene.playerGrid[target.r][target.c],
        target,
      };
    });
    console.log(`  Wrong-cell fill at (${penaltyCheck.target.r},${penaltyCheck.target.c}): cell state = ${penaltyCheck.cellState}`);
    console.log(`  scene.mistakes field: ${penaltyCheck.mistakesField} → ${penaltyCheck.mistakesAfter}`);
    check('Wrong cell now displays as filled (state 1)', penaltyCheck.cellState === 1);
    check('No mistakes counter increment (field undefined or 0)',
      penaltyCheck.mistakesAfter === undefined || penaltyCheck.mistakesAfter === 0);

    // ── 5. Win check requires EXACT match (over-fill prevents win) ──
    console.log('\n=== Win check requires exact match (no over-filling) ===');
    const winCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('NonogramScene');
      // Reset solved
      scene.solved = false;
      // Fill ALL cells, including non-solution cells
      for (let r = 0; r < scene.gridSize; r++) {
        for (let c = 0; c < scene.gridSize; c++) {
          scene.playerGrid[r][c] = 1;
        }
      }
      scene.checkWin();
      const allFilledSolved = scene.solved;

      // Now fill ONLY the solution cells (exact match)
      scene.solved = false;
      for (let r = 0; r < scene.gridSize; r++) {
        for (let c = 0; c < scene.gridSize; c++) {
          scene.playerGrid[r][c] = scene.solution[r][c] ? 1 : 0;
        }
      }
      scene.checkWin();
      const exactSolved = scene.solved;

      return { allFilledSolved, exactSolved };
    });
    console.log(`  All cells filled (over-fill): solved=${winCheck.allFilledSolved}`);
    console.log(`  Exact match: solved=${winCheck.exactSolved}`);
    check('Over-filling does NOT trigger win', winCheck.allFilledSolved === false);
    check('Exact match DOES trigger win', winCheck.exactSolved === true);

    // ── 6. Undo restores the previous cell state ──
    console.log('\n=== Undo restores previous state ===');
    await launchNonogram(page, 'easy');
    await wait(400);
    const undoCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('NonogramScene');
      // Click 3 cells, then undo twice
      scene.fillMode = true;
      const trace = [];
      for (let i = 0; i < 3; i++) {
        scene.handleCellClick(i, i);
        trace.push(scene.playerGrid[i][i]);
      }
      const before = trace.slice();
      scene.undo();
      const afterFirstUndo = scene.playerGrid[2][2];
      scene.undo();
      const afterSecondUndo = scene.playerGrid[1][1];
      return { before, afterFirstUndo, afterSecondUndo };
    });
    console.log(`  After 3 fills at (0,0)(1,1)(2,2): ${undoCheck.before.join(',')}`);
    console.log(`  After first undo: cell (2,2) = ${undoCheck.afterFirstUndo} (expected 0)`);
    console.log(`  After second undo: cell (1,1) = ${undoCheck.afterSecondUndo} (expected 0)`);
    check('First undo restored cell (2,2) to empty', undoCheck.afterFirstUndo === 0);
    check('Second undo restored cell (1,1) to empty', undoCheck.afterSecondUndo === 0);

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
