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
    /// The week's agenda section.
    @Test(arguments: Variant.all)
    func homeWeekAgenda(_ variant: Variant) async throws {
        let agenda = try await LiveAgendaService(client: stubClient(try fixture("agenda_week")))
            .week(from: "2026-09-28", to: "2026-10-04").days.flatMap(\.items)
        checkSnapshot(
            NavigationStack { lower { HomeAgendaSection(entries: agenda) } },
            variant,
            height: variant.size.isAccessibilityCategory ? 2400 : 300
        )
    }

    private func lower<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) { content() }.padding(16)
        }
        .background(Palette.pageBackground)
    }

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

    /// The week with no séance.
    @Test(arguments: Variant.all)
    func agendaEmpty(_ variant: Variant) {
        checkSnapshot(NavigationStack { HomeAgendaSection(entries: []).padding(16) }, variant, height: 200)
    }
}
