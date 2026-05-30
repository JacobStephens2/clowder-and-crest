import WidgetKit
import SwiftUI

@main
struct ClowderWidgetBundle: WidgetBundle {
    var body: some Widget {
        CatsAwaitingWidget()
        GuildStatusWidget()
    }
}
