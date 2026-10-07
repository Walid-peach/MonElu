import Foundation
import MonEluCore
@testable import MonEluFeatures
import Testing

/// The comparison's divergences from a recorded response, how a page is
/// assembled, and the short names in each row (#487).
struct CompareTests {
    static func diverging() async throws -> DivergingVotes {
        try await LiveCompareService(client: stubClient(try fixture("diverging_votes")))
            .diverging(first: "PA795228", other: "PA721202")
    }

    @Test func mapsTheDivergences() async throws {
        let diverging = try await Self.diverging()
        #expect(diverging.total == 21)
        #expect(diverging.items.count == 3)
        let first = try #require(diverging.items.first)
        #expect(first.positionA != first.positionB)
    }

    /// Without a second deputy the page holds the first only, and asks for nothing else.
    @Test func aPageWithoutASecondDeputyLoadsOnlyTheFirst() async throws {
        let compare = LiveCompareService(client: operationClient([:]))
        let page = try await compare.page(first: "PA1008", other: nil, deputies: try LiveDeputiesServiceTests.service())
        #expect(page.first.profile.deputy.id == "PA1008")
        #expect(page.first.scorecard?.votesForRate != nil)
        #expect(page.other == nil)
        #expect(page.diverging == nil)
    }

    /// A failing divergence list leaves both scorecards on screen.
    @Test func aFailingDivergenceListKeepsBothSides() async throws {
        let compare = LiveCompareService(client: operationClient([:]))
        let page = try await compare.page(first: "PA1008", other: "PA1008", deputies: try LiveDeputiesServiceTests.service())
        #expect(page.other != nil)
        #expect(page.diverging == nil)
    }

    @Test func shortNamesKeepTheFirstInitial() {
        let deputy = DeputyItem(
            id: "PA1", name: "Nadège Abomangoli", group: nil, groupShort: nil,
            department: nil, circonscription: nil, photoURL: nil
        )
        #expect(deputy.shortName == "N. Abomangoli")
    }
}
