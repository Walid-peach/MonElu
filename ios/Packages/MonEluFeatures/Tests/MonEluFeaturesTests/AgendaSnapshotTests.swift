import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// The agenda in light and dark, at the default and an accessibility text
/// size (#483), from a week recorded from the production API.
@MainActor
@Suite(.snapshots(record: .missing))
struct AgendaSnapshotTests {
    /// The three links a point can have: none, its scrutin, the AN dossier.
    @Test(arguments: Variant.all)
    func agendaWeek(_ variant: Variant) async throws {
        let week = try await AgendaTests.week()
        checkSnapshot(
            NavigationStack {
                ScrollView { AgendaWeekContent(week: week, theme: .constant(nil)).padding(.vertical, 8) }
                    .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 3000 : 960
        )
    }

    /// A point whose bill has a page in the app (#511): a chevron, like a
    /// scrutin, rather than the AN link's outward arrow.
    @Test(arguments: Variant.all)
    func agendaEntryOpeningTheBill(_ variant: Variant) async throws {
        let entry = try await AgendaTests.week().days[1].items[0]
        let withPage = AgendaEntry(
            id: entry.id, start: entry.start, pointType: entry.pointType, summary: entry.summary,
            objet: entry.objet, theme: entry.theme, voteID: nil, result: nil, dossierURL: entry.dossierURL,
            dossierTitle: entry.dossierTitle, loiID: "DLR5L17N54777"
        )
        checkSnapshot(
            NavigationStack {
                AgendaEntryLink(entry: withPage).padding(16).background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 700 : 200
        )
    }

    @Test(arguments: Variant.all)
    func agendaFilteredByTheme(_ variant: Variant) async throws {
        let week = try await AgendaTests.week()
        checkSnapshot(
            NavigationStack {
                ScrollView { AgendaWeekContent(week: week, theme: .constant("Institutions")).padding(.vertical, 8) }
                    .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 1500 : 480
        )
    }

    @Test(arguments: Variant.all)
    func agendaWeekSwitcher(_ variant: Variant) throws {
        let now = try #require(ISO8601DateFormatter().date(from: "2026-10-06T10:00:00Z"))
        checkSnapshot(
            VStack(spacing: 12) {
                AgendaWeekSwitcher(window: AgendaWindow(offset: 0, now: now)) { _ in }
                AgendaWeekSwitcher(window: AgendaWindow(offset: -2, now: now)) { _ in }
            }
            .padding(16),
            variant
        )
    }
}
