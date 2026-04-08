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
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

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

// ──── Filesystem (save export + auto-snapshot) ────
//
// The user's stated concern: "I want to reinstall the game on Android to
// get updates and still have haptics, but I'm worried about losing the
// save." Two parallel flows:
//
//   1. **Auto-snapshot** (writeAutoSnapshot / readAutoSnapshot) — writes
//      a single overwriting file to the app's data directory on every
//      day-end. Used by the title screen's restore prompt on first
//      launch after a reinstall. The Filesystem.Directory.Data location
//      doesn't survive APK uninstall, so this only helps for in-place
//      APK UPDATES, not full uninstall + reinstall flows.
//
//   2. **Manual export via Share sheet** (exportSaveToFilesystem) — for
//      the user-initiated "save this somewhere I can find" case, we
//      write the file to a temporary spot in app cache and immediately
//      open the system share sheet (Drive, Email, Files via SAF, etc.).
//      This bypasses Android 10+'s scoped storage entirely: the user
//      gets to pick where the file goes via the system picker.
//
// Why the share sheet vs. writing to a fixed Documents path: on Android
// 10+, @capacitor/filesystem's Directory.Documents maps to an app-private
// scoped-storage location, NOT the user-visible /storage/emulated/0/
// Documents folder. The save file gets written, but the user can't
// browse to it with the system Files app — it only exists inside the
// app's private sandbox. The Share API sidesteps this by handing the
// file to the user via a system intent the moment it's written; the
// user picks the destination, the OS handles the permission, and the
// file lands somewhere they can actually find.
//
// Reported as: "I can't find the export save file on my phone. Perhaps
// the cloud save feature is worth it"
//
// All flows are no-ops on web. On web the existing <a download> code in
// the menu still works fine because the browser handles downloads.

const AUTO_SNAPSHOT_FILENAME = 'clowder-save-autosnapshot.json';

/** Manual save export via the Android system share sheet. Writes the
 *  save JSON to app cache, gets a content:// URI back, then opens the
 *  share intent so the user can pick where to send it (Drive, email,
 *  Files via SAF, etc.). This sidesteps Android 10+'s scoped storage
 *  hide-the-file problem entirely.
 *
 *  Returns true on successful share, false on failure or web context.
 *  The share sheet itself is the success signal; the player picks the
 *  destination after this returns. */
export async function exportSaveToFilesystem(filename: string, jsonContent: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    // Write to Cache directory — temporary, no permission needed.
    // The Share API only needs the URI to exist long enough for the
    // receiving app to copy it; cache is the right scope.
    const writeResult = await Filesystem.writeFile({
      path: filename,
      data: jsonContent,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });

    if (!writeResult.uri) {
      console.error('exportSaveToFilesystem: write succeeded but no URI returned');
      return false;
    }

    // Open the system share sheet. The user picks where the file goes —
    // Drive, Files (via SAF), email, etc. Android handles the permission
    // grant via the share intent so we don't need MANAGE_EXTERNAL_STORAGE
    // or MediaStore writes.
    await Share.share({
      title: 'Clowder & Crest save',
      text: `Your Clowder & Crest save: ${filename}`,
      url: writeResult.uri,
      dialogTitle: 'Save your Clowder & Crest save file',
    });

    return true;
  } catch (e) {
    // Share.share rejects if the user dismisses the share sheet — that's
    // not a failure, that's just "no thanks". Distinguishing dismissal
    // from real errors isn't critical; the toast in the caller covers
    // both with the same message.
    console.warn('exportSaveToFilesystem ended:', e);
    return false;
  }
}

/** Overwrite the auto-snapshot file in app data with the latest save
 *  JSON. Called on day-end (NOT on every saveGame, which would be too
 *  frequent and laggy on Android). Silent on failure — the autosnapshot
 *  is a belt-and-suspenders backup, not a critical write path.
 *
 *  Stored in Directory.Data (app-private) — survives APK updates but
 *  NOT a full uninstall + reinstall. For uninstall recovery the user
 *  must use the Share-sheet manual export above. */
export async function writeAutoSnapshot(jsonContent: string): Promise<void> {
  if (!isNative()) return;
  try {
    await Filesystem.writeFile({
      path: AUTO_SNAPSHOT_FILENAME,
      data: jsonContent,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true,
    });
  } catch {
    // Silent — autosnapshot is best-effort
  }
}

/** Read the auto-snapshot file from app data if it exists. Returns the
 *  raw JSON string, or null if missing/unreadable. Used at startup to
 *  detect a recoverable save after an APK update.
 *
 *  Tries Directory.Data first (the new location). For compatibility
 *  with the v2.4.0 export that wrote to Directory.Documents, falls
 *  back to that path on miss so older snapshots still get recovered. */
export async function readAutoSnapshot(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const result = await Filesystem.readFile({
      path: AUTO_SNAPSHOT_FILENAME,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    if (typeof result.data === 'string') return result.data;
  } catch {
    // Fall through to legacy Documents location below
  }
  try {
    const legacy = await Filesystem.readFile({
      path: AUTO_SNAPSHOT_FILENAME,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    if (typeof legacy.data === 'string') return legacy.data;
    return null;
  } catch {
    return null;
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
