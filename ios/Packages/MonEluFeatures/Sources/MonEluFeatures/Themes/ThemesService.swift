import Foundation
import MonEluAPI

/// The theme page's data, behind a protocol so screens are tested with a stub.
public protocol ThemesService: Sendable {
    /// Nil for an unknown slug (a 404).
    func theme(slug: String) async throws -> ThemePage?
}

/// `ThemesService` on the generated client (`getTheme`).
public struct LiveThemesService: ThemesService {
    /// The page shows the theme's latest scrutins, not all of them.
    static let recentVotes = 10

    private let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func theme(slug: String) async throws -> ThemePage? {
        let response = try await client.getTheme(path: .init(slug: slug), query: .init(limit: Self.recentVotes))
        // A 404 is not in the spec, so the client reports it as undocumented.
        if case .undocumented(statusCode: 404, _) = response { return nil }
        return ThemePage(try response.ok.body.json)
    }
}

extension ThemePage {
    init(_ theme: Components.Schemas.ThemeDetail) {
        self.init(
            slug: theme.slug,
            name: theme.name,
            voteCount: theme.voteCount,
            adoptionRate: theme.adoptionRate,
            mostDivided: theme.mostDividedVote.map {
                ThemeDividedVote(
                    id: $0.voteId, title: $0.voteTitle, date: $0.votedAt,
                    votesFor: $0.votesFor, votesAgainst: $0.votesAgainst
                )
            },
            partyPositions: theme.partyPositions.map {
                ThemePartyPosition(short: $0.partyShort, pourRate: $0.pourRate, expressed: $0.expressed)
            },
            votes: theme.votes.map {
                VoteItem(
                    id: $0.voteId, title: $0.voteTitle, date: $0.votedAt, result: $0.result,
                    summary: $0.summaryPlain, theme: theme.name
                )
            }
        )
    }
}
