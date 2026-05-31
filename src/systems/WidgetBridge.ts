// Bridge to the iOS Home Screen / Lock Screen widgets.
//
// The native side (ClowderBridgePlugin.swift) writes the snapshot into the
// shared App Group container and asks WidgetKit to refresh. This is iOS-only:
// the plugin isn't registered on Android or web, so every call is guarded and
// silently no-ops elsewhere. Mirror any field change here in
// ClowderBridgePlugin.swift and ClowderWidgetData.swift.

import { registerPlugin } from '@capacitor/core';
import { isIOS } from './NativeFeatures';

export interface ClowderWidgetData {
  guildName: string;
  dayCount: number;
  catCount: number;
  lastPlayed: number; // epoch ms (Date.now())
}

interface ClowderBridgePlugin {
  updateWidgetData(data: ClowderWidgetData): Promise<void>;
}

const ClowderBridge = registerPlugin<ClowderBridgePlugin>('ClowderBridge');

/** The guild's display name — matches the chapter-aware header the Guildhall
 *  scene shows ("Behind the Grain Market" pre-Ch.2, "The Guildhall" after). */
export function guildDisplayName(chapter: number): string {
  return chapter < 2 ? 'Behind the Grain Market' : 'The Guildhall';
}

/** Push the latest guild snapshot to the iOS widgets. No-op off iOS. Errors
 *  are swallowed — a failed widget update must never disrupt day-end. */
export async function updateWidgetData(data: ClowderWidgetData): Promise<void> {
  if (!isIOS()) return;
  try {
    await ClowderBridge.updateWidgetData(data);
  } catch {
    // Widget refresh is best-effort.
  }
}
