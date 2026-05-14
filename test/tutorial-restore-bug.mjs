// Regression: after the new-game tutorial finishes, `#bottom-bar` must remain
// `position: fixed` (so it stays pinned to the viewport bottom). The previous
// bug let the 5-second setTimeout restore land AFTER a duplicate highlight had
// captured the already-mutated `relative` value, pinning the nav bar in
// document flow at the top of the screen.
import { chromium } from 'playwright';

const killer = setTimeout(() => { console.error('hard-kill'); process.exit(2); }, 60_000);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 800, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

try {
  await page.goto('http://localhost:3200/', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#game-container canvas', { timeout: 8000 });

  // Drive the tutorial directly — skip intro story / scene transitions so
  // the test stays under a few seconds.
  await page.evaluate(async () => {
    const { showTutorial } = await import('/src/ui/onboarding.ts');
    showTutorial();
  });

  // Click through all 5 steps faster than the old 5s restore timeout
  // (this is exactly the timing that triggered the original bug).
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(150);
    // Click the bubble (z-index 9999 ensures it's on top).
    await page.evaluate(() => {
      const bubbles = document.querySelectorAll('div');
      for (const b of bubbles) {
        if (b.textContent?.includes('Tap to continue')) {
          b.click();
          return;
        }
      }
    });
  }

  await page.waitForTimeout(300);

  const finalState = await page.evaluate(() => {
    const el = document.getElementById('bottom-bar');
    if (!el) return { found: false };
    const cs = window.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      found: true,
      position: cs.position,
      bottom: cs.bottom,
      y: r.y,
      h: r.height,
      viewportH: window.innerHeight,
      inlinePosition: el.style.position,
      inlineZIndex: el.style.zIndex,
    };
  });
  console.log(JSON.stringify(finalState, null, 2));

  // Inline position must be empty so the stylesheet's `position: fixed`
  // applies. If a setTimeout restored `'relative'` over the original
  // empty string, that's the bug we're guarding against.
  if (finalState.inlinePosition !== '') {
    console.log('FAIL: bottom-bar inline position is', JSON.stringify(finalState.inlinePosition), '— expected empty');
    process.exitCode = 1;
  } else if (finalState.position !== 'fixed') {
    console.log('FAIL: bottom-bar computed position is', finalState.position, '— expected fixed');
    process.exitCode = 1;
  } else if (Math.abs(finalState.y - (finalState.viewportH - finalState.h)) > 2) {
    console.log('FAIL: bottom-bar y is', finalState.y, '— expected near', finalState.viewportH - finalState.h);
    process.exitCode = 1;
  } else {
    console.log('PASS: bottom-bar stayed fixed at viewport bottom');
  }
} finally {
  clearTimeout(killer);
  await browser.close();
}
