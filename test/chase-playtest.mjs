// ChaseScene playtest — verifies the maze-chase design-pillar improvements:
//   1. Dog pack: easy=1 Tracker, medium/hard=2 dogs (Tracker + Ambusher)
//   2. Ambusher targeting (4 tiles ahead of cat's facing direction)
//   3. Pac-Man-style ghost combo on catnip (5 → 10 → 20 fish, doubling)
//   4. Death-cause feedback (Tracker vs Ambusher in the death message)
//   5. Catnip mode scares ALL dogs (not just one)
//
// RESILIENCE STRATEGY (lessons from previous hung playtest):
//   - Hard top-level setTimeout that calls process.exit(3) if anything hangs
//     past HARD_TIMEOUT_MS. Even if browser.close()/server.kill() deadlock.
//   - Signal handlers (SIGINT/SIGTERM) clean up and exit fast.
//   - try/finally guarantees browser+server teardown on every exit path.
//   - All verification uses direct method calls + state inspection — no
//     waiting on Phaser timers, which were proven unreliable under page.evaluate
//     scene.start in the HuntScene playtest.
//   - Run via `timeout 120s node test/chase-playtest.mjs` for a third
//     layer of protection against runaway processes.
//
// Run: timeout 120s node test/chase-playtest.mjs

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'chase');
const SAVE_PATH = path.join(__dirname, 'test-save-everything-unlocked.json');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const BASE = 'http://localhost:3200';
const HARD_TIMEOUT_MS = 90_000;

// ── Process-level kill switch ──
// If anything in the playtest hangs (browser deadlock, vite stalled, infinite
// loop in scene logic), this fires regardless of in-flight promises.
const hardKill = setTimeout(() => {
  console.error(`\n!! FATAL: Playtest exceeded ${HARD_TIMEOUT_MS}ms — force exit`);
  emergencyCleanup();
  process.exit(3);
}, HARD_TIMEOUT_MS);
hardKill.unref(); // allow normal completion to exit early

let browser = null;
let server = null;

/**
 * Kill the dev server AND its child vite process. `npm run dev` spawns vite
 * as a grandchild — calling server.kill() alone only kills npm and leaves
 * vite running. We spawn with detached:true to make `server` a process group
 * leader, then kill -<pgid> to take down the whole group.
 */
