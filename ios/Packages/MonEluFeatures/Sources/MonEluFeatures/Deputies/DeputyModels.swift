import Foundation

/// A deputy as the list shows them.
public struct DeputyItem: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    /// The group's full name (`Rassemblement National`); nil for a deputy the
    /// API has no group for.
    public let group: String?
    /// The group's short label (`RN`, `EPR`, …).
    public let groupShort: String?
    public let department: String?
    public let circonscription: String?
    public let photoURL: URL?
    /// The surname the list is sorted by, when the response carries it.
    public let lastName: String?

    public init(
        id: String, name: String, group: String?, groupShort: String?,
        department: String?, circonscription: String?, photoURL: URL?, lastName: String? = nil
    ) {
        self.id = id
        self.name = name
        self.group = group
        self.groupShort = groupShort
        self.department = department
        self.circonscription = circonscription
        self.photoURL = photoURL
        self.lastName = lastName
    }

    /// The list's section letter: the surname's first letter, accents and
    /// particles' case folded ("É" is "E", "de Courson" is "D").
    public var initial: String? {
        guard let first = lastName?.trimmingCharacters(in: .whitespaces).first else { return nil }
        return String(first).folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil).uppercased()
    }

    /// "Gironde · 4e circonscription", or whichever half the API returned.
    public var constituency: String? {
        let parts = [department, seat].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// "1re circonscription", "4e circonscription".
    public var seat: String? {
        circonscription.map { $0 == "1" ? "1re circonscription" : "\($0)e circonscription" }
    }
}

/// One page of the deputy list.
public struct DeputyPage: Sendable {
    public let items: [DeputyItem]
    /// How many deputies match the query in all.
    public let total: Int
    /// The offset this page starts at.
    public let offset: Int

    public init(items: [DeputyItem], total: Int, offset: Int) {
        self.items = items
        self.total = total
        self.offset = offset
    }

    /// Where the next page starts, or nil after the last one.
    public var nextOffset: Int? {
        let next = offset + items.count
        return items.isEmpty || next >= total ? nil : next
    }
}

/// What the list asks the API for.
public struct DeputyQuery: Hashable, Sendable {
    public var search: String
    /// The group's full name, exactly as `listDeputies` filters on it; nil
    /// for every group.
    public var group: String?
    /// The département's full name, as `listDeputies` filters on it.
    public var department: String?
    /// True for current mandates only; nil for every deputy of the legislature.
    public var active: Bool?
    public var offset: Int

    public init(
        search: String = "", group: String? = nil, department: String? = nil, active: Bool? = nil, offset: Int = 0
    ) {
        self.search = search
        self.group = group
        self.department = department
        self.active = active
        self.offset = offset
    }
}

/// A deputy's identity and mandate.
public struct DeputyProfile: Hashable, Sendable {
    public let deputy: DeputyItem
    public let mandateStart: Date?
    /// Nil while the deputy holds the seat.
    public let mandateEnd: Date?

    public init(deputy: DeputyItem, mandateStart: Date?, mandateEnd: Date?) {
        self.deputy = deputy
        self.mandateStart = mandateStart
        self.mandateEnd = mandateEnd
    }
}

/// A deputy's voting figures, exactly as `getScorecard` returns them. The
/// rates are the API's, 0 to 1; the app never divides one count by another
/// (ADR-019: `presence_rate`'s denominator is not even in the response).
public struct DeputyScorecard: Hashable, Sendable {
    public let totalVotes: Int
    public let presenceRate: Double
    public let votesFor: Int
    public let votesAgainst: Int
    public let abstentions: Int
    public let eligibleSolennels: Int
    public let solennelsCast: Int
    public let solennelParticipationRate: Double
    public let eligibleVotingDays: Int
    public let votingDaysPresent: Int
    public let votingDaysRate: Double
    /// Share of "pour" among expressed positions (`votes_for_pct`, 0 to 1).
    public let votesForRate: Double?

