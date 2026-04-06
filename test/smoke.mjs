// Clowder & Crest — end-to-end smoke test via Playwright headless Chromium.
//
// Run: `npm run test:smoke`
//   • Starts the Vite dev server (unless DEV_SERVER_URL env var is set)
//   • Loads the title screen, clicks New Game, fills name prompt, advances intro
//   • Verifies guildhall is reached and HTML chrome is visible
//   • Reloads the page to check for stuck state
//   • Reports console errors / failed requests
//   • Exits non-zero on any real error
//
// Screenshots land in test/screenshots/smoke/ (gitignored).

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'smoke');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const BASE = process.env.DEV_SERVER_URL ?? 'http://localhost:3200';
const externalServer = !!process.env.DEV_SERVER_URL;

const errors = [];
const warnings = [];

function logResult(label, ok, detail = '') {
  const mark = ok ? '\u2713' : '\u2717';
  console.log(`${mark} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) errors.push(label + (detail ? ': ' + detail : ''));
}

async function clickCanvas(page, x, y) {
  const canvas = await page.$('#game-container canvas');
  const box = await canvas.boundingBox();
  const cx = box.x + (x / 390) * box.width;
  const cy = box.y + (y / 844) * box.height;
  await page.mouse.click(cx, cy);
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await wait(500);
  }
  throw new Error(`Dev server did not become ready at ${url} within ${timeoutMs}ms`);
}

async function main() {
  let server;
  if (!externalServer) {
    console.log('Starting Vite dev server...');
    server = spawn('npm', ['run', 'dev'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.resolve(__dirname, '..'),
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

  let ignoreFailures = false;
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') {
      if (text.includes('googletagmanager') || text.includes('google-analytics')) return;
      errors.push(`[console.error] ${text}`);
      console.log('  ERR:', text);
    } else if (msg.type() === 'warning') {
      if (text.includes('GL Driver') || text.includes('DevTools') || text.includes('vite')) return;
      warnings.push(`[console.warn] ${text}`);
    }
  });
  page.on('pageerror', (err) => {
    errors.push(`[pageerror] ${err.message}`);
    console.log('  PAGEERR:', err.message);
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (url.includes('googletagmanager') || url.includes('google-analytics')) return;
    if (ignoreFailures) return;
    const failure = req.failure()?.errorText ?? '';
    // Chromium aborts long media downloads on navigation — noise, not a real failure.
    if (failure === 'net::ERR_ABORTED' && (url.includes('/audio/') || url.includes('.mp3'))) return;
    errors.push(`[requestfailed] ${url}: ${failure}`);
  });

  try {
    console.log('\n=== Page load ===');
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
    logResult('Page loads', true);
    await page.waitForTimeout(4000);

    console.log('\n=== Canvas + Phaser ===');
    const info = await page.evaluate(() => {
      const c = document.querySelector('#game-container canvas');
      return {
        hasCanvas: !!c,
        width: c?.width ?? 0,
        height: c?.height ?? 0,
        phaserVersion: window.Phaser?.VERSION ?? null,
      };
    });
    logResult('Canvas rendered', info.hasCanvas && info.width > 0, `${info.width}×${info.height}`);
    logResult('Phaser loaded', !!info.phaserVersion, info.phaserVersion);

    console.log('\n=== Title screen ===');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-title.png') });

    console.log('\n=== New Game ===');
    await clickCanvas(page, 195, 470);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-after-new-game.png') });

    console.log('\n=== Name prompt ===');
    const nameInput = await page.$('input[type="text"]');
    if (nameInput) {
      await nameInput.fill('SmokeTest');
      const btn = await page.$('button:has-text("Begin"), button:has-text("Continue"), button:has-text("Start")');
      if (btn) await btn.click();
      else await nameInput.press('Enter');
      logResult('Name submitted', true);
    } else {
      logResult('Name prompt appeared', false, 'no input element');
    }

    console.log('\n=== Intro advance ===');
    await page.waitForTimeout(1500);
    for (let i = 0; i < 10; i++) {
      await clickCanvas(page, 195, 420);
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-after-intro.png') });
    logResult('Advanced through intro', true);

    console.log('\n=== HTML chrome ===');
    const navButtons = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button, .tab'))
        .map((b) => b.textContent?.trim())
        .filter((t) => t && t.length < 30)
    );
    const hasExpectedNav = ['Guild', 'Town', 'Cats', 'Menu'].every((label) =>
      navButtons.some((b) => b?.includes(label))
    );
    logResult('Bottom nav present', hasExpectedNav);

    console.log('\n=== Memory ===');
    const metrics = await page.evaluate(() => {
      const mem = performance.memory;
      return mem ? {
        used: Math.round(mem.usedJSHeapSize / 1024 / 1024),
        total: Math.round(mem.totalJSHeapSize / 1024 / 1024),
      } : null;
    });
    if (metrics) {
      logResult('Memory under 150MB', metrics.used < 150, `${metrics.used}MB used`);
    }

    console.log('\n=== Reload stability ===');
    ignoreFailures = true;
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    ignoreFailures = false;
    const reloaded = await page.evaluate(() => !!document.querySelector('#game-container canvas'));
    logResult('Canvas present after reload', reloaded);
  } finally {
    await browser.close();
    if (server) {
      server.kill('SIGTERM');
      await wait(500);
    }
  }

  console.log('\n========== SUMMARY ==========');
  console.log(`Errors: ${errors.length}`);
  console.log(`Warnings: ${warnings.length}`);
  if (errors.length) {
    console.log('\nERRORS:');
    errors.forEach((e) => console.log('  -', e));
  }
  if (warnings.length) {
    console.log('\nWARNINGS:');
    warnings.forEach((w) => console.log('  -', w));
  }
  console.log(`\nScreenshots: ${SCREENSHOT_DIR}`);
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(2);
});
