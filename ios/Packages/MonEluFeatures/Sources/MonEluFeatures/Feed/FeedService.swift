import Foundation
import MonEluAPI
import MonEluCore

/// Accueil's two tabs (ADR-042 §4): what the user follows, or the week's
/// headline business at the Assembly.
public enum FeedTab: String, CaseIterable, Hashable, Sendable {
    case pourVous = "pour_vous"
    case assemblee

    var title: String {
        switch self {
        case .pourVous: "Pour vous"
        case .assemblee: "À l'Assemblée"
        }
    }
}

/// What the feed is asked for: one tab, and the follows that narrow it.
public struct FeedQuery: Hashable, Sendable {
    public var tab: FeedTab
    public var deputyID: String?
    public var themes: [String]

    public init(tab: FeedTab, deputyID: String?, themes: [String]) {
        self.tab = tab
        self.deputyID = deputyID
        self.themes = themes
    }

    /// The query for `filter`: a tap on one circle asks the API for that
    /// follow alone, so the app never filters the feed itself (ADR-042 §1).
    static func pourVous(deputyID: String?, themes: [String], filter: FeedFilter) -> FeedQuery {
        switch filter {
        case .all: FeedQuery(tab: .pourVous, deputyID: deputyID, themes: themes)
        case .deputy: FeedQuery(tab: .pourVous, deputyID: deputyID, themes: [])
        case .theme(let slug): FeedQuery(tab: .pourVous, deputyID: nil, themes: [slug])
        }
    }
}

/// One scrutin card, everything it shows as the API computed it.
public struct FeedScrutinCard: Hashable, Sendable, Identifiable {
    public let id: String
    public let date: Date?
    /// `ensemble`, `motion`, `amendement`, `article` or `autre`.
    public let kind: String
    public let title: String
    public let summary: String?
    public let theme: String?
    public let result: String?
    public let votesFor: Int?
    public let votesAgainst: Int?
    public let abstentions: Int?
    /// The week's closest scrutin with a known result.
    public let isClosest: Bool
    /// The followed deputy's position: `pour`, `contre`, `abstention` or `nonVotant`.
    public let deputyPosition: String?
    /// The scrutin's official page on assemblee-nationale.fr.
    public let officialURL: URL?
    /// The bill's id when it has a MonÉlu page.
    public let loiID: String?

    public init(
        id: String, date: Date?, kind: String, title: String, summary: String?, theme: String?, result: String?,
        votesFor: Int?, votesAgainst: Int?, abstentions: Int?, isClosest: Bool, deputyPosition: String?,
        officialURL: URL?, loiID: String?
    ) {
        self.id = id
        self.date = date
        self.kind = kind
        self.title = title
        self.summary = summary
        self.theme = theme
        self.result = result
        self.votesFor = votesFor
        self.votesAgainst = votesAgainst
        self.abstentions = abstentions
        self.isClosest = isClosest
        self.deputyPosition = deputyPosition
        self.officialURL = officialURL
        self.loiID = loiID
    }
}

/// The followed deputy's other positions of the week, as the API counted them.
public struct FeedRollup: Hashable, Sendable {
    /// Votes cast (pour, contre, abstention) that earned no card.
    public let total: Int
    public let amendements: Int
    public let articles: Int
    public let autres: Int
    /// Present but not voting; never part of `total`.
    public let nonVotant: Int

    public init(total: Int, amendements: Int, articles: Int, autres: Int, nonVotant: Int) {
        self.total = total
        self.amendements = amendements
        self.articles = articles
        self.autres = autres
        self.nonVotant = nonVotant
    }
}

/// One entry of the feed, in the order the API returned it.
public enum FeedEntry: Hashable, Sendable, Identifiable {
    case scrutin(FeedScrutinCard)
    case agenda(AgendaEntry)
    case rollup(FeedRollup)

    public var id: String {
        switch self {
        case .scrutin(let card): "scrutin:\(card.id)"
        case .agenda(let entry): "agenda:\(entry.id)"
        case .rollup: "rollup"
        }
    }
}

/// One week of the feed.
public struct FeedPage: Hashable, Sendable {
    /// The Monday and Sunday of the week shown, `YYYY-MM-DD`.
    public let weekStart: String
    public let weekEnd: String
    /// True when the current week had no scrutin and an earlier one is shown.
    public let noSitting: Bool
    public let entries: [FeedEntry]

    public init(weekStart: String, weekEnd: String, noSitting: Bool, entries: [FeedEntry]) {
        self.weekStart = weekStart
        self.weekEnd = weekEnd
        self.noSitting = noSitting
        self.entries = entries
    }
}

/// The feed's data, behind a protocol so the screen is tested with a stub.
public protocol FeedService: Sendable {
    func feed(_ query: FeedQuery) async throws -> FeedPage
}

/// `FeedService` on the generated client (`getFeed`).
public struct LiveFeedService: FeedService {
    private let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func feed(_ query: FeedQuery) async throws -> FeedPage {
        let response = try await client.getFeed(query: .init(
            tab: .init(rawValue: query.tab.rawValue),
            deputyId: query.deputyID,
            theme: query.themes.isEmpty ? nil : query.themes
        ))
        return FeedPage(try response.ok.body.json)
    }
}

extension FeedPage {
    init(_ page: Components.Schemas.FeedResponse) {
        self.init(
            weekStart: page.weekStart,
            weekEnd: page.weekEnd,
            noSitting: page.noSitting,
            // Each item carries exactly one payload; one with none is skipped.
            entries: page.items.compactMap { item in
                if let scrutin = item.scrutin { return .scrutin(FeedScrutinCard(scrutin)) }
                if let agenda = item.agenda { return .agenda(AgendaEntry(agenda)) }
                if let rollup = item.rollup { return .rollup(FeedRollup(rollup)) }
                return nil
            }
        )
    }
}

extension FeedScrutinCard {
    init(_ scrutin: Components.Schemas.FeedScrutin) {
        self.init(
            id: scrutin.voteId, date: scrutin.votedAt, kind: scrutin.scrutinKind, title: scrutin.title,
            summary: scrutin.summaryPlain, theme: scrutin.theme, result: scrutin.result,
            votesFor: scrutin.votesFor, votesAgainst: scrutin.votesAgainst, abstentions: scrutin.abstentions,
            isClosest: scrutin.closest ?? false, deputyPosition: scrutin.deputyPosition,
            officialURL: URL(string: scrutin.anUrl),
            loiID: scrutin.loisUrl == nil ? nil : scrutin.dossierId
        )
    }
}

extension FeedRollup {
    init(_ rollup: Components.Schemas.FeedRollup) {
        self.init(
            total: rollup.total, amendements: rollup.amendement, articles: rollup.article,
            autres: rollup.autre, nonVotant: rollup.nonVotant
        )
    }
}
