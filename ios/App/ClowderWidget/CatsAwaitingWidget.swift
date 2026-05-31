import WidgetKit
import SwiftUI

// MARK: - Timeline

struct ClowderEntry: TimelineEntry {
    let date: Date
    let data: ClowderWidgetData
}

struct ClowderProvider: TimelineProvider {
    func placeholder(in context: Context) -> ClowderEntry {
        ClowderEntry(date: Date(), data: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (ClowderEntry) -> Void) {
        completion(ClowderEntry(date: Date(), data: .load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ClowderEntry>) -> Void) {
        // The game pushes fresh data + reloadAllTimelines() at day-end, so the
        // timeline mostly updates on demand. This 6-hour cadence is just a
        // fallback so "days since last played" keeps creeping up if the player
        // walks away for a while.
        let entry = ClowderEntry(date: Date(), data: .load())
        let next = Calendar.current.date(byAdding: .hour, value: 6, to: Date()) ?? Date().addingTimeInterval(6 * 3600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Palette (matches the game's warm parchment + crest gold)

enum ClowderPalette {
    static let background = Color(red: 0x1c / 255, green: 0x1b / 255, blue: 0x19 / 255)
    static let gold = Color(red: 0xC9 / 255, green: 0xA8 / 255, blue: 0x4C / 255)
    static let parchment = Color(red: 0xc4 / 255, green: 0x95 / 255, blue: 0x6a / 255)
}

// MARK: - Cats Awaiting widget (Home Screen small + medium)

struct CatsAwaitingWidget: Widget {
    let kind = "CatsAwaitingWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ClowderProvider()) { entry in
            CatsAwaitingView(entry: entry)
                .widgetURL(URL(string: "clowderandcrest://open"))
                .containerBackground(ClowderPalette.background, for: .widget)
        }
        .configurationDisplayName("Your Cats Await")
        .description("See your guild and how long since your clowder last saw you.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct CatsAwaitingView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ClowderEntry

    private var awayLine: String {
        let days = entry.data.daysSinceLastPlayed
        switch days {
        case 0: return "Your guild awaits"
        case 1: return "Away 1 day"
        default: return "Away \(days) days"
        }
    }

    var body: some View {
        switch family {
        case .systemMedium: mediumBody
        default: smallBody
        }
    }

    private var smallBody: some View {
        VStack(alignment: .leading, spacing: 6) {
            CrestMark(size: 28)
            Spacer(minLength: 0)
            Text("Day \(entry.data.dayCount)")
                .font(.system(.title2, design: .serif).weight(.bold))
                .foregroundStyle(ClowderPalette.gold)
            Text(awayLine)
                .font(.system(.caption, design: .serif))
                .foregroundStyle(ClowderPalette.parchment)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var mediumBody: some View {
        HStack(spacing: 14) {
            CrestMark(size: 52)
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.data.guildName)
                    .font(.system(.headline, design: .serif).weight(.bold))
                    .foregroundStyle(ClowderPalette.gold)
                    .lineLimit(1)
                Text("Day \(entry.data.dayCount) · \(entry.data.catCount) \(entry.data.catCount == 1 ? "cat" : "cats")")
                    .font(.system(.subheadline, design: .serif))
                    .foregroundStyle(ClowderPalette.parchment)
                Spacer(minLength: 0)
                Text(awayLine)
                    .font(.system(.caption, design: .serif))
                    .foregroundStyle(ClowderPalette.parchment.opacity(0.8))
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

// MARK: - Crest mark
//
// A lightweight vector stand-in for the crest emblem so the widget has no
// asset dependency on the game bundle. Reads as a gold shield with a cat.

struct CrestMark: View {
    let size: CGFloat

    var body: some View {
        ZStack {
            Shield()
                .fill(Color(red: 0x6b / 255, green: 0x12 / 255, blue: 0x12 / 255))
            Shield()
                .stroke(ClowderPalette.gold, lineWidth: max(1.5, size * 0.06))
            Image(systemName: "cat.fill")
                .resizable()
                .scaledToFit()
                .padding(size * 0.22)
                .foregroundStyle(.black.opacity(0.85))
        }
        .frame(width: size, height: size)
    }
}

private struct Shield: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let w = rect.width, h = rect.height
        p.move(to: CGPoint(x: rect.minX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + h * 0.62))
        p.addQuadCurve(
            to: CGPoint(x: rect.midX, y: rect.maxY),
            control: CGPoint(x: rect.maxX, y: rect.minY + h * 0.9))
        p.addQuadCurve(
            to: CGPoint(x: rect.minX, y: rect.minY + h * 0.62),
            control: CGPoint(x: rect.minX, y: rect.minY + h * 0.9))
        p.closeSubpath()
        _ = w
        return p
    }
}
