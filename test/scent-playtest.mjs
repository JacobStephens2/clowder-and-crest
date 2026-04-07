// ScentTrailScene playtest — verifies the deduction/hot-cold design pillars:
//   1. Grid stores exact Manhattan distance (not 0-3 buckets)
//   2. Tile reveal shows the actual distance number
//   3. Remote probe decrements probesLeft and reveals a non-adjacent tile
//   4. Out-of-probes blocks further probes
//   5. Constraint ring highlights exactly the right number of cells
//   6. Direction hint is gone from the HUD
//   7. Walking onto the target still triggers victory
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
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'scent');
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
      'clowder_scent_tutorial_v2',
      'clowder_scent_tutorial',
    ];
    for (const k of keys) localStorage.setItem(k, '1');
  }, JSON.stringify(save));
}

async function launchScent(page, difficulty) {
  return page.evaluate((diff) => {
    const game = window.__clowderGame;
    if (!game) return 'no game';
    for (const scene of game.scene.getScenes(true)) {
      if (scene.scene.key !== 'ScentTrailScene' && scene.scene.key !== 'BootScene') {
        game.scene.stop(scene.scene.key);
      }
    }
    game.scene.start('ScentTrailScene', {
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

    // ── 1. Grid stores exact Manhattan distance ──
    console.log('\n=== Grid stores exact Manhattan distance (not 0-3 buckets) ===');
    await launchScent(page, 'medium');
    await wait(500);
    const gridCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('ScentTrailScene');
      // Pick a few cells far from the target and verify their stored value
      // is the actual Manhattan distance, not capped at 3
      const samples = [];
      for (let r = 0; r < scene.gridSize; r++) {
        for (let c = 0; c < scene.gridSize; c++) {
          if (scene.grid[r][c] === -1) continue; // wall
          const expected = Math.abs(r - scene.targetR) + Math.abs(c - scene.targetC);
          samples.push({ r, c, stored: scene.grid[r][c], expected });
        }
      }
      // Find the max distance stored
      const maxStored = Math.max(...samples.map((s) => s.stored));
      const allMatch = samples.every((s) => s.stored === s.expected);
      return { maxStored, allMatch, sampleCount: samples.length, gridSize: scene.gridSize };
    });
    console.log(`  Sample count: ${gridCheck.sampleCount}, max stored distance: ${gridCheck.maxStored}, grid: ${gridCheck.gridSize}x${gridCheck.gridSize}`);
    check('Max stored distance > 3 (not bucketed)', gridCheck.maxStored > 3);
    check('All stored values match Manhattan distance to target', gridCheck.allMatch);

    // ── 2. Tile reveal shows numeric distance ──
    console.log('\n=== Reveal text is the numeric distance ===');
    const revealCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('ScentTrailScene');
      // Find an unrevealed non-wall cell and reveal it
      let target = null;
      for (let r = 0; r < scene.gridSize; r++) {
        for (let c = 0; c < scene.gridSize; c++) {
          if (scene.grid[r][c] !== -1 && !scene.revealed[r][c]) {
            target = { r, c, distance: scene.grid[r][c] };
            break;
          }
        }
        if (target) break;
      }
      if (!target) return { error: 'no unrevealed cell' };
      scene.revealTile(target.r, target.c);
      const text = scene.scentTexts[target.r][target.c];
      return {
        target,
        rendered: text?.text,
      };
    });
    console.log(`  Tile (${revealCheck.target.r},${revealCheck.target.c}) distance ${revealCheck.target.distance}, rendered: "${revealCheck.rendered}"`);
    check('Rendered text matches the numeric distance',
      revealCheck.rendered === String(revealCheck.target.distance));

    // ── 3. Remote probe decrements probesLeft and reveals a non-adjacent tile ──
    console.log('\n=== Remote probe consumes a probe and reveals tile ===');
    await launchScent(page, 'medium');
    await wait(400);
    const probeCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('ScentTrailScene');
      const probesBefore = scene.probesLeft;
      // Find an unrevealed non-wall cell that is far from the cat
      let target = null;
      for (let r = 0; r < scene.gridSize; r++) {
        for (let c = 0; c < scene.gridSize; c++) {
          if (scene.grid[r][c] === -1) continue;
          if (scene.revealed[r][c]) continue;
          const distFromCat = Math.abs(r - scene.catPos.r) + Math.abs(c - scene.catPos.c);
          if (distFromCat >= 3) {
            target = { r, c };
            break;
          }
        }
        if (target) break;
      }
      if (!target) return { error: 'no far unrevealed cell' };
      scene.onTileTap(target.r, target.c);
      return {
        target,
        revealed: scene.revealed[target.r][target.c],
        probesAfter: scene.probesLeft,
        probesBefore,
        catUnchanged: true, // we don't move the cat
      };
    });
    console.log(`  Probed (${probeCheck.target.r},${probeCheck.target.c}), probesLeft ${probeCheck.probesBefore} → ${probeCheck.probesAfter}`);
    check('Probe revealed the target tile', probeCheck.revealed === true);
    check('probesLeft decremented by 1', probeCheck.probesAfter === probeCheck.probesBefore - 1);

    // ── 4. Out-of-probes blocks further probes ──
    console.log('\n=== Out of probes blocks further probes ===');
    const outOfCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('ScentTrailScene');
      // Drain probes
      scene.probesLeft = 0;
      // Find an unrevealed non-wall cell
      let target = null;
      for (let r = 0; r < scene.gridSize; r++) {
        for (let c = 0; c < scene.gridSize; c++) {
          if (scene.grid[r][c] !== -1 && !scene.revealed[r][c]) { target = { r, c }; break; }
        }
        if (target) break;
      }
      if (!target) return { error: 'no unrevealed cell' };
      const wasRevealed = scene.revealed[target.r][target.c];
      scene.onTileTap(target.r, target.c);
      return {
        target,
        wasRevealed,
        nowRevealed: scene.revealed[target.r][target.c],
        probesLeftAfter: scene.probesLeft,
      };
    });
    console.log(`  Probed with 0 probes left: was revealed=${outOfCheck.wasRevealed}, now revealed=${outOfCheck.nowRevealed}`);
    check('Tile NOT revealed when out of probes', outOfCheck.nowRevealed === false);
    check('probesLeft stays at 0', outOfCheck.probesLeftAfter === 0);

    // ── 5. Constraint ring highlights all cells at the matching distance ──
    console.log('\n=== Constraint ring highlights cells at matching distance ===');
    await launchScent(page, 'medium');
    await wait(400);
    const ringCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('ScentTrailScene');
      // Pick a revealed tile and call showConstraintRing on it
      const r = scene.catPos.r;
      const c = scene.catPos.c;
      const dist = scene.grid[r][c];
      scene.showConstraintRing(r, c, dist);
      // Count how many cells SHOULD match
      let expected = 0;
      for (let rr = 0; rr < scene.gridSize; rr++) {
        for (let cc = 0; cc < scene.gridSize; cc++) {
          if (scene.grid[rr][cc] === -1) continue;
          if (Math.abs(rr - r) + Math.abs(cc - c) === dist) expected++;
        }
      }
      return {
        center: { r, c },
        distance: dist,
        actualCount: scene.constraintRingGfx.length,
        expectedCount: expected,
      };
    });
    console.log(`  Center (${ringCheck.center.r},${ringCheck.center.c}) at distance ${ringCheck.distance}: ${ringCheck.actualCount} highlights drawn, expected ${ringCheck.expectedCount}`);
    check('Constraint ring count matches Manhattan-distance count',
      ringCheck.actualCount === ringCheck.expectedCount);

    // ── 6. Direction hint is gone ──
    console.log('\n=== Auto-direction hint is removed ===');
    const hintCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('ScentTrailScene');
      const allText = [];
      scene.children.list.forEach((child) => {
        if (child.type === 'Text' && typeof child.text === 'string') {
          allText.push(child.text);
        }
      });
      const driftLine = allText.find((t) => t.includes('drifts'));
      return { driftLine, allText };
    });
    console.log(`  "drifts" line: ${hintCheck.driftLine ?? '(not present)'}`);
    check('No "scent drifts" pre-solve hint in the HUD', !hintCheck.driftLine);

    // ── 7. Walking onto the target still triggers victory ──
    console.log('\n=== Walking onto target still triggers victory ===');
    const winCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('ScentTrailScene');
      // Teleport the cat one step away from the target along an axis with
      // no wall in between, then walk onto it.
      // Find a non-wall neighbor of the target
      const dirs = [
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
      ];
      let approachFrom = null;
      let stepIntoTarget = null;
      for (const d of dirs) {
        const nr = scene.targetR + d.dy;
        const nc = scene.targetC + d.dx;
        if (nr < 0 || nr >= scene.gridSize || nc < 0 || nc >= scene.gridSize) continue;
        if (scene.grid[nr][nc] === -1) continue;
        approachFrom = { r: nr, c: nc };
        // Step direction is opposite of d (we walk INTO the target)
        stepIntoTarget = { dx: -d.dx, dy: -d.dy };
        break;
      }
      if (!approachFrom) return { error: 'no walkable neighbor of target' };
      scene.catPos = approachFrom;
      scene.movesLeft = 5;
      scene.finished = false;
      scene.moveCat(stepIntoTarget.dx, stepIntoTarget.dy);
      return {
        catPos: scene.catPos,
        target: { r: scene.targetR, c: scene.targetC },
        finished: scene.finished,
      };
    });
    console.log(`  Cat now at (${winCheck.catPos.r},${winCheck.catPos.c}), target at (${winCheck.target.r},${winCheck.target.c}), finished=${winCheck.finished}`);
    check('Cat reached the target tile',
      winCheck.catPos.r === winCheck.target.r && winCheck.catPos.c === winCheck.target.c);
    check('Win triggered (scene.finished = true)', winCheck.finished === true);

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
