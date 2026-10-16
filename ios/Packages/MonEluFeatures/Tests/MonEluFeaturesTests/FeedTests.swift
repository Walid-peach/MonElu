import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// The feed's client mapping and its query (#565, ADR-042): the app keeps the
/// API's order and asks the API to narrow, never filters itself.
struct FeedServiceTests {
    func page() async throws -> FeedPage {
        try await LiveFeedService(client: stubClient(try fixture("feed_pour_vous")))
            .feed(FeedQuery(tab: .pourVous, deputyID: "PA1008", themes: ["justice-securite"]))
    }

    @Test func keepsTheAPIsOrderAndEveryKind() async throws {
        let page = try await page()
        #expect(page.entries.map(\.id) == [
            "scrutin:VTANR5L17V9101", "scrutin:VTANR5L17V9100", "scrutin:VTANR5L17V9099",
            "agenda:PTOD17_FEED01", "rollup",
        ])
        #expect(page.weekStart == "2026-10-12")
        #expect(page.noSitting == false)
    }

    @Test func mapsACardAsTheAPIComputedIt() async throws {
        guard case .scrutin(let closest) = try await page().entries.first else {
            Issue.record("the first entry is not a scrutin")
            return
        }
        #expect(closest.isClosest)
        #expect(closest.kind == "amendement")
        #expect(closest.deputyPosition == "pour")
        #expect(closest.loiID == nil)
        #expect(closest.officialURL?.absoluteString == "https://www.assemblee-nationale.fr/dyn/scrutins/VTANR5L17V9101")
    }

    @Test func aBillWithAPageKeepsItsID() async throws {
        guard case .scrutin(let law) = try await page().entries[1] else {
            Issue.record("the second entry is not a scrutin")
            return
        }
        #expect(law.loiID == "DLR5L17N53980")
    }

    @Test func theRollupKeepsNonVotantApart() async throws {
        guard case .rollup(let rollup) = try await page().entries.last else {
            Issue.record("the last entry is not the rollup")
            return
        }
        #expect(rollup == FeedRollup(total: 20, amendements: 17, articles: 2, autres: 1, nonVotant: 3))
    }

    @Test func aCircleAsksTheAPIForThatFollowAlone() {
        let themes = ["justice-securite", "sante-social"]
        #expect(FeedQuery.pourVous(deputyID: "PA1", themes: themes, filter: .all)
            == FeedQuery(tab: .pourVous, deputyID: "PA1", themes: themes))
        #expect(FeedQuery.pourVous(deputyID: "PA1", themes: themes, filter: .deputy)
            == FeedQuery(tab: .pourVous, deputyID: "PA1", themes: []))
        #expect(FeedQuery.pourVous(deputyID: "PA1", themes: themes, filter: .theme("sante-social"))
            == FeedQuery(tab: .pourVous, deputyID: nil, themes: ["sante-social"]))
    }

    @Test func theRollupReadsAsASentence() {
        let view = FeedRollupView(rollup: FeedRollup(total: 20, amendements: 17, articles: 2, autres: 1, nonVotant: 3))
        #expect(view.headline == "Et 20 autres votes de votre député")
        #expect(view.detail == "17 amendements · 2 articles · 1 autre scrutin · non-votant sur 3 scrutins")
    }
}

/// The feed in light and dark at the default and an accessibility text size,
/// from a response written from the API's schema.
@MainActor
@Suite(.snapshots(record: .missing))
struct FeedSnapshotTests {
    func page() async throws -> FeedPage {
        try await LiveFeedService(client: stubClient(try fixture("feed_pour_vous")))
            .feed(FeedQuery(tab: .pourVous, deputyID: "PA1008", themes: ["justice-securite"]))
    }

    /// The three scrutin cards: the closest amendment, a whole text with a
    /// summary, a motion with its explanation.
    @Test(arguments: Variant.all)
    func feedScrutinCards(_ variant: Variant) async throws {
        let cards = try await page().entries.prefix(3)
        checkSnapshot(
            NavigationStack {
                ScrollView {
                    FeedContent(page: FeedPage(weekStart: "2026-10-12", weekEnd: "2026-10-18", noSitting: false, entries: Array(cards)), tab: .pourVous)
                        .padding(16)
                }
                .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 4200 : 1500
        )
    }

    /// The end of the feed: the agenda item, the roll-up and the quiz.
    @Test(arguments: Variant.all)
    func feedAgendaAndRollup(_ variant: Variant) async throws {
        let rest = try await page().entries.suffix(2)
        checkSnapshot(
            NavigationStack {
                ScrollView {
                    FeedContent(
                        page: FeedPage(weekStart: "2026-10-12", weekEnd: "2026-10-18", noSitting: false, entries: Array(rest)),
                        tab: .pourVous, deputyID: "PA1008"
                    )
                    .padding(16)
                }
                .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 2400 : 700
        )
    }

    @Test(arguments: Variant.all)
    func feedEmpty(_ variant: Variant) {
        checkSnapshot(
            NavigationStack {
                FeedContent(page: FeedPage(weekStart: "2026-10-12", weekEnd: "2026-10-18", noSitting: false, entries: []), tab: .pourVous)
                    .padding(16)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 1400 : 420
        )
    }
}
