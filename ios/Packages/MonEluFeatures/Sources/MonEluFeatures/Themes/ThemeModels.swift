import Foundation
import MonEluCore

/// A theme's page as `GET /themes/{slug}` returns it. Themes are MonÉlu's
/// classification, not the Assemblée's; every figure is the API's.
public struct ThemePage: Hashable, Sendable {
    public let slug: String
    public let name: String
    public let voteCount: Int
    /// Share adopted among scrutins with a known result; nil when none has one.
    public let adoptionRate: Double?
    public let mostDivided: ThemeDividedVote?
    /// In the API's order (by seats); `byPourRate` is the order the chart reads in.
    public let partyPositions: [ThemePartyPosition]
    /// The theme's most recent scrutins.
    public let votes: [VoteItem]

    public init(
        slug: String, name: String, voteCount: Int, adoptionRate: Double?, mostDivided: ThemeDividedVote?,
        partyPositions: [ThemePartyPosition], votes: [VoteItem]
    ) {
        self.slug = slug
        self.name = name
        self.voteCount = voteCount
        self.adoptionRate = adoptionRate
        self.mostDivided = mostDivided
        self.partyPositions = partyPositions
        self.votes = votes
    }
}

/// The theme's narrowest pour/contre margin.
public struct ThemeDividedVote: Hashable, Sendable {
    public let id: String
    public let title: String
    public let date: Date?
    public let votesFor: Int
    public let votesAgainst: Int
    /// `adopté` or `rejeté`, as the API recorded it.
    public let result: String?

    public init(id: String, title: String, date: Date?, votesFor: Int, votesAgainst: Int, result: String? = nil) {
        self.id = id
        self.title = title
        self.date = date
        self.votesFor = votesFor
        self.votesAgainst = votesAgainst
        self.result = result
    }
}

/// One group's positions summed across the theme's scrutins.
public struct ThemePartyPosition: Hashable, Sendable, Identifiable {
    /// Nil for deputies with no group, shown as non-inscrits.
    public let short: String?
    /// Share of "pour" among expressed positions, as the API computed it.
    public let pourRate: Double
    public let expressed: Int

    public var id: String { short ?? "" }

    public init(short: String?, pourRate: Double, expressed: Int) {
        self.short = short
        self.pourRate = pourRate
        self.expressed = expressed
    }
}

extension ReferenceData {
    /// The slug of the theme named `name` (a vote's `theme`); nil when unknown.
    static func themeSlug(named name: String?) -> String? {
        guard let name else { return nil }
        return themesByName[name]
    }

    private static let themesByName: [String: String] = {
        let rows = (try? ReferenceData.themes()) ?? []
        return Dictionary(rows.map { ($0.name, $0.slug) }, uniquingKeysWith: { first, _ in first })
    }()
}

extension ThemePage {
    /// The groups by their share of "pour", highest first, which is what the
    /// "Qui vote pour" bars show (#527); ties keep the API's order. The rates
    /// are the API's, only sorted here.
    var byPourRate: [ThemePartyPosition] {
        partyPositions.enumerated()
            .sorted { $0.element.pourRate != $1.element.pourRate ? $0.element.pourRate > $1.element.pourRate : $0.offset < $1.offset }
            .map(\.element)
    }
}
