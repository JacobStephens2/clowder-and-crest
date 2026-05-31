import Foundation
import Capacitor
import WidgetKit

// Local Capacitor plugin that bridges the web game to the iOS Home Screen /
// Lock Screen widgets. The game calls `ClowderBridge.updateWidgetData(...)`
// at day-end; we persist a JSON snapshot into the shared App Group container
// (the same id + key the widget reads in ClowderWidgetData) and ask WidgetKit
// to refresh. Registered in ClowderBridgeViewController.capacitorDidLoad().
@objc(ClowderBridgePlugin)
public class ClowderBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ClowderBridgePlugin"
    public let jsName = "ClowderBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateWidgetData", returnType: CAPPluginReturnPromise)
    ]

    private let appGroupID = "group.page.stephens.clowder"
    private let storageKey = "clowderWidgetData"

    @objc func updateWidgetData(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: appGroupID) else {
            call.reject("App Group \(appGroupID) is unavailable")
            return
        }

        // Build the snapshot from whatever the web layer passed, with safe
        // fallbacks so a partial call never wipes a good widget.
        let payload: [String: Any] = [
            "guildName": call.getString("guildName") ?? "Your Guild",
            "dayCount": call.getInt("dayCount") ?? 1,
            "catCount": call.getInt("catCount") ?? 1,
            // JS sends epoch milliseconds (Date.now()). Default to "now".
            "lastPlayed": call.getDouble("lastPlayed") ?? (Date().timeIntervalSince1970 * 1000)
        ]

        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
            call.reject("Failed to encode widget data")
            return
        }

        defaults.set(json, forKey: storageKey)

        // Reload the timelines so the new day count shows immediately.
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }

        call.resolve()
    }
}
