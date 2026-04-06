// BrawlScene playtest — verifies the top-down action design pillars:
//   1. Telegraphed rat attacks (windup state, can be canceled by walking away)
//   2. Hit-stop on kill (60ms freeze on impact)
//   3. Skirmisher rat type appears in wave 2+
//   4. Wave foreshadowing (alert + delay before actual spawn)
//   5. Boss phase 2 transition at 50% HP
//
// RESILIENCE: same multi-layer pattern as the chase/sokoban/courier playtests:
//   - Hard top-level setTimeout (90s) → process.exit(3)
//   - Process group kill for vite (kill -<pgid> after detached spawn)
//   - Signal handlers route through emergencyCleanup
//   - finally-block guaranteed teardown
//   - Recommended outer wrapper: `timeout 150s node test/brawl-playtest.mjs`

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'brawl');
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

async function inspectBrawl(page) {
  return page.evaluate(() => {
    const game = window.__clowderGame;
    if (!game) return { error: 'no game instance' };
    const scene = game.scene.getScene('BrawlScene');
    if (!scene || !scene.sys.isActive()) return { error: 'BrawlScene not active' };
    const s = scene;
    return {
      catX: s.catX,
      catY: s.catY,
      catHp: s.catHp,
      catMaxHp: s.catMaxHp,
      wave: s.wave,
      totalWaves: s.totalWaves,
      waveAnnouncing: s.waveAnnouncing,
      hitStopUntil: s.hitStopUntil,
      finished: s.finished,
      ratsKilled: s.ratsKilled,
      rats: (s.rats ?? []).map((r) => ({
        type: r.type,
        x: r.x, y: r.y,
        hp: r.hp, maxHp: r.maxHp,
        windupTimer: r.windupTimer,
        windupDuration: r.windupDuration,
        lungeTimer: r.lungeTimer,
        bossPhase: r.bossPhase,
      })),
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
      'clowder_brawl_tutorial_v2',
      'clowder_brawl_tutorial',
    ];
    for (const k of keys) localStorage.setItem(k, '1');
  }, JSON.stringify(save));
}

