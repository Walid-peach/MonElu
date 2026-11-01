import Foundation

/// A scrutin as the list shows it.
public struct VoteItem: Identifiable, Hashable, Sendable {
    public let id: String
    public let title: String
    public let date: Date?
    /// `adopté` or `rejeté`, exactly as the API states it.
    public let result: String?
    public let summary: String?
    public let theme: String?
    /// The counts the list returns, for its split bar; nil where the
    /// response carries none.
    public let votesFor: Int?
    public let votesAgainst: Int?
    public let abstentions: Int?

    public init(
        id: String, title: String, date: Date?, result: String?, summary: String?, theme: String?,
        votesFor: Int? = nil, votesAgainst: Int? = nil, abstentions: Int? = nil
    ) {
        self.id = id
        self.title = title
        self.date = date
        self.result = result
        self.summary = summary
        self.theme = theme
        self.votesFor = votesFor
        self.votesAgainst = votesAgainst
        self.abstentions = abstentions
    }
}

/// One page of the vote list and the cursor for the next one.
public struct VotePage: Sendable {
    public let items: [VoteItem]
    public let nextCursor: String?

    public init(items: [VoteItem], nextCursor: String?) {
        self.items = items
        self.nextCursor = nextCursor
    }
}

/// What the list asks the API for.
public struct VoteQuery: Hashable, Sendable {
    public var search: String
    /// `adopté`, `rejeté`, or nil for both.
    public var result: String?
    /// The theme's name, exactly as `listVotes` filters on it; nil for every theme.
    public var theme: String?
    /// What the scrutins decided (`ensemble`, `motion`, …, #481); empty for every kind.
    public var kinds: [String]
    /// `next_cursor` of the previous page; nil for the first page.
    public var cursor: String?

    public init(
        search: String = "", result: String? = nil, theme: String? = nil, kinds: [String] = [], cursor: String? = nil
    ) {
        self.search = search
        self.result = result
        self.theme = theme
        self.kinds = kinds
        self.cursor = cursor
    }
}

/// One deputy's position on a scrutin.
public struct DeputyPosition: Hashable, Sendable {
    public let deputyID: String
    public let name: String
    /// The group's short label (`EPR`, `LFI`, …); nil for a non-inscrit.
    public let group: String?
    /// `pour`, `contre`, `abstention` or `nonVotant`.
    public let position: String

    public init(deputyID: String, name: String, group: String?, position: String) {
        self.deputyID = deputyID
        self.name = name
        self.group = group
        self.position = position
    }
}

/// How much of the chamber took part in a scrutin (the API's
/// `participation`, #627). Every figure is the API's; the app only shows it.
public struct VoteTurnout: Hashable, Sendable {
    /// Deputies with a recorded position, non-votants included.
    public let participants: Int
    /// Of which non-votants: present, no position taken.
    public let nonVoting: Int
    /// The chamber's seats (577).
    public let seats: Int
    /// participants / seats, 0 to 1.
    public let rate: Double
    /// The median rate of the scrutins of the same type; nil when unknown.
    public let typicalRate: Double?
    /// `below`, `usual` or `above` the typical rate; nil when unknown.
    public let comparison: String?
    /// Each group's turnout, keyed like `DeputyPosition.group`.
    public let groups: [GroupTurnout]

    public init(
        participants: Int, nonVoting: Int, seats: Int, rate: Double,
        typicalRate: Double?, comparison: String?, groups: [GroupTurnout]
    ) {
        self.participants = participants
        self.nonVoting = nonVoting
        self.seats = seats
        self.rate = rate
        self.typicalRate = typicalRate
        self.comparison = comparison
        self.groups = groups
    }
}

/// One group's turnout: its participants over its members on the vote's date.
public struct GroupTurnout: Hashable, Sendable {
    /// The group's short label; nil for the non-inscrits.
    public let group: String?
    public let participants: Int
    public let members: Int
    /// participants / members, 0 to 1.
    public let rate: Double

    public init(group: String?, participants: Int, members: Int, rate: Double) {
        self.group = group
        self.participants = participants
        self.members = members
        self.rate = rate
    }
}

