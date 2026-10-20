import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// Accueil in light and dark, at the default and an
/// accessibility text size (#477), from responses recorded from the
/// production API. Views holding links sit in a stack, as in the app.
@MainActor
@Suite(.snapshots(record: .missing))
struct HomeSnapshotTests {
    /// A first visit with nothing followed (#575): the feed's header with
    /// only « + Suivre » in the follows row, and « Pour vous » empty with its
    /// follow prompt (ADR-042 §4), as `HomeScreen` lays them out.
    @Test(arguments: Variant.all)
    func homeFollowsNothing(_ variant: Variant) {
        let empty = FeedPage(weekStart: "2026-10-12", weekEnd: "2026-10-18", noSitting: false, entries: [])
        let view = NavigationStack {
            FeedPageView(state: .loaded(FeedScreen(page: empty)), tab: .pourVous, followsNothing: true) {
                HomeTagline()
                    .padding(.horizontal, 16)
                FollowsRow(circles: [], filter: .constant(.all), onAdd: {})
                Picker("Fil", selection: .constant(FeedTab.pourVous)) {
                    ForEach(FeedTab.allCases, id: \.self) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
            }
        }
        checkSnapshot(view, variant, height: variant.size.isAccessibilityCategory ? 2600 : 900)
    }
}
