import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

let server;
let browser;
let context;
let page;
let uploads;
let releaseSlots;
let releaseUpload;

before(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await server?.close();
});
beforeEach(async () => {
  uploads = [];
  releaseSlots = undefined;
  releaseUpload = undefined;
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  page.setDefaultTimeout(5000);
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.route(`${origin}/`, (route) => route.fulfill({
    contentType: 'text/html',
    body: '<link rel="stylesheet" href="/src/ui/overlay.css"><div id="overlay-layer"></div>',
  }));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body;
    let status = 200;
    if (path === '/api/auth/me') body = { user: { id: 'panel-player', email: 'player@example.test' } };
    else if (path === '/api/saves/slots') {
      if (releaseSlots) await releaseSlots.promise;
      body = { slots: [{ slot: 1, exists: true, hash: 'remote', summary: { name: 'Remote guild', day: 1, chapter: 1, cats: 1 } }] };
    } else if (request.method() === 'PUT') {
      uploads.push(request.postDataJSON());
      if (releaseUpload) ({ body, status } = await releaseUpload.promise);
      else body = { ok: true, hash: 'uploaded', status: 'fast-forward' };
    } else body = { ok: true };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(origin);
  await page.evaluate(async () => {
    const Cloud = await import('/src/systems/CloudSync.ts');
    const Panel = await import('/src/ui/CloudPanel.ts');
    const Saves = await import('/src/systems/SaveManager.ts');
    const { initSessionFlow } = await import('/src/systems/SessionFlow.ts');
    const { eventBus } = await import('/src/utils/events.ts');
    let save = Saves.createDefaultSave('First guild');
    const checkpoints = [];
    const noop = () => {};
    const session = initSessionFlow({
      overlayLayer: document.getElementById('overlay-layer'),
      getGameState: () => save, setGameState: (s) => { save = s; },
      createDefaultSave: Saves.createDefaultSave,
      rawSaveGame: (s) => { checkpoints.push(s.playerCatName); Saves.saveGame(s); },
      saveToSlot: Saves.saveToSlot, deleteSave: Saves.deleteSave, deleteSlot: Saves.deleteSlot,
      switchScene: noop, playIntroStory: noop, showTutorial: noop, showGuildReport: noop,
      showToast: noop, updateStatusBar: noop, startBgm: noop, startDayTimer: noop,
      clearTransientState: noop, getOfflineStationedEarnings: () => ({ earnings: 0, daysAway: 0 }),
      getDailyUpkeep: () => 0,
    });
    Saves.saveToSlot(1, save);
    Panel.initCloudPanel({
      overlayLayer: document.getElementById('overlay-layer'), showToast: noop,
      getGameState: () => save, saveGame: session.saveGame, setGameState: (s) => { save = s; },
      switchScene: noop, getActiveSlot: session.getActiveSlot, reopenMenu: noop,
    });
    window.fixture = { Cloud, Panel, Saves, checkpoints,
      advance: () => { save.day = 4; },
      switchGuild: (slot) => {
        save = Saves.createDefaultSave('Second guild');
        eventBus.emit('active-slot', slot);
        Saves.saveToSlot(slot, save);
      },
    };
    await Cloud.refreshAuth();
  });
});
afterEach(async () => {
  releaseSlots?.resolve();
  releaseUpload?.resolve({ body: { ok: true, hash: 'cleanup' }, status: 200 });
  await context?.close();
});

function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}

async function showPanel() {
  await page.evaluate(() => window.fixture.Panel.showCloudPanel());
  await page.locator('#cloud-upload').waitFor();
}

test('manual action checkpoints and uploads the live save through the session interface', { timeout: 20000 }, async () => {
  await showPanel();
  if (process.env.CLOUD_PANEL_CAPTURE) await page.screenshot({ path: process.env.CLOUD_PANEL_CAPTURE });
  await page.evaluate(() => window.fixture.advance());
  await page.locator('#cloud-upload').click();
  await page.waitForFunction(() => window.fixture.checkpoints.length === 1);
  await page.waitForFunction(() => !window.fixture.Cloud.hasPending(1));
  assert.equal(uploads[0].save.day, 4);
  assert.equal(await page.evaluate(() => window.fixture.Saves.loadFromSlot(1).day), 4);
});

test('stale panel action cannot checkpoint a previous guild into a newly active slot', { timeout: 20000 }, async () => {
  await showPanel();
  await page.evaluate(() => {
    const button = document.getElementById('cloud-upload');
    window.fixture.switchGuild(2);
    button.click();
  });
  assert.deepEqual(await page.evaluate(() => window.fixture.checkpoints), []);
  assert.equal(await page.evaluate(() => window.fixture.Saves.loadFromSlot(2).playerCatName), 'Second guild');
});

test('a panel refresh that finishes after a guild switch cannot bind stale controls', { timeout: 20000 }, async () => {
  releaseSlots = deferred();
  const requested = page.waitForRequest('**/api/saves/slots');
  await page.evaluate(() => window.fixture.Panel.showCloudPanel());
  await requested;
  await page.evaluate(() => window.fixture.switchGuild(2));
  const responded = page.waitForResponse('**/api/saves/slots');
  releaseSlots.resolve();
  await responded;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  assert.equal(await page.locator('#cloud-upload').count(), 0);
});

test('an upload conflict arriving after a guild switch cannot open another guild chooser', { timeout: 20000 }, async () => {
  await showPanel();
  releaseUpload = deferred();
  const requested = page.waitForRequest((r) => r.method() === 'PUT');
  await page.locator('#cloud-upload').click();
  await requested;
  await page.evaluate(() => window.fixture.switchGuild(2));
  releaseUpload.resolve({ status: 409, body: { detail: { remoteHash: 'remote' } } });
  await page.waitForResponse((r) => r.request().method() === 'PUT');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  assert.equal(await page.locator('#conflict-keep-local').count(), 0);
});

test('a stale conflict choice cannot checkpoint the previous guild into the active slot', { timeout: 20000 }, async () => {
  await showPanel();
  releaseUpload = deferred();
  releaseUpload.resolve({ status: 409, body: { detail: { remoteHash: 'remote' } } });
  await page.locator('#cloud-upload').click();
  await page.locator('#conflict-keep-local').waitFor();
  await page.evaluate(() => {
    window.fixture.checkpoints.length = 0;
    window.fixture.switchGuild(2);
    document.getElementById('conflict-keep-local').click();
  });
  assert.deepEqual(await page.evaluate(() => window.fixture.checkpoints), []);
  assert.equal(await page.evaluate(() => window.fixture.Saves.loadFromSlot(2).playerCatName), 'Second guild');
});
