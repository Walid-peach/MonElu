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
    var selection: AppTab = .home
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

    #if DEBUG
    /// A link passed at launch as `MonEluOpenURL <link>`, for Maestro flows
    /// (`ios/maestro/routes.yaml`). They cannot rely on `openLink`: iOS may or
    /// may not put an "Open in MonÉlu?" prompt in front of a custom-scheme
    /// link, and whether tapping it delivers the link varied between machines.
    /// Debug builds only; the link goes through the same `open(url:)` as
    /// `onOpenURL`.
    static func launchLink(arguments: [String] = ProcessInfo.processInfo.arguments) -> URL? {
        guard let index = arguments.firstIndex(where: { $0 == "MonEluOpenURL" || $0 == "-MonEluOpenURL" }),
              arguments.indices.contains(index + 1)
        else { return nil }
        return URL(string: arguments[index + 1])
    }
    #endif

    func path(for tab: AppTab) -> Binding<[AppRoute]> {
        Binding(get: { self.paths[tab] ?? [] }, set: { self.paths[tab] = $0 })
    }
}
