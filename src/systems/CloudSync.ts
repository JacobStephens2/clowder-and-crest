// Cloud account + save-sync facade.
//
// Mirrors the NativeFeatures.ts convention: every entry point is safe to call
// anywhere (web / native / offline / signed-out) and never throws into game
// code. The game stays fully playable with no account; cloud sync is additive.
//
// Talks to the clowder-sync service via /api/* — same-origin on web (cookie
// session) and an absolute origin on the Capacitor WebView (Bearer token in
// @capacitor/preferences, because the WebView origin is cross-origin to the
// API host and the cookie path is fragile there).
//
// THE PRODUCT RULE (from the Chart35 data-loss incident): local data is the
// source of truth unless the player explicitly chooses otherwise. This module
// never overwrites a local slot without (a) an explicit caller decision and
// (b) a .cloudbak backup written first. Conflicts surface as a 'diverged'
// status for the UI to resolve — they are never auto-merged.

import { Preferences } from '@capacitor/preferences';
import { isNative } from './NativeFeatures';
import {
  loadFromSlot,
  saveToSlot,
  validateAndSanitizeSave,
  backupSlotBeforeCloudOverwrite,
  SAVE_VERSION,
  type SaveData,
} from './SaveManager';

// ──── Types ────

export type AuthStatus = 'unknown' | 'signed-out' | 'signed-in' | 'offline';

export interface CloudAuthState {
  status: AuthStatus;
  userId?: string;
  email?: string;
  emailVerified?: boolean;
  lastError?: string;
}

export interface CloudSlotSummary {
  slot: number;
  exists: boolean;
  hash?: string;
  serverUpdatedAt?: string;
  deviceId?: string | null;
  summary?: { name: string; day: number | null; chapter: number | null; cats: number; lastPlayedTimestamp?: number | null; version?: number | null };
}

export type SlotSyncState =
  | 'no-account' | 'offline' | 'empty' | 'in-sync'
  | 'local-only' | 'cloud-only' | 'local-newer' | 'cloud-newer'
  | 'diverged' | 'error';

export interface SlotSyncStatus {
  slot: number;
  state: SlotSyncState;
  cloud?: CloudSlotSummary;
}

export interface PushResult {
  ok: boolean;
  cancelled?: boolean;
  status?: 'created' | 'unchanged' | 'fast-forward' | 'forced';
  conflict?: CloudSlotSummary;
  error?: string;
}

export interface PullResult {
  ok: boolean;
  save?: SaveData;
  error?: 'version-skew' | 'invalid' | 'absent' | 'network' | 'auth';
}

// ──── Local metadata keys ────

const K_TOKEN = 'clowder_cloud_token';            // native only
const K_DEVICE = 'clowder_cloud_device_id';
const K_EMAIL = 'clowder_cloud_email';
const kCloudHash = (slot: number) => `clowder_cloud_slot_${slot}_cloudhash`;
const kLocalHash = (slot: number) => `clowder_cloud_slot_${slot}_localhash`;
const kPending = (slot: number) => `clowder_cloud_slot_${slot}_pending`;

// ──── State ────

let authState: CloudAuthState = { status: 'unknown' };
let nativeToken: string | null = null;
let identityGeneration = 0;
const listeners = new Set<(s: CloudAuthState) => void>();

function setState(next: Partial<CloudAuthState>): void {
  authState = { ...authState, ...next };
  for (const fn of listeners) {
    try { fn(authState); } catch { /* listener errors never break sync */ }
  }
}

export function getAuthState(): CloudAuthState {
  return authState;
}

