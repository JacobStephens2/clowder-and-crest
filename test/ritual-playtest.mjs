// RitualScene playtest — verifies the sequence-memory design pillars:
//   1. Per-candle distinct frequencies (pentatonic scale)
//   2. Speed escalation across rounds (flash + gap shrink)
//   3. Adaptive replaySpeedMult on failure (1.4x slowdown)
//   4. Replay slowdown resets on round advance
//   5. Perfect-round tracking + tiered star scoring
//   6. Near-fail messaging when player gets far into a long sequence
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
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'ritual');
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
      'clowder_ritual_tutorial_v2',
      'clowder_ritual_tutorial',
    ];
    for (const k of keys) localStorage.setItem(k, '1');
  }, JSON.stringify(save));
}

async function launchRitual(page, difficulty) {
  return page.evaluate((diff) => {
    const game = window.__clowderGame;
    if (!game) return 'no game';
    for (const scene of game.scene.getScenes(true)) {
      if (scene.scene.key !== 'RitualScene' && scene.scene.key !== 'BootScene') {
        game.scene.stop(scene.scene.key);
      }
    }
    game.scene.start('RitualScene', {
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

    // ── 1. Per-candle distinct frequencies ──
    console.log('\n=== Distinct per-candle pentatonic frequencies ===');
    await launchRitual(page, 'medium');
    await wait(500);
    const freqCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('RitualScene');
      const freqs = [];
      for (let i = 0; i < scene.candleCount; i++) {
        freqs.push(scene.getCandleFrequency(i));
      }
      return { freqs, candleCount: scene.candleCount };
    });
    console.log(`  Candle count: ${freqCheck.candleCount}`);
    console.log(`  Frequencies: ${freqCheck.freqs.map((f) => f.toFixed(2)).join(', ')} Hz`);
    check('All candle frequencies are distinct',
      new Set(freqCheck.freqs).size === freqCheck.freqs.length);
    check('Frequencies are in ascending order (pentatonic ramp)',
      freqCheck.freqs.every((f, i) => i === 0 || f > freqCheck.freqs[i - 1]));
    check('Lowest tone is C4 (~261 Hz)',
      Math.abs(freqCheck.freqs[0] - 261.63) < 0.01);

    // ── 2. Speed escalation across rounds ──
    console.log('\n=== Speed escalation: flash duration shrinks per round ===');
    const speedCurve = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('RitualScene');
      const samples = [];
      const oldRound = scene.round;
      const oldMult = scene.replaySpeedMult;
      scene.replaySpeedMult = 1.0;
      for (let r = 1; r <= scene.targetRounds; r++) {
        scene.round = r;
        samples.push({
          round: r,
          flashMs: scene.getCurrentFlashMs(),
          gapMs: scene.getCurrentGapMs(),
        });
      }
      scene.round = oldRound;
      scene.replaySpeedMult = oldMult;
      return samples;
    });
    console.log('  round | flashMs | gapMs');
    for (const s of speedCurve) {
      console.log(`  ${String(s.round).padStart(4)}  | ${String(s.flashMs).padStart(6)}  | ${String(s.gapMs).padStart(5)}`);
    }
    check('Flash duration shrinks across rounds',
      speedCurve[speedCurve.length - 1].flashMs < speedCurve[0].flashMs);
    check('Gap duration shrinks across rounds',
      speedCurve[speedCurve.length - 1].gapMs < speedCurve[0].gapMs);
    check('Flash ramp is monotonic (non-increasing)',
      speedCurve.every((s, i) => i === 0 || s.flashMs <= speedCurve[i - 1].flashMs));

    // ── 3. Adaptive slowdown on failure ──
    console.log('\n=== Adaptive replay slowdown after failure ===');
    const slowdownCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('RitualScene');
      // Force a normal-speed measurement
      scene.round = 4;
      scene.replaySpeedMult = 1.0;
      scene.targetRounds = 6;
      const normalFlash = scene.getCurrentFlashMs();
      // Apply the failure slowdown
      scene.replaySpeedMult = 1.4;
      const slowFlash = scene.getCurrentFlashMs();
      return { normalFlash, slowFlash };
    });
    console.log(`  Normal flash at round 4: ${slowdownCheck.normalFlash}ms`);
    console.log(`  Slowed flash (1.4x): ${slowdownCheck.slowFlash}ms`);
    check('Slowdown extends flash duration',
      slowdownCheck.slowFlash > slowdownCheck.normalFlash);
    check('Slowdown is roughly 1.4x',
      Math.abs(slowdownCheck.slowFlash / slowdownCheck.normalFlash - 1.4) < 0.05);

    // ── 4. Slowdown resets on a new round ──
    console.log('\n=== Slowdown resets on round advance ===');
    const resetCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('RitualScene');
      // Set up: simulate a failed round
      scene.replaySpeedMult = 1.4;
      scene.currentRoundPerfect = false;
      const beforeRound = scene.round;
      scene.nextRound();
      return {
        replaySpeedMultAfter: scene.replaySpeedMult,
        currentRoundPerfectAfter: scene.currentRoundPerfect,
        roundAdvanced: scene.round > beforeRound,
      };
    });
    console.log(`  After nextRound(): replaySpeedMult=${resetCheck.replaySpeedMultAfter}, currentRoundPerfect=${resetCheck.currentRoundPerfectAfter}`);
    check('replaySpeedMult reset to 1.0', resetCheck.replaySpeedMultAfter === 1.0);
    check('currentRoundPerfect reset to true', resetCheck.currentRoundPerfectAfter === true);
    check('Round advanced', resetCheck.roundAdvanced);

    // ── 5. Perfect round tracking ──
    console.log('\n=== Perfect round tracking ===');
    await launchRitual(page, 'easy');
    await wait(500);
    const perfectCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('RitualScene');
      // Simulate a perfect first round: setup sequence, mark as input, tap correctly
      scene.round = 1;
      scene.sequence = [0, 1, 2];
      scene.playerInput = [];
      scene.phase = 'input';
      scene.currentRoundPerfect = true;
      scene.targetRounds = 99; // prevent endGame from firing
      // Tap each candle in order
      for (let i = 0; i < 3; i++) {
        scene.onCandleTap(i);
      }
      const afterPerfect = scene.perfectRounds;

      // Now simulate a round with a failure
      scene.round = 2;
      scene.sequence = [0, 1, 2];
      scene.playerInput = [];
      scene.phase = 'input';
      scene.currentRoundPerfect = true;
      scene.lives = 99;
      // Wrong tap on first step
      scene.onCandleTap(2); // expected 0
      // After this, currentRoundPerfect should be false; tapping correctly now
      // shouldn't promote to perfect
      scene.playerInput = [];
      scene.phase = 'input';
      for (let i = 0; i < 3; i++) {
        scene.onCandleTap(i);
      }
      const afterFailure = scene.perfectRounds;

      return { afterPerfect, afterFailure };
    });
    console.log(`  perfectRounds after perfect round 1: ${perfectCheck.afterPerfect}`);
    console.log(`  perfectRounds after failed-then-completed round 2: ${perfectCheck.afterFailure}`);
    check('Perfect round increments perfectRounds', perfectCheck.afterPerfect === 1);
    check('Failed-then-completed round does NOT increment perfectRounds',
      perfectCheck.afterFailure === 1);

    // ── 6. Near-fail messaging logic ──
    console.log('\n=== Near-fail message when failing late in a long sequence ===');
    await launchRitual(page, 'easy');
    await wait(500);
    const nearFailCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('RitualScene');
      // Set up a 5-step sequence and fail on step 4 (80% through)
      scene.round = 5;
      scene.targetRounds = 99;
      scene.sequence = [0, 1, 2, 3, 0];
      scene.playerInput = [];
      scene.phase = 'input';
      scene.lives = 99;
      // Tap correctly 4 times, then wrong on the 5th
      for (let i = 0; i < 4; i++) {
        scene.onCandleTap(scene.sequence[i]);
      }
      scene.onCandleTap(2); // wrong! expected 0
      // The status text should say "Almost!"
      const statusText = scene.children.getByName('statusText');
      const lateMessage = statusText?.text ?? '';

      // Now early-fail: 4-step sequence, fail on step 1
      scene.round = 6;
      scene.sequence = [0, 1, 2, 3];
      scene.playerInput = [];
      scene.phase = 'input';
      scene.lives = 99;
      scene.onCandleTap(2); // wrong! expected 0
      const earlyMessage = statusText?.text ?? '';
      return { lateMessage, earlyMessage };
    });
    console.log(`  Late-fail message: "${nearFailCheck.lateMessage}"`);
    console.log(`  Early-fail message: "${nearFailCheck.earlyMessage}"`);
    check('Late failure shows "Almost!" message',
      nearFailCheck.lateMessage.toLowerCase().includes('almost'));
    check('Early failure shows generic "Wrong" message',
      nearFailCheck.earlyMessage.toLowerCase().includes('wrong'));

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
