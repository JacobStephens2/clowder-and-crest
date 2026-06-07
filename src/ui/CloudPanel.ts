// Cloud Save account panel — sign in / create account / status / sign out.
//
// Opened from the in-game Menu (Panels.ts). Auth only; the per-slot
// upload/download/compare controls and the divergence chooser are added in a
// separate, independently-revertible commit (the highest-risk piece).

import { esc } from '../utils/helpers';
import type { SaveData } from '../systems/SaveManager';
import * as Cloud from '../systems/CloudSync';

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
