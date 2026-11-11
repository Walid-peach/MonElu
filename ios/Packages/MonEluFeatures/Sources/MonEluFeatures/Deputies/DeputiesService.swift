import Foundation
import MonEluAPI
import MonEluCore

/// The deputy list's, profiles' and Accueil's data, behind a protocol so
/// models and screens are tested with a stub instead of the network.
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
    /// How often the deputy votes with their group's majority.
    func alignment(id: String) async throws -> DeputyAlignment
    /// The scrutins where the deputy voted against their group's majority.
    func dissidentVotes(id: String) async throws -> DissidentVotes
}

extension DeputiesService {
    /// A stub that does not answer these fails them, and the profile
    /// leaves the section out.
    public func alignment(id: String) async throws -> DeputyAlignment { throw URLError(.unsupportedURL) }
    public func dissidentVotes(id: String) async throws -> DissidentVotes { throw URLError(.unsupportedURL) }
}

/// The API has no deputy with this id (a 404 from `getDeputy`).
public struct DeputyNotFound: Error, Equatable {
    public let id: String
}

extension DeputiesService {
    /// The profile and, in parallel, its scorecard, alignment and recent
    /// votes. Only the profile itself is required.
    ///
    /// `partial` receives the page as soon as the profile is known, and again
    /// each time a section lands, so the screen opens on who the deputy is
    /// without waiting for the slowest of the four requests.
    public func profilePage(
        id: String, partial: @escaping @Sendable (DeputyProfilePage) async -> Void = { _ in }
    ) async throws -> DeputyProfilePage {
        try await withThrowingTaskGroup(of: ProfilePart.self) { group in
            group.addTask { .profile(try await self.profile(id: id)) }
            group.addTask { .scorecard(try? await self.scorecard(id: id)) }
            group.addTask { .alignment(try? await self.alignment(id: id)) }
            group.addTask { .recentVotes(try? await self.recentVotes(id: id)) }

            var page: DeputyProfilePage?
            var sections = DeputyProfilePage.Sections()
            var remaining = 4
            // A failed profile throws here, which cancels the sections.
            for try await part in group {
                remaining -= 1
                switch part {
                case .profile(let profile): page = DeputyProfilePage(profile: profile, sections: sections)
                case .scorecard(let scorecard): sections.scorecard = scorecard
                case .alignment(let alignment): sections.alignment = alignment
                case .recentVotes(let votes): sections.recentVotes = votes
                }
                page?.apply(sections)
                if let page, remaining > 0 { await partial(page) }
            }
            guard let page else { throw CancellationError() }
            return page
        }
    }
}

/// One of the four requests behind a profile page, as it lands.
private enum ProfilePart: Sendable {
    case profile(DeputyProfile)
    case scorecard(DeputyScorecard?)
    case alignment(DeputyAlignment?)
    case recentVotes([DeputyVote]?)
}

extension DeputyProfilePage {
    /// The sections that have landed so far.
    struct Sections: Sendable {
        var scorecard: DeputyScorecard?
        var alignment: DeputyAlignment?
        var recentVotes: [DeputyVote]?
    }

    init(profile: DeputyProfile, sections: Sections) {
        self.init(
            profile: profile, scorecard: sections.scorecard, recentVotes: sections.recentVotes,
            alignment: sections.alignment
        )
    }

    mutating func apply(_ sections: Sections) {
        scorecard = sections.scorecard
        alignment = sections.alignment
        recentVotes = sections.recentVotes
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
            department: query.department,
            party: query.group,
            active: query.active
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
            votingDaysRate: card.votingDaysRate, votesForRate: card.votesForPct
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

    public func alignment(id: String) async throws -> DeputyAlignment {
        let alignment = try await client.getAlignment(path: .init(deputyId: id)).ok.body.json
        return DeputyAlignment(
            alignmentRate: alignment.partyAlignmentRate, dissidentVotes: alignment.dissidentVotes,
            totalVotes: alignment.totalVotes
        )
    }

    /// The API's ceiling for one call.
    static let dissidentVotesCount = 50

    public func dissidentVotes(id: String) async throws -> DissidentVotes {
        let response = try await client.getDissidentVotes(
            path: .init(deputyId: id), query: .init(limit: Self.dissidentVotesCount)
        ).ok.body.json
        return DissidentVotes(
            total: response.total,
            items: response.items.map {
                DissidentVote(
                    id: $0.voteId, title: $0.voteTitle, date: $0.votedAt, result: $0.result,
                    position: $0.position, majorityPosition: $0.majorityPosition
                )
            }
        )
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
        self.init(
            id: vote.voteId, title: vote.voteTitle, date: vote.votedAt, result: vote.result,
            position: vote.position, scrutinKind: vote.scrutinKind
        )
    }
}

extension DeputyItem {
    init(_ deputy: Components.Schemas.DeputyListItem) {
        self.init(
            id: deputy.deputyId, name: deputy.fullName, group: deputy.party, groupShort: deputy.partyShort,
            department: deputy.department, circonscription: deputy.circonscription,
            photoURL: deputy.photoUrl.flatMap(URL.init(string:)), lastName: deputy.lastName
        )
    }
}
