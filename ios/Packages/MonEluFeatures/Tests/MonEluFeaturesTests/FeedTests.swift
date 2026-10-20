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
            .feed(FeedQuery(tab: .pourVous, deputyIDs: ["PA1008"], themes: ["justice-securite"]))
    }

    @Test func keepsTheAPIsOrderAndEveryKind() async throws {
        let page = try await page()
        #expect(page.entries.map(\.id) == [
            "scrutin:VTANR5L17V9101", "scrutin:VTANR5L17V9100", "scrutin:VTANR5L17V9099",
            "agenda:PTOD17_FEED01", "rollup:PA1008",
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
        #expect(closest.positions == [FeedDeputyPosition(deputyID: "PA1008", position: "pour")])
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

    /// `latest_by_theme` becomes a lookup by slug for the theme rings (#573).
    @Test func mapsEachThemesLatestScrutin() async throws {
        let latest = try #require(ISO8601DateFormatter().date(from: "2026-10-13T22:00:00Z"))
        #expect(try await page().latestByTheme == ["justice-securite": latest])
    }

    @Test func theRollupKeepsNonVotantApart() async throws {
        guard case .rollup(let rollup) = try await page().entries.last else {
            Issue.record("the last entry is not the rollup")
            return
        }
        #expect(rollup == FeedRollup(
            deputyID: "PA1008", total: 20, amendements: 17, articles: 2, autres: 1, nonVotant: 3
        ))
    }

    @Test func aCircleAsksTheAPIForThatFollowAlone() {
        let themes = ["justice-securite", "sante-social"]
        let deputies = ["PA1", "PA2"]
        #expect(FeedQuery.pourVous(deputyIDs: deputies, themes: themes, filter: .all)
            == FeedQuery(tab: .pourVous, deputyIDs: deputies, themes: themes))
        #expect(FeedQuery.pourVous(deputyIDs: deputies, themes: themes, filter: .deputy("PA2"))
            == FeedQuery(tab: .pourVous, deputyIDs: ["PA2"], themes: []))
        #expect(FeedQuery.pourVous(deputyIDs: deputies, themes: themes, filter: .theme("sante-social"))
            == FeedQuery(tab: .pourVous, deputyIDs: [], themes: ["sante-social"]))
    }

    /// With nothing followed Accueil opens on « À l'Assemblée », so the
    /// first screen has content; once something is followed, « Pour vous »
    /// (#575).
    @Test func accueilOpensOnTheAssemblyUntilSomethingIsFollowed() {
        #expect(HomeTabDefault.tab(followsNothing: true) == .assemblee)
        #expect(HomeTabDefault.tab(followsNothing: false) == .pourVous)
    }

    /// An empty « Pour vous » with nothing followed asks for a follow; with
    /// follows, it says the week was quiet for them.
    @MainActor @Test func anEmptyPourVousSaysWhy() {
        #expect(FeedEmptyNote(tab: .pourVous, followsNothing: true).message.hasPrefix("Vous ne suivez encore rien"))
        #expect(FeedEmptyNote(tab: .pourVous).message.hasPrefix("Rien cette semaine pour ce que vous suivez"))
        #expect(FeedEmptyNote(tab: .assemblee, followsNothing: true).message == "Aucun grand vote cette semaine.")
    }

    @MainActor @Test func theRollupReadsAsASentence() {
        let rollup = FeedRollup(deputyID: "PA1", total: 20, amendements: 17, articles: 2, autres: 1, nonVotant: 3)
        let view = FeedRollupView(rollup: rollup)
        #expect(view.headline == "Et 20 autres votes de votre député")
        #expect(view.detail == "17 amendements · 2 articles · 1 autre scrutin · non-votant sur 3 scrutins")
        // With several deputies followed, each roll-up names its deputy.
        #expect(FeedRollupView(rollup: rollup, name: "Marie Dupont").headline == "Et 20 autres votes de Marie Dupont")
    }

    /// « Votre député » while one deputy is followed, each name once there
    /// are several (ADR-042 amendment §3).
    @Test func cardsNameEachDeputyOnlyWhenSeveralAreFollowed() {
        #expect(FollowedDeputyNames(names: ["PA1": "Marie Dupont"], count: 1).name(of: "PA1") == nil)
        let several = FollowedDeputyNames(names: ["PA1": "Marie Dupont"], count: 2)
        #expect(several.name(of: "PA1") == "Marie Dupont")
        #expect(several.name(of: "PA2") == "Député suivi")
    }

    /// The live service sends every followed deputy as the repeated
    /// `deputies` parameter, never the older `deputy_id`.
    @Test func everyFollowedDeputyIsSentToTheAPI() async throws {
        let recorder = RequestRecorder()
        _ = try await LiveFeedService(client: stubClient(try fixture("feed_pour_vous"), recorder: recorder))
            .feed(FeedQuery(tab: .pourVous, deputyIDs: ["PA1", "PA2"], themes: []))
        let query = try #require(recorder.urls.first?.query)
        #expect(query.contains("deputies=PA1&deputies=PA2"))
        #expect(!query.contains("deputy_id"))
    }
}

/// The feed in light and dark at the default and an accessibility text size,
/// from a response written from the API's schema.
@MainActor
@Suite(.snapshots(record: .missing))
struct FeedSnapshotTests {
    func page() async throws -> FeedPage {
        try await LiveFeedService(client: stubClient(try fixture("feed_pour_vous")))
            .feed(FeedQuery(tab: .pourVous, deputyIDs: ["PA1008"], themes: ["justice-securite"]))
    }

    /// One scrutin card at a time, so each image stays under the
    /// repository's 500 KB limit.
    func card(_ index: Int, _ variant: Variant, height: CGFloat, testName: String = #function) async throws {
        guard case .scrutin(let card) = try await page().entries[index] else {
            Issue.record("entry \(index) is not a scrutin")
            return
        }
        checkSnapshot(
            NavigationStack {
                FeedScrutinCardView(card: card)
                    .padding(16)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? height * 3 : height,
            testName: testName
        )
    }

    /// The week's closest scrutin: an amendment with no summary.
    @Test(arguments: Variant.all)
    func feedClosestCard(_ variant: Variant) async throws {
        try await card(0, variant, height: 480)
    }

    /// A whole text, its summary as the headline over the official title.
    @Test(arguments: Variant.all)
    func feedWholeTextCard(_ variant: Variant) async throws {
        try await card(1, variant, height: 500)
    }

    /// A motion: the deputy's position names the motion, with the one-line
    /// explanation of what a motion does.
    @Test(arguments: Variant.all)
    func feedMotionCard(_ variant: Variant) async throws {
        try await card(2, variant, height: 560)
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
                        tab: .pourVous, deputyIDs: ["PA1008"]
                    )
                    .padding(16)
                }
                .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 2400 : 700
        )
    }

    /// A failed feed keeps its header: the follows row and the tabs stay
    /// usable above the failure and its retry.
    @Test(arguments: Variant.all)
    func feedFailedKeepsHeader(_ variant: Variant) {
        let circles = FollowCircle.circles(
            deputies: [.sample], themeSlugs: ["justice-securite"], themes: (try? ReferenceData.themes()) ?? []
        )
        checkSnapshot(
            NavigationStack {
                FeedPageView(state: .failed(.offline), tab: .pourVous) {
                    FollowsRow(circles: circles, filter: .constant(.all), onAdd: {})
                    Picker("Fil", selection: .constant(FeedTab.pourVous)) {
                        ForEach(FeedTab.allCases, id: \.self) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 16)
                }
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 2000 : 640
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
