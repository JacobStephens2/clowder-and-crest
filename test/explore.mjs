// Clowder & Crest — UI exploration tour via Playwright.
//
// Run: `npm run test:explore`
//   • Loads the test save (chapter 7, everything unlocked) via menu import
//   • Navigates to each major view and captures a screenshot
//   • Used for layout/visual review, not assertion-based testing
//
// Screenshots land in test/screenshots/explore/.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'explore');
const TEST_SAVE_PATH = path.join(__dirname, 'test_saves/test-save-everything-unlocked.json');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const BASE = process.env.DEV_SERVER_URL ?? 'http://localhost:3200';
const externalServer = !!process.env.DEV_SERVER_URL;

let shotIndex = 0;

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await wait(500);
  }
  throw new Error(`Dev server not ready at ${url}`);
}

async function shot(page, label) {
  shotIndex++;
  const n = String(shotIndex).padStart(2, '0');
  const safe = label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const p = path.join(SCREENSHOT_DIR, `${n}-${safe}.png`);
  await page.screenshot({ path: p });
  console.log(`  [${n}] ${label}`);
  return p;
}

async function clickCanvas(page, x, y) {
  const canvas = await page.$('#game-container canvas');
  const box = await canvas.boundingBox();
  await page.mouse.click(
    box.x + (x / 390) * box.width,
    box.y + (y / 844) * box.height,
  );
}

/**
 * Inject the test save into localStorage via page.evaluate before Phaser boots.
 * The game uses slot-based saves: `clowder_save_slot_1/2/3`. We write to slot 1
 * and also the legacy `clowder_save` key (for the Import Save path). TitleScene
 * then shows a "Continue" button because getSlotSummary(1) finds data.
 */
async function loadTestSave(page) {
  const save = JSON.parse(fs.readFileSync(TEST_SAVE_PATH, 'utf-8'));
  save.flags = {
    ...save.flags,
    tutorial_complete: true,
    clowder_intro_shown: true,
  };
  await page.evaluate((saveJson) => {
    localStorage.setItem('clowder_save_slot_1', saveJson);
    localStorage.setItem('clowder_save', saveJson);
    // Suppress tutorial overlays — each scene checks localStorage for its key
    const tutorialKeys = [
      'clowder_tutorial_shown',
      'clowder_guildhall_tutorial',
      'clowder_town_tutorial',
      'clowder_puzzle_tutorial',
      'clowder_sokoban_tutorial',
      'clowder_chase_tutorial',
      'clowder_fishing_tutorial',
      'clowder_hunt_tutorial',
      'clowder_brawl_tutorial',
      'clowder_nonogram_tutorial',
      'clowder_stealth_tutorial',
      'clowder_pounce_tutorial',
      'clowder_patrol_tutorial',
      'clowder_ritual_tutorial',
      'clowder_scent_trail_tutorial',
      'clowder_heist_tutorial',
      'clowder_courier_run_tutorial',
    ];
    for (const k of tutorialKeys) localStorage.setItem(k, '1');
  }, JSON.stringify(save));
}

async function navTab(page, label) {
  // The bottom nav buttons contain emoji + label; use a text locator
  const btn = await page.$(`button:has-text("${label}"), .bottom-nav button:has-text("${label}")`);
  if (!btn) return false;
  await btn.click();
  await wait(1200);
  return true;
}

async function openMenuPanel(page) {
  await navTab(page, 'Menu');
  await wait(600);
}

async function closeOverlay(page) {
  // Try common close patterns
  const close = await page.$('.panel-close, button:has-text("×"), button:has-text("Close")');
  if (close) {
    await close.click();
    await wait(400);
  }
}