    public init(
        totalVotes: Int, presenceRate: Double, votesFor: Int, votesAgainst: Int, abstentions: Int,
        eligibleSolennels: Int, solennelsCast: Int, solennelParticipationRate: Double,
        eligibleVotingDays: Int, votingDaysPresent: Int, votingDaysRate: Double, votesForRate: Double? = nil
    ) {
        self.totalVotes = totalVotes
        self.presenceRate = presenceRate
        self.votesFor = votesFor
        self.votesAgainst = votesAgainst
        self.abstentions = abstentions
        self.eligibleSolennels = eligibleSolennels
        self.solennelsCast = solennelsCast
        self.solennelParticipationRate = solennelParticipationRate
        self.eligibleVotingDays = eligibleVotingDays
        self.votingDaysPresent = votingDaysPresent
        self.votingDaysRate = votingDaysRate
        self.votesForRate = votesForRate
    }
}

/// A scrutin with the deputy's position on it.
public struct DeputyVote: Identifiable, Hashable, Sendable {
    public let id: String
    public let title: String
    public let date: Date?
    /// The scrutin's result, `adopté` or `rejeté`, as the API states it.
    public let result: String?
    /// `pour`, `contre`, `abstention` or `nonVotant`.
    public let position: String
    /// What the scrutin decided (`ensemble`, `motion`, `amendement`,
    /// `article`, `autre`), as the API classifies it; nil when unclassified.
    public let scrutinKind: String?

    public init(
        id: String, title: String, date: Date?, result: String?, position: String, scrutinKind: String? = nil
    ) {
        self.id = id
        self.title = title
        self.date = date
        self.result = result
        self.position = position
        self.scrutinKind = scrutinKind
    }

    /// "Vote sur l'ensemble du texte", "Vote sur un amendement", …; nil for
    /// `autre` or an unclassified scrutin, whose title already says it all.
    public var scope: String? {
        switch scrutinKind {
        case "ensemble": "Vote sur l'ensemble du texte"
        case "motion": "Vote sur une motion"
        case "amendement": "Vote sur un amendement"
        case "article": "Vote sur un article"
        default: nil
        }
    }
}

/// Everything a profile shows. The scorecard and recent votes are optional:
/// the profile still opens when only those requests fail, as on the website.
public struct DeputyProfilePage: Hashable, Sendable {
    public let profile: DeputyProfile
    public let scorecard: DeputyScorecard?
    public let recentVotes: [DeputyVote]?
    /// Nil when the alignment failed to load; the section is left out.
    public let alignment: DeputyAlignment?

    public init(
        profile: DeputyProfile, scorecard: DeputyScorecard?, recentVotes: [DeputyVote]?, alignment: DeputyAlignment? = nil
    ) {
        self.profile = profile
        self.scorecard = scorecard
        self.recentVotes = recentVotes
        self.alignment = alignment
    }
}

/// How often a deputy votes with their group, as `getAlignment` computed it.
public struct DeputyAlignment: Hashable, Sendable {
    /// 0 to 1, over the deputy's expressed positions.
    public let alignmentRate: Double
    public let dissidentVotes: Int
    public let totalVotes: Int

    public init(alignmentRate: Double, dissidentVotes: Int, totalVotes: Int) {
        self.alignmentRate = alignmentRate
        self.dissidentVotes = dissidentVotes
        self.totalVotes = totalVotes
    }
}

/// A scrutin where the deputy voted against their group's majority.
public struct DissidentVote: Identifiable, Hashable, Sendable {
    public let id: String
    public let title: String
    public let date: Date?
    public let result: String?
    public let position: String
    /// The group's plurality position, as the API computed it.
    public let majorityPosition: String

    public init(id: String, title: String, date: Date?, result: String?, position: String, majorityPosition: String) {
        self.id = id
        self.title = title
        self.date = date
        self.result = result
        self.position = position
        self.majorityPosition = majorityPosition
    }
}

/// The dissident votes: how many in all, and the latest.
public struct DissidentVotes: Hashable, Sendable {
    public let total: Int
    public let items: [DissidentVote]

    public init(total: Int, items: [DissidentVote]) {
        self.total = total
        self.items = items
    }
}
