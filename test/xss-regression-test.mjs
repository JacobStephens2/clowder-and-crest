// XSS regression test for the Panels.ts and Conversations.ts esc() fixes.
//
// Plants a save with a cat named `<img src=x onerror=alert('xss')>` and a
// player-controlled `playerCatName` containing the same payload, then opens
// the cat panel and verifies:
//   1. No alert dialog fires
//   2. The DOM contains the literal string with escaped < and > (proof the
//      payload was inserted as text, not as an active img element)
//   3. There is no <img src="x"> element anywhere in the panel DOM
//   4. The rename prompt also escapes the name in both <h2> and attribute values
//
// Run: timeout 120s node test/xss-regression-test.mjs

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'xss');
const SAVE_PATH = path.join(__dirname, 'test_saves/test-save-everything-unlocked.json');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const BASE = 'http://localhost:3200';
const HARD_TIMEOUT_MS = 120_000;
const PAYLOAD = `<img src=x onerror="window.__xssFired=true">`;

let server;
let browser;

const hardKill = setTimeout(() => {
  console.error('Hard timeout reached — bailing');
  if (browser) browser.close().catch(() => {});
  if (server?.pid) { try { process.kill(-server.pid, 'SIGKILL'); } catch {} }
  process.exit(1);
}, HARD_TIMEOUT_MS);

