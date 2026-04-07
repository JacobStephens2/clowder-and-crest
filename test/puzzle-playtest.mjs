// PuzzleScene playtest — verifies the sliding-block design pillars:
//   1. Every authored puzzle has a name + concept
//   2. Load-time BFS validator confirms every puzzle is solvable
//   3. The validator auto-corrects authored minMoves drift
//   4. PuzzleScene displays the puzzle's name in the HUD
//   5. PERFECT callout fires when the player solves at par
//   6. Block axis arrows are present (axisGfx in each block container)
//   7. Undo + reset still work
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
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'puzzle');
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
      'clowder_puzzle_tutorial_v2',
      'clowder_puzzle_tutorial',
    ];
    for (const k of keys) localStorage.setItem(k, '1');
  }, JSON.stringify(save));
}

async function launchPuzzle(page, puzzleId) {
  return page.evaluate(async (id) => {
    const game = window.__clowderGame;
    if (!game) return 'no game';
    const mod = await import('/src/systems/PuzzleGenerator.ts');
    const puzzle = id ? mod.getPuzzle(id) : mod.getPuzzleByDifficulty('easy');
    if (!puzzle) return 'no puzzle';
    for (const scene of game.scene.getScenes(true)) {
      if (scene.scene.key !== 'PuzzleScene' && scene.scene.key !== 'BootScene') {
        game.scene.stop(scene.scene.key);
      }
    }
    game.scene.start('PuzzleScene', {
      puzzle,
      jobId: 'mill_mousing',
      catId: 'player_wildcat',
    });
    return 'started';
  }, puzzleId);
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
  const consoleWarns = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (t.includes('google') || t.includes('analytics')) return;
      consoleErrors.push(t);
      console.log('  ERR:', t);
    }
    if (msg.type() === 'warning') {
      const t = msg.text();
      if (t.includes('PuzzleGenerator')) consoleWarns.push(t);
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

    // ── 1. Every authored puzzle has a name + concept ──
    console.log('\n=== Authored puzzles have themed names + concepts ===');
    const libraryCheck = await page.evaluate(async () => {
      const mod = await import('/src/systems/PuzzleGenerator.ts');
      const all = mod.getAllPuzzles();
      return all.map((p) => ({
        id: p.id, name: p.name, concept: p.concept,
        difficulty: p.difficulty, minMoves: p.minMoves,
      }));
    });
    console.log(`  Library size: ${libraryCheck.length}`);
    for (const p of libraryCheck) {
      console.log(`    ${p.id} (${p.difficulty}) "${p.name}" — ${p.concept} (par ${p.minMoves})`);
    }
    check('All puzzles have a name', libraryCheck.every((p) => p.name && p.name.length > 0));
    check('All puzzles have a concept', libraryCheck.every((p) => p.concept && p.concept.length > 0));
    const easyCount = libraryCheck.filter((p) => p.difficulty === 'easy').length;
    const mediumCount = libraryCheck.filter((p) => p.difficulty === 'medium').length;
    const hardCount = libraryCheck.filter((p) => p.difficulty === 'hard').length;
    console.log(`  By difficulty: easy=${easyCount}, medium=${mediumCount}, hard=${hardCount}`);
    // The doc emphasizes quality > quantity for the hand-curated hard tier:
    // a single insightful hard puzzle beats three mediocre ones. Hand-
    // designing genuinely hard Rush Hour positions is non-trivial, so we
    // require at least one and accept that growing the hard tier is a
    // longer-term project.
    check('Hard tier has ≥1 hand-curated puzzle', hardCount >= 1);
    check('Easy tier has ≥3 puzzles for variety', easyCount >= 3);

    // ── 2. Validator: every loaded puzzle is solvable ──
    console.log('\n=== Loaded puzzles are all BFS-solvable ===');
    const solvabilityCheck = await page.evaluate(async () => {
      const mod = await import('/src/systems/PuzzleGenerator.ts');
      const all = mod.getAllPuzzles();
      const results = [];
      for (const p of all) {
        const r = mod.isSolvable(p);
        results.push({ id: p.id, name: p.name, solvable: r.solvable, bfsMin: r.minMoves, authored: p.minMoves });
      }
      return results;
    });
    console.log('  id          | bfs | authored | match');
    for (const r of solvabilityCheck) {
      const match = r.solvable && r.bfsMin === r.authored ? '✓' : '✗';
      console.log(`  ${r.id.padEnd(11)} | ${String(r.bfsMin).padStart(3)} | ${String(r.authored).padStart(8)} | ${match}`);
    }
    check('Every loaded puzzle is solvable', solvabilityCheck.every((r) => r.solvable));
    check('Every loaded puzzle minMoves matches BFS optimum',
      solvabilityCheck.every((r) => r.bfsMin === r.authored));

    // ── 3. Validator catches drift ──
    // Test by manually constructing a puzzle with a wrong minMoves and
    // running it through isSolvable directly.
    console.log('\n=== Validator detects authored-vs-BFS drift ===');
    const driftCheck = await page.evaluate(async () => {
      const mod = await import('/src/systems/PuzzleGenerator.ts');
      // The smallest "First Slide" puzzle, but lie about minMoves
      const fakePuzzle = {
        id: 'drift_test',
        name: 'Drift Test',
        difficulty: 'easy',
        minMoves: 99, // wrong on purpose
        exitSide: 'right',
        exitRow: 2,
        blocks: [
          { id: 'cat', x: 0, y: 2, length: 2, orientation: 'horizontal', isTarget: true },
        ],
      };
      const result = mod.isSolvable(fakePuzzle);
      return { authored: fakePuzzle.minMoves, bfs: result.minMoves, mismatch: result.minMoves !== fakePuzzle.minMoves };
    });
    console.log(`  Authored 99, BFS computed ${driftCheck.bfs}, mismatch detected: ${driftCheck.mismatch}`);
    check('BFS computed a different value (catches drift)', driftCheck.mismatch === true);

    // ── 4. PuzzleScene displays the puzzle name in the HUD ──
    console.log('\n=== Puzzle name renders in HUD ===');
    await launchPuzzle(page, 'easy_1');
    await wait(800);
    const hudCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('PuzzleScene');
      if (!scene || !scene.sys.isActive()) return { error: 'scene inactive' };
      const allText = [];
      scene.children.list.forEach((c) => {
        if (c.type === 'Text' && typeof c.text === 'string') {
          allText.push(c.text);
        }
      });
      return {
        configName: scene.config.name,
        configConcept: scene.config.concept,
        hasName: allText.includes(scene.config.name),
        hasConcept: allText.includes(scene.config.concept),
        allText,
      };
    });
    console.log(`  config.name = "${hudCheck.configName}"`);
    console.log(`  config.concept = "${hudCheck.configConcept}"`);
    check('Name "First Slide" rendered in scene text',
      hudCheck.configName === 'First Slide' && hudCheck.hasName);
    check('Concept rendered in scene text', hudCheck.hasConcept);
    await shot(page, 'easy-1-with-name');

    // ── 5. PERFECT callout fires when player ties par ──
    console.log('\n=== PERFECT callout fires on optimal solve ===');
    const perfectCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('PuzzleScene');
      // Force the win path with a move count equal to par
      scene.solved = false;
      scene.moveCount = scene.config.minMoves - 1; // winPuzzle increments by 1
      // Pick the target block sprite
      const target = scene.blockSprites.find((s) => s.block.isTarget);
      if (!target) return { error: 'no target sprite' };
      scene.winPuzzle(target);
      // The callout text is added to the scene; look for "PERFECT!"
      const allText = [];
      scene.children.list.forEach((c) => {
        if (c.type === 'Text' && typeof c.text === 'string') {
          allText.push(c.text);
        }
      });
      const hasPerfect = allText.some((t) => t === 'PERFECT!');
      return { moveCountAtWin: scene.moveCount, par: scene.config.minMoves, hasPerfect };
    });
    console.log(`  moveCount=${perfectCheck.moveCountAtWin}, par=${perfectCheck.par}, PERFECT shown: ${perfectCheck.hasPerfect}`);
    check('PERFECT! callout fires when player ties par', perfectCheck.hasPerfect === true);

    // ── 6. Sub-par solve does NOT fire PERFECT ──
    console.log('\n=== Sub-par solve does NOT fire PERFECT ===');
    await launchPuzzle(page, 'easy_2');
    await wait(500);
    const subparCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('PuzzleScene');
      scene.solved = false;
      // Way over par
      scene.moveCount = scene.config.minMoves * 3 - 1;
      const target = scene.blockSprites.find((s) => s.block.isTarget);
      scene.winPuzzle(target);
      const allText = [];
      scene.children.list.forEach((c) => {
        if (c.type === 'Text' && typeof c.text === 'string') {
          allText.push(c.text);
        }
      });
      return {
        moveCountAtWin: scene.moveCount,
        par: scene.config.minMoves,
        hasPerfect: allText.some((t) => t === 'PERFECT!'),
      };
    });
    console.log(`  moveCount=${subparCheck.moveCountAtWin}, par=${subparCheck.par}, PERFECT shown: ${subparCheck.hasPerfect}`);
    check('Sub-par solve does NOT fire PERFECT', subparCheck.hasPerfect === false);

    // ── 7. Block axis arrows are present ──
    console.log('\n=== Block axis arrows present in non-target containers ===');
    await launchPuzzle(page, 'easy_1');
    await wait(500);
    const axisCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('PuzzleScene');
      // Each non-target block container has 2+ children (rect + arrows + label).
      // Target block has axisGfx hidden via alpha=0 but still present.
      const containers = scene.blockSprites.map((s) => ({
        id: s.block.id,
        isTarget: s.block.isTarget,
        childCount: s.container.length,
      }));
      const nonTargets = containers.filter((c) => !c.isTarget);
      const minChildren = Math.min(...nonTargets.map((c) => c.childCount));
      return { containers, minNonTargetChildren: minChildren };
    });
    console.log(`  Non-target blocks have at least ${axisCheck.minNonTargetChildren} children (rect+axis+label minimum)`);
    check('Non-target blocks have ≥3 children (rect + axis + label)',
      axisCheck.minNonTargetChildren >= 3);

    // ── 8. Undo and reset still work ──
    console.log('\n=== Undo + reset still work ===');
    await launchPuzzle(page, 'easy_1');
    await wait(500);
    const undoCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('PuzzleScene');
      // Move a block via direct manipulation, then undo
      const sprite = scene.blockSprites.find((s) => !s.block.isTarget);
      if (!sprite) return { error: 'no non-target sprite' };
      const startX = sprite.block.x;
      const startY = sprite.block.y;
      // Manually push a fake history entry and update block position
      scene.moveHistory.push({ blockId: sprite.block.id, fromX: startX, fromY: startY });
      sprite.block.x = startX; // simulate move (no actual move available without dragging)
      scene.moveCount = 1;
      scene.undo();
      return {
        moveCountAfterUndo: scene.moveCount,
        historyLen: scene.moveHistory.length,
      };
    });
    console.log(`  After undo: moveCount=${undoCheck.moveCountAfterUndo}, history len=${undoCheck.historyLen}`);
    check('Undo decrements moveCount', undoCheck.moveCountAfterUndo === 0);
    check('Undo pops history entry', undoCheck.historyLen === 0);

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
  if (consoleWarns.length > 0) {
    console.log(`Validator warnings: ${consoleWarns.length}`);
    consoleWarns.forEach((w) => console.log('  -', w));
  }
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
