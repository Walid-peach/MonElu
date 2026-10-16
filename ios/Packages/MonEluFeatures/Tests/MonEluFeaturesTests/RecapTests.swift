import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// The recap card's week (#566): counted by the API, read as sentences, with
/// `nonVotant` kept apart from the abstentions.
struct RecapTests {
    func week() async throws -> FeedWeek {
        try await LiveFeedService(client: stubClient(try fixture("feed_week"))).week(deputyID: "PA1008")
    }

    @Test func mapsTheWeekAsTheAPICountedIt() async throws {
        let week = try await week()
        #expect(week.deputy == FeedWeekDeputy(cast: 23, pour: 14, contre: 3, abstention: 6, nonVotant: 2))
        #expect((week.lawsAdopted, week.motionsRejected, week.scrutins) == (1, 1, 87))
        #expect(week.nextAgenda?.id == "PTOD17_FEED01")
    }

    @Test func positionsReadAsASentence() {
        let deputy = FeedWeekDeputy(cast: 23, pour: 14, contre: 3, abstention: 6, nonVotant: 2)
        #expect(FeedRecapCard.positions(deputy) == "14 pour · 6 abstentions · 3 contre · non-votant sur 2 scrutins")
    }

    @Test func outcomesNameLawsAndMotions() async throws {
        #expect(FeedRecapCard.outcomes(try await week()) == "1 loi adoptée · 1 motion rejetée")
    }

    @Test func aWeekWithNeitherCountsItsScrutins() {
        let week = FeedWeek(
            weekStart: "2026-10-12", weekEnd: "2026-10-18", noSitting: false, scrutins: 41, lawsAdopted: 0,
            lawsRejected: 0, motionsAdopted: 0, motionsRejected: 0, deputy: nil, nextAgenda: nil
        )
        #expect(FeedRecapCard.outcomes(week) == "41 scrutins cette semaine")
    }

    /// The recap is only asked for in « Pour vous » with a deputy.
    @Test func theRecapIsOnlyAskedForWithADeputy() async {
        let service = CountingFeedService()
        _ = await HomeScreenRecap.recap(for: FeedQuery(tab: .assemblee, deputyID: "PA1", themes: []), service: service)
        _ = await HomeScreenRecap.recap(
            for: FeedQuery(tab: .pourVous, deputyID: nil, themes: ["sante-social"]), service: service
        )
        #expect(service.weekCalls == 0)
        // A failed recap is nil, never an error that would hide the feed.
        let week = await HomeScreenRecap.recap(for: FeedQuery(tab: .pourVous, deputyID: "PA1", themes: []), service: service)
        #expect(week == nil)
        #expect(service.weekCalls == 1)
    }
}

/// A `FeedService` that counts its recap requests.
final class CountingFeedService: FeedService, @unchecked Sendable {
    private let lock = NSLock()
    private var calls = 0
    var weekCalls: Int { lock.withLock { calls } }

    func feed(_ query: FeedQuery) async throws -> FeedPage {
        FeedPage(weekStart: "2026-10-12", weekEnd: "2026-10-18", noSitting: false, entries: [])
    }

    func week(deputyID: String?) async throws -> FeedWeek {
        lock.withLock { calls += 1 }
        throw URLError(.notConnectedToInternet)
    }
}

/// The top of « Pour vous » in light and dark at the default and an
/// accessibility text size.
@MainActor
@Suite(.snapshots(record: .missing))
struct RecapSnapshotTests {
    let empty = FeedPage(weekStart: "2026-10-12", weekEnd: "2026-10-18", noSitting: false, entries: [])

    @Test(arguments: Variant.all)
    func recapCard(_ variant: Variant) async throws {
        let week = try await LiveFeedService(client: stubClient(try fixture("feed_week"))).week(deputyID: "PA1008")
        checkSnapshot(
            FeedRecapCard(week: week).padding(16).background(Palette.pageBackground),
            variant,
            height: variant.size.isAccessibilityCategory ? 900 : 300
        )
    }

    /// No deputy followed: the card that finds one, above the themes' feed.
    @Test(arguments: Variant.all)
    func noDeputy(_ variant: Variant) {
        checkSnapshot(
            NavigationStack {
                FeedContent(page: empty, tab: .pourVous, showsFindDeputy: true)
                    .padding(16)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 1800 : 560
        )
    }

    /// A recess week: the note saying which week is shown instead.
    @Test(arguments: Variant.all)
    func noSitting(_ variant: Variant) {
        let recess = FeedPage(weekStart: "2026-09-28", weekEnd: "2026-10-04", noSitting: true, entries: [])
        checkSnapshot(
            NavigationStack {
                FeedContent(page: recess, tab: .assemblee)
                    .padding(16)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 1600 : 520
        )
    }
}
