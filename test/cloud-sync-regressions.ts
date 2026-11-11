import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { MemoryStorage } from './helpers/MemoryStorage';

const storage = new MemoryStorage();
Object.assign(globalThis, {
  localStorage: storage,
  document: { getElementById: () => null },
  window: { devicePixelRatio: 1 },
});
const Cloud = await import('../src/systems/CloudSync');
const { createDefaultSave, saveToSlot, loadFromSlot } = await import('../src/systems/SaveManager');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const success = (hash: string) => response({ ok: true, hash, status: 'fast-forward' });
const user = (id = 'player-1') => ({ user: { id, email: `${id}@example.test`, emailVerified: true } });
let requests: { path: string; body: any; reply: ReturnType<typeof deferred<Response>> }[];
let identity: string;
let offline: boolean;
let logoutReply: ReturnType<typeof deferred<Response>> | undefined;

beforeEach(async () => {
  storage.clear();
  requests = [];
  identity = 'player-1';
  offline = false;
  logoutReply = undefined;
  mock.method(globalThis, 'fetch', async (path: string, init?: RequestInit) => {
    if (path === '/api/auth/logout' && logoutReply) return logoutReply.promise;
    if (path.startsWith('/api/auth/')) {
      if (offline) throw new Error('Offline');
      return response(user(identity));
    }
    const reply = deferred<Response>();
    requests.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null, reply });
    return reply.promise;
  });
  await Cloud.refreshAuth();
  mock.timers.enable({ apis: ['setTimeout'] });
});

afterEach(async () => {
  logoutReply?.resolve(response({ ok: true }));
  await Cloud.logout();
  for (const request of requests) request.reply.resolve(response({ detail: 'Test cleanup' }, 500));
  await setImmediate();
  mock.restoreAll();
  mock.timers.reset();
});

test('acknowledges only the sent snapshot when the caller advances during upload', async () => {
  const save = createDefaultSave('First guild');
  saveToSlot(1, save);
  const upload = Cloud.pushSlot(1, save, { reason: 'manual-upload' });
  save.day = 2;
  saveToSlot(1, save);
  assert.equal(requests[0].body.save.day, 1);
  requests[0].reply.resolve(success('server-day-1'));
  assert.equal((await upload).ok, true);
  assert.equal(Cloud.compareSlot(1, { slot: 1, exists: true, hash: 'server-day-1' }).state, 'local-newer');
});

test('scheduled checkpoint keeps its guild and slot when another guild becomes active', async () => {
  let active = createDefaultSave('First guild');
  saveToSlot(1, active);
  Cloud.schedulePush(1, active);
  active.day = 2;
  active = createDefaultSave('Second guild');
  saveToSlot(2, active);
  mock.timers.tick(8000);
  await setImmediate();
  assert.equal(requests.length, 1, 'scheduled save value must produce an upload');
  assert.equal(requests[0].path, '/api/saves/slots/1');
  assert.equal(requests[0].body.save.playerCatName, 'First guild');
  assert.equal(requests[0].body.save.day, 1);
  requests[0].reply.resolve(success('first-guild'));
  await setImmediate();
});

test('debounces each slot independently and coalesces only its latest checkpoint', async () => {
  const first = createDefaultSave('First guild');
  const second = createDefaultSave('Second guild');
  Cloud.schedulePush(1, first);
  mock.timers.tick(4000);
  Cloud.schedulePush(2, second);
  first.day = 3;
  Cloud.schedulePush(1, first);
  mock.timers.tick(7999);
  assert.equal(requests.length, 0);
  mock.timers.tick(1);
  await setImmediate();
  assert.deepEqual(requests.map((r) => [r.path, r.body.save.day]), [
    ['/api/saves/slots/2', 1], ['/api/saves/slots/1', 3],
  ]);
  for (const request of requests) request.reply.resolve(success('independent'));
  await setImmediate();
});

test('serializes same-slot snapshots and takes the base hash when each starts', async () => {
  const save = createDefaultSave('Ordered guild');
  saveToSlot(1, save);
  const first = Cloud.pushSlot(1, save, { reason: 'manual-upload' });
  save.day = 2;
  saveToSlot(1, save);
  const second = Cloud.pushSlot(1, save, { reason: 'manual-upload' });
  save.day = 3;
  assert.equal(Cloud.hasPending(1), true, 'acceptance must persist pending before the request completes');
  assert.equal(requests.length, 1, 'only one request per slot may be in flight');
  requests[0].reply.resolve(success('day-1'));
  await first;
  await setImmediate();
  assert.equal(Cloud.hasPending(1), true, 'older success cannot clear the newer request');
  assert.equal(requests[1].body.save.day, 2, 'queued uploads are detached at entry');
  assert.equal(requests[1].body.baseHash, 'day-1');
  requests[1].reply.resolve(success('day-2'));
  assert.equal((await second).ok, true);
  assert.equal(Cloud.hasPending(1), false);
});