export function subscribeAuth(fn: (s: CloudAuthState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isSignedIn(): boolean {
  return authState.status === 'signed-in';
}

// ──── Device id ────

function deviceId(): string {
  let id = localStorage.getItem(K_DEVICE);
  if (!id) {
    try {
      id = crypto.randomUUID();
    } catch {
      id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    localStorage.setItem(K_DEVICE, id);
  }
  return id;
}

// ──── Native token storage (Preferences) ────

async function loadNativeToken(): Promise<void> {
  if (!isNative()) return;
  try {
    const { value } = await Preferences.get({ key: K_TOKEN });
    nativeToken = value || null;
  } catch {
    nativeToken = null;
  }
}

async function saveNativeToken(token: string): Promise<void> {
  nativeToken = token;
  if (!isNative()) return;
  try { await Preferences.set({ key: K_TOKEN, value: token }); } catch { /* best effort */ }
}

async function clearNativeToken(): Promise<void> {
  nativeToken = null;
  if (!isNative()) return;
  try { await Preferences.remove({ key: K_TOKEN }); } catch { /* best effort */ }
}

// ──── Fetch wrapper ────

/** Origin prefix for API calls. Empty (relative /api) on web so requests are
 *  same-origin and the session cookie rides along; absolute on native because
 *  the WebView origin is not the API host. */
function apiBase(): string {
  return isNative() ? 'https://clowderandcrest.com' : '';
}

interface ApiResult { status: number; data: any; networkError?: boolean; }

async function api(method: string, path: string, body?: unknown): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (nativeToken) headers['Authorization'] = `Bearer ${nativeToken}`;
  try {
    const resp = await fetch(apiBase() + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data: any = null;
    try { data = await resp.json(); } catch { /* empty/non-json body */ }
    return { status: resp.status, data };
  } catch {
    return { status: 0, data: null, networkError: true };
  }
}

// ──── Local-save hashing (change detection only) ────
//
// A stable stringify + cheap hash, used ONLY to detect whether the local slot
// changed since the last sync. It lives in the client's own hash space and
// deliberately does NOT need to match the server's content hash — the server
// hash is the authoritative concurrency token and the client treats it as
// opaque. Comparing localHash vs lastSyncedLocalHash answers "did local move?";
// comparing the server's slot hash vs lastSyncedCloudHash answers "did cloud
// move?". Together they classify in-sync / local-newer / cloud-newer / diverged.

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function localHash(save: SaveData): string {
  const s = stableStringify(save);
  // djb2 — fast, good enough for equality detection.
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function captureSave(save: SaveData): SaveData {
  const snapshot = JSON.parse(JSON.stringify(save));
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('Invalid save');
  return snapshot;
}

// ──── Init ────

/** One-shot init: load any native token, then resolve auth state via /me.
 *  Non-blocking elsewhere — callers should not await game-critical paths on it. */
export async function initCloudSync(): Promise<void> {
  await loadNativeToken();
  const knownEmail = localStorage.getItem(K_EMAIL);
  if (knownEmail) setState({ email: knownEmail });
  await refreshAuth();
}

/** Re-check the session. Sets 'offline' on network failure (so the UI can say
 *  "changes are local only" rather than "signed out", per the Chart35 banner
 *  lesson — a dropped network must never read as a logout). */
export async function refreshAuth(): Promise<CloudAuthState> {
  const generation = identityGeneration;
  const res = await api('GET', '/api/auth/me');
  if (generation !== identityGeneration) return authState;
  if (res.networkError) {
    // Keep the last-known identity but mark transport down.
    setState({ status: authState.email ? 'offline' : 'signed-out' });
    return authState;
  }
  if (res.status === 200 && res.data?.user) {
    adoptIdentity(res.data.user.id);
    localStorage.setItem(K_EMAIL, res.data.user.email);
    setState({ status: 'signed-in', email: res.data.user.email, emailVerified: !!res.data.user.emailVerified, lastError: undefined });
  } else {
    adoptIdentity(undefined);
    setState({ status: 'signed-out', emailVerified: undefined });
  }
  return authState;
}

// ──── Auth actions ────

async function adoptSession(res: ApiResult): Promise<{ ok: boolean; error?: string }> {
  if (res.networkError) return { ok: false, error: 'Network unavailable' };
  if (res.status >= 400) {
    const msg = typeof res.data?.detail === 'string' ? res.data.detail : 'Request failed';
    setState({ lastError: msg });
    return { ok: false, error: msg };
  }
  if (res.data?.user) adoptIdentity(res.data.user.id);
  if (res.data?.token) await saveNativeToken(res.data.token);
  if (res.data?.user) {
    localStorage.setItem(K_EMAIL, res.data.user.email);
    setState({ status: 'signed-in', email: res.data.user.email, emailVerified: !!res.data.user.emailVerified, lastError: undefined });
  }
  return { ok: true };
}

export async function register(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  return adoptSession(await api('POST', '/api/auth/register', { email, password, deviceId: deviceId(), platform: isNative() ? 'native' : 'web' }));
}

export async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  return adoptSession(await api('POST', '/api/auth/login', { email, password, deviceId: deviceId(), platform: isNative() ? 'native' : 'web' }));
}

export async function logout(): Promise<void> {
  // Cancel at entry, before the logout request can yield to another upload.
  identityGeneration++;
  for (const slot of uploadLanes.keys()) invalidateUploads(slot);
  setState({ status: 'signed-out', userId: undefined });
  await api('POST', '/api/auth/logout');
  await clearNativeToken();
  localStorage.removeItem(K_EMAIL);
  setState({ status: 'signed-out', email: undefined, emailVerified: undefined });
  // NOTE: logout deliberately does NOT touch local saves or sync metadata.
}

export async function resendVerification(): Promise<{ ok: boolean; error?: string }> {
  const res = await api('POST', '/api/auth/resend-verification');
  return { ok: res.status === 200, error: res.status === 200 ? undefined : 'Could not resend' };
}

export async function requestPasswordReset(email: string): Promise<void> {
  // Always resolves (server returns 202 regardless, no account enumeration).
  await api('POST', '/api/auth/forgot-password', { email });
}

export async function verifyEmail(token: string): Promise<boolean> {
  const res = await api('POST', '/api/auth/verify-email', { token });
  if (res.status === 200) { await refreshAuth(); return true; }
  return false;
}

export async function resetPassword(token: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const res = await api('POST', '/api/auth/reset-password', { token, password });
  if (res.status === 200) return { ok: true };
  return { ok: false, error: typeof res.data?.detail === 'string' ? res.data.detail : 'Reset failed' };
}

/** Parse a verification / reset link the user followed from email. The mailer
 *  builds `{BASE_URL}/#/verify-email?token=...` and `/#/reset-password?token=...`. */
export function readAuthLink(): { kind: 'verify' | 'reset'; token: string } | null {
  const m = (window.location.hash || '').match(/^#\/(verify-email|reset-password)\?token=([^&]+)/);
  if (!m) return null;
  return { kind: m[1] === 'verify-email' ? 'verify' : 'reset', token: decodeURIComponent(m[2]) };
}

/** Strip the token out of the URL so a refresh doesn't re-trigger it. */
export function clearAuthLink(): void {
  try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* ignore */ }
}

// ──── Slot metadata ────

function getCloudBaseHash(slot: number): string | null { return localStorage.getItem(kCloudHash(slot)); }
function setSyncedMeta(slot: number, cloudHash: string, fingerprint: string): void {
  const previousCloud = getCloudBaseHash(slot);
  const previousLocal = localStorage.getItem(kLocalHash(slot));
  try {
    localStorage.setItem(kCloudHash(slot), cloudHash);
    localStorage.setItem(kLocalHash(slot), fingerprint);
  } catch (error) {
    // Best effort: a partial pair must not masquerade as a completed sync.
    try {
      if (previousCloud === null) localStorage.removeItem(kCloudHash(slot));
      else localStorage.setItem(kCloudHash(slot), previousCloud);
      if (previousLocal === null) localStorage.removeItem(kLocalHash(slot));
      else localStorage.setItem(kLocalHash(slot), previousLocal);
    } catch { /* storage remains unavailable; pending was recorded at entry */ }
    throw error;
  }
}
export function markPending(slot: number): boolean {
  try { localStorage.setItem(kPending(slot), '1'); return true; } catch { return false; }
}
export function hasPending(slot: number): boolean {
  try { return localStorage.getItem(kPending(slot)) === '1'; } catch { return true; }
}

// ──── Cloud reads ────

export async function fetchCloudSlots(): Promise<CloudSlotSummary[] | null> {
  const res = await api('GET', '/api/saves/slots');
  if (res.status !== 200 || !Array.isArray(res.data?.slots)) return null;
  return res.data.slots as CloudSlotSummary[];
}

// ──── Compare ────

/** Classify a slot's local vs cloud relationship. Pure read; no writes. */
export function compareSlot(slot: number, cloud: CloudSlotSummary | undefined): SlotSyncStatus {
  if (authState.status === 'offline') return { slot, state: 'offline', cloud };
  if (authState.status !== 'signed-in') return { slot, state: 'no-account', cloud };

  const local = loadFromSlot(slot);
  const localExists = !!local;
  const cloudExists = !!cloud?.exists;

  if (!localExists && !cloudExists) return { slot, state: 'empty', cloud };
  if (!localExists && cloudExists) return { slot, state: 'cloud-only', cloud };
  if (localExists && !cloudExists) return { slot, state: 'local-only', cloud };

  // Both exist — use the 3-way baseline.
  const curLocal = localHash(local as SaveData);
  const curCloud = cloud!.hash || '';
  const baseLocal = localStorage.getItem(kLocalHash(slot));
  const baseCloud = getCloudBaseHash(slot);
  const localChanged = curLocal !== baseLocal;
  const cloudChanged = curCloud !== baseCloud;

  if (!localChanged && !cloudChanged) return { slot, state: 'in-sync', cloud };
  if (!localChanged && cloudChanged) return { slot, state: 'cloud-newer', cloud };
  if (localChanged && !cloudChanged) return { slot, state: 'local-newer', cloud };
  return { slot, state: 'diverged', cloud };
}

// ──── Push ────

interface Upload {
  slot: number;
  snapshot: SaveData;
  fingerprint: string;
  sequence: number;
  identity: number;
  generation: number;
  force: boolean;
  reason: string;
  resolve: (result: PushResult) => void;
}

interface UploadLane {
  generation: number;
  requested: number;
  running: boolean;
  queue: Upload[];
  scheduled?: { upload: Upload; timer: ReturnType<typeof setTimeout> };
}

const uploadLanes = new Map<number, UploadLane>();
const PUSH_DEBOUNCE_MS = 8000;

function laneFor(slot: number): UploadLane {
  let lane = uploadLanes.get(slot);
  if (!lane) {
    lane = { generation: 0, requested: 0, running: false, queue: [] };
    uploadLanes.set(slot, lane);
  }
  return lane;
}

function acceptUpload(slot: number, save: SaveData, opts: { force?: boolean; reason: string }): Upload {
  const snapshot = captureSave(save);
  const fingerprint = localHash(snapshot);
  if (!markPending(slot)) throw new Error('Could not record pending upload');
  const lane = laneFor(slot);
  return { slot, snapshot, fingerprint, sequence: ++lane.requested,
    identity: identityGeneration, generation: lane.generation,
    force: !!opts.force, reason: opts.reason, resolve: () => {} };
}

function cancelDebounce(lane: UploadLane): void {
  if (lane.scheduled) clearTimeout(lane.scheduled.timer);
  lane.scheduled = undefined;
}

function cancelledUpload(): PushResult {
  return { ok: false, cancelled: true, error: 'Upload cancelled' };
}

function invalidateUploads(slot: number): void {
  const lane = laneFor(slot);
  lane.generation++;
  cancelDebounce(lane);
  for (const upload of lane.queue.splice(0)) upload.resolve(cancelledUpload());
}

function adoptIdentity(userId: string | undefined): void {
  if (authState.userId === userId) return;
  identityGeneration++;
  for (const slot of uploadLanes.keys()) invalidateUploads(slot);
  authState = { ...authState, userId };
}

function isCurrentUpload(upload: Upload): boolean {
  return upload.identity === identityGeneration && upload.generation === laneFor(upload.slot).generation;
}

async function runLane(lane: UploadLane): Promise<void> {
  if (lane.running) return;
  lane.running = true;
  try {
    while (lane.queue.length) {
      const upload = lane.queue.shift()!;
      upload.resolve(await sendUpload(upload, lane));
    }
  } finally { lane.running = false; }
}

function enqueueUpload(upload: Upload): void {
  const lane = laneFor(upload.slot);
  lane.queue.push(upload);
  void runLane(lane);
}

/** Upload a slot's save. baseHash is the last cloud hash we synced to, so the
 *  server can 409 on divergence. `force` is ONLY passed after an explicit user
 *  choice in the divergence chooser. Never silently overwrites. */
export async function pushSlot(slot: number, save: SaveData, opts: { force?: boolean; reason: string }): Promise<PushResult> {
  if (authState.status !== 'signed-in') return { ok: false, error: 'Not signed in' };
  try {
    const upload = acceptUpload(slot, save, opts);
    cancelDebounce(laneFor(slot));
    return new Promise((resolve) => {
      upload.resolve = resolve;
      enqueueUpload(upload);
    });
  } catch {
    return { ok: false, error: 'Could not prepare upload' };
  }
}

async function sendUpload(upload: Upload, lane: UploadLane): Promise<PushResult> {
  const { slot } = upload;
  try {
    if (!isCurrentUpload(upload)) return cancelledUpload();
    if (authState.status !== 'signed-in') return { ok: false, error: 'Not signed in' };
    const res = await api('PUT', `/api/saves/slots/${slot}`, {
      save: upload.snapshot,
      baseHash: upload.force ? (getCloudBaseHash(slot) ?? undefined) : getCloudBaseHash(slot),
      force: upload.force,
      deviceId: deviceId(),
      reason: upload.reason,
    });
    if (!isCurrentUpload(upload)) return cancelledUpload();
    if (res.networkError) return { ok: false, error: 'Network unavailable' };
    if (res.status === 409) {
      invalidateUploads(slot);
      const d = res.data?.detail || {};
      return { ok: false, conflict: { slot, exists: true, hash: d.remoteHash, serverUpdatedAt: d.serverUpdatedAt, deviceId: d.deviceId, summary: d.remoteSummary } };
    }
    if (res.status !== 200 || !res.data?.ok || typeof res.data.hash !== 'string') {
      return { ok: false, error: typeof res.data?.detail === 'string' ? res.data.detail : 'Upload failed' };
    }
    setSyncedMeta(slot, res.data.hash, upload.fingerprint);
    const persisted = loadFromSlot(slot);
    if (lane.requested === upload.sequence && persisted && localHash(captureSave(persisted)) === upload.fingerprint) {
      localStorage.removeItem(kPending(slot));
    }
    return { ok: true, status: res.data.status };
  } catch {
    return { ok: false, error: 'Could not store or send upload' };
  }
}

// ──── Pull ────

/** Download a slot's cloud save and write it locally, backing up the existing
 *  local slot first. Refuses a save whose version is newer than this client
 *  (forward-only migration) and refuses one that fails sanitization. `reason`
 *  tags the local backup. Does NOT load it into the running game — the caller
 *  decides that. */
export async function pullSlot(slot: number, opts: { reason: string }): Promise<PullResult> {
  if (authState.status !== 'signed-in') return { ok: false, error: 'auth' };
  const identity = identityGeneration;
  const generation = laneFor(slot).generation;
  const res = await api('GET', `/api/saves/slots/${slot}`);
  if (identity !== identityGeneration || generation !== laneFor(slot).generation) return { ok: false, error: 'auth' };
  if (res.networkError) return { ok: false, error: 'network' };
  if (res.status === 401) return { ok: false, error: 'auth' };
  if (res.status !== 200 || !res.data?.exists || !res.data?.save) return { ok: false, error: 'absent' };

  const raw = res.data.save;
  // Version-skew refusal: a forward-only migration ladder cannot safely load a
  // save written by a newer client. Refuse rather than misinterpret fields.
  if (typeof raw?.version === 'number' && raw.version > SAVE_VERSION) {
    return { ok: false, error: 'version-skew' };
  }
  const clean = validateAndSanitizeSave(raw);
  if (!clean) return { ok: false, error: 'invalid' };

  // Back up the local slot BEFORE overwriting it, then write.
  backupSlotBeforeCloudOverwrite(slot, opts.reason);
  saveToSlot(slot, clean);
  invalidateUploads(slot);
  setSyncedMeta(slot, res.data.hash, localHash(clean));
  localStorage.removeItem(kPending(slot));
  return { ok: true, save: clean };
}

// ──── Cloud delete (manual only) ────

export async function deleteCloudSlot(slot: number): Promise<boolean> {
  if (authState.status !== 'signed-in') return false;
  const identity = identityGeneration;
  const generation = laneFor(slot).generation;
  const res = await api('DELETE', `/api/saves/slots/${slot}`);
  if (identity !== identityGeneration || generation !== laneFor(slot).generation) return false;
  if (res.status === 200) {
    invalidateUploads(slot);
    localStorage.removeItem(kCloudHash(slot));
    localStorage.removeItem(kLocalHash(slot));
    localStorage.removeItem(kPending(slot));
    return true;
  }
  return false;
}

// ──── Debounced background push (day-end) ────
//
// Day-end is the game's natural checkpoint, but End Day can fire in bursts, so
// coalesce to one push. A background conflict is NOT auto-resolved: it leaves
// local untouched and stops, so the player resolves it via the Cloud menu's
// chooser next time. A network failure marks the slot pending for flushPending.

export function schedulePush(slot: number, save: SaveData): void {
  if (authState.status !== 'signed-in') return;
  try {
    const upload = acceptUpload(slot, save, { reason: 'day-end' });
    const lane = laneFor(slot);
    cancelDebounce(lane);
    lane.scheduled = { upload, timer: setTimeout(() => {
      lane.scheduled = undefined;
      enqueueUpload(upload);
    }, PUSH_DEBOUNCE_MS) };
  } catch { markPending(slot); }
}

// ──── Pending flush ────

/** Retry any slot marked pending (e.g. a push that failed while offline).
 *  Returns the slots that hit a conflict so the caller can prompt. Safe to
 *  call on an 'online' event or app resume. */
export async function flushPending(): Promise<number[]> {
  if (authState.status !== 'signed-in') return [];
  const identity = identityGeneration;
  const conflicts: number[] = [];
  for (const slot of [1, 2, 3]) {
    if (identity !== identityGeneration) break;
    if (!hasPending(slot)) continue;
    // Distinguish an empty slot from a failed read; only emptiness clears work.
    try {
      if (localStorage.getItem(`clowder_save_slot_${slot}`) === null) {
        localStorage.removeItem(kPending(slot));
        continue;
      }
    } catch { continue; }
    const save = loadFromSlot(slot);
    if (!save) {
      continue;
    }
    const r = await pushSlot(slot, save, { reason: 'day-end' });
    if (r.conflict) conflicts.push(slot);
  }
  return conflicts;
}
