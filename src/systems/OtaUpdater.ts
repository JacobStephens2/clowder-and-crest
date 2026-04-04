/**
 * Over-the-air update system using @capgo/capacitor-updater.
 *
 * On app launch:
 *   1. Checks https://clowder.stephens.page/updates/manifest.json
 *   2. If a newer version exists, downloads the zip bundle in the background
 *   3. Applies the update on next app restart (or immediately if the user is on the title screen)
 *
 * The manifest.json format:
 *   { "version": "1.0.1", "url": "https://clowder.stephens.page/updates/1.0.1.zip" }
 *
 * To publish an update:
 *   npm run build
 *   npm run ota:publish
 */

const MANIFEST_URL = 'https://clowder.stephens.page/updates/manifest.json';
const CURRENT_VERSION = __APP_VERSION__;

interface UpdateManifest {
  version: string;
  url: string;
}

export async function checkForUpdates(): Promise<void> {
  // Only run in a Capacitor native context
  if (!(window as any).Capacitor?.isNativePlatform()) return;

  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');

    // Notify the plugin that the current bundle is working fine
    // (prevents auto-rollback if a previous update had issues)
    await CapacitorUpdater.notifyAppReady();

    // Fetch the manifest
    const resp = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!resp.ok) return;

    const manifest: UpdateManifest = await resp.json();

    // Compare versions — simple string comparison works for semver
    if (manifest.version === CURRENT_VERSION) return;
    if (!isNewer(manifest.version, CURRENT_VERSION)) return;

    console.log(`[OTA] Update available: ${CURRENT_VERSION} → ${manifest.version}`);

    // Download the bundle in the background
    const bundle = await CapacitorUpdater.download({
      url: manifest.url,
      version: manifest.version,
    });

    console.log(`[OTA] Bundle downloaded: ${bundle.version}`);

    // Apply the update immediately
    await CapacitorUpdater.set({ id: bundle.id });

    console.log(`[OTA] Update applied`);
  } catch (err) {
    // Silent fail — OTA is best-effort, the app works fine without it
    console.warn('[OTA] Update check failed:', err);
  }
}

function isNewer(remote: string, local: string): boolean {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] ?? 0;
    const lv = l[i] ?? 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}