async function launchBrawl(page, difficulty) {
  return page.evaluate((diff) => {
    const game = window.__clowderGame;
    if (!game) return 'no game';
    for (const scene of game.scene.getScenes(true)) {
      if (scene.scene.key !== 'BrawlScene' && scene.scene.key !== 'BootScene') {
        game.scene.stop(scene.scene.key);
      }
    }
    game.scene.start('BrawlScene', {
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

    // ── 1. Wave foreshadowing: alert appears before actual spawn ──
    console.log('\n=== Wave foreshadowing ===');
    await launchBrawl(page, 'easy');
    await wait(300);
    // Force wave 1 to spawn via the public method (the real timer may not
    // fire under page.evaluate scene launches — proven in HuntScene)
    const foreshadow = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('BrawlScene');
      // Reset wave state and force a foreshadow
      scene.wave = 0;
      scene.rats = [];
      scene.waveAnnouncing = false;
      scene.spawnWave();
      // Right after calling spawnWave, waveAnnouncing should be true
      // and the rat list should still be empty (the actual spawn is delayed)
      return {
        waveAnnouncingAfterCall: scene.waveAnnouncing,
        ratCountAfterCall: scene.rats.length,
        waveNumber: scene.wave,
      };
    });
    console.log(`  After spawnWave(): waveAnnouncing=${foreshadow.waveAnnouncingAfterCall}, rats=${foreshadow.ratCountAfterCall}, wave=${foreshadow.waveNumber}`);
    check('Wave 1 advanced', foreshadow.waveNumber === 1);
    check('waveAnnouncing flag is true after spawnWave', foreshadow.waveAnnouncingAfterCall === true);
    check('No rats spawned during the foreshadow window', foreshadow.ratCountAfterCall === 0);

    // ── 2. Force the actual spawn via the internal method ──
    console.log('\n=== Wave 1 spawns only Grunts ===');
    let state = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('BrawlScene');
      scene.actuallySpawnWave();
      scene.waveAnnouncing = false;
      return {
        rats: scene.rats.map((r) => ({ type: r.type, hp: r.hp })),
      };
    });
    console.log(`  Rats spawned: ${state.rats.length} (${state.rats.map((r) => r.type).join(', ')})`);
    const wave1Types = new Set(state.rats.map((r) => r.type));
    check('Wave 1 has at least 3 rats', state.rats.length >= 3);
    check('Wave 1 contains only grunts', wave1Types.size === 1 && wave1Types.has('grunt'));

    // ── 3. Wave 2 introduces Skirmishers ──
    console.log('\n=== Wave 2 introduces Skirmishers ===');
    state = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('BrawlScene');
      // Clear current rats and force wave 2
      for (const r of scene.rats) r.gfx.destroy();
      scene.rats = [];
      scene.wave = 1; // will become 2 after spawnWave
      scene.actuallySpawnWave(); // skip the foreshadow, just spawn directly
      scene.wave = 2;
      // Re-spawn for wave 2
      for (const r of scene.rats) r.gfx.destroy();
      scene.rats = [];
      scene.actuallySpawnWave();
      return {
        rats: scene.rats.map((r) => ({ type: r.type, hp: r.hp })),
      };
    });
    const wave2Types = state.rats.map((r) => r.type);
    console.log(`  Rats spawned: ${state.rats.length} (${wave2Types.join(', ')})`);
    const hasSkirmisher = wave2Types.includes('skirmisher');
    check('Wave 2 contains at least one skirmisher', hasSkirmisher);
    check('Wave 2 still contains grunts', wave2Types.includes('grunt'));

    // ── 4. Telegraph: starting a windup locks the rat in place ──
    console.log('\n=== Rat windup state ===');
    const windupCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('BrawlScene');
      // Take the first grunt and trigger its windup
      const grunt = scene.rats.find((r) => r.type === 'grunt');
      if (!grunt) return { error: 'no grunt' };
      grunt.stunTimer = 0;
      const before = grunt.windupTimer;
      scene.startRatWindup(grunt);
      return {
        before,
        after: grunt.windupTimer,
        duration: grunt.windupDuration,
      };
    });
    console.log(`  windupTimer: ${windupCheck.before} → ${windupCheck.after} (duration ${windupCheck.duration})`);
    check('startRatWindup sets the windup timer > 0', windupCheck.after > 0);
    check('windupDuration matches the timer at start', Math.abs(windupCheck.after - windupCheck.duration) < 0.001);

    // ── 5. Walking away during windup avoids damage ──
    console.log('\n=== Player can dodge by walking away during windup ===');
    const dodgeCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('BrawlScene');
      const grunt = scene.rats.find((r) => r.type === 'grunt');
      if (!grunt) return { error: 'no grunt' };
      // Place the cat far from the grunt and trigger the resolution as if
      // the windup just elapsed.
      scene.catX = 1000;
      scene.catY = 1000;
      scene.invincibleTimer = 0;
      const hpBefore = scene.catHp;
      scene.resolveRatAttack(grunt);
      return { hpBefore, hpAfter: scene.catHp };
    });
    console.log(`  Cat HP before windup resolves (cat far away): ${dodgeCheck.hpBefore} → ${dodgeCheck.hpAfter}`);
    check('Walking out of range during windup avoids damage', dodgeCheck.hpAfter === dodgeCheck.hpBefore);

    // ── 6. Standing in range when windup resolves takes damage ──
    console.log('\n=== Standing in range when windup resolves takes damage ===');
    const hitCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('BrawlScene');
      const grunt = scene.rats.find((r) => r.type === 'grunt');
      if (!grunt) return { error: 'no grunt' };
      // Place the cat right next to the grunt and resolve the attack
      scene.catX = grunt.x + 4;
      scene.catY = grunt.y + 4;
      scene.invincibleTimer = 0;
      const hpBefore = scene.catHp;
      scene.resolveRatAttack(grunt);
      return { hpBefore, hpAfter: scene.catHp };
    });
    console.log(`  Cat HP (in range): ${hitCheck.hpBefore} → ${hitCheck.hpAfter}`);
    check('Standing in range takes damage', hitCheck.hpAfter < hitCheck.hpBefore);

    // ── 7. Hit-stop fires on kill ──
    console.log('\n=== Hit-stop sets hitStopUntil on kill ===');
    const hitStopCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('BrawlScene');
      // Spawn a fresh grunt right next to the cat and kill it
      scene.catHp = scene.catMaxHp;
      // Clear existing rats to remove noise
      for (const r of scene.rats) { try { r.gfx.destroy(); } catch {} }
      scene.rats = [];
      scene.spawnRat('grunt', 1, 1.0);
      const grunt = scene.rats[0];
      grunt.x = scene.catX + 5;
      grunt.y = scene.catY;
      grunt.gfx.setPosition(grunt.x, grunt.y);
      grunt.stunTimer = 0;
      // Face the rat
      scene.catFacing = 0;
      const before = scene.hitStopUntil;
      scene.attack();
      return {
        before,
        after: scene.hitStopUntil,
        ratsRemaining: scene.rats.length,
      };
    });
    console.log(`  hitStopUntil: ${hitStopCheck.before} → ${hitStopCheck.after}, rats remaining: ${hitStopCheck.ratsRemaining}`);
    check('Hit-stop timestamp advanced after kill', hitStopCheck.after > hitStopCheck.before);
    check('Killed rat removed from list', hitStopCheck.ratsRemaining === 0);

    // ── 8. Boss phase transition at 50% HP ──
    console.log('\n=== Boss phase 2 triggers at 50% HP ===');
    const bossCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('BrawlScene');
      // Clear and spawn a fresh boss
      for (const r of scene.rats) { try { r.gfx.destroy(); } catch {} }
      scene.rats = [];
      scene.spawnBoss();
      const boss = scene.rats.find((r) => r.type === 'boss');
      if (!boss) return { error: 'no boss' };
      const phaseBefore = boss.bossPhase;
      const speedBefore = boss.speed;
      // Drop boss HP to 50% and trigger the transition
      boss.hp = Math.floor(boss.maxHp / 2);
      scene.triggerBossPhase2(boss);
      return {
        phaseBefore,
        phaseAfter: boss.bossPhase,
        speedBefore,
        speedAfter: boss.speed,
        ratsAfter: scene.rats.length,
        ratTypes: scene.rats.map((r) => r.type),
      };
    });
    console.log(`  Phase: ${bossCheck.phaseBefore} → ${bossCheck.phaseAfter}, speed: ${bossCheck.speedBefore.toFixed(2)} → ${bossCheck.speedAfter.toFixed(2)}`);
    console.log(`  Rats after transition: ${bossCheck.ratsAfter} (${bossCheck.ratTypes.join(', ')})`);
    check('Boss transitions to phase 2', bossCheck.phaseAfter === 2);
    check('Boss speed increased in phase 2', bossCheck.speedAfter > bossCheck.speedBefore);
    check('Phase 2 spawns 2 grunt minions',
      bossCheck.ratTypes.filter((t) => t === 'grunt').length === 2);

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
