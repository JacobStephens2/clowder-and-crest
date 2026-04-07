// Unified facade for Capacitor native plugins.
//
// All entry points are safe to call on web — they detect the runtime via
// Capacitor.isNativePlatform() and silently no-op when not running inside the
// Android wrapper. This lets game code call e.g. `haptic.medium()` without
// caring whether we're on a phone or in a browser tab.
//
// Plugin packages used here:
//   @capacitor/haptics              — vibration / taptic feedback
//   @capacitor/local-notifications  — scheduled return reminders
//   @capacitor/app                  — pause/resume lifecycle, back button
//   @capacitor/status-bar           — match the dark game theme on Android

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App, type AppState } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

const RETURN_NOTIFICATION_ID = 1001;
const HAPTICS_PREF_KEY = 'clowder_haptics_enabled';

let hapticsEnabled = localStorage.getItem(HAPTICS_PREF_KEY) !== '0';

/** Whether we're running inside the Capacitor Android wrapper. */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
  localStorage.setItem(HAPTICS_PREF_KEY, enabled ? '1' : '0');
}

export function areHapticsEnabled(): boolean {
  return hapticsEnabled;
}

// ──── Haptics ────
//
// Three impact levels (light/medium/heavy) for physical "thud" feedback,
// plus a notification family (success/warning/error) for outcome-shaped
// patterns. `tap()` is the default UI press feedback.

function safeImpact(style: ImpactStyle): void {
  if (!hapticsEnabled || !isNative()) return;
  Haptics.impact({ style }).catch(() => {});
}

function safeNotification(type: NotificationType): void {
  if (!hapticsEnabled || !isNative()) return;
  Haptics.notification({ type }).catch(() => {});
}

export const haptic = {
  /** UI tap — single short pulse for buttons, menus, taps. */
  tap(): void {
    if (!hapticsEnabled || !isNative()) return;
    Haptics.selectionStart()
      .then(() => Haptics.selectionChanged())
      .then(() => Haptics.selectionEnd())
      .catch(() => {});
  },
  /** Light impact — block snap, tumbler set, soft landing. */
  light(): void { safeImpact(ImpactStyle.Light); },
  /** Medium impact — kill, launch, fish bite, push. */
  medium(): void { safeImpact(ImpactStyle.Medium); },
  /** Heavy impact — boss hit, ability burst, hit-stop moments. */
  heavy(): void { safeImpact(ImpactStyle.Heavy); },
  /** Success outcome — perfect clear, lock open, run complete. */
  success(): void { safeNotification(NotificationType.Success); },
  /** Warning outcome — spotted, near-miss, poison rat. */
  warning(): void { safeNotification(NotificationType.Warning); },
  /** Error outcome — caught, fail, dog catches cat. */
  error(): void { safeNotification(NotificationType.Error); },
  /** Custom-duration vibration in milliseconds. */
  vibrate(ms: number): void {
    if (!hapticsEnabled || !isNative()) return;
    Haptics.vibrate({ duration: ms }).catch(() => {});
  },
};

// ──── Local Notifications ────

let notificationsReady = false;
let notificationPermissionRequested = false;

async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === 'granted') return true;
    if (notificationPermissionRequested) return false;
    notificationPermissionRequested = true;
    const req = await LocalNotifications.requestPermissions();
    return req.display === 'granted';
  } catch {
    return false;
  }
}

/**
 * Schedule (or replace) the daily "your cats are waiting" reminder.
 *
 * Always cancels any existing scheduled reminder first, so calling this every
 * time the player ends a day will never cause notifications to stack.
 *
 * @param catName  Player's Wildcat name, used in the body text.
 * @param hoursAhead  When to fire — defaults to 16h, a comfortable next-day window.
 */
export async function scheduleDailyReturnNotification(catName: string, hoursAhead: number = 16): Promise<void> {
  if (!isNative()) return;
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  try {
    // Cancel any pending return reminder before scheduling the new one.
    await LocalNotifications.cancel({ notifications: [{ id: RETURN_NOTIFICATION_ID }] }).catch(() => {});
    const fireAt = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
    const safeName = catName?.trim() || 'your guild';
    await LocalNotifications.schedule({
      notifications: [{
        id: RETURN_NOTIFICATION_ID,
        title: 'The guildhall is quiet…',
        body: `${safeName} and the clowder are waiting for you to return.`,
        schedule: { at: fireAt, allowWhileIdle: true },
        smallIcon: 'ic_stat_icon_config_sample',
      }],
    });
    notificationsReady = true;
  } catch {
    // Permission denied or plugin error — silent.
  }
}

/** Cancel any pending return reminder. Called when starting a new session. */
export async function cancelReturnNotification(): Promise<void> {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: RETURN_NOTIFICATION_ID }] });
  } catch {
    // No-op
  }
}

export function notificationsScheduled(): boolean {
  return notificationsReady;
}

// ──── App Lifecycle ────
//
// When the Android user swipes the app away or hits home, we want to:
//   1. Persist the save (the page-visibility listener already handles this)
//   2. Pause the day timer so the day doesn't drain in the background
//   3. Pause music so we don't keep playing audio off-screen
//
// On resume we restore both. This avoids the "I left the app, came back, and
// my whole day was gone" failure mode.

export interface LifecycleHooks {
  onPause?: () => void;
  onResume?: () => void;
  onBackButton?: () => void;
}

export function registerAppLifecycle(hooks: LifecycleHooks): void {
  if (!isNative()) return;
  try {
    App.addListener('appStateChange', (state: AppState) => {
      if (state.isActive) {
        hooks.onResume?.();
      } else {
        hooks.onPause?.();
      }
    });
    if (hooks.onBackButton) {
      App.addListener('backButton', () => {
        hooks.onBackButton?.();
      });
    }
  } catch {
    // No-op
  }
}

// ──── Status Bar ────

export async function setupStatusBar(): Promise<void> {
  if (!isNative()) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#1c1b19' });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    // No-op
  }
}

// ──── Boot ────

/**
 * One-shot init called once at app startup. Sets up the status bar and
 * pre-warms notification permissions so the first day-end can schedule a
 * reminder without a permission popup mid-flow.
 */
export async function initNative(): Promise<void> {
  if (!isNative()) return;
  await setupStatusBar();
  // Fire-and-forget the permission prompt — non-blocking.
  ensureNotificationPermission().catch(() => {});
}
