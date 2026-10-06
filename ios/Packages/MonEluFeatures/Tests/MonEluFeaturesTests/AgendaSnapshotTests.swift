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
