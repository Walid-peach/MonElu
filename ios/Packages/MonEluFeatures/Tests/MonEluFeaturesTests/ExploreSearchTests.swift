import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// Explorer's search (#521): what each kind of query sends, and to whom.
struct ExploreSearchTests {
    static func lois() async throws -> [LoiListItem] {
        try await ExploreTests.lois().lois().items
    }

    static func search(
        deputies: any DeputiesService = RecordingDeputiesService(),
        votes: any VotesService = RecordingVotesService(),
        postalCodes: any PostalCodeService = StubPostalCodes(.success([]))
    ) -> ExploreSearch {
        ExploreSearch(deputies: deputies, votes: votes, postalCodes: postalCodes)
    }

    /// A name searches current deputies and the votes, both through the list
    /// endpoints, and matches no postal code.
    @Test func aNameSearchesDeputiesAndVotes() async throws {
        let deputies = RecordingDeputiesService()
        let votes = RecordingVotesService()
        let postal = StubPostalCodes(.success([]))
        _ = await Self.search(deputies: deputies, votes: votes, postalCodes: postal)("  Abomangoli ", lois: [])
        #expect(deputies.queries == [DeputyQuery(search: "Abomangoli", active: true)])
        #expect(votes.queries == [VoteQuery(search: "Abomangoli")])
        #expect(postal.codes.isEmpty)
    }

    /// A five-digit code goes to the postal-code service and comes back as
    /// its département.
    @Test func aPostalCodeFindsItsDepartment() async throws {
        let postal = StubPostalCodes(.success([PostalDepartment(code: "33", name: "Gironde", communes: ["Bordeaux"])]))
        let results = await Self.search(postalCodes: postal)("33000", lois: [])
        #expect(postal.codes == ["33000"])
        #expect(results.departments.map(\.code) == ["33"])
    }

    @Test func departmentsMatchByNameWithoutAccentsOrByCode() async {
        let search = Self.search()
        #expect(await search.departments(matching: "seine-saint").map(\.code) == ["93"])
        #expect(await search.departments(matching: "herault").map(\.code) == ["34"])
        #expect(await search.departments(matching: "2a").map(\.code) == ["2A"])
    }

    @Test func billsMatchTheirTitle() async throws {
        let results = await Self.search()("patrimoine immobilier", lois: try await Self.lois())
        #expect(results.lois.count == 1)
        #expect(results.lois.first?.title?.hasPrefix("Moderniser la gestion") == true)
    }

    @Test func aShortQuerySendsNothing() async {
        let deputies = RecordingDeputiesService()
        let results = await Self.search(deputies: deputies)(" a ", lois: [])
        #expect(results.isEmpty)
        #expect(deputies.queries.isEmpty)
    }

    /// Both list endpoints failing reads as a failure, not as "no result".
    @Test func bothFailingIsAFailure() async {
        let offline = URLError(.notConnectedToInternet)
        let results = await Self.search(
            deputies: RecordingDeputiesService(pages: [.failure(offline)]),
            votes: RecordingVotesService(pages: [.failure(offline)])
        )("budget", lois: [])
        #expect(results.failed)
        #expect(results.isEmpty)
    }
}

/// The results in light and dark, at the default and an accessibility text
/// size, from recorded responses.
@MainActor
@Suite(.snapshots(record: .missing))
struct ExploreSearchSnapshotTests {
    @Test(arguments: Variant.all)
    func exploreSearchResults(_ variant: Variant) async throws {
        let search = ExploreSearch(
            deputies: try LiveDeputiesServiceTests.service(),
            votes: LiveVotesService(client: stubClient(try fixture("votes"))),
            postalCodes: StubPostalCodes(.success([]))
        )
        var results = await search("loi", lois: try await ExploreSearchTests.lois())
        // Trimmed to two of each so the image stays readable.
        results.deputies = Array(results.deputies.prefix(2))
        results.votes = Array(results.votes.prefix(2))
        results.lois = Array(results.lois.prefix(2))
        results.departments = try ReferenceData.departments().filter { $0.code == "33" }
        checkSnapshot(
            NavigationStack {
                ScrollView { ExploreSearchResultsView(results: results).padding(.vertical, 12) }
                    .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 3000 : 1200
        )
    }

    @Test(arguments: Variant.all)
    func exploreSearchNoResult(_ variant: Variant) {
        checkSnapshot(
            NavigationStack {
                ExploreSearchResultsView(results: ExploreSearchResults())
                    .frame(maxHeight: .infinity, alignment: .top)
                    .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 400 : 200
        )
    }
}
