// Cloud Save account panel — sign in / create account / status / sign out.
//
// Opened from the in-game Menu (Panels.ts). Auth only; the per-slot
// upload/download/compare controls and the divergence chooser are added in a
// separate, independently-revertible commit (the highest-risk piece).

import { esc } from '../utils/helpers';
import type { SaveData } from '../systems/SaveManager';
import { loadFromSlot } from '../systems/SaveManager';
import { eventBus } from '../utils/events';
import { isNative, exportSaveToFilesystem } from '../systems/NativeFeatures';
import * as Cloud from '../systems/CloudSync';
import type { CloudSlotSummary } from '../systems/CloudSync';

export interface CloudPanelDeps {
  overlayLayer: HTMLElement;
  showToast: (msg: string) => void;
  getGameState: () => SaveData | null;
  saveGame: (s: SaveData) => void;
  setGameState: (s: SaveData | null) => void;
  switchScene: (target: string, data?: object) => void;
  getActiveSlot: () => number;
  reopenMenu: () => void;
}

let deps: CloudPanelDeps;

export function initCloudPanel(d: CloudPanelDeps): void {
  deps = d;
}

const INPUT_STYLE =
  'width:100%;box-sizing:border-box;padding:8px;margin:4px 0;background:#1a1614;' +
  'border:1px solid #3a3530;border-radius:4px;color:#c4956a;font-family:Georgia,serif;font-size:13px';

function removeCloudPanels(): void {
  deps.overlayLayer.querySelectorAll('.cloud-overlay').forEach((el) => el.remove());
}

/** Render the cloud account panel for the current auth state. Re-call to
 *  refresh after any state change. */
export function showCloudPanel(): void {
  removeCloudPanels();
  const state = Cloud.getAuthState();

  const panel = document.createElement('div');
  panel.className = 'menu-overlay cloud-overlay';

  let body: string;
  if (state.status === 'offline') {
    body = `
      <p style="color:#c8a06a;font-size:13px">You're offline. Your game is saved on this device; cloud sync will resume when you reconnect.</p>
      <button class="menu-btn" id="cloud-retry">Retry connection</button>`;
  } else if (state.status === 'signed-in') {
    const verifyLine = state.emailVerified
      ? `<div style="color:#88bb88;font-size:12px;margin:4px 0">Cloud saves are on. Email verified.</div>`
      : `<div style="color:#c8a06a;font-size:12px;margin:4px 0">Verify your email to enable password recovery.</div>
         <button class="menu-btn" id="cloud-resend">Resend verification email</button>`;
    body = `
      <div style="color:#8b7355;font-size:13px;margin-bottom:6px">Signed in as <span style="color:#c4956a">${esc(state.email || '')}</span></div>
      ${verifyLine}
      <div id="cloud-slot-controls"></div>
      <button class="menu-btn" id="cloud-signout">Sign out</button>`;
  } else {
    // signed-out or unknown → show the auth form.
    body = `
      <p style="color:#8b7355;font-size:12px;margin:0 0 8px">Create an account to back up your guild and play it on another device. Your saves stay on this device too.</p>
      <input type="email" id="cloud-email" placeholder="Email" autocomplete="username" style="${INPUT_STYLE}" />
      <input type="password" id="cloud-password" placeholder="Password (8+ characters)" autocomplete="current-password" style="${INPUT_STYLE}" />
      <div id="cloud-auth-error" style="color:#cc6666;font-size:11px;min-height:14px;margin:2px 0"></div>
      <button class="menu-btn" id="cloud-signin">Sign In</button>
      <button class="menu-btn" id="cloud-register">Create Account</button>
      <button class="menu-btn" id="cloud-forgot" style="border:none;color:#6b8ea6;font-size:11px">Forgot password?</button>`;
  }

  panel.innerHTML = `
    <button class="panel-close" id="cloud-close">&times;</button>
    <h2>Cloud Save</h2>
    ${body}
  `;
  deps.overlayLayer.appendChild(panel);

  document.getElementById('cloud-close')!.addEventListener('click', () => {
    removeCloudPanels();
    deps.reopenMenu();
  });

  // --- offline ---
  document.getElementById('cloud-retry')?.addEventListener('click', async () => {
    await Cloud.refreshAuth();
    showCloudPanel();
  });

  // --- signed-in ---
  document.getElementById('cloud-resend')?.addEventListener('click', async () => {
    const r = await Cloud.resendVerification();
    deps.showToast(r.ok ? 'Verification email sent' : (r.error || 'Could not resend'));
  });
  document.getElementById('cloud-signout')?.addEventListener('click', async () => {
    await Cloud.logout();
    deps.showToast('Signed out. Your saves remain on this device.');
    showCloudPanel();
  });

  if (state.status === 'signed-in') {
    renderSlotControls().catch(() => {});
  }

  // --- signed-out / auth form ---
  const emailEl = document.getElementById('cloud-email') as HTMLInputElement | null;
  const pwEl = document.getElementById('cloud-password') as HTMLInputElement | null;
  const errEl = document.getElementById('cloud-auth-error');
  const setErr = (m: string) => { if (errEl) errEl.textContent = m; };

  document.getElementById('cloud-signin')?.addEventListener('click', async () => {
    const r = await Cloud.login((emailEl?.value || '').trim(), pwEl?.value || '');
    if (r.ok) { deps.showToast('Signed in'); showCloudPanel(); }
    else setErr(r.error || 'Sign in failed');
  });
  document.getElementById('cloud-register')?.addEventListener('click', async () => {
    const r = await Cloud.register((emailEl?.value || '').trim(), pwEl?.value || '');
    if (r.ok) { deps.showToast('Account created — cloud saves are on'); showCloudPanel(); }
    else setErr(r.error || 'Could not create account');
  });
  document.getElementById('cloud-forgot')?.addEventListener('click', async () => {
    const email = (emailEl?.value || '').trim();
    if (!email) { setErr('Enter your email first'); return; }
    await Cloud.requestPasswordReset(email);
    deps.showToast('If that email has a verified account, a reset link is on its way.');
  });
}