test('immediate upload supersedes an older unsent debounce', async () => {
  const save = createDefaultSave('Manual guild');
  Cloud.schedulePush(1, save);
  save.day = 2;
  saveToSlot(1, save);
  const manual = Cloud.pushSlot(1, save, { reason: 'manual-upload' });
  requests[0].reply.resolve(success('manual'));
  await manual;
  mock.timers.tick(8000);
  await setImmediate();
  assert.equal(requests.length, 1, 'old day-end checkpoint must never follow the manual upload');
});

test('a conflict stops automatic work already waiting and preserves the baseline', async () => {
  const save = createDefaultSave('Conflicted guild');
  saveToSlot(1, save);
  const baseline = Cloud.pushSlot(1, save, { reason: 'manual-upload' });
  requests[0].reply.resolve(success('original'));
  await baseline;
  const conflict = Cloud.pushSlot(1, save, { reason: 'manual-upload' });
  save.day = 2;
  saveToSlot(1, save);
  Cloud.schedulePush(1, save);
  mock.timers.tick(8000);
  requests[1].reply.resolve(response({ detail: { remoteHash: 'other-device' } }, 409));
  assert.equal((await conflict).conflict?.hash, 'other-device');
  await setImmediate();
  assert.equal(requests.length, 2, 'conflict must stop the queued automatic upload');
  assert.equal(Cloud.compareSlot(1, { slot: 1, exists: true, hash: 'original' }).state, 'local-newer');
  assert.equal(Cloud.hasPending(1), true);
});

for (const cancellation of ['logout', 'identity', 'pull', 'delete'] as const) {
  test(`${cancellation} cancels unsent work and ignores obsolete upload responses`, async () => {
    const save = createDefaultSave('Cancelled guild');
    saveToSlot(1, save);
    const first = Cloud.pushSlot(1, save, { reason: 'manual-upload' });
    const queued = Cloud.pushSlot(1, save, { reason: 'manual-upload' });
    Cloud.schedulePush(1, save);
    let expectedHash: string | null = null;
    if (cancellation === 'logout') {
      logoutReply = deferred<Response>();
      const signingOut = Cloud.logout();
      mock.timers.tick(8000);
      assert.equal(requests.length, 1, 'logout entry must cancel before its network call completes');
      logoutReply.resolve(response({ ok: true }));
      await signingOut;
    } else if (cancellation === 'identity') {
      identity = 'replacement-player';
      await Cloud.refreshAuth();
    } else if (cancellation === 'pull') {
      const pulling = Cloud.pullSlot(1, { reason: 'download' });
      const replacement = createDefaultSave('Downloaded guild');
      requests[1].reply.resolve(response({ exists: true, hash: 'pulled', save: replacement }));
      assert.equal((await pulling).ok, true);
      expectedHash = 'pulled';
    } else {
      const deleting = Cloud.deleteCloudSlot(1);
      requests[1].reply.resolve(response({ ok: true }));
      assert.equal(await deleting, true);
    }
    requests[0].reply.resolve(success('obsolete'));
    assert.equal((await first).ok, false, 'late acknowledgment must not surface as current success');
    assert.equal((await queued).ok, false);
    mock.timers.tick(8000);
    await setImmediate();
    assert.equal(requests.filter((r) => r.body?.save).length, 1);
    assert.equal(storage.getItem('clowder_cloud_slot_1_cloudhash'), expectedHash);
    assert.equal(loadFromSlot(1)?.playerCatName, cancellation === 'pull' ? 'Downloaded guild' : 'Cancelled guild');
  });
}

test('retry after reload reads the latest persisted checkpoint and supersedes an old timer', async () => {
  const save = createDefaultSave('Recovered guild');
  saveToSlot(1, save);
  Cloud.schedulePush(1, save);
  assert.equal(Cloud.hasPending(1), true);
  await Cloud.logout(); // discard in-memory work, preserving the durable marker
  const Reloaded = await import('../src/systems/CloudSync.ts?recovery');
  await Reloaded.refreshAuth();
  save.day = 5;
  saveToSlot(1, save);
  const retry = Reloaded.flushPending();
  assert.equal(requests[0].body.save.day, 5);
  assert.equal(requests[0].body.force, false);
  requests[0].reply.resolve(success('recovered'));
  assert.deepEqual(await retry, []);
  assert.equal(Reloaded.hasPending(1), false);
  assert.equal(Reloaded.compareSlot(1, { slot: 1, exists: true, hash: 'recovered' }).state, 'in-sync');
  await Reloaded.logout();
  await Cloud.refreshAuth();
  Cloud.schedulePush(1, save);
  save.day = 6;
  saveToSlot(1, save);
  const secondRetry = Cloud.flushPending();
  assert.equal(requests[1].body.save.day, 6);
  requests[1].reply.resolve(success('retry'));
  await secondRetry;
  mock.timers.tick(8000);
  await setImmediate();
  assert.equal(requests.length, 2);
});

