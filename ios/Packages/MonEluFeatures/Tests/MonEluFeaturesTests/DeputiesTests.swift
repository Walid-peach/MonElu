import Foundation
import MonEluCore
@testable import MonEluFeatures
import Testing

/// A `DeputiesService` that records its list queries and replays scripted pages.
final class RecordingDeputiesService: DeputiesService, @unchecked Sendable {
    private let lock = NSLock()
    private var pages: [Result<DeputyPage, any Error>]
    private(set) var queries: [DeputyQuery] = []

    init(pages: [Result<DeputyPage, any Error>] = []) { self.pages = pages }

    func deputies(_ query: DeputyQuery) async throws -> DeputyPage {
        try lock.withLock {
            queries.append(query)
            return try pages.isEmpty ? DeputyPage(items: [], total: 0, offset: query.offset) : pages.removeFirst().get()
        }
    }

    func profile(id: String) async throws -> DeputyProfile { throw URLError(.badServerResponse) }
    func scorecard(id: String) async throws -> DeputyScorecard { throw URLError(.badServerResponse) }
    func recentVotes(id: String) async throws -> [DeputyVote] { throw URLError(.badServerResponse) }
    func votes(id: String, since: Date) async throws -> [DeputyVote] { throw URLError(.badServerResponse) }
    func departmentDeputies(code: String) async throws -> [DeputyItem] { [] }
}

func deputy(_ id: String, name: String = "Alain David", group: String? = "Socialistes et apparentés") -> DeputyItem {
    DeputyItem(
        id: id, name: name, group: group, groupShort: "SOC", department: "Gironde", circonscription: "4",
        photoURL: URL(string: "https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/carre/1008.jpg")
    )
}

/// Two groups as `groups.json` holds them (its type has no public initializer).
let testGroups = try! JSONDecoder().decode([ReferenceData.Group].self, from: Data("""
[{"slug": "socialistes-et-apparentes", "name": "Socialistes et apparentés"},
 {"slug": "rassemblement-national", "name": "Rassemblement National"}]
""".utf8))

@MainActor
struct DeputiesListModelTests {
    @Test func firstLoadAsksForEveryone() async {
        let service = RecordingDeputiesService(pages: [.success(DeputyPage(items: [deputy("PA1")], total: 1, offset: 0))])
        let model = DeputiesListModel(service: service, groups: testGroups)
        await model.loader.loadIfNeeded()
        #expect(service.queries == [DeputyQuery()])
        #expect(model.loader.state.value?.map(\.id) == ["PA1"])
        #expect(model.needsReload == false)
    }

    @Test func theGroupFilterSendsTheGroupsFullName() async {
        let service = RecordingDeputiesService()
        let model = DeputiesListModel(service: service, groups: testGroups)
        model.searchText = "  david "
        model.groupSlug = "socialistes-et-apparentes"
        #expect(model.needsReload)
        #expect(model.groupName == "Socialistes et apparentés")
        await model.reload()
        #expect(service.queries == [DeputyQuery(search: "david", group: "Socialistes et apparentés")])
        #expect(model.needsReload == false)
    }

    @Test func noMatchIsTheEmptyState() async {
        let model = DeputiesListModel(service: RecordingDeputiesService(), groups: testGroups)
        await model.reload()
        #expect(model.loader.state.isEmptyState)
    }

    @Test func loadMoreFollowsTheOffsetUntilTheTotal() async {
        let service = RecordingDeputiesService(pages: [
            .success(DeputyPage(items: [deputy("PA1"), deputy("PA2")], total: 3, offset: 0)),
            .success(DeputyPage(items: [deputy("PA3")], total: 3, offset: 2)),
        ])
        let model = DeputiesListModel(service: service, groups: testGroups)
        model.groupSlug = "rassemblement-national"
        await model.reload()
        await model.loadMore()
        await model.loadMore() // all three loaded: no third request
        #expect(service.queries.map(\.offset) == [0, 2])
        #expect(service.queries.allSatisfy { $0.group == "Rassemblement National" })
        #expect(model.loader.state.value?.map(\.id) == ["PA1", "PA2", "PA3"])
    }

    @Test func failedNextPageKeepsTheListAndCanBeRetried() async {
        let service = RecordingDeputiesService(pages: [
            .success(DeputyPage(items: [deputy("PA1")], total: 2, offset: 0)),
            .failure(URLError(.notConnectedToInternet)),
            .success(DeputyPage(items: [deputy("PA2")], total: 2, offset: 1)),
        ])
        let model = DeputiesListModel(service: service, groups: testGroups)
        await model.reload()
        await model.loadMore()
        #expect(model.loadMoreFailure == .offline)
        #expect(model.loader.state.value?.map(\.id) == ["PA1"])
        await model.loadMore()
        #expect(model.loadMoreFailure == nil)
        #expect(model.loader.state.value?.map(\.id) == ["PA1", "PA2"])
    }

    @Test func theFilterChoicesAreTheBundledGroups() throws {
        let model = DeputiesListModel(service: RecordingDeputiesService())
        #expect(model.groups == (try ReferenceData.groups()))
        #expect(model.groups.count == 12)
    }
}

