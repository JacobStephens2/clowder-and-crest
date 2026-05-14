// Regression: completing RoofScout from the title-screen Day of Rest
// catalogue must reopen the catalogue, not a blank screen.
//
// Original failure: RoofScoutScene's shutdown handler called
// `this.platforms?.clear(true, true)` on physics groups Phaser had
// already started tearing down, throwing TypeError "Cannot read
// properties of undefined (reading 'size')" inside game.scene.stop().
// The error bubbled out of switchScene() in onContinue, halting JS
// before scene.start('TitleScene') could fire — leaving every Phaser
// scene stopped and the screen blank.
import { chromium } from 'playwright';

const killer = setTimeout(() => { console.error('hard-kill'); process.exit(2); }, 90_000);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 800, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message));

try {
  await page.goto('http://localhost:3200/', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#game-container canvas', { timeout: 8000 });

  // Open the title-screen Day of Rest catalogue.
  await page.evaluate(async () => {
    const showcase = await import('/src/systems/Showcase.ts');
    showcase.showTitleScreenDayOfRest();
  });
  await page.waitForSelector('#dor-spoiler-confirm', { timeout: 5000 });
  await page.click('#dor-spoiler-confirm');
  await page.waitForSelector('.dor-card', { timeout: 5000 });

  // Pick RoofScout → Easy
  await page.evaluate(() => {
    document.querySelector('.dor-card[data-scene="RoofScoutScene"]')?.click();
  });
  await page.waitForSelector('.dor-diff-btn[data-diff="easy"]', { timeout: 5000 });
  await page.click('.dor-diff-btn[data-diff="easy"]');
  await page.waitForFunction(() => window.__clowderGame?.scene.isActive('RoofScoutScene'), { timeout: 5000 });

  // Dismiss the minigame tutorial overlay (z-index 9999 body div, no class).
  await page.evaluate(() => {
    document.querySelectorAll('body > div').forEach((el) => {
      const cs = window.getComputedStyle(el);
      if (cs.zIndex === '9999' && cs.position === 'fixed') (el).click();
    });
  });

  // Simulate a win by emitting puzzle-complete directly (skips the climb).
  await page.evaluate(async () => {
    const { eventBus } = await import('/src/utils/events.ts');
    eventBus.emit('puzzle-complete', {
      puzzleId: 'roof_scout_easy',
      moves: 100,
      minMoves: 100,
      stars: 3,
      jobId: '__day_of_rest_RoofScoutScene',
      catId: 'demo-cat',
      bonusFish: 0,
    });
  });
  await page.waitForSelector('.result-overlay button#practice-continue', { timeout: 5000 });

  // Click "Back to Day of Rest". The bug fired inside switchScene during
  // RoofScoutScene shutdown, so even though the click handler runs, the
  // navigation aborts and TitleScene never starts.
  await page.evaluate(() => {
    document.getElementById('practice-continue')?.click();
  });

  // Allow up to 2s for the panel to reopen (TitleScene's 50ms delayedCall
  // or the 600ms belt-and-suspenders fallback, whichever wins).
  const dorOpened = await page.waitForFunction(
    () => !!document.querySelector('.day-of-rest-overlay'),
    { timeout: 3000 },
  ).then(() => true).catch(() => false);

  if (dorOpened) {
    console.log('PASS: Day of Rest panel reopened after RoofScout win');
  } else {
    console.log('FAIL: blank screen — Day of Rest panel never reopened');
    process.exitCode = 1;
  }
} finally {
  clearTimeout(killer);
  await browser.close();
}