function cleanup(code = 0) {
  clearTimeout(hardKill);
  if (browser) browser.close().catch(() => {});
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
  setTimeout(() => process.exit(code), 200);
}
process.on('SIGINT', () => cleanup(130));
process.on('SIGTERM', () => cleanup(143));
process.on('uncaughtException', (e) => { console.error(e); cleanup(1); });

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const res = await fetch(url); if (res.ok) return true; } catch {}
    await wait(500);
  }
  throw new Error('Dev server not ready');
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  let allPass = true;
  function check(label, ok, detail = '') {
    const mark = ok ? '✓' : '✗';
    console.log(`  ${mark} ${label}${detail ? ' — ' + detail : ''}`);
    if (!ok) allPass = false;
  }

  // Auto-dismiss any alert dialogs and record that they fired (an alert
  // firing is a TEST FAILURE — it would mean the XSS payload executed)
  let alertFired = false;
  page.on('dialog', async (dialog) => {
    alertFired = true;
    console.log(`  ⚠ DIALOG FIRED: type=${dialog.type()} message=${dialog.message()}`);
    await dialog.dismiss();
  });

  // Install hooks on every new document so they survive page reloads.
  // addInitScript runs before any other script in the page.
  //
  // Hook 1: stack trace whenever __xssFired is set — confirms the moment
  // the browser parsed the payload (the browser fires onerror async, so
  // this won't show the WRITER, but it confirms timing).
  //
  // Hook 2: stack trace whenever innerHTML is set to a string containing
  // the payload — this is what shows WHICH application code site failed
  // to escape. Critical for diagnosis when the test fails.
  await ctx.addInitScript(() => {
    let _fired = false;
    Object.defineProperty(window, '__xssFired', {
      get() { return _fired; },
      set(value) {
        _fired = value;
        (window).__xssTraces = (window).__xssTraces || [];
        (window).__xssTraces.push({
          stack: new Error().stack.split('\n').slice(1, 15),
          timestamp: Date.now(),
        });
      },
      configurable: true,
    });

    const innerHTMLDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    const originalSetter = innerHTMLDesc.set;
    Object.defineProperty(Element.prototype, 'innerHTML', {
      configurable: true,
      get: innerHTMLDesc.get,
      set(value) {
        if (typeof value === 'string' && /onerror\s*=\s*["']window\.__xssFired|onload\s*=\s*["']window\.__xssFired/.test(value)) {
          (window).__xssWriters = (window).__xssWriters || [];
          (window).__xssWriters.push({
            tag: this.tagName,
            id: this.id,
            class: this.className,
            valueSnippet: value.substring(0, 200),
            stack: new Error().stack.split('\n').slice(1, 15),
            timestamp: Date.now(),
          });
        }
        return originalSetter.call(this, value);
      },
    });
  });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  // Plant a save with the XSS payload as the cat name AND playerCatName
  const save = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf-8'));
  save.flags = { ...save.flags, tutorial_complete: true };
  save.playerCatName = PAYLOAD;
  // Set the first cat (player wildcat) name to the payload
  if (save.cats && save.cats[0]) {
    save.cats[0].name = PAYLOAD;
  }
  // Also set a second cat to a payload to exercise the bond display
  if (save.cats && save.cats[1]) {
    save.cats[1].name = `<svg onload="window.__xssFired=true">`;
  }

  await page.evaluate((s) => {
    localStorage.setItem('clowder_save_slot_1', s);
    localStorage.setItem('clowder_save', s);
  }, JSON.stringify(save));

  await page.reload({ waitUntil: 'networkidle' });
  await wait(5000);

  // Localized XSS check: was anything fired by the title screen alone?
  const titleScreenXss = await page.evaluate(() => !!window.__xssFired);
  check('window.__xssFired NOT set after title screen load', !titleScreenXss);

  // Click Continue → slot 1
  console.log('\n=== Loading save with XSS payloads ===');
  const canvas = await page.$('#game-container canvas');
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + (470 / 844) * box.height);
  let slotBtn = null;
  for (let i = 0; i < 25; i++) {
    await wait(200);
    slotBtn = await page.$('.slot-btn[data-slot="1"]');
    if (slotBtn) break;
  }
  if (!slotBtn) {
    console.log('  ⚠ slot picker did not appear');
    cleanup(1);
    return;
  }
  await slotBtn.click();
  await wait(3500);

  // Localized XSS check: was anything fired during the guildhall load itself?
  const guildhallXss = await page.evaluate(() => !!window.__xssFired);
  check('window.__xssFired NOT set after guildhall load', !guildhallXss);
  if (guildhallXss) {
    // Dump everything that contains an unescaped img/svg payload so we can
    // localize WHERE in the DOM the bug lives.
    const findings = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('img, svg'));
      const hostile = all.filter(el => {
        const src = el.getAttribute('src') || '';
        const onerror = el.getAttribute('onerror') || '';
        const onload = el.getAttribute('onload') || '';
        return src === 'x' || onerror.includes('xssFired') || onload.includes('xssFired');
      });
      return hostile.map(el => ({
        tag: el.tagName,
        src: el.getAttribute('src'),
        onerror: el.getAttribute('onerror'),
        onload: el.getAttribute('onload'),
        parentClasses: (() => {
          const chain = [];
          let p = el.parentElement;
          while (p && chain.length < 6) {
            chain.push(p.className || p.tagName);
            p = p.parentElement;
          }
          return chain;
        })(),
      }));
    });
    console.log('  HOSTILE ELEMENTS IN DOM:', JSON.stringify(findings, null, 2));

    // Dump stack traces captured at the moment __xssFired was set
    const traces = await page.evaluate(() => (window).__xssTraces || []);
    console.log('  STACK TRACES AT XSS FIRE:');
    for (const t of traces) {
      console.log('   --- timestamp:', t.timestamp);
      for (const frame of t.stack) console.log('   ', frame);
    }

    // Dump innerHTML write call sites that contained the payload
    const writers = await page.evaluate(() => (window).__xssWriters || []);
    console.log('  INNERHTML WRITERS:');
    for (const w of writers) {
      console.log('   --- timestamp:', w.timestamp);
      console.log('   element:', w.tag, 'id:', w.id, 'class:', w.class);
      console.log('   snippet:', w.valueSnippet);
      console.log('   stack:');
      for (const frame of w.stack) console.log('     ', frame);
    }
  }

  // Open the cat panel by clicking the Cats nav button
  console.log('\n=== Opening cat panel ===');
  const catsTab = await page.$('button.nav-btn[data-scene="cats"]');
  if (catsTab) {
    await catsTab.click();
    await wait(1500);
  } else {
    console.log('  ⚠ cats tab not found, trying alt selector');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cats = btns.find(b => b.textContent?.includes('Cats'));
      cats?.click();
    });
    await wait(1500);
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-cat-panel-with-xss-payload.png') });

  // Inspect the panel DOM for proof of escaping
  console.log('\n=== Verifying XSS payload was escaped ===');
  const audit = await page.evaluate((payload) => {
    // The HTML index has a static `.panel hidden` element. The dynamically
    // created cat panel has class "panel" (no other classes) and inline
    // display:block. Pick the one that's actually visible / has content.
    const candidates = Array.from(document.querySelectorAll('.panel'));
    const panel = candidates.find(el => !el.classList.contains('hidden') && (el.textContent || '').length > 0)
      || candidates[candidates.length - 1] || null;
    if (!panel) return { foundPanel: false };
    const html = panel.innerHTML;
    // Browsers serialize text-content innerHTML by escaping ONLY <, >, &
    // (and preserving "). Attribute values additionally escape ". So the
    // expected escaped form for text content is:
    const textEscapedForm = payload.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // The textContent of the panel should literally include the original
    // payload string (because escaped HTML decodes back to the literal
    // characters when read as text).
    const textContent = panel.textContent || '';
    // Hostile <img> elements would render as actual DOM nodes
    const hostileImgs = Array.from(panel.querySelectorAll('img'))
      .filter(img => img.getAttribute('src') === 'x' || img.getAttribute('onerror'));
    const hostileSvgs = Array.from(panel.querySelectorAll('svg'))
      .filter(svg => svg.getAttribute('onload'));
    return {
      foundPanel: true,
      htmlContainsEscapedPayload: html.includes(textEscapedForm),
      htmlContainsRawPayload: html.includes(payload),
      textContentContainsPayloadAsLiteralText: textContent.includes(payload),
      textContentSnippet: textContent.substring(0, 400),
      catNameElements: Array.from(panel.querySelectorAll('.cat-card-name')).slice(0, 3).map(el => el.textContent),
      hostileImgCount: hostileImgs.length,
      hostileSvgCount: hostileSvgs.length,
      xssFlagFired: !!window.__xssFired,
    };
  }, PAYLOAD);

  if (!audit.foundPanel) {
    check('cat panel rendered', false, 'no .panel element in DOM');
    cleanup(1);
    return;
  }

  check('cat panel rendered', true);
  check('payload appears as escaped HTML entities in innerHTML', audit.htmlContainsEscapedPayload);
  check('payload does NOT appear as raw HTML', !audit.htmlContainsRawPayload);
  check('payload appears as literal text in textContent (proof escape worked)',
    audit.textContentContainsPayloadAsLiteralText);
  if (!audit.textContentContainsPayloadAsLiteralText) {
    console.log('  DEBUG textContent snippet:', JSON.stringify(audit.textContentSnippet));
    console.log('  DEBUG cat-card-name elements:', JSON.stringify(audit.catNameElements));
    const allPanels = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.panel, .menu-overlay, .conversation-overlay, [class*="panel"]')).map(el => ({
        tag: el.tagName,
        class: el.className,
        textLen: (el.textContent || '').length,
        textPreview: (el.textContent || '').substring(0, 100),
      }));
    });
    console.log('  DEBUG all panel-like elements:', JSON.stringify(allPanels, null, 2));
  }
  check('no hostile <img src=x onerror=...> elements created', audit.hostileImgCount === 0,
    audit.hostileImgCount > 0 ? `${audit.hostileImgCount} hostile imgs found` : '');
  check('no hostile <svg onload=...> elements created', audit.hostileSvgCount === 0,
    audit.hostileSvgCount > 0 ? `${audit.hostileSvgCount} hostile svgs found` : '');
  check('window.__xssFired was NOT set after opening cat panel', !audit.xssFlagFired);
  check('no alert() dialog fired', !alertFired);

  // Now exercise the rename prompt — open it for the first cat
  console.log('\n=== Opening rename prompt (highest-risk site) ===');
  const renameBtn = await page.$('.rename-btn');
  if (renameBtn) {
    await renameBtn.click();
    await wait(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-rename-prompt-with-xss-payload.png') });

    const promptAudit = await page.evaluate((payload) => {
      const prompt = document.querySelector('.name-prompt-overlay');
      if (!prompt) return { foundPrompt: false };
      const html = prompt.innerHTML;
      const escapedForm = payload.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const input = prompt.querySelector('input.rename-input');
      // For the input element: value/placeholder are properties; check that
      // the BROWSER decoded the escaped HTML attribute back to the literal
      // payload string (which is correct — that's how attribute escaping works)
      // and that the attribute SOURCE was escaped (no raw < or > in the HTML)
      const inputValueProperty = input?.value;
      const inputPlaceholderProperty = input?.getAttribute('placeholder');
      // hostile imgs/svgs in the prompt
      const hostileImgs = Array.from(prompt.querySelectorAll('img'))
        .filter(img => img.getAttribute('src') === 'x' || img.getAttribute('onerror'));
      return {
        foundPrompt: true,
        htmlContainsEscapedPayload: html.includes(escapedForm),
        htmlContainsRawPayload: html.includes(payload),
        inputValueIsLiteralPayload: inputValueProperty === payload,
        inputPlaceholderIsLiteralPayload: inputPlaceholderProperty === payload,
        hostileImgCount: hostileImgs.length,
        xssFlagFired: !!window.__xssFired,
      };
    }, PAYLOAD);

    if (!promptAudit.foundPrompt) {
      check('rename prompt rendered', false);
    } else {
      check('rename prompt rendered', true);
      check('rename prompt h2 has escaped payload', promptAudit.htmlContainsEscapedPayload);
      check('rename prompt does not contain raw HTML payload', !promptAudit.htmlContainsRawPayload);
      check('rename input value attribute decoded back to literal text (not HTML)',
        promptAudit.inputValueIsLiteralPayload,
        promptAudit.inputValueIsLiteralPayload ? '' : `value=${JSON.stringify(promptAudit.inputValueProperty)}`);
      check('rename input placeholder decoded back to literal text', promptAudit.inputPlaceholderIsLiteralPayload);
      check('no hostile <img> in rename prompt', promptAudit.hostileImgCount === 0);
      check('window.__xssFired still not set', !promptAudit.xssFlagFired);
      check('still no alert() dialog fired', !alertFired);
    }
  } else {
    console.log('  ⚠ no rename button found — skipping rename prompt audit');
  }

  console.log('\n========== SUMMARY ==========');
  console.log(allPass ? 'ALL XSS REGRESSION CHECKS PASSED' : 'SOME CHECKS FAILED');
  cleanup(allPass ? 0 : 1);
}

main().catch((e) => { console.error(e); cleanup(1); });
