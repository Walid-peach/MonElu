import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// The group page in light and dark, at the default and an accessibility
/// text size (#484), from a response recorded from the production API and
/// trimmed to three members.
@MainActor
@Suite(.snapshots(record: .missing))
struct GroupsSnapshotTests {
    static let configuration = AppConfiguration(
        minIOSVersion: "1.0.0",
        features: .init(chat: true, verify: true),
        dataHorizon: "2025-07-01",
        caveats: [
            .init(id: "presence_rate", text: "Le taux de présence compte le `nonVotant` comme présent, et son dénominateur est limité aux scrutins tenus pendant le mandat du député - un député élu en cours de législature n'est pas pénalisé pour les votes antérieurs."),
        ]
    )

    @Test(arguments: Variant.all)
    func groupPage(_ variant: Variant) async throws {
        let group = try await GroupsTests.page()
        checkSnapshot(
            NavigationStack {
                ScrollView { GroupContent(group: group, configuration: Self.configuration).padding(.vertical, 16) }
                    .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 3300 : 1120
        )
    }
}
