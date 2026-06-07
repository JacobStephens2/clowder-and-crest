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
  const res = await api('GET', '/api/auth/me');
  if (res.networkError) {
    // Keep the last-known identity but mark transport down.
    setState({ status: authState.email ? 'offline' : 'signed-out' });
    return authState;
  }
  if (res.status === 200 && res.data?.user) {
    localStorage.setItem(K_EMAIL, res.data.user.email);
    setState({ status: 'signed-in', email: res.data.user.email, emailVerified: !!res.data.user.emailVerified, lastError: undefined });
  } else {
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

// ──── Slot metadata ────

function getCloudBaseHash(slot: number): string | null { return localStorage.getItem(kCloudHash(slot)); }
function setSyncedMeta(slot: number, cloudHash: string, save: SaveData): void {
  localStorage.setItem(kCloudHash(slot), cloudHash);
  localStorage.setItem(kLocalHash(slot), localHash(save));
  localStorage.removeItem(kPending(slot));
}
export function markPending(slot: number): void { localStorage.setItem(kPending(slot), '1'); }
export function hasPending(slot: number): boolean { return localStorage.getItem(kPending(slot)) === '1'; }

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

/** Upload a slot's save. baseHash is the last cloud hash we synced to, so the
 *  server can 409 on divergence. `force` is ONLY passed after an explicit user
 *  choice in the divergence chooser. Never silently overwrites. */
export async function pushSlot(slot: number, save: SaveData, opts: { force?: boolean; reason: string }): Promise<PushResult> {
  if (authState.status !== 'signed-in') return { ok: false, error: 'Not signed in' };
  const res = await api('PUT', `/api/saves/slots/${slot}`, {
    save,
    baseHash: opts.force ? (getCloudBaseHash(slot) ?? undefined) : getCloudBaseHash(slot),
    force: !!opts.force,
    deviceId: deviceId(),
    reason: opts.reason,
  });
  if (res.networkError) { markPending(slot); return { ok: false, error: 'Network unavailable' }; }
  if (res.status === 409) {
    const d = res.data?.detail || {};
    return { ok: false, conflict: { slot, exists: true, hash: d.remoteHash, serverUpdatedAt: d.serverUpdatedAt, deviceId: d.deviceId, summary: d.remoteSummary } };
  }
  if (res.status !== 200 || !res.data?.ok) {
    return { ok: false, error: typeof res.data?.detail === 'string' ? res.data.detail : 'Upload failed' };
  }
  setSyncedMeta(slot, res.data.hash, save);
  return { ok: true, status: res.data.status };
}

// ──── Pull ────

/** Download a slot's cloud save and write it locally, backing up the existing
 *  local slot first. Refuses a save whose version is newer than this client
 *  (forward-only migration) and refuses one that fails sanitization. `reason`
 *  tags the local backup. Does NOT load it into the running game — the caller
 *  decides that. */
export async function pullSlot(slot: number, opts: { reason: string }): Promise<PullResult> {
  if (authState.status !== 'signed-in') return { ok: false, error: 'auth' };
  const res = await api('GET', `/api/saves/slots/${slot}`);
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
  setSyncedMeta(slot, res.data.hash, clean);
  return { ok: true, save: clean };
}

// ──── Cloud delete (manual only) ────

export async function deleteCloudSlot(slot: number): Promise<boolean> {
  if (authState.status !== 'signed-in') return false;
  const res = await api('DELETE', `/api/saves/slots/${slot}`);
  if (res.status === 200) {
    localStorage.removeItem(kCloudHash(slot));
    localStorage.removeItem(kLocalHash(slot));
    return true;
  }
  return false;
}

// ──── Pending flush ────

/** Retry any slot marked pending (e.g. a push that failed while offline).
 *  Returns the slots that hit a conflict so the caller can prompt. Safe to
 *  call on an 'online' event or app resume. */
export async function flushPending(getLocalSave: (slot: number) => SaveData | null): Promise<number[]> {
  if (authState.status !== 'signed-in') return [];
  const conflicts: number[] = [];
  for (const slot of [1, 2, 3]) {
    if (!hasPending(slot)) continue;
    const save = getLocalSave(slot);
    if (!save) { localStorage.removeItem(kPending(slot)); continue; }
    const r = await pushSlot(slot, save, { reason: 'day-end' });
    if (r.conflict) conflicts.push(slot);
  }
  return conflicts;
}
