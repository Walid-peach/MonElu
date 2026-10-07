import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// Réglages (#494): the appearance preference and the data horizon, and the
/// screen in light and dark at the default and an accessibility text size.
@MainActor
@Suite(.snapshots(record: .missing))
struct SettingsTests {
    static let configuration = AppConfiguration(
        minIOSVersion: "1.0.0",
        features: .init(chat: true, verify: true),
        dataHorizon: "2025-07-01",
        caveats: [],
        siteURL: "https://monelu.fr"
    )

    @Test func eachAppearanceMapsToItsInterfaceStyle() {
        #expect(AppearancePreference.system.interfaceStyle == .unspecified)
        #expect(AppearancePreference.light.interfaceStyle == .light)
        #expect(AppearancePreference.dark.interfaceStyle == .dark)
        #expect(AppearancePreference(rawValue: "dark") == .dark)
    }

    /// The horizon is the configuration's, formatted; a malformed one is left out.
    @Test func theHorizonComesFromTheConfiguration() {
        #expect(SettingsContent.horizon("2025-07-01") == "1 juil. 2025")
        #expect(SettingsContent.horizon("pas une date") == nil)
    }

    @Test(arguments: Variant.all)
    func settings(_ variant: Variant) {
        checkSnapshot(
            NavigationStack {
                SettingsContent(
                    appearance: .constant(.system), configuration: Self.configuration, version: "1.0 (42)"
                )
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 2600 : 900
        )
    }
}
