import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import fs from 'node:fs';

const ROOT = '/var/www/clowder.stephens.page';
const SAVE = JSON.parse(fs.readFileSync(ROOT + '/test/test-save-everything-unlocked.json', 'utf-8'));

const server = spawn('npm', ['run', 'dev'], { stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
server.stdout.on('data', () => {});
server.stderr.on('data', () => {});
for (let i = 0; i < 30; i++) { try { if ((await fetch('http://localhost:3200')).ok) break; } catch {} await wait(500); }

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

await page.goto('http://localhost:3200', { waitUntil: 'domcontentloaded' });
await page.evaluate((s) => {
  localStorage.setItem('clowder_save_slot_1', s);
  localStorage.setItem('clowder_save', s);
  localStorage.setItem('clowder_hunt_tutorial_v2', '1');
}, JSON.stringify(SAVE));
await page.reload({ waitUntil: 'networkidle' });
await wait(4000);

const result = await page.evaluate(async () => {
  const game = window.__clowderGame;
  for (const s of game.scene.getScenes(true)) {
    if (s.scene.key !== 'HuntScene' && s.scene.key !== 'BootScene') game.scene.stop(s.scene.key);
  }
  game.scene.start('HuntScene', { difficulty: 'easy', jobId: 'mill_mousing', catId: 'player_wildcat', catBreed: 'wildcat' });
  await new Promise((r) => setTimeout(r, 1000));
  const scene = game.scene.getScene('HuntScene');
  return {
    sceneKey: scene.scene.key,
    isActive: scene.sys.isActive(),
    timePaused: scene.time.paused,
    timeNow: scene.time.now,
    pendingCount: scene.time._pendingRemoval?.length ?? null,
    eventCount: scene.time._active?.length ?? null,
    countdownExists: scene.countdownTimer != null,
    countdownDestroyed: scene.countdownTimer?.hasDispatched ?? null,
    nextSpawnExists: scene.nextSpawnTimer != null,
    nextSpawnDestroyed: scene.nextSpawnTimer?.hasDispatched ?? null,
    timeLeft: scene.timeLeft,
    totalSpawned: scene.totalSpawned,
    tutorialShowing: scene.tutorialShowing,
    finished: scene.finished,
  };
});
console.log(JSON.stringify(result, null, 2));

await browser.close();
server.kill('SIGTERM');