// ──── Per-slot upload / download / compare ────

function relTime(t: number | string | null | undefined): string {
  if (t == null) return '';
  const ms = typeof t === 'string' ? Date.parse(t) : t;
  if (!Number.isFinite(ms)) return '';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function localSummaryLine(s: SaveData): string {
  return `${esc(s.playerCatName || 'Unnamed')} — Day ${s.day}, Ch.${s.chapter}, ${s.cats.length} cats · played ${relTime(s.lastPlayedTimestamp)}`;
}

function cloudSummaryLine(c: CloudSlotSummary): string {
  const s = c.summary;
  if (!s) return 'Cloud save';
  return `${esc(s.name || 'Unnamed')} — Day ${s.day ?? '?'}, Ch.${s.chapter ?? '?'}, ${s.cats} cats · synced ${relTime(c.serverUpdatedAt)}`;
}

const STATE_LABEL: Record<string, string> = {
  'in-sync': 'In sync with the cloud.',
  'local-only': 'This guild is not backed up yet.',
  'cloud-only': 'A cloud save exists for this slot; nothing on this device.',
  'local-newer': 'This device has changes not yet uploaded.',
  'cloud-newer': 'A newer copy is in the cloud.',
  'diverged': 'This device and the cloud have both changed — choose which to keep.',
  'empty': 'Nothing here yet.',
};

/** Fill #cloud-slot-controls for the active slot. Reads cloud state, classifies
 *  it, and offers explicit Upload / Download / Refresh — routing any divergence
 *  through the chooser rather than overwriting. */
async function renderSlotControls(): Promise<void> {
  const container = document.getElementById('cloud-slot-controls');
  if (!container) return;
  const slot = deps.getActiveSlot();
  const gs = deps.getGameState();
  container.innerHTML = `<div style="color:#8b7355;font-size:12px;margin:6px 0">Checking cloud…</div>`;

  const slots = await Cloud.fetchCloudSlots();
  // The panel may have been closed/re-rendered while we awaited.
  if (!document.getElementById('cloud-slot-controls')) return;
  if (slots === null) {
    container.innerHTML = `<div style="color:#c8a06a;font-size:12px;margin:6px 0">Couldn't reach the cloud. Try again shortly.</div>`;
    return;
  }
  const cloud = slots.find((s) => s.slot === slot);
  const status = Cloud.compareSlot(slot, cloud);
  const canDownload = !!cloud?.exists;

  container.innerHTML = `
    <div style="margin:8px 0;padding:8px 10px;background:rgba(42,37,32,0.5);border-radius:4px;font-size:12px;color:#8b7355">
      <div style="color:#c4956a;margin-bottom:2px">Slot ${slot}</div>
      <div>${STATE_LABEL[status.state] ?? ''}</div>
      ${cloud?.exists ? `<div style="margin-top:4px;font-size:11px;color:#6b8ea6">Cloud: ${cloudSummaryLine(cloud)}</div>` : ''}
    </div>
    <button class="menu-btn" id="cloud-upload">Upload this guild to the cloud</button>
    ${canDownload ? `<button class="menu-btn" id="cloud-download">Download cloud save</button>` : ''}
    <button class="menu-btn" id="cloud-refresh" style="border:none;color:#6b8ea6;font-size:11px">Check for cloud updates</button>
  `;

  document.getElementById('cloud-upload')?.addEventListener('click', () => { if (gs) doUpload(slot, gs); });
  document.getElementById('cloud-download')?.addEventListener('click', () => { if (cloud) doDownload(slot, cloud); });
  document.getElementById('cloud-refresh')?.addEventListener('click', () => { renderSlotControls().catch(() => {}); });
}

async function doUpload(slot: number, gs: SaveData, force = false): Promise<void> {
  deps.saveGame(gs); // persist the live state to the slot before uploading
  const r = await Cloud.pushSlot(slot, gs, { reason: force ? 'conflict-resolution' : 'manual-upload', force });
  if (r.ok) {
    deps.showToast(r.status === 'unchanged' ? 'Already up to date' : 'Uploaded to the cloud');
    renderSlotControls().catch(() => {});
  } else if (r.conflict) {
    showDivergenceChooser(slot, gs, r.conflict);
  } else {
    deps.showToast(r.error || 'Upload failed');
  }
}

async function doDownload(slot: number, cloud: CloudSlotSummary): Promise<void> {
  const status = Cloud.compareSlot(slot, cloud);
  // If the device has its own un-uploaded changes, never silently replace them.
  if (status.state === 'diverged' || status.state === 'local-newer') {
    const local = loadFromSlot(slot);
    if (local) { showDivergenceChooser(slot, local, cloud); return; }
  }
  await applyCloudDownload(slot, 'download');
}

/** Pull the cloud save (backing up local first), then load it into the running
 *  game. Surfaces the version-skew and invalid-save refusals as toasts. */
async function applyCloudDownload(slot: number, reason: string): Promise<void> {
  const r = await Cloud.pullSlot(slot, { reason });
  if (r.ok && r.save) {
    deps.setGameState(r.save);
    eventBus.emit('active-slot', slot);
    eventBus.emit('game-loaded', r.save);
    removeCloudPanels();
    deps.switchScene('GuildhallScene');
    deps.showToast('Cloud save loaded');
    return;
  }
  if (r.error === 'version-skew') deps.showToast('That cloud save is from a newer version of the game. Update first.');
  else if (r.error === 'invalid') deps.showToast('The cloud save could not be read; your local save is unchanged.');
  else if (r.error === 'absent') deps.showToast('No cloud save in this slot.');
  else deps.showToast('Could not download; your local save is unchanged.');
}

/** The conflict resolver. Never auto-resolves: the player explicitly chooses,
 *  and a local .cloudbak backup is written before any overwrite. Per the
 *  Chart35 lesson, "keep this device" is the protective default. */
function showDivergenceChooser(slot: number, localSave: SaveData, cloud: CloudSlotSummary): void {
  removeCloudPanels();
  const modal = document.createElement('div');
  modal.className = 'menu-overlay cloud-overlay';
  modal.innerHTML = `
    <h2>Cloud save conflict</h2>
    <p style="color:#8b7355;font-size:12px">Slot ${slot} changed in two places. Choose what to keep — a local backup is made before anything is replaced.</p>
    <div style="margin:8px 0;padding:8px 10px;background:rgba(42,37,32,0.6);border-left:3px solid #6b8ea6;border-radius:4px;font-size:12px;color:#c4956a">
      <div style="color:#88bb88;margin-bottom:2px">This device</div>${localSummaryLine(localSave)}
    </div>
    <div style="margin:8px 0;padding:8px 10px;background:rgba(42,37,32,0.6);border-left:3px solid #c8a06a;border-radius:4px;font-size:12px;color:#c4956a">
      <div style="color:#c8a06a;margin-bottom:2px">Cloud copy</div>${cloudSummaryLine(cloud)}
    </div>
    <button class="menu-btn" id="conflict-keep-local">Keep this device and upload</button>
    <button class="menu-btn" id="conflict-use-cloud">Use the cloud copy on this device</button>
    <button class="menu-btn" id="conflict-export" style="font-size:11px">Export local backup first</button>
    <button class="menu-btn" id="conflict-cancel" style="border:none;color:#8b7355;font-size:11px">Cancel — keep playing on this device</button>
  `;
  deps.overlayLayer.appendChild(modal);

  document.getElementById('conflict-keep-local')!.addEventListener('click', () => {
    modal.remove();
    doUpload(slot, localSave, true);
  });
  document.getElementById('conflict-use-cloud')!.addEventListener('click', () => {
    modal.remove();
    applyCloudDownload(slot, 'conflict');
  });
  document.getElementById('conflict-export')!.addEventListener('click', () => {
    exportLocalBackup(localSave);
  });
  document.getElementById('conflict-cancel')!.addEventListener('click', () => {
    modal.remove();
    deps.showToast('Kept your local save. Cloud sync is paused for this slot until you choose.');
  });
}

/** Download the local save as a file (web) or hand it to the share sheet
 *  (native) — an escape hatch before a destructive conflict resolution. */
function exportLocalBackup(save: SaveData): void {
  const json = JSON.stringify(save);
  const filename = `clowder-save-day${save.day}.json`;
  if (isNative()) {
    exportSaveToFilesystem(filename, json).then((shared) => {
      deps.showToast(shared ? 'Local backup exported' : 'Backup export cancelled');
    });
    return;
  }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  deps.showToast(`Backup saved as ${filename}`);
}
