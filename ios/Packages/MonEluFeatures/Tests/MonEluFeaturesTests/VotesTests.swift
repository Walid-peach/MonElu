import Foundation
import MonEluCore
@testable import MonEluFeatures
import Testing

@MainActor
struct VotesListModelTests {
    @Test func firstLoadAsksForEverything() async {
        let service = RecordingVotesService(pages: [.success(VotePage(items: [item("V1")], nextCursor: nil))])
        let model = VotesListModel(service: service)
        await model.loader.loadIfNeeded()
        #expect(service.queries == [VoteQuery()])
        #expect(model.loader.state.value?.map(\.id) == ["V1"])
        #expect(model.needsReload == false)
    }

    @Test func searchAndFilterChangeTheQuery() async {
        let service = RecordingVotesService()
        let model = VotesListModel(service: service)
        model.searchText = "  budget "
        model.filter = .rejected
        #expect(model.needsReload)
        await model.reload()
        #expect(service.queries == [VoteQuery(search: "budget", result: "rejeté")])
        #expect(model.needsReload == false)
    }

    @Test func noMatchIsTheEmptyState() async {
        let model = VotesListModel(service: RecordingVotesService())
        await model.reload()
        #expect(model.loader.state.isEmptyState)
    }

    @Test func loadMoreFollowsTheCursorAndAppends() async {
        let service = RecordingVotesService(pages: [
            .success(VotePage(items: [item("V1")], nextCursor: "c1")),
            .success(VotePage(items: [item("V2")], nextCursor: nil)),
        ])
        let model = VotesListModel(service: service)
        model.filter = .adopted
        await model.reload()
        await model.loadMore()
        await model.loadMore() // no cursor left: no third request
        #expect(service.queries.map(\.cursor) == [nil, "c1"])
        #expect(service.queries.allSatisfy { $0.result == "adopté" })
        #expect(model.loader.state.value?.map(\.id) == ["V1", "V2"])
    }

    @Test func failedNextPageKeepsTheListAndCanBeRetried() async {
        let service = RecordingVotesService(pages: [
            .success(VotePage(items: [item("V1")], nextCursor: "c1")),
            .failure(URLError(.networkConnectionLost)),
            .success(VotePage(items: [item("V2")], nextCursor: nil)),
        ])
        let model = VotesListModel(service: service)
        await model.reload()
        await model.loadMore()
        #expect(model.loadMoreFailure == .offline)
        #expect(model.loader.state.value?.map(\.id) == ["V1"])

        await model.loadMore() // the retry asks for the same page again
        #expect(model.loadMoreFailure == nil)
        #expect(service.queries.map(\.cursor) == [nil, "c1", "c1"])
        #expect(model.loader.state.value?.map(\.id) == ["V1", "V2"])
    }

    @Test func offlineShowsTheOfflineState() async {
        let model = VotesListModel(service: RecordingVotesService(pages: [.failure(URLError(.notConnectedToInternet))]))
        await model.reload()
        #expect(model.loader.state.failure == .offline)
    }
}

struct LiveVotesServiceTests {
    @Test func mapsARecordedVoteList() async throws {
        let page = try await LiveVotesService(client: stubClient(try fixture("votes"))).votes(VoteQuery())
        #expect(page.items.count == 3)
        #expect(page.items.first?.id == "VTANR5L17V8434")
        #expect(page.items.first?.result == "adopté")
    }

    @Test func mapsARecordedVoteDetail() async throws {
        let vote = try await LiveVotesService(client: stubClient(try fixture("vote_detail"))).vote(id: "VTANR5L17V8434")
        #expect(vote.votesFor == 276)
        #expect(vote.votesAgainst == 86)
        #expect(vote.abstentions == 2)
        #expect(vote.positions.count == 24)
        #expect(vote.dossierURL?.path() == "/lois/DLR5L17N52746")
    }

    @Test @MainActor func unknownVoteIsAnErrorStateNotACrash() async {
        let service = LiveVotesService(client: stubClient(Data(#"{"detail":"Vote not found"}"#.utf8), status: .notFound))
        let loader = Loader { try await service.vote(id: "nope") }
        await loader.load()
        #expect(loader.state.failure == .server)
    }
}

struct GroupPositionsTests {
    private func position(_ group: String?, _ position: String) -> DeputyPosition {
        DeputyPosition(deputyID: UUID().uuidString, name: "X", group: group, position: position)
    }

    @Test func talliesPerGroupLargestFirst() {
        let vote = VoteDetail(
            item: item("V1"), votesFor: 3, votesAgainst: 1, abstentions: 0,
            positions: [
                position("EPR", "pour"), position("EPR", "pour"), position("EPR", "nonVotant"),
                position("LFI", "contre"), position(nil, "pour"),
            ],
            dossierTitle: nil, dossierURL: nil
        )
        let groups = vote.positionsByGroup
        #expect(groups.map(\.group) == ["EPR", "LFI", "Non inscrit"])
        #expect(groups[0].ordered.map(\.position) == ["pour", "nonVotant"])
        #expect(groups[0].ordered.map(\.count) == [2, 1])
        #expect(groups[0].total == 3)
    }

    /// The followed deputy's own position, nil when they recorded none; and
    /// the scrutin's number, read off its id for display.
    @Test func followedPositionAndScrutinNumber() async throws {
        let vote = try await LiveVotesService(client: stubClient(try fixture("vote_detail"))).vote(id: "VTANR5L17V8434")
        let first = try #require(vote.positions.first)
        #expect(vote.position(of: first.deputyID)?.position == first.position)
        #expect(vote.position(of: "PA0") == nil)
        #expect(vote.position(of: nil) == nil)
        #expect(vote.scrutinNumber == "8434")
        #expect(vote.totalVoters == 364)
        #expect(vote.dossierID == "DLR5L17N52746")
        #expect(vote.hasLoiPage)
    }
}
