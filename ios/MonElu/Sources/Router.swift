import MonEluCore
import Observation
import SwiftUI

/// Which tab is showing and what is pushed on each tab's stack (#459).
///
/// Every navigation to a deputy or a vote goes through `open`, whether it
/// comes from a tap in another tab or a link, so universal links need only
/// call `open(url:)` once the domain exists (#432).
@MainActor
@Observable
final class Router {
    var selection: AppTab = .myDeputy
    var paths: [AppTab: [AppRoute]] = [:]

    /// Shows `route` in its own tab, on top of whatever that tab had open.
    /// Opening the screen that is already on top does not stack it twice.
    func open(_ route: AppRoute) {
        selection = route.tab
        guard paths[route.tab]?.last != route else { return }
        paths[route.tab, default: []].append(route)
    }

    /// Opens a `monelu://` or website link; false when it names no screen.
    @discardableResult
    func open(url: URL) -> Bool {
        guard let route = AppRoute(url: url) else { return false }
        open(route)
        return true
    }

    func path(for tab: AppTab) -> Binding<[AppRoute]> {
        Binding(get: { self.paths[tab] ?? [] }, set: { self.paths[tab] = $0 })
    }
}