async function main() {
  let server;
  if (!externalServer) {
    console.log('Starting Vite dev server...');
    server = spawn('npm', ['run', 'dev'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: ROOT,
    });
    server.stdout?.on('data', () => {});
    server.stderr?.on('data', () => {});
    await waitForServer(BASE);
    console.log(`Dev server ready at ${BASE}`);
  }

  const browser = await chromium.launch({ headless: true });
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
    }
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  try {
    console.log('\n=== Loading game with test save ===');
    // First load to establish localStorage access
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await loadTestSave(page);
    // Second load — Phaser boots with the save in place
    await page.reload({ waitUntil: 'networkidle' });
    await wait(4500); // let boot + title transitions settle
    await shot(page, 'initial-boot');

    // With a slot save present, TitleScene shows "Continue" at canvas (195, 470)
    // and "New Game" at (195, 520). Click Continue.
    await clickCanvas(page, 195, 470);
    await wait(1200);
    await shot(page, 'slot-picker');

    // The slot picker is an HTML overlay listing up to 3 slots. Click the first.
    const slotBtn = await page.$('.slot-btn, button:has-text("Tester"), button:has-text("Day 60")');
    if (slotBtn) {
      await slotBtn.click();
      await wait(2500);
    } else {
      // Fallback — click the first button that isn't the close/back/cancel
      const buttons = await page.$$('button');
      for (const b of buttons) {
        const t = (await b.textContent())?.trim() ?? '';
        if (t && !t.match(/close|cancel|back|×|✕/i) && t.length < 60) {
          await b.click();
          break;
        }
      }
      await wait(2500);
    }
    await shot(page, 'after-slot-load');

    // Dismiss any HTML tutorial/toast overlays
    for (let i = 0; i < 5; i++) {
      const overlay = await page.$('.tutorial-overlay, [class*="tutorial"]');
      if (overlay) {
        await overlay.click();
        await wait(500);
      } else break;
    }
    await shot(page, 'after-boot');

    // ── Main tabs ──
    console.log('\n=== Main tabs ===');
    if (await navTab(page, 'Guild')) await shot(page, 'guild-view');
    if (await navTab(page, 'Town')) await shot(page, 'town-view');
    if (await navTab(page, 'Cats')) await shot(page, 'cats-panel');
    await closeOverlay(page);
    if (await navTab(page, 'Menu')) await shot(page, 'menu-panel');
    await closeOverlay(page);

    // ── Guild detail: click into a room ──
    console.log('\n=== Guild rooms ===');
    if (await navTab(page, 'Guild')) {
      await wait(800);
      await shot(page, 'guild-overview-detailed');
      // Click roughly where the first room would be
      await clickCanvas(page, 195, 220);
      await wait(1500);
      await shot(page, 'room-scene-sleeping');
      // Back to guild
      const back = await page.$('button:has-text("Back"), button:has-text("←")');
      if (back) { await back.click(); await wait(800); }
      else await navTab(page, 'Guild');
    }

    // ── Town map details ──
    console.log('\n=== Town map ===');
    if (await navTab(page, 'Town')) {
      await wait(1000);
      await shot(page, 'town-full');
      // Click around the map to spot different buildings
      await clickCanvas(page, 150, 300);
      await wait(800);
      await shot(page, 'town-click-1');
      await clickCanvas(page, 250, 500);
      await wait(800);
      await shot(page, 'town-click-2');
    }

    // ── Cat panel scroll ──
    console.log('\n=== Cats panel ===');
    if (await navTab(page, 'Cats')) {
      await wait(800);
      await shot(page, 'cats-list');
      // Click first cat card to see the detail view
      const catCard = await page.$('.cat-card, [class*="cat-"]');
      if (catCard) {
        await catCard.click();
        await wait(800);
        await shot(page, 'cat-detail');
      }
      await closeOverlay(page);
    }

    // ── Menu panel sub-views ──
    console.log('\n=== Menu panel ===');
    if (await navTab(page, 'Menu')) {
      await wait(800);
      await shot(page, 'menu-top');
      // Scroll the menu panel to see bottom
      await page.evaluate(() => {
        const panel = document.querySelector('.panel, [class*="menu-panel"]');
        if (panel) panel.scrollTop = panel.scrollHeight;
      });
      await wait(400);
      await shot(page, 'menu-bottom');
      await closeOverlay(page);
    }

    console.log('\n=== Done ===');
  } finally {
    await browser.close();
    if (server) {
      server.kill('SIGTERM');
      await wait(500);
    }
  }

  console.log(`\nScreenshots: ${SCREENSHOT_DIR}`);
  console.log(`Console errors: ${consoleErrors.length}`);
  if (consoleErrors.length) {
    consoleErrors.forEach((e) => console.log('  -', e));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(2);
});