function killServerTree(signal = 'SIGTERM') {
  if (!server || server.killed) return;
  try {
    // Negative PID = kill process group (works because we spawned detached)
    process.kill(-server.pid, signal);
  } catch {
    // Process group may already be gone — fall back to killing the leader
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

/**
 * Inspect the live ChaseScene. Reads the new dogs[] array (post-refactor)
 * rather than the old single-dog fields.
 */
async function inspectChase(page) {
  return page.evaluate(() => {
    const game = window.__clowderGame;
    if (!game) return { error: 'no game instance' };
    const scene = game.scene.getScene('ChaseScene');
    if (!scene || !scene.sys.isActive()) return { error: 'ChaseScene not active' };
    const s = scene;
    return {
      catPos: s.catPos,
      catLastDir: s.catLastDir,
      ratPos: s.ratPos,
      dogs: (s.dogs ?? []).map((d) => ({
        pos: d.pos,
        archetype: d.archetype,
        state: d.state,
        displayName: d.displayName,
      })),
      dogScaredUntil: s.dogScaredUntil,
      scaredEatenThisWindow: s.scaredEatenThisWindow,
      nowMs: s.time.now,
      dotsRemaining: s.dots?.length ?? 0,
      dotsCollected: s.dotsCollected,
      comboCount: s.comboCount,
      comboMaxBonus: s.comboMaxBonus,
      pelletsRemaining: s.catnipPellets?.length ?? 0,
      timeLeft: s.timeLeft,
      caught: s.caught,
    };
  });
}

async function loadTestSave(page) {
  const save = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf-8'));
  save.flags = { ...save.flags, tutorial_complete: true, clowder_intro_shown: true };
  await page.evaluate((s) => {
    localStorage.setItem('clowder_save_slot_1', s);
    localStorage.setItem('clowder_save', s);
    // Pre-dismiss tutorial overlays including the new v3 chase tutorial (dog pack)
    const keys = [
      'clowder_tutorial_shown',
      'clowder_chase_tutorial_v3',
      'clowder_chase_tutorial_v2',
      'clowder_chase_tutorial',
    ];
    for (const k of keys) localStorage.setItem(k, '1');
  }, JSON.stringify(save));
}

/**
 * Launch ChaseScene at the requested difficulty. We use the same direct-launch
 * pattern as the hunt playtest. The hunt timer issue is a Phaser quirk that
 * doesn't matter here because every verification below uses direct method
 * calls and state inspection — no waiting on the live game loop.
 */
async function launchChase(page, difficulty) {
  return page.evaluate((diff) => {
    const game = window.__clowderGame;
    if (!game) return 'no game';
    for (const scene of game.scene.getScenes(true)) {
      if (scene.scene.key !== 'ChaseScene' && scene.scene.key !== 'BootScene') {
        game.scene.stop(scene.scene.key);
      }
    }
    game.scene.start('ChaseScene', {
      difficulty: diff,
      jobId: 'mill_mousing',
      catId: 'player_wildcat',
    });
    return 'started';
  }, difficulty);
}

async function main() {
  console.log('Starting Vite dev server...');
  // detached:true makes the child its own process group leader, which lets us
  // later kill -<pgid> to take down npm AND its vite grandchild together.
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

  try {
    // ── 1. Boot the test save ──
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await loadTestSave(page);
    await page.reload({ waitUntil: 'networkidle' });
    await wait(4000);

    // ── 2. EASY: verify single Tracker dog ──
    console.log('\n=== Easy difficulty: 1 Tracker only ===');
    await launchChase(page, 'easy');
    await wait(800);
    let state = await inspectChase(page);
    if (state.error) throw new Error(`inspect failed: ${state.error}`);
    console.log(`  dogs spawned: ${state.dogs.length}`);
    for (const d of state.dogs) console.log(`    - ${d.displayName} at (${d.pos.r},${d.pos.c}) state=${d.state}`);
    if (state.dogs.length === 1 && state.dogs[0].archetype === 'tracker') {
      console.log('  ✓ Easy spawns exactly 1 Tracker (low-floor onboarding)');
    } else {
      console.log('  ✗ Expected 1 tracker on easy, got:', state.dogs.map((d) => d.archetype));
    }
    await shot(page, 'easy-single-tracker');

    // ── 3. MEDIUM: verify 2-dog pack with both archetypes ──
    console.log('\n=== Medium difficulty: Tracker + Ambusher pack ===');
    await launchChase(page, 'medium');
    await wait(800);
    state = await inspectChase(page);
    if (state.error) throw new Error(`inspect failed: ${state.error}`);
    console.log(`  dogs spawned: ${state.dogs.length}`);
    for (const d of state.dogs) console.log(`    - ${d.displayName} at (${d.pos.r},${d.pos.c})`);
    const archetypes = state.dogs.map((d) => d.archetype).sort();
    const hasBoth = state.dogs.length === 2 && archetypes.includes('tracker') && archetypes.includes('ambusher');
    if (hasBoth) {
      console.log('  ✓ Medium spawns 2 dogs with distinct archetypes (Pillar 1)');
    } else {
      console.log('  ✗ Expected tracker+ambusher, got:', archetypes);
    }
    await shot(page, 'medium-dog-pack');

    // ── 4. Ambusher targeting verification (call targetTileFor directly) ──
    console.log('\n=== Ambusher targets 4 tiles ahead of cat ===');
    const targetCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('ChaseScene');
      const ambusher = scene.dogs.find((d) => d.archetype === 'ambusher');
      const tracker = scene.dogs.find((d) => d.archetype === 'tracker');
      if (!ambusher || !tracker) return { error: 'missing dog' };
      // Force the cat to face east (dc=1), test target tile is east of cat
      scene.catLastDir = { dr: 0, dc: 1 };
      const ambushTarget = scene.targetTileFor(ambusher);
      const trackerTarget = scene.targetTileFor(tracker);
      // Now face the cat south
      scene.catLastDir = { dr: 1, dc: 0 };
      const ambushTargetSouth = scene.targetTileFor(ambusher);
      return {
        catPos: scene.catPos,
        ambushTargetEast: ambushTarget,
        ambushTargetSouth,
        trackerTarget,
      };
    });
    if (targetCheck.error) {
      console.log('  ✗', targetCheck.error);
    } else {
      console.log('  cat at', targetCheck.catPos);
      console.log('  Tracker target (always cat tile):', targetCheck.trackerTarget);
      console.log('  Ambusher target when facing east :', targetCheck.ambushTargetEast);
      console.log('  Ambusher target when facing south:', targetCheck.ambushTargetSouth);
      // Tracker should target cat exactly. Ambusher should be offset by 4 in cat's facing dir
      // (clamped to bounds).
      const trackerOk = targetCheck.trackerTarget.r === targetCheck.catPos.r &&
                        targetCheck.trackerTarget.c === targetCheck.catPos.c;
      const ambusherEastOk = targetCheck.ambushTargetEast.c > targetCheck.catPos.c ||
                             targetCheck.ambushTargetEast.c === targetCheck.catPos.c; // clamped at edge
      const ambusherSouthOk = targetCheck.ambushTargetSouth.r > targetCheck.catPos.r ||
                              targetCheck.ambushTargetSouth.r === targetCheck.catPos.r;
      const distinct = targetCheck.trackerTarget.r !== targetCheck.ambushTargetEast.r ||
                       targetCheck.trackerTarget.c !== targetCheck.ambushTargetEast.c;
      console.log(`  ${trackerOk ? '✓' : '✗'} Tracker targets cat tile directly`);
      console.log(`  ${ambusherEastOk ? '✓' : '✗'} Ambusher offsets east when cat faces east`);
      console.log(`  ${ambusherSouthOk ? '✓' : '✗'} Ambusher offsets south when cat faces south`);
      console.log(`  ${distinct ? '✓' : '✗'} Tracker & Ambusher target DIFFERENT tiles`);
    }

    // ── 5. Catnip ghost combo: 5 → 10 → 20 escalation ──
    console.log('\n=== Pac-Man ghost combo: doubling reward per scared dog eaten ===');
    const comboCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('ChaseScene');
      // Reset relevant counters
      scene.dotsCollected = 0;
      scene.comboMaxBonus = 0;
      scene.scaredEatenThisWindow = 0;
      scene.dogScaredUntil = scene.time.now + 10_000;

      const rewards = [];
      const dogA = scene.dogs[0];
      const dogB = scene.dogs[1];
      // Eat the first dog
      const before1 = scene.dotsCollected;
      scene.catScaredDog(dogA);
      rewards.push(scene.dotsCollected - before1);
      // Eat the second dog (still in same catnip window)
      if (dogB) {
        const before2 = scene.dotsCollected;
        scene.catScaredDog(dogB);
        rewards.push(scene.dotsCollected - before2);
      }
      // Now simulate a third eat by re-using dogA (window still open)
      const before3 = scene.dotsCollected;
      scene.catScaredDog(dogA);
      rewards.push(scene.dotsCollected - before3);

      return {
        rewards,
        finalScaredEaten: scene.scaredEatenThisWindow,
        totalBonus: scene.comboMaxBonus,
      };
    });
    console.log(`  Reward sequence (each scared-dog eat): ${comboCheck.rewards.join(' → ')} fish`);
    console.log(`  Total bonus accumulated: ${comboCheck.totalBonus}`);
    const expected = [5, 10, 20];
    const matches = comboCheck.rewards.length === expected.length &&
                    comboCheck.rewards.every((v, i) => v === expected[i]);
    if (matches) {
      console.log('  ✓ Geometric escalation 5→10→20 confirmed');
    } else {
      console.log(`  ✗ Expected ${expected.join('→')}, got ${comboCheck.rewards.join('→')}`);
    }

    // ── 6. New catnip cycle resets the chain ──
    console.log('\n=== New catnip pellet resets the ghost chain ===');
    const resetCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('ChaseScene');
      // Activate catnip a fresh time
      scene.activateCatnipMode(100, 100);
      const afterReset = scene.scaredEatenThisWindow;
      // First eat in new window should be 5 again
      const before = scene.dotsCollected;
      scene.catScaredDog(scene.dogs[0]);
      const firstRewardInNewWindow = scene.dotsCollected - before;
      return { afterReset, firstRewardInNewWindow };
    });
    console.log(`  scaredEatenThisWindow after activate: ${resetCheck.afterReset} (expect 0)`);
    console.log(`  First reward in fresh window: ${resetCheck.firstRewardInNewWindow} (expect 5)`);
    if (resetCheck.afterReset === 0 && resetCheck.firstRewardInNewWindow === 5) {
      console.log('  ✓ Chain resets per catnip pellet');
    } else {
      console.log('  ✗ Chain reset broken');
    }

    // ── 7. Death-cause feedback: dogCaughtCat shows the right archetype name ──
    console.log('\n=== Death message names the responsible dog archetype ===');
    // Re-launch a fresh medium scene because the previous tests left it in a
    // weird state (catnip active, dotsCollected modified)
    await launchChase(page, 'medium');
    await wait(500);
    const deathMessages = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('ChaseScene');
      const tracker = scene.dogs.find((d) => d.archetype === 'tracker');
      // Trigger the death path with the tracker
      scene.dogCaughtCat(tracker);
      // The death message text was added to the scene as a Text object — find it
      const allText = [];
      scene.children.list.forEach((child) => {
        if (child.type === 'Text' && typeof child.text === 'string') {
          allText.push(child.text);
        }
      });
      return allText;
    });
    const trackerLine = deathMessages.find((t) => t.includes('Tracker'));
    if (trackerLine) {
      console.log(`  ✓ Death message names the Tracker: "${trackerLine}"`);
    } else {
      console.log('  ✗ Death message did not include "Tracker". Got:', deathMessages.filter((t) => t.includes('Caught') || t.includes('positioned') || t.includes('followed')));
    }

    // Verify the ambusher message uses different language
    await launchChase(page, 'medium');
    await wait(500);
    const ambusherDeathMessages = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('ChaseScene');
      const ambusher = scene.dogs.find((d) => d.archetype === 'ambusher');
      scene.dogCaughtCat(ambusher);
      const allText = [];
      scene.children.list.forEach((child) => {
        if (child.type === 'Text' && typeof child.text === 'string') {
          allText.push(child.text);
        }
      });
      return allText;
    });
    const ambusherLine = ambusherDeathMessages.find((t) => t.includes('Ambusher'));
    if (ambusherLine) {
      console.log(`  ✓ Death message names the Ambusher: "${ambusherLine}"`);
    } else {
      console.log('  ✗ Ambusher death message missing. Got:', ambusherDeathMessages.filter((t) => t.includes('Caught')));
    }
    await shot(page, 'death-message-ambusher');

    // ── 8. HARD difficulty also has 2 dogs ──
    console.log('\n=== Hard difficulty: also 2 dogs ===');
    await launchChase(page, 'hard');
    await wait(800);
    state = await inspectChase(page);
    if (state.error) throw new Error(`inspect failed: ${state.error}`);
    console.log(`  dogs: ${state.dogs.length}`);
    if (state.dogs.length === 2) {
      console.log('  ✓ Hard also fields the full pack');
    } else {
      console.log(`  ✗ Expected 2, got ${state.dogs.length}`);
    }
    await shot(page, 'hard-pack');

    // ── 9. Final medium-difficulty shot showing pack visually ──
    await launchChase(page, 'medium');
    await wait(800);
    await shot(page, 'final-medium-pack-visual');
  } finally {
    // Guaranteed cleanup — even if anything above threw
    try { await browser?.close(); } catch (e) { console.error('browser close failed:', e?.message); }
    browser = null;
    killServerTree('SIGTERM');
    // Brief wait for graceful shutdown, then force-kill the whole tree
    await wait(500);
    killServerTree('SIGKILL');
    server = null;
  }

  console.log('\n========== SUMMARY ==========');
  console.log(`Console errors: ${consoleErrors.length}`);
  consoleErrors.forEach((e) => console.log('  -', e));
  console.log(`\nScreenshots: ${SCREENSHOT_DIR}`);
  clearTimeout(hardKill);
  process.exit(consoleErrors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  emergencyCleanup();
  clearTimeout(hardKill);
  process.exit(2);
});
