import Foundation
import MonEluCore

/// A parliamentary group's page as `GET /groups/{slug}` returns it. Every
/// rate and count is the API's: current members only (ADR-026).
public struct GroupPage: Hashable, Sendable {
    public let slug: String
    public let name: String
    /// The group's short label (`LFI`), from its members' `party_short`.
    public let short: String?
    public let memberCount: Int
    public let averagePresence: Double?
    public let averageDissidence: Double?
    public let members: [GroupMember]
    public let mostDissident: [GroupMember]
    public let dividedVotes: [GroupDividedVote]
    /// The group's place by current seats, as the API ranks it; nil for the
    /// non-inscrits, who are not a group (#526).
    public let seatRank: Int?

    public init(
        slug: String, name: String, short: String?, memberCount: Int, averagePresence: Double?,
        averageDissidence: Double?, members: [GroupMember], mostDissident: [GroupMember],
        dividedVotes: [GroupDividedVote], seatRank: Int? = nil
    ) {
        self.slug = slug
        self.name = name
        self.short = short
        self.memberCount = memberCount
        self.averagePresence = averagePresence
        self.averageDissidence = averageDissidence
        self.members = members
        self.mostDissident = mostDissident
        self.dividedVotes = dividedVotes
        self.seatRank = seatRank
    }

    /// "12 députés en mandat · 4e groupe de l'Assemblée" (#526).
    var countLine: String {
        let count = "\(MonEluFormat.count(memberCount)) député\(memberCount > 1 ? "s" : "") en mandat"
        guard let seatRank else { return count }
        return "\(count) · \(seatRank == 1 ? "1er" : "\(seatRank)e") groupe de l'Assemblée"
    }

    /// The members whose name contains `query`, ignoring case and accents.
    func members(matching query: String) -> [GroupMember] {
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return members }
        return members.filter {
            $0.deputy.name.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) != nil
        }
    }
}

/// A member with the two rates the API computed for them.
public struct GroupMember: Hashable, Sendable, Identifiable {
    public let deputy: DeputyItem
    public let presenceRate: Double?
    public let dissidentRate: Double?

    public var id: String { deputy.id }

    public init(deputy: DeputyItem, presenceRate: Double?, dissidentRate: Double?) {
        self.deputy = deputy
        self.presenceRate = presenceRate
        self.dissidentRate = dissidentRate
    }
}

/// A scrutin that divided the group: its result, and the group's own split.
public struct GroupDividedVote: Hashable, Sendable, Identifiable {
    public let id: String
    public let title: String
    public let date: Date?
    public let result: String?
    public let pour: Int
    public let contre: Int
    public let abstention: Int

    public init(id: String, title: String, date: Date?, result: String?, pour: Int, contre: Int, abstention: Int) {
        self.id = id
        self.title = title
        self.date = date
        self.result = result
        self.pour = pour
        self.contre = contre
        self.abstention = abstention
    }
}

extension ReferenceData {
    /// The slug of the group named `name` (the API's `party`), for a link to
    /// its page; nil for a name the table does not know.
    static func groupSlug(named name: String?) -> String? {
        guard let name else { return nil }
        return groupsByName[name]
    }

    private static let groupsByName: [String: String] = {
        let rows = (try? ReferenceData.groups()) ?? []
        return Dictionary(rows.map { ($0.name, $0.slug) }, uniquingKeysWith: { first, _ in first })
    }()
}
