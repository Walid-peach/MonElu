import Foundation
import MonEluAPI
import MonEluCore

/// The Députés tab's data, behind a protocol so models and screens are tested
/// with a stub instead of the network.
public protocol DeputiesService: Sendable {
    func deputies(_ query: DeputyQuery) async throws -> DeputyPage
    /// Throws `DeputyNotFound` when the API has no such deputy.
    func profile(id: String) async throws -> DeputyProfile
    func scorecard(id: String) async throws -> DeputyScorecard
    func recentVotes(id: String) async throws -> [DeputyVote]
    /// The deputy's votes on scrutins held after `since`, newest first.
    func votes(id: String, since: Date) async throws -> [DeputyVote]
    /// The current deputies of a département, by INSEE code (`33`, `2A`).
    func departmentDeputies(code: String) async throws -> [DeputyItem]
}

/// The API has no deputy with this id (a 404 from `getDeputy`).
public struct DeputyNotFound: Error, Equatable {
    public let id: String
}

extension DeputiesService {
    /// The profile and, in parallel, its scorecard and recent votes. Only the
    /// profile itself is required.
    public func profilePage(id: String) async throws -> DeputyProfilePage {
        async let scorecard = try? self.scorecard(id: id)
        async let votes = try? self.recentVotes(id: id)
        let profile = try await profile(id: id)
        return await DeputyProfilePage(profile: profile, scorecard: scorecard, recentVotes: votes)
    }
}

/// `DeputiesService` on the generated client (`listDeputies`, `getDeputy`,
/// `getScorecard`, `getDeputyVotes`).
public struct LiveDeputiesService: DeputiesService {
    static let pageSize = 30
    static let recentVotesCount = 10
    /// The API's ceiling for one call.
    static let sinceVotesCount = 50

    private let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func deputies(_ query: DeputyQuery) async throws -> DeputyPage {
        let search = query.search.trimmingCharacters(in: .whitespacesAndNewlines)
        let response = try await client.listDeputies(query: .init(
            limit: Self.pageSize,
            offset: query.offset,
            search: search.isEmpty ? nil : search,
            party: query.group
        ))
        let list = try response.ok.body.json
        return DeputyPage(items: list.items.map(DeputyItem.init), total: list.total, offset: list.offset)
    }

    public func profile(id: String) async throws -> DeputyProfile {
        let response = try await client.getDeputy(path: .init(deputyId: id))
        // A 404 is not in the spec, so the client reports it as undocumented.
        if case .undocumented(statusCode: 404, _) = response { throw DeputyNotFound(id: id) }
        let deputy = try response.ok.body.json
        return DeputyProfile(
            deputy: DeputyItem(
                id: deputy.deputyId, name: deputy.fullName, group: deputy.party, groupShort: deputy.partyShort,
                department: deputy.department, circonscription: deputy.circonscription,
                photoURL: deputy.photoUrl.flatMap(URL.init(string:))
            ),
            mandateStart: deputy.mandateStart.flatMap(MonEluFormat.calendarDate),
            mandateEnd: deputy.mandateEnd.flatMap(MonEluFormat.calendarDate)
        )
    }

    public func scorecard(id: String) async throws -> DeputyScorecard {
        let card = try await client.getScorecard(path: .init(deputyId: id)).ok.body.json
        return DeputyScorecard(
            totalVotes: card.totalVotes, presenceRate: card.presenceRate,
            votesFor: card.votesFor, votesAgainst: card.votesAgainst, abstentions: card.abstentions,
            eligibleSolennels: card.eligibleSolennels, solennelsCast: card.solennelsCast,
            solennelParticipationRate: card.solennelParticipationRate,
            eligibleVotingDays: card.eligibleVotingDays, votingDaysPresent: card.votingDaysPresent,
            votingDaysRate: card.votingDaysRate
        )
    }

    public func recentVotes(id: String) async throws -> [DeputyVote] {
        let response = try await client.getDeputyVotes(
            path: .init(deputyId: id), query: .init(limit: Self.recentVotesCount)
        )
        return try response.ok.body.json.items.map(DeputyVote.init)
    }

    public func votes(id: String, since: Date) async throws -> [DeputyVote] {
        let response = try await client.getDeputyVotes(
            path: .init(deputyId: id), query: .init(limit: Self.sinceVotesCount, since: since)
        )
        return try response.ok.body.json.items.map(DeputyVote.init)
    }

    public func departmentDeputies(code: String) async throws -> [DeputyItem] {
        let department = try await client.getDepartment(path: .init(code: code)).ok.body.json
        return department.deputies.map {
            DeputyItem(
                id: $0.deputyId, name: $0.fullName, group: $0.party, groupShort: $0.partyShort,
                department: $0.department, circonscription: $0.circonscription,
                photoURL: $0.photoUrl.flatMap(URL.init(string:))
            )
        }
    }
}

extension DeputyVote {
    init(_ vote: Components.Schemas.DeputyVoteItem) {
        self.init(id: vote.voteId, title: vote.voteTitle, date: vote.votedAt, result: vote.result, position: vote.position)
    }
}

extension DeputyItem {
    init(_ deputy: Components.Schemas.DeputySummary) {
        self.init(
            id: deputy.deputyId, name: deputy.fullName, group: deputy.party, groupShort: deputy.partyShort,
            department: deputy.department, circonscription: deputy.circonscription,
            photoURL: deputy.photoUrl.flatMap(URL.init(string:))
        )
    }
}
