import MonEluCore
import SwiftUI

/// Switches the selected tab, for a screen inviting the user into another
/// section (Accueil's "Une question sur ses votes ?" and quiz invitation,
/// #477). The app's root view sets it from its router; feature packages never
/// see the router itself.
public struct OpenTabAction: Sendable {
    private let action: @MainActor @Sendable (AppTab) -> Void

    public init(_ action: @escaping @MainActor @Sendable (AppTab) -> Void) {
        self.action = action
    }

    @MainActor public func callAsFunction(_ tab: AppTab) {
        action(tab)
    }
}

extension EnvironmentValues {
    /// Does nothing outside the app's root view (previews, snapshot tests).
    @Entry public var openTab = OpenTabAction { _ in }
}
