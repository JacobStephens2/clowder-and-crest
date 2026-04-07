// Portfolio screenshot capture for clowderandcrest.com on stephens.page.
// Loads test-save-everything-unlocked.json (6 cats, 3 unlocked rooms,
// chapter 7) into save slot 1, then drives the title screen Continue
// flow normally so the game initializes via its real load path.
// Captures the guildhall, town map, and a room interior; copies the
// guildhall as the portfolio hero shot.
//
// Run: `timeout 90s node test/capture-portfolio-screenshot.mjs`

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'portfolio');
const SAVE_PATH = path.join(__dirname, 'test_saves/test-save-everything-unlocked.json');
const PORTFOLIO_TARGET = '/var/www/stephens.page/screenshots/clowder.stephens.page.png';

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const BASE = 'http://localhost:3200';
const HARD_TIMEOUT_MS = 90_000;

let server;
let browser;

const hardKill = setTimeout(() => {
  console.error('Hard timeout reached — bailing out');
  if (browser) browser.close().catch(() => {});
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGKILL'); } catch {}
  }
  process.exit(1);
}, HARD_TIMEOUT_MS);

function cleanup(code = 0) {
  clearTimeout(hardKill);
  if (browser) browser.close().catch(() => {});
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  }
  setTimeout(() => process.exit(code), 200);
}

process.on('SIGINT', () => cleanup(130));
process.on('SIGTERM', () => cleanup(143));
process.on('uncaughtException', (e) => { console.error(e); cleanup(1); });

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

// Click coordinates are in the GAME_WIDTH × GAME_HEIGHT coordinate space
// (390 × 844 by default). Helper translates to actual canvas pixel position.
async function tap(page, gx, gy) {
  const canvas = await page.$('#game-container canvas');
  const box = await canvas.boundingBox();
  const cx = box.x + (gx / 390) * box.width;
  const cy = box.y + (gy / 844) * box.height;
  await page.mouse.click(cx, cy);
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
  console.log(`Dev server ready at ${BASE}`);

  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, // matches game's native aspect
    deviceScaleFactor: 3, // produces 1170 × 2532 final pixel resolution
  });
  const page = await ctx.newPage();

  page.on('pageerror', (e) => console.log('  PAGEERR:', e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (t.includes('google') || t.includes('analytics')) return;
      console.log('  ERR:', t);
    }
  });

  // First load — empty page, no save
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  // Plant the test save into slot 1 + legacy slot
  const saveJson = fs.readFileSync(SAVE_PATH, 'utf-8');
  const save = JSON.parse(saveJson);
  // Make sure flags don't trigger any modal popups
  save.flags = {
    ...save.flags,
    tutorial_complete: true,
    clowder_intro_shown: true,
  };
  await page.evaluate((s) => {
    localStorage.setItem('clowder_save_slot_1', s);
    localStorage.setItem('clowder_save', s);
  }, JSON.stringify(save));

  // Reload so the title screen sees the save and shows the Continue button
  await page.reload({ waitUntil: 'networkidle' });
  await wait(3000); // let TitleScene fully render with rain particles
  console.log('\n=== Title screen loaded ===');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '00-title.png') });

  // Click the Continue button — Phaser canvas button at game coords ~(195, 470)
  // when slots exist (TitleScene.ts:161). Tested in the existing smoke test.
  console.log('\n=== Clicking Continue ===');
  await tap(page, 195, 470);
  await wait(800);

  // Slot picker is an HTML overlay with .slot-btn[data-slot] elements.
  // Click slot 1 to load our planted save.
  const slotBtn = await page.$('.slot-btn[data-slot="1"]');
  if (!slotBtn) {
    console.log('  ⚠ slot picker not found — dumping body classes');
    const bodyHtml = await page.evaluate(() => document.body.innerHTML.slice(0, 1500));
    console.log(bodyHtml);
    cleanup(1);
    return;
  }
  await slotBtn.click();
  console.log('  slot 1 clicked — loading save');
  await wait(4000); // load + scene transition + cat sprites populating

  // Capture 1: Guildhall overview
  console.log('\n=== Capturing Guildhall overview ===');
  const guildPath = path.join(SCREENSHOT_DIR, '01-guildhall.png');
  await page.screenshot({ path: guildPath });
  const guildSize = fs.statSync(guildPath).size;
  console.log(`  saved → ${guildPath} (${(guildSize / 1024).toFixed(1)} KB)`);

  // Sanity check — if it's still mostly black, something is wrong
  if (guildSize < 50_000) {
    console.log('  ⚠ guildhall screenshot is suspiciously small (likely black)');
  }

  // Capture 2: Town Map
  console.log('\n=== Capturing Town Map ===');
  // Click the Town tab in the bottom nav
  const townTab = await page.$('button:has-text("Town"), .tab:has-text("Town")');
  if (townTab) {
    await townTab.click();
    await wait(2500);
    const townPath = path.join(SCREENSHOT_DIR, '02-town.png');
    await page.screenshot({ path: townPath });
    console.log(`  saved → ${townPath}`);
  } else {
    console.log('  ⚠ town tab not found');
  }

  // Capture 3: Back to guildhall, then enter a room
  console.log('\n=== Capturing Room interior ===');
  const guildTab = await page.$('button:has-text("Guild"), .tab:has-text("Guild")');
  if (guildTab) {
    await guildTab.click();
    await wait(1500);
    // Tap roughly where a room would be in the guildhall layout —
    // try the first room area (top of the canvas)
    await tap(page, 195, 250);
    await wait(2000);
    const roomPath = path.join(SCREENSHOT_DIR, '03-room.png');
    await page.screenshot({ path: roomPath });
    console.log(`  saved → ${roomPath}`);
  }

  // Pick the guildhall as the hero shot for the portfolio
  console.log('\n=== Copying hero shot to portfolio ===');
  if (fs.existsSync(guildPath) && fs.statSync(guildPath).size > 50_000) {
    fs.copyFileSync(guildPath, PORTFOLIO_TARGET);
    const stat = fs.statSync(PORTFOLIO_TARGET);
    console.log(`  → ${PORTFOLIO_TARGET}`);
    console.log(`  size: ${(stat.size / 1024).toFixed(1)} KB`);
  } else {
    console.log('  ⚠ guildhall shot too small — leaving portfolio image alone');
  }

  cleanup(0);
}

main().catch((e) => {
  console.error(e);
  cleanup(1);
});
