import Foundation
import MonEluAPI

/// The vote list's and vote detail's data, behind a protocol so models and screens are tested
/// with a stub instead of the network.
public protocol VotesService: Sendable {
    func votes(_ query: VoteQuery) async throws -> VotePage
    func vote(id: String) async throws -> VoteDetail
}

/// `VotesService` on the generated client (`listVotes`, `getVote`).
public struct LiveVotesService: VotesService {
    static let pageSize = 30

    private let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func votes(_ query: VoteQuery) async throws -> VotePage {
        let search = query.search.trimmingCharacters(in: .whitespacesAndNewlines)
        let response = try await client.listVotes(query: .init(
            limit: Self.pageSize,
            before: query.cursor,
            result: query.result,
            theme: query.theme,
            search: search.isEmpty ? nil : search,
            kind: query.kinds.isEmpty ? nil : query.kinds
        ))
        let list = try response.ok.body.json
        return VotePage(items: list.items.map(VoteItem.init), nextCursor: list.nextCursor)
    }

    public func vote(id: String) async throws -> VoteDetail {
        VoteDetail(try await client.getVote(path: .init(voteId: id)).ok.body.json)
    }
}

extension VoteItem {
    init(_ vote: Components.Schemas.VoteSummary) {
        self.init(
            id: vote.voteId, title: vote.voteTitle, date: vote.votedAt,
            result: vote.result, summary: vote.summaryPlain, theme: vote.theme,
            votesFor: vote.votesFor, votesAgainst: vote.votesAgainst, abstentions: vote.abstentions
        )
    }
}

extension VoteDetail {
    init(_ vote: Components.Schemas.VoteDetail) {
        self.init(
            item: VoteItem(
                id: vote.voteId, title: vote.voteTitle, date: vote.votedAt,
                result: vote.result, summary: vote.summaryPlain, theme: vote.theme
            ),
            votesFor: vote.votesFor,
            votesAgainst: vote.votesAgainst,
            abstentions: vote.abstentions,
            positions: (vote.positions ?? []).map {
                DeputyPosition(deputyID: $0.deputyId, name: $0.fullName, group: $0.partyShort, position: $0.position)
            },
            dossierTitle: vote.dossier?.titre,
            dossierURL: vote.dossier?.loisUrl.flatMap(URL.init(string:)),
            totalVoters: vote.totalVoters,
            dossierID: vote.dossier?.dossierUid,
            dossierStatus: vote.dossier?.status
        )
    }
}
