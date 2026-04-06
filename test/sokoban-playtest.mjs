// SokobanScene playtest — verifies the themed-level redesign:
//   1. Each difficulty exposes named themed levels with a name + concept
//   2. Every themed level is solvable (BFS-validated at scene load time)
//   3. Level name + concept are rendered above the puzzle
//   4. Restart button resets the puzzle to its initial state
//   5. The push mechanic still works and victory still triggers
//
// RESILIENCE: same multi-layer protection as chase-playtest:
//   - Hard top-level setTimeout (90s) → process.exit(3)
//   - Process group kill for vite (kill -<pgid> after detached spawn)
//   - Signal handlers (SIGINT/SIGTERM/uncaughtException) route through
//     the same emergency cleanup
//   - finally-block guaranteed teardown
//   - Recommended outer wrapper: `timeout 150s node test/sokoban-playtest.mjs`
//
// All verifications use direct method calls + state inspection. No waiting
// on Phaser timers, which are unreliable under page.evaluate scene.start.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'sokoban');
const SAVE_PATH = path.join(__dirname, 'test-save-everything-unlocked.json');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const BASE = 'http://localhost:3200';
const HARD_TIMEOUT_MS = 90_000;

// ── Process-level kill switch ──
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
  return p;
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

async function inspectSokoban(page) {
  return page.evaluate(() => {
    const game = window.__clowderGame;
    if (!game) return { error: 'no game instance' };
    const scene = game.scene.getScene('SokobanScene');
    if (!scene || !scene.sys.isActive()) return { error: 'SokobanScene not active' };
    const s = scene;
    return {
      levelName: s.level?.name,
      levelConcept: s.level?.concept,
      minMoves: s.level?.minMoves,
      playerPos: s.playerPos,
      crates: s.crates,
      targets: s.level?.targets,
      moveCount: s.moveCount,
      solved: s.solved,
      inputLocked: s.inputLocked,
      gridDims: s.level ? [s.level.grid.length, s.level.grid[0].length] : null,
    };
  });
}

async function loadTestSave(page) {
  const save = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf-8'));
  save.flags = { ...save.flags, tutorial_complete: true, clowder_intro_shown: true };
  await page.evaluate((s) => {
    localStorage.setItem('clowder_save_slot_1', s);
    localStorage.setItem('clowder_save', s);
    const keys = [
      'clowder_tutorial_shown',
      'clowder_sokoban_tutorial_v2',
      'clowder_sokoban_tutorial',
    ];
    for (const k of keys) localStorage.setItem(k, '1');
  }, JSON.stringify(save));
}

