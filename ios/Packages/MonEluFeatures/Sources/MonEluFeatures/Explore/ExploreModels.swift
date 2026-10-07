import Foundation
import MonEluCore

/// A parliamentary group and its seats today, as `listGroups` returns them.
public struct GroupSeats: Hashable, Sendable, Identifiable {
    public let slug: String
    public let name: String
    public let short: String?
    public let seats: Int
    public var id: String { slug }

    public init(slug: String, name: String, short: String?, seats: Int) {
        self.slug = slug
        self.name = name
        self.short = short
        self.seats = seats
    }
}

/// A bill in the list of those with a page.
public struct LoiListItem: Hashable, Sendable, Identifiable {
    public let id: String
    public let title: String?
    /// The derived status (`promulguee`, `en_navette`, …, ADR-035 §5).
    public let status: String?
    public let lastVote: Date?
    public let theme: String?
    /// Its scrutins other than amendment and article votes.
    public let headlineCount: Int?

    public init(
        id: String, title: String?, status: String?, lastVote: Date?, theme: String?, headlineCount: Int?
    ) {
        self.id = id
        self.title = title
        self.status = status
        self.lastVote = lastVote
        self.theme = theme
        self.headlineCount = headlineCount
    }
}

public struct LoiList: Hashable, Sendable {
    public let items: [LoiListItem]
    public let total: Int

    public init(items: [LoiListItem], total: Int) {
        self.items = items
        self.total = total
    }
}

/// A département by its INSEE code and name, from the bundled table.
public struct DepartmentRef: Hashable, Sendable, Identifiable {
    public let code: String
    public let name: String
    public var id: String { code }

    public init(code: String, name: String) {
        self.code = code
        self.name = name
    }
}

/// What Explorer's contents page shows beyond the fixed tables: the counts
/// on its tiles, the groups' seats and the user's own département. Each part
/// is nil when its request failed, and the page leaves it out.
public struct ExploreHub: Hashable, Sendable {
    /// Deputies in mandate today (`listDeputies?active=true`'s total).
    public let deputiesInMandate: Int?
    /// Bills with a page (`listLois`'s total).
    public let loiCount: Int?
    public let groups: [GroupSeats]?
    /// The followed deputy's département.
    public let myDepartment: DepartmentRef?
    /// The followed deputy the hub was loaded for, so the screen can tell
    /// when the user has followed someone else since.
    public let followedDeputyID: String?

    public init(
        deputiesInMandate: Int?, loiCount: Int?, groups: [GroupSeats]?, myDepartment: DepartmentRef?,
        followedDeputyID: String? = nil
    ) {
        self.deputiesInMandate = deputiesInMandate
        self.loiCount = loiCount
        self.groups = groups
        self.myDepartment = myDepartment
        self.followedDeputyID = followedDeputyID
    }

    /// Loads every part at once; none of them can fail the page.
    static func load(
        deputies: any DeputiesService, lois: any LoisService, groups: any GroupsService, followedDeputyID: String?
    ) async -> ExploreHub {
        async let inMandate = try? deputies.deputies(DeputyQuery(active: true)).total
        async let loiCount = try? lois.lois().total
        async let seats = try? groups.groups()
        async let mine = myDepartment(deputies: deputies, followedDeputyID: followedDeputyID)
        return ExploreHub(
            deputiesInMandate: await inMandate, loiCount: await loiCount, groups: await seats, myDepartment: await mine,
            followedDeputyID: followedDeputyID
        )
    }

    /// The followed deputy's département, when there is one and the bundled
    /// table knows its name.
    static func myDepartment(deputies: any DeputiesService, followedDeputyID: String?) async -> DepartmentRef? {
        guard let followedDeputyID,
              let name = try? await deputies.profile(id: followedDeputyID).deputy.department,
              let code = ReferenceData.departmentCode(named: name)
        else { return nil }
        return DepartmentRef(code: code, name: name)
    }
}
