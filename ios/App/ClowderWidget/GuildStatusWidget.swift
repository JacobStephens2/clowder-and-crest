import WidgetKit
import SwiftUI

// Lock Screen widget — glanceable day count + guild name.
// Lock Screen families render monochrome/tinted, so these views stay shape-
// and text-only and let the system handle colouring (no custom fills).

struct GuildStatusWidget: Widget {
    let kind = "GuildStatusWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ClowderProvider()) { entry in
            GuildStatusView(entry: entry)
                .widgetURL(URL(string: "clowderandcrest://open"))
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Guild Status")
        .description("Your guild name and day count on the Lock Screen.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct GuildStatusView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ClowderEntry

    var body: some View {
        switch family {
        case .accessoryInline:
            Label("Day \(entry.data.dayCount) · \(entry.data.catCount) cats", systemImage: "pawprint.fill")

        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.data.guildName)
                    .font(.headline)
                    .lineLimit(1)
                Text("Day \(entry.data.dayCount) · \(entry.data.catCount) \(entry.data.catCount == 1 ? "cat" : "cats")")
                    .font(.caption)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

        default: // .accessoryCircular
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: -2) {
                    Image(systemName: "cat.fill")
                        .font(.system(size: 13))
                    Text("\(entry.data.dayCount)")
                        .font(.system(.title3, design: .rounded).weight(.bold))
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                }
            }
        }
    }
}
