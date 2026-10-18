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
        try await LiveFeedService(client: stubClient(try fixture("feed_week"))).week(deputyIDs: ["PA1008"])
    }

    @Test func mapsTheWeekAsTheAPICountedIt() async throws {
        let week = try await week()
        #expect(week.deputies == [
            FeedWeekDeputy(deputyID: "PA1008", cast: 23, pour: 14, contre: 3, abstention: 6, nonVotant: 2),
        ])
        #expect((week.lawsAdopted, week.motionsRejected, week.scrutins) == (1, 1, 87))
        #expect(week.nextAgenda?.id == "PTOD17_FEED01")
    }

    @Test func positionsReadAsASentence() {
        let deputy = FeedWeekDeputy(deputyID: "PA1", cast: 23, pour: 14, contre: 3, abstention: 6, nonVotant: 2)
        #expect(FeedRecapCard.positions(deputy) == "14 pour · 3 contre · 6 abstentions · non-votant sur 2 scrutins")
    }

    /// « votes de votre député » while one is followed, the deputy's name on
    /// each card of the pager once there are several.
    @Test func eachCardNamesItsDeputyWhenSeveralAreFollowed() {
        #expect(FeedRecapCard.castLabel(23, name: nil) == "votes de votre député")
        #expect(FeedRecapCard.castLabel(1, name: "Marie Dupont") == "vote de Marie Dupont")
    }

    @Test func outcomesNameLawsAndMotions() async throws {
        #expect(FeedRecapCard.outcomes(try await week()) == "1 loi adoptée · 1 motion rejetée")
    }

    @Test func aWeekWithNeitherCountsItsScrutins() {
        let week = FeedWeek(
            weekStart: "2026-10-12", weekEnd: "2026-10-18", noSitting: false, scrutins: 41, lawsAdopted: 0,
            lawsRejected: 0, motionsAdopted: 0, motionsRejected: 0, deputies: [], nextAgenda: nil
        )
        #expect(FeedRecapCard.outcomes(week) == "41 scrutins cette semaine")
    }

    /// A recess week's count is not "cette semaine" (ADR-042 §5).
    @Test func aRecessWeekIsNotThisWeek() {
        let week = FeedWeek(
            weekStart: "2026-09-28", weekEnd: "2026-10-04", noSitting: true, scrutins: 12, lawsAdopted: 0,
            lawsRejected: 0, motionsAdopted: 0, motionsRejected: 0, deputies: [], nextAgenda: nil
        )
        #expect(FeedRecapCard.outcomes(week) == "12 scrutins cette semaine-là")
    }

    /// The recap is only asked for in « Pour vous » with a followed deputy,
    /// whichever circle narrows the feed, and for every followed deputy.
    @Test func theRecapIsOnlyAskedForWithADeputy() async {
        let service = CountingFeedService()
        _ = await HomeScreenRecap.recap(tab: .assemblee, deputyIDs: ["PA1"], service: service)
        _ = await HomeScreenRecap.recap(tab: .pourVous, deputyIDs: [], service: service)
        #expect(service.weekCalls == 0)
        // A failed recap is nil, never an error that would hide the feed.
        let week = await HomeScreenRecap.recap(tab: .pourVous, deputyIDs: ["PA1", "PA2"], service: service)
        #expect(week == nil)
        #expect(service.weekCalls == 1)
        #expect(service.lastDeputyIDs == ["PA1", "PA2"])
    }
}

/// A `FeedService` that counts its recap requests.
final class CountingFeedService: FeedService, @unchecked Sendable {
    private let lock = NSLock()
    private var calls = 0
    private var deputyIDs: [String] = []
    var weekCalls: Int { lock.withLock { calls } }
    var lastDeputyIDs: [String] { lock.withLock { deputyIDs } }

    func feed(_ query: FeedQuery) async throws -> FeedPage {
        FeedPage(weekStart: "2026-10-12", weekEnd: "2026-10-18", noSitting: false, entries: [])
    }

    func week(deputyIDs: [String]) async throws -> FeedWeek {
        lock.withLock {
            calls += 1
            self.deputyIDs = deputyIDs
        }
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
        let week = try await LiveFeedService(client: stubClient(try fixture("feed_week"))).week(deputyIDs: ["PA1008"])
        checkSnapshot(
            FeedRecapCard(week: week, deputy: week.deputies[0]).padding(16).background(Palette.pageBackground),
            variant,
            height: variant.size.isAccessibilityCategory ? 900 : 300
        )
    }

    /// Two deputies followed: one card each, named, in a pager whose next
    /// card peeks in; their positions are never added up.
    @Test(arguments: Variant.all)
    func recapPagerForTwoDeputies(_ variant: Variant) async throws {
        let one = try await LiveFeedService(client: stubClient(try fixture("feed_week"))).week(deputyIDs: ["PA1008"])
        let week = FeedWeek(
            weekStart: one.weekStart, weekEnd: one.weekEnd, noSitting: false, scrutins: one.scrutins,
            lawsAdopted: one.lawsAdopted, lawsRejected: one.lawsRejected, motionsAdopted: one.motionsAdopted,
            motionsRejected: one.motionsRejected,
            deputies: one.deputies + [
                FeedWeekDeputy(deputyID: "PA2", cast: 9, pour: 2, contre: 7, abstention: 0, nonVotant: 0),
            ],
            nextAgenda: nil
        )
        let names = FollowedDeputyNames(names: ["PA1008": "Nadège Abomangoli", "PA2": "Marie Dupont"], count: 2)
        checkSnapshot(
            FeedRecapPager(week: week, names: names).padding(16).background(Palette.pageBackground),
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
