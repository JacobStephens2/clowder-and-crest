import Foundation

// Shared shape of the data the game writes into the App Group container.
//
// The Capacitor web layer calls ClowderBridge.updateWidgetData(...) at day-end;
// the native ClowderBridgePlugin encodes this struct as JSON into
// UserDefaults(suiteName: appGroupID) under `storageKey`, then reloads the
// widget timelines. The widget reads it back here. Both sides agree on the
// same App Group id and key — keep them in sync with ClowderBridgePlugin.swift.
struct ClowderWidgetData: Codable {
    var guildName: String
    var dayCount: Int
    var catCount: Int
    var lastPlayed: Double   // epoch milliseconds (matches JS Date.now())

    static let appGroupID = "group.page.stephens.clowder"
    static let storageKey = "clowderWidgetData"

    /// A friendly placeholder used before the player has ever ended a day
    /// (fresh install, or the widget added before first launch).
    static let placeholder = ClowderWidgetData(
        guildName: "Your Guild",
        dayCount: 1,
        catCount: 1,
        lastPlayed: 0
    )

    /// Read the latest snapshot the game wrote, or the placeholder if none.
    static func load() -> ClowderWidgetData {
        guard
            let defaults = UserDefaults(suiteName: appGroupID),
            let raw = defaults.string(forKey: storageKey),
            let data = raw.data(using: .utf8),
            let decoded = try? JSONDecoder().decode(ClowderWidgetData.self, from: data)
        else {
            return placeholder
        }
        return decoded
    }

    /// Whole days since the guild was last played, clamped at 0.
    var daysSinceLastPlayed: Int {
        guard lastPlayed > 0 else { return 0 }
        let lastDate = Date(timeIntervalSince1970: lastPlayed / 1000.0)
        let seconds = Date().timeIntervalSince(lastDate)
        return max(0, Int(seconds / 86_400))
    }
}
