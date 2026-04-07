// PounceScene playtest — verifies the slingshot/projectile-physics
// design pillars:
//   1. Every breed maps to a distinct ability via getBreedAbility
//   2. MATERIALS library has wood/stone/glass with distinct density
//   3. STRUCTURE_TEMPLATES has multiple distinct named layouts
//   4. Launching projectile sets activeProjectile + abilityAvailable
//   5. Each breed ability produces the expected physics state change:
//      - power_shot boosts velocity magnitude
//      - heavy_drop zeroes horizontal velocity, sets downward
//      - redirect reorients toward tap point
//      - split spawns 2 extra projectiles
//      - explosion pushes nearby bodies outward
//   6. Ability is single-use per launch (abilityAvailable clears)
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
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'pounce');
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
      'clowder_pounce_tutorial_v2',
      'clowder_pounce_tutorial',
    ];
    for (const k of keys) localStorage.setItem(k, '1');
  }, JSON.stringify(save));
}

async function launchPounce(page, breed = 'wildcat') {
  return page.evaluate((catBreed) => {
    const game = window.__clowderGame;
    if (!game) return 'no game';
    for (const scene of game.scene.getScenes(true)) {
      if (scene.scene.key !== 'PounceScene' && scene.scene.key !== 'BootScene') {
        game.scene.stop(scene.scene.key);
      }
    }
    game.scene.start('PounceScene', {
      difficulty: 'medium',
      jobId: 'mill_mousing',
      catId: 'player_wildcat',
      catBreed,
    });
    return 'started';
  }, breed);
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

    // ── 1. BREED_ABILITIES has every expected breed ──
    console.log('\n=== Every breed maps to a distinct ability ===');
    const breedCheck = await page.evaluate(async () => {
      const mod = await import('/src/scenes/PounceScene.ts');
      const breeds = ['wildcat', 'maine_coon', 'siamese', 'russian_blue', 'tuxedo', 'bengal'];
      const result = {};
      for (const b of breeds) {
        result[b] = mod.getBreedAbility(b);
      }
      return result;
    });
    for (const [breed, info] of Object.entries(breedCheck)) {
      console.log(`  ${breed.padEnd(13)} → ${info.ability} ("${info.name}")`);
    }
    const distinctAbilities = new Set(Object.values(breedCheck).map((v) => v.ability));
    check('All 6 breeds covered', Object.keys(breedCheck).length === 6);
    check('All breed abilities are distinct', distinctAbilities.size === 6);

    // ── 2. MATERIALS library has wood/stone/glass with distinct density ──
    console.log('\n=== Materials library ===');
    const materialCheck = await page.evaluate(async () => {
      const mod = await import('/src/scenes/PounceScene.ts');
      return {
        wood: mod.MATERIALS.wood,
        stone: mod.MATERIALS.stone,
        glass: mod.MATERIALS.glass,
      };
    });
    console.log(`  wood:  density ${materialCheck.wood.density}, restitution ${materialCheck.wood.restitution}`);
    console.log(`  stone: density ${materialCheck.stone.density}, restitution ${materialCheck.stone.restitution}`);
    console.log(`  glass: density ${materialCheck.glass.density}, restitution ${materialCheck.glass.restitution}`);
    check('Stone is denser than wood', materialCheck.stone.density > materialCheck.wood.density);
    check('Glass is lighter than wood', materialCheck.glass.density < materialCheck.wood.density);
    check('Glass is bouncier than stone',
      materialCheck.glass.restitution > materialCheck.stone.restitution);

    // ── 3. STRUCTURE_TEMPLATES has multiple named templates ──
    console.log('\n=== Structure templates ===');
    const templates = await page.evaluate(async () => {
      const mod = await import('/src/scenes/PounceScene.ts');
      return mod.STRUCTURE_TEMPLATES.map((t) => ({
        name: t.name,
        blockCount: t.blocks.length,
        materials: [...new Set(t.blocks.map((b) => b.material))],
        ratCount: t.ratPositions.length,
      }));
    });
    for (const t of templates) {
      console.log(`  ${t.name.padEnd(15)} blocks=${t.blockCount} rats=${t.ratCount} materials=[${t.materials.join(',')}]`);
    }
    check('At least 4 templates defined', templates.length >= 4);
    check('Templates have unique names',
      new Set(templates.map((t) => t.name)).size === templates.length);
    check('At least one template uses glass',
      templates.some((t) => t.materials.includes('glass')));
    check('At least one template uses stone',
      templates.some((t) => t.materials.includes('stone')));

    // ── 4. Launching sets activeProjectile + abilityAvailable ──
    console.log('\n=== launchProjectile sets active state ===');
    await launchPounce(page, 'wildcat');
    await wait(800);
    const launchState = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('PounceScene');
      // Sanity: scene started OK
      const beforeActive = scene.activeProjectile != null;
      const beforeAvailable = scene.abilityAvailable;
      // Launch a shot directly via the public method
      scene.launchProjectile(180, -200);
      const afterActive = scene.activeProjectile != null;
      const afterAvailable = scene.abilityAvailable;
      return { beforeActive, beforeAvailable, afterActive, afterAvailable };
    });
    console.log(`  Before launch: active=${launchState.beforeActive}, available=${launchState.beforeAvailable}`);
    console.log(`  After launch:  active=${launchState.afterActive}, available=${launchState.afterAvailable}`);
    check('No active projectile before launch', !launchState.beforeActive);
    check('Active projectile set after launch', launchState.afterActive);
    check('Ability becomes available after launch', launchState.afterAvailable);

    // ── 5. Power Shot ability boosts velocity magnitude ──
    console.log('\n=== Power Shot (wildcat) boosts velocity ===');
    const powerCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('PounceScene');
      // Reset and launch fresh
      scene.activeProjectile = null;
      scene.abilityAvailable = false;
      scene.catBreed = 'wildcat';
      scene.launchProjectile(180, -180);
      const proj = scene.activeProjectile;
      const beforeSpeed = Math.sqrt(proj.velocity.x ** 2 + proj.velocity.y ** 2);
      scene.triggerBreedAbility(0, 0);
      const afterSpeed = Math.sqrt(proj.velocity.x ** 2 + proj.velocity.y ** 2);
      return { beforeSpeed, afterSpeed, abilityCleared: !scene.abilityAvailable };
    });
    console.log(`  Speed: ${powerCheck.beforeSpeed.toFixed(2)} → ${powerCheck.afterSpeed.toFixed(2)}`);
    check('Power Shot increased velocity magnitude', powerCheck.afterSpeed > powerCheck.beforeSpeed);
    check('Ability cleared after triggering', powerCheck.abilityCleared);

    // ── 6. Heavy Drop zeroes horizontal velocity ──
    console.log('\n=== Heavy Drop (maine_coon) zeroes horizontal ===');
    const dropCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('PounceScene');
      scene.activeProjectile = null;
      scene.abilityAvailable = false;
      scene.catBreed = 'maine_coon';
      scene.launchProjectile(180, -180);
      const proj = scene.activeProjectile;
      scene.triggerBreedAbility(0, 0);
      return { vx: proj.velocity.x, vy: proj.velocity.y };
    });
    console.log(`  After Heavy Drop: vx=${dropCheck.vx}, vy=${dropCheck.vy}`);
    check('Horizontal velocity zeroed', dropCheck.vx === 0);
    check('Vertical velocity is downward and large', dropCheck.vy >= 10);

    // ── 7. Redirect reorients toward tap point ──
    console.log('\n=== Redirect (siamese) reorients toward tap ===');
    const redirectCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('PounceScene');
      scene.activeProjectile = null;
      scene.abilityAvailable = false;
      scene.catBreed = 'siamese';
      scene.launchProjectile(180, -180);
      const proj = scene.activeProjectile;
      // Redirect toward (200, 100) — the projectile is around (60, ~620 - launch),
      // so the target is up and to the right
      const tapX = 200;
      const tapY = 100;
      scene.triggerBreedAbility(tapX, tapY);
      // The new velocity should point from the projectile's current pos toward (tapX, tapY)
      const dx = tapX - proj.position.x;
      const dy = tapY - proj.position.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const unitX = dx / len;
      const unitY = dy / len;
      // Compare with the unit vector of the new velocity
      const vMag = Math.sqrt(proj.velocity.x ** 2 + proj.velocity.y ** 2);
      const newUnitX = proj.velocity.x / vMag;
      const newUnitY = proj.velocity.y / vMag;
      // Dot product should be ~1 if directions match
      const dot = unitX * newUnitX + unitY * newUnitY;
      return { dot, vx: proj.velocity.x, vy: proj.velocity.y };
    });
    console.log(`  Direction match (dot product): ${redirectCheck.dot.toFixed(3)}`);
    check('New velocity points toward tap (dot ≈ 1)', redirectCheck.dot > 0.99);

    // ── 8. Split spawns 2 extra projectiles ──
    console.log('\n=== Triple Split (russian_blue) spawns 2 extras ===');
    const splitCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('PounceScene');
      scene.activeProjectile = null;
      scene.abilityAvailable = false;
      scene.catBreed = 'russian_blue';
      // Count cat_projectile bodies before/after
      const countCats = () => scene.matter.world.getAllBodies()
        .filter((b) => b.label === 'cat_projectile').length;
      scene.launchProjectile(180, -180);
      const before = countCats();
      scene.triggerBreedAbility(0, 0);
      const after = countCats();
      return { before, after, delta: after - before };
    });
    console.log(`  cat_projectile count: ${splitCheck.before} → ${splitCheck.after} (delta ${splitCheck.delta})`);
    check('Split added 2 extra projectiles', splitCheck.delta === 2);

    // ── 9. Explosion pushes nearby bodies outward ──
    console.log('\n=== Whirlwind (tuxedo) pushes nearby bodies ===');
    const explosionCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('PounceScene');
      scene.activeProjectile = null;
      scene.abilityAvailable = false;
      scene.catBreed = 'tuxedo';
      scene.launchProjectile(180, -180);
      const proj = scene.activeProjectile;
      // Pick a nearby block (the structure is around x=200-340)
      // Find any non-static body other than the projectile
      const nearby = scene.matter.world.getAllBodies()
        .filter((b) => !b.isStatic && b !== proj && b.label?.startsWith('block_'));
      if (nearby.length === 0) return { error: 'no nearby blocks' };
      // Move the projectile next to the first block so it's within radius
      const target = nearby[0];
      scene.matter.body.setPosition(proj, { x: target.position.x - 30, y: target.position.y });
      const speedBefore = Math.sqrt(target.velocity.x ** 2 + target.velocity.y ** 2);
      scene.triggerBreedAbility(0, 0);
      const speedAfter = Math.sqrt(target.velocity.x ** 2 + target.velocity.y ** 2);
      return { speedBefore, speedAfter, delta: speedAfter - speedBefore };
    });
    console.log(`  Nearby block speed: ${explosionCheck.speedBefore?.toFixed(2)} → ${explosionCheck.speedAfter?.toFixed(2)}`);
    check('Whirlwind imparted velocity to nearby block',
      explosionCheck.speedAfter > explosionCheck.speedBefore);

    // ── 10. Ability is single-use per launch ──
    console.log('\n=== Ability fires once per launch ===');
    const onceCheck = await page.evaluate(() => {
      const scene = window.__clowderGame.scene.getScene('PounceScene');
      scene.activeProjectile = null;
      scene.abilityAvailable = false;
      scene.catBreed = 'wildcat';
      scene.launchProjectile(180, -180);
      const proj = scene.activeProjectile;
      const v0 = Math.sqrt(proj.velocity.x ** 2 + proj.velocity.y ** 2);
      scene.triggerBreedAbility(0, 0);
      const v1 = Math.sqrt(proj.velocity.x ** 2 + proj.velocity.y ** 2);
      // Try to trigger again — should be a no-op
      scene.triggerBreedAbility(0, 0);
      const v2 = Math.sqrt(proj.velocity.x ** 2 + proj.velocity.y ** 2);
      return { v0, v1, v2 };
    });
    console.log(`  Speed: ${onceCheck.v0.toFixed(2)} → ${onceCheck.v1.toFixed(2)} → ${onceCheck.v2.toFixed(2)}`);
    check('First trigger boosted speed', onceCheck.v1 > onceCheck.v0);
    check('Second trigger had no effect (ability single-use)', onceCheck.v2 === onceCheck.v1);

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