struct DeputyModelTests {
    @Test func nextOffsetStopsAtTheTotal() {
        #expect(DeputyPage(items: [deputy("A"), deputy("B")], total: 5, offset: 0).nextOffset == 2)
        #expect(DeputyPage(items: [deputy("E")], total: 5, offset: 4).nextOffset == nil)
        #expect(DeputyPage(items: [], total: 5, offset: 5).nextOffset == nil)
    }

    @Test func constituencyUsesWhatTheAPIReturned() {
        #expect(deputy("A").constituency == "Gironde · 4e circonscription")
        let first = DeputyItem(
            id: "A", name: "A", group: nil, groupShort: nil, department: "Ariège", circonscription: "1", photoURL: nil
        )
        #expect(first.constituency == "Ariège · 1re circonscription")
        let none = DeputyItem(
            id: "A", name: "A", group: nil, groupShort: nil, department: nil, circonscription: nil, photoURL: nil
        )
        #expect(none.constituency == nil)
    }

    @Test @MainActor func mandateIsWrittenFromTheDatesReturned() throws {
        let start = try #require(MonEluFormat.calendarDate("2024-07-07"))
        let end = try #require(MonEluFormat.calendarDate("2025-10-12"))
        #expect(DeputyHeader.mandate(start: start, end: nil) == "En mandat depuis le 7 juillet 2024")
        #expect(DeputyHeader.mandate(start: start, end: end) == "Mandat du 7 juillet 2024 au 12 octobre 2025")
        #expect(DeputyHeader.mandate(start: nil, end: nil) == nil)
    }
}

/// The live service against responses recorded from the production API.
struct LiveDeputiesServiceTests {
    static func service() throws -> LiveDeputiesService {
        LiveDeputiesService(client: operationClient([
            "listDeputies": try fixture("deputies"),
            "getDeputy": try fixture("deputy"),
            "getScorecard": try fixture("deputy_scorecard"),
            "getDeputyVotes": try fixture("deputy_votes"),
        ]))
    }

    @Test func listMapsEveryDeputy() async throws {
        let page = try await Self.service().deputies(DeputyQuery())
        #expect(page.total == 649)
        #expect(page.offset == 0)
        #expect(page.items.count == 4)
        let first = try #require(page.items.first)
        #expect(first.id == "PA793214")
        #expect(first.name == "Audrey Abadie-Amiel")
        #expect(first.group == "Libertés, Indépendants, Outre-mer et Territoires")
        #expect(first.photoURL?.absoluteString.hasSuffix("/793214.jpg") == true)
    }

    @Test func profileReadsTheMandateDatesAndAnOpenEnd() async throws {
        let profile = try await Self.service().profile(id: "PA1008")
        #expect(profile.deputy.name == "Alain David")
        #expect(profile.mandateStart.map(MonEluFormat.day) == "7 juillet 2024")
        #expect(profile.mandateEnd == nil)
    }

    /// Every figure is the response's own value, rates included: nothing is
    /// recomputed in Swift (#462).
    @Test func scorecardIsTheAPIsFiguresUnchanged() async throws {
        let card = try await Self.service().scorecard(id: "PA1008")
        let json = try #require(try JSONSerialization.jsonObject(with: fixture("deputy_scorecard")) as? [String: Any])
        #expect(card.totalVotes == json["total_votes"] as? Int)
        #expect(card.presenceRate == json["presence_rate"] as? Double)
        #expect(card.votesFor == json["votes_for"] as? Int)
        #expect(card.votesAgainst == json["votes_against"] as? Int)
        #expect(card.abstentions == json["abstentions"] as? Int)
        #expect(card.eligibleSolennels == json["eligible_solennels"] as? Int)
        #expect(card.solennelsCast == json["solennels_cast"] as? Int)
        #expect(card.solennelParticipationRate == json["solennel_participation_rate"] as? Double)
        #expect(card.eligibleVotingDays == json["eligible_voting_days"] as? Int)
        #expect(card.votingDaysPresent == json["voting_days_present"] as? Int)
        #expect(card.votingDaysRate == json["voting_days_rate"] as? Double)
    }

    @Test func recentVotesCarryThePosition() async throws {
        let votes = try await Self.service().recentVotes(id: "PA1008")
        #expect(votes.count == 5)
        #expect(votes.first?.position == "abstention")
        #expect(votes.dropFirst().allSatisfy { $0.position == "pour" })
        #expect(votes.allSatisfy { $0.date != nil })
    }

    @Test func profilePageLoadsEverySection() async throws {
        let page = try await Self.service().profilePage(id: "PA1008")
        #expect(page.profile.deputy.id == "PA1008")
        #expect(page.scorecard?.solennelsCast == 43)
        #expect(page.recentVotes?.count == 5)
    }

    @Test func profilePageOpensWhenOnlyTheSectionsFail() async throws {
        let service = LiveDeputiesService(client: operationClient(["getDeputy": try fixture("deputy")]))
        let page = try await service.profilePage(id: "PA1008")
        #expect(page.profile.deputy.name == "Alain David")
        #expect(page.scorecard == nil)
        #expect(page.recentVotes == nil)
    }

    @Test func profilePageFailsWithoutTheProfile() async throws {
        let service = LiveDeputiesService(client: operationClient(["getScorecard": try fixture("deputy_scorecard")]))
        await #expect(throws: (any Error).self) { try await service.profilePage(id: "PA1008") }
    }
}