/// A scrutin's detail.
public struct VoteDetail: Hashable, Sendable {
    public let item: VoteItem
    public let votesFor: Int?
    public let votesAgainst: Int?
    public let abstentions: Int?
    public let positions: [DeputyPosition]
    public let dossierTitle: String?
    /// The bill's page on the website, when it has one (the API's `lois_url`).
    public let dossierURL: URL?
    /// The API's `total_voters`.
    public let totalVoters: Int?
    /// The bill's dossier uid, for its page in the app (#482).
    public let dossierID: String?
    /// The bill's derived status (`en_navette`, …).
    public let dossierStatus: String?
    /// The scrutin's page on assemblee-nationale.fr (the API's `an_url`, #617).
    public let officialURL: URL?
    /// `spo` (ordinary), `sps` (solemn) or `moc` (censure motion).
    public let voteType: String?
    /// The three tallies over the voters, 0 to 1 (the API's `pct_*`).
    public let pctPour: Double?
    public let pctContre: Double?
    public let pctAbstention: Double?
    /// The `pour` votes needed to adopt (the API's `majority_required`).
    public let majorityRequired: Int?
    /// The turnout (the API's `participation`, #627).
    public let turnout: VoteTurnout?

    public init(
        item: VoteItem, votesFor: Int?, votesAgainst: Int?, abstentions: Int?,
        positions: [DeputyPosition], dossierTitle: String?, dossierURL: URL?,
        totalVoters: Int? = nil, dossierID: String? = nil, dossierStatus: String? = nil,
        officialURL: URL? = nil, voteType: String? = nil,
        pctPour: Double? = nil, pctContre: Double? = nil, pctAbstention: Double? = nil,
        majorityRequired: Int? = nil, turnout: VoteTurnout? = nil
    ) {
        self.item = item
        self.votesFor = votesFor
        self.votesAgainst = votesAgainst
        self.abstentions = abstentions
        self.positions = positions
        self.dossierTitle = dossierTitle
        self.dossierURL = dossierURL
        self.totalVoters = totalVoters
        self.dossierID = dossierID
        self.dossierStatus = dossierStatus
        self.officialURL = officialURL
        self.voteType = voteType
        self.pctPour = pctPour
        self.pctContre = pctContre
        self.pctAbstention = pctAbstention
        self.majorityRequired = majorityRequired
        self.turnout = turnout
    }

    /// The API's turnout for a group of `positionsByGroup`, if it sent one.
    func turnout(of group: GroupPositions) -> GroupTurnout? {
        turnout?.groups.first { ($0.group ?? GroupPositions.nonInscrit) == group.group }
    }

    /// The bill has a page (the API's `lois_url` is set only then), so the
    /// "Le texte" card can open it in the app.
    public var hasLoiPage: Bool { dossierID != nil && dossierURL != nil }

    /// "8441", from the AN's scrutin id (`VTANR5L17V8441`): a label only.
    public var scrutinNumber: String? {
        guard let range = item.id.range(of: #"V(\d+)$"#, options: .regularExpression) else { return nil }
        return String(item.id[range].dropFirst())
    }

    /// The followed deputy's position on this scrutin, if they have one.
    func position(of deputyID: String?) -> DeputyPosition? {
        guard let deputyID else { return nil }
        return positions.first { $0.deputyID == deputyID }
    }

    /// The positions tallied per group, largest group first. A display
    /// grouping of what the API returned, as the website does; the scrutin's
    /// own totals and result always come from the API.
    public var positionsByGroup: [GroupPositions] {
        Dictionary(grouping: positions, by: { $0.group ?? GroupPositions.nonInscrit })
            .map { group, members in
                GroupPositions(
                    group: group,
                    counts: Dictionary(members.map { ($0.position, 1) }, uniquingKeysWith: +)
                )
            }
            .sorted { ($0.total, $1.group) > ($1.total, $0.group) }
    }
}

/// How one group split on a scrutin.
public struct GroupPositions: Identifiable, Hashable, Sendable {
    public static let nonInscrit = "Non inscrit"
    /// Display order of the positions, matching `vote_positions.json`.
    public static let positionOrder = ["pour", "contre", "abstention", "nonVotant"]

    public let group: String
    public let counts: [String: Int]

    public var id: String { group }
    public var total: Int { counts.values.reduce(0, +) }

    /// The positions this group took, in display order, with their counts.
    public var ordered: [(position: String, count: Int)] {
        Self.positionOrder.compactMap { position in
            counts[position].map { (position, $0) }
        }
    }
}
