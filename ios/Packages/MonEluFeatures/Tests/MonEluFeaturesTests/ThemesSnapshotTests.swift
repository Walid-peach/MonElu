import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// The theme page in light and dark, at the default and an accessibility
/// text size (#485), from a response recorded from the production API and
/// trimmed to five groups and two scrutins.
@MainActor
@Suite(.snapshots(record: .missing))
struct ThemesSnapshotTests {
    static let configuration = AppConfiguration(
        minIOSVersion: "1.0.0", features: .init(chat: true, verify: true), dataHorizon: "2025-07-01", caveats: []
    )

    @Test(arguments: Variant.all)
    func themePage(_ variant: Variant) async throws {
        let theme = try await ThemesTests.page()
        checkSnapshot(
            NavigationStack {
                ScrollView { ThemeContent(theme: theme, configuration: Self.configuration).padding(.vertical, 16) }
                    .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 3600 : 1250
        )
    }
}