async function launchSokoban(page, difficulty) {
  return page.evaluate((diff) => {
    const game = window.__clowderGame;
    if (!game) return 'no game';
    for (const scene of game.scene.getScenes(true)) {
      if (scene.scene.key !== 'SokobanScene' && scene.scene.key !== 'BootScene') {
        game.scene.stop(scene.scene.key);
      }
    }
    game.scene.start('SokobanScene', {
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

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await loadTestSave(page);
    await page.reload({ waitUntil: 'networkidle' });
    await wait(4000);

    // ── 1. Validate EVERY themed level by reaching into the THEMED_LEVELS
    //    dictionary via the running scene. We can't import it directly from
    //    the test (it's not exported), so we run the scene's solveSokoban
    //    against the data we read off a freshly-launched scene's level pool.
    //    Strategy: launch each difficulty several times and tally how many
    //    distinct themed names show up. With ~3 themed per difficulty,
    //    8 launches per difficulty should hit them all with high probability.
    console.log('\n=== Themed levels appear and validate ===');
    const seenLevels = { easy: new Set(), medium: new Set(), hard: new Set() };
    for (const diff of ['easy', 'medium', 'hard']) {
      for (let i = 0; i < 8; i++) {
        await launchSokoban(page, diff);
        await wait(400);
        const state = await inspectSokoban(page);
        if (state.error) throw new Error(`launch ${diff}#${i} failed: ${state.error}`);
        seenLevels[diff].add(state.levelName);
        // Sanity: minMoves was filled in by the BFS validator
        if (typeof state.minMoves !== 'number' || state.minMoves <= 0) {
          console.log(`  ✗ ${diff}: level "${state.levelName}" has invalid minMoves=${state.minMoves}`);
          allPass = false;
        }
        // Sanity: name and concept exist and are non-trivial
        if (!state.levelName || state.levelName.length < 3) {
          console.log(`  ✗ ${diff}#${i}: missing name`);
          allPass = false;
        }
        if (!state.levelConcept || state.levelConcept.length < 10) {
          console.log(`  ✗ ${diff}#${i}: missing concept`);
          allPass = false;
        }
      }
      console.log(`  ${diff}: ${seenLevels[diff].size} distinct levels seen → ${[...seenLevels[diff]].join(', ')}`);
    }

    // The minimum bar: each difficulty surfaces at least 2 distinct themed
    // names. (3 themed levels per difficulty are defined; with 8 random
    // picks we should usually see all 3, but the test tolerates 2 to avoid
    // flakiness from RNG streaks.)
    for (const diff of ['easy', 'medium', 'hard']) {
      if (seenLevels[diff].size >= 2) {
        console.log(`  ✓ ${diff} surfaces ≥2 named themed levels`);
      } else {
        console.log(`  ✗ ${diff} only surfaced ${seenLevels[diff].size} themed levels`);
        allPass = false;
      }
    }

    // ── 2. Verify the level title is rendered to the screen ──
    console.log('\n=== Level name is rendered above the puzzle ===');
    await launchSokoban(page, 'easy');
    await wait(500);
    const onScreenLevelName = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('SokobanScene');
      if (!scene || !scene.level) return null;
      const target = scene.level.name;
      const allText = [];
      scene.children.list.forEach((child) => {
        if (child.type === 'Text' && typeof child.text === 'string') {
          allText.push(child.text);
        }
      });
      return { target, found: allText.includes(target), allText };
    });
    if (onScreenLevelName?.found) {
      console.log(`  ✓ Level title "${onScreenLevelName.target}" rendered`);
    } else {
      console.log(`  ✗ Level title not found in scene text. Got: ${JSON.stringify(onScreenLevelName?.allText)}`);
      allPass = false;
    }
    await shot(page, 'easy-with-level-name');

    // ── 3. Restart button resets state ──
    console.log('\n=== Restart returns puzzle to initial state ===');
    const restartCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('SokobanScene');
      const initialPlayer = { ...scene.level.playerStart };
      const initialCrates = scene.level.crates.map((c) => ({ ...c }));

      // Make some moves: try every direction so at least one lands a push
      for (const d of ['right', 'down', 'right', 'down']) {
        scene.tryMove(d);
      }
      const movedCount = scene.moveCount;
      const movedPlayer = { ...scene.playerPos };

      // Now restart
      scene.resetPuzzle();

      return {
        movedCount,
        movedPlayer,
        afterPlayer: { ...scene.playerPos },
        afterMoveCount: scene.moveCount,
        cratesMatchInitial: scene.crates.length === initialCrates.length &&
          scene.crates.every((c, i) => c.r === initialCrates[i].r && c.c === initialCrates[i].c),
        initialPlayer,
      };
    });
    console.log(`  Player moved from ${JSON.stringify(restartCheck.initialPlayer)} → ${JSON.stringify(restartCheck.movedPlayer)} (${restartCheck.movedCount} moves)`);
    console.log(`  After Restart: player=${JSON.stringify(restartCheck.afterPlayer)} moveCount=${restartCheck.afterMoveCount} crates-match-initial=${restartCheck.cratesMatchInitial}`);
    const restartOk = restartCheck.afterMoveCount === 0 &&
      restartCheck.afterPlayer.r === restartCheck.initialPlayer.r &&
      restartCheck.afterPlayer.c === restartCheck.initialPlayer.c &&
      restartCheck.cratesMatchInitial;
    if (restartOk) {
      console.log('  ✓ Restart fully resets the puzzle');
    } else {
      console.log('  ✗ Restart did not fully reset');
      allPass = false;
    }

    // ── 4. Push mechanic still works (call tryMove and verify state changes) ──
    console.log('\n=== Push mechanic moves player and crates ===');
    await launchSokoban(page, 'easy');
    await wait(500);
    const pushCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('SokobanScene');
      // Find a direction where the player will actually push something
      const dirs = ['up', 'down', 'left', 'right'];
      const dirOffsets = {
        up: { dr: -1, dc: 0 },
        down: { dr: 1, dc: 0 },
        left: { dr: 0, dc: -1 },
        right: { dr: 0, dc: 1 },
      };
      for (const d of dirs) {
        const off = dirOffsets[d];
        const checkR = scene.playerPos.r + off.dr;
        const checkC = scene.playerPos.c + off.dc;
        const hasCrate = scene.crates.some((c) => c.r === checkR && c.c === checkC);
        if (hasCrate) {
          const beforeCrate = { ...scene.crates.find((c) => c.r === checkR && c.c === checkC) };
          scene.tryMove(d);
          const afterCrate = scene.crates.find((c) => c.r === scene.playerPos.r + off.dr && c.c === scene.playerPos.c + off.dc);
          return {
            direction: d,
            beforeCrate,
            afterCrate,
            playerNowAt: { ...scene.playerPos },
            moveCount: scene.moveCount,
          };
        }
      }
      return { noAdjacentCrate: true };
    });
    if (pushCheck.noAdjacentCrate) {
      // Walk one step and try again — easy "First Push" has the player far from crates
      const fallbackCheck = await page.evaluate(() => {
        const scene = window.__clowderGame.scene.getScene('SokobanScene');
        // Walk east until we hit something
        for (let i = 0; i < 5; i++) {
          const before = { ...scene.playerPos };
          scene.tryMove('right');
          const after = { ...scene.playerPos };
          if (before.r === after.r && before.c === after.c) break;
        }
        return { playerPos: { ...scene.playerPos }, moveCount: scene.moveCount, crates: scene.crates.map((c) => ({ ...c })) };
      });
      console.log(`  Walked east to ${JSON.stringify(fallbackCheck.playerPos)} after ${fallbackCheck.moveCount} moves`);
      if (fallbackCheck.moveCount > 0) {
        console.log('  ✓ Player movement works');
      } else {
        console.log('  ✗ Player did not move');
        allPass = false;
      }
    } else {
      console.log(`  Pushed ${pushCheck.direction}: crate moved from ${JSON.stringify(pushCheck.beforeCrate)} → ${JSON.stringify(pushCheck.afterCrate)}`);
      if (pushCheck.afterCrate && pushCheck.moveCount > 0) {
        console.log('  ✓ Push mechanic works');
      } else {
        console.log('  ✗ Push mechanic broken');
        allPass = false;
      }
    }

    // ── 5. Solve a level by following a BFS path → verify victory ──
    // This is the strongest end-to-end check: we use the scene's own solver
    // to find a solution, replay it via tryMove, and verify the win event
    // fires (scene.solved becomes true).
    console.log('\n=== End-to-end: BFS solver path drives victory ===');
    await launchSokoban(page, 'easy');
    await wait(500);
    const solveResult = await page.evaluate(async () => {
      const scene = window.__clowderGame.scene.getScene('SokobanScene');
      // We need solveSokoban to return the actual move sequence, not just a
      // count. Re-implement a tiny BFS inline against the scene's grid.
      const { grid } = scene.level;
      const ROWS = grid.length;
      const COLS = grid[0].length;
      const FLOOR_VAL = 2;
      const isFloor = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c] === FLOOR_VAL;
      const dirs = [
        ['up', { dr: -1, dc: 0 }],
        ['down', { dr: 1, dc: 0 }],
        ['left', { dr: 0, dc: -1 }],
        ['right', { dr: 0, dc: 1 }],
      ];
      const targets = scene.level.targets;
      const isSolved = (crates) => targets.every((t) => crates.some((c) => c.r === t.r && c.c === t.c));
      const stateKey = (pr, pc, crates) => `${pr},${pc}|${crates.map((c) => `${c.r},${c.c}`).sort().join(';')}`;

      const start = {
        pr: scene.playerPos.r,
        pc: scene.playerPos.c,
        crates: scene.crates.map((c) => ({ ...c })),
        path: [],
      };
      const visited = new Set([stateKey(start.pr, start.pc, start.crates)]);
      const queue = [start];
      let solution = null;
      let explored = 0;
      while (queue.length > 0 && explored < 50000) {
        const cur = queue.shift();
        explored++;
        if (isSolved(cur.crates)) { solution = cur.path; break; }
        for (const [name, off] of dirs) {
          const nr = cur.pr + off.dr;
          const nc = cur.pc + off.dc;
          if (!isFloor(nr, nc)) continue;
          const crateIdx = cur.crates.findIndex((c) => c.r === nr && c.c === nc);
          let newCrates = cur.crates;
          if (crateIdx >= 0) {
            const pushR = nr + off.dr;
            const pushC = nc + off.dc;
            if (!isFloor(pushR, pushC)) continue;
            if (cur.crates.some((c) => c.r === pushR && c.c === pushC)) continue;
            newCrates = cur.crates.map((c, i) => i === crateIdx ? { r: pushR, c: pushC } : c);
          }
          const key = stateKey(nr, nc, newCrates);
          if (visited.has(key)) continue;
          visited.add(key);
          queue.push({ pr: nr, pc: nc, crates: newCrates, path: [...cur.path, name] });
        }
      }
      if (!solution) return { error: 'BFS could not find a solution', explored };

      // Replay the solution via the real tryMove path
      for (const move of solution) {
        scene.tryMove(move);
      }

      return {
        solution,
        steps: solution.length,
        solved: scene.solved,
        finalMoves: scene.moveCount,
        explored,
      };
    });

    if (solveResult.error) {
      console.log(`  ✗ ${solveResult.error} (explored ${solveResult.explored})`);
      allPass = false;
    } else {
      console.log(`  Solved in ${solveResult.steps} steps: ${solveResult.solution.join('→')}`);
      console.log(`  scene.solved=${solveResult.solved}, scene.moveCount=${solveResult.finalMoves}`);
      if (solveResult.solved) {
        console.log('  ✓ End-to-end solve triggers victory');
      } else {
        console.log('  ✗ Solve completed but scene.solved is still false');
        allPass = false;
      }
    }
    await shot(page, 'after-bfs-solve');
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