test('network failure and offline refresh retain the identity, pending request and baseline', async () => {
  const save = createDefaultSave('Offline guild');
  saveToSlot(1, save);
  const baseline = Cloud.pushSlot(1, save, { reason: 'manual-upload' });
  requests[0].reply.resolve(success('baseline'));
  await baseline;
  save.day = 2;
  saveToSlot(1, save);
  const upload = Cloud.pushSlot(1, save, { reason: 'manual-upload' });
  requests[1].reply.reject(new Error('Offline'));
  assert.equal((await upload).ok, false);
  offline = true;
  await Cloud.refreshAuth();
  assert.equal(Cloud.getAuthState().status, 'offline');
  assert.equal(Cloud.getAuthState().userId, 'player-1');
  assert.equal(Cloud.hasPending(1), true);
  offline = false;
  await Cloud.refreshAuth();
  const retry = Cloud.flushPending();
  assert.equal(requests[2].body.baseHash, 'baseline');
  requests[2].reply.resolve(success('reconnected'));
  await retry;
  assert.equal(Cloud.hasPending(1), false);
});

test('fingerprints the JSON representation including omitted optional properties', async () => {
  const save = createDefaultSave('Optional fields');
  save.tutorialDone = undefined;
  saveToSlot(1, save);
  const upload = Cloud.pushSlot(1, save, { reason: 'manual-upload' });
  assert.equal(Object.hasOwn(requests[0].body.save, 'tutorialDone'), false);
  requests[0].reply.resolve(success('optional'));
  await upload;
  assert.equal(Cloud.compareSlot(1, { slot: 1, exists: true, hash: 'optional' }).state, 'in-sync');
});

test('capture and pending-marker failures return errors without sending invalid requests', async () => {
  const save = createDefaultSave('Uncapturable guild');
  Object.defineProperty(save, 'cycle', { value: save, enumerable: true });
  assert.equal((await Cloud.pushSlot(1, save, { reason: 'manual-upload' })).ok, false);
  assert.doesNotThrow(() => Cloud.schedulePush(1, save));
  assert.equal(Cloud.hasPending(1), true);
  mock.method(storage, 'setItem', () => { throw new Error('Storage full'); });
  assert.equal((await Cloud.pushSlot(2, createDefaultSave('Full storage'), { reason: 'manual-upload' })).ok, false);
  mock.timers.tick(8000);
  await setImmediate();
  assert.equal(requests.length, 0);
});

test('older success preserves pending work recorded for a newer failed scheduled capture', async () => {
  const save = createDefaultSave('Capture failure guild');
  saveToSlot(1, save);
  const first = Cloud.pushSlot(1, save, { reason: 'manual-upload' });
  const newer = { ...save, day: 2 };
  Object.defineProperty(newer, 'cycle', { value: newer, enumerable: true });
  Cloud.schedulePush(1, newer);
  assert.equal(Cloud.hasPending(1), true);
  requests[0].reply.resolve(success('day-1'));
  assert.equal((await first).ok, true);
  assert.equal(Cloud.hasPending(1), true, 'older success cannot clear pending for a failed newer capture');
});

test('baseline persistence failure never reports a successful sync', async () => {
  const save = createDefaultSave('Storage failure');
  saveToSlot(1, save);
  const upload = Cloud.pushSlot(1, save, { reason: 'manual-upload' });
  const original = storage.setItem.bind(storage);
  mock.method(storage, 'setItem', (key, value) => {
    if (key.endsWith('_localhash')) throw new Error('Storage full');
    original(key, value);
  });
  requests[0].reply.resolve(success('unrecorded'));
  assert.equal((await upload).ok, false);
  assert.equal(Cloud.hasPending(1), true);
  assert.notEqual(Cloud.compareSlot(1, { slot: 1, exists: true, hash: 'unrecorded' }).state, 'in-sync');
});

for (const status of ['created', 'unchanged', 'forced'] as const) {
  test(`preserves ${status} results and the explicit force option`, async () => {
    const save = createDefaultSave('Result guild');
    saveToSlot(1, save);
    const upload = Cloud.pushSlot(1, save, { reason: 'manual-upload', force: status === 'forced' });
    assert.equal(requests[0].body.force, status === 'forced');
    requests[0].reply.resolve(response({ ok: true, hash: status, status }));
    assert.deepEqual(await upload, { ok: true, status });
    assert.equal(Cloud.hasPending(1), false);
  });
}
