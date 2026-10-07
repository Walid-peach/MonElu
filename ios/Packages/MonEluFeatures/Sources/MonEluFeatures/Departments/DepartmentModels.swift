import Foundation
import MonEluCore

/// A département's page as `GET /departments/{code}` returns it: its
/// current deputies, the groups they sit in and the votes that split them.
public struct DepartmentPage: Hashable, Sendable {
    public let code: String
    public let name: String
    public let deputyCount: Int
    /// In the API's order.
    public let composition: [DepartmentGroupCount]
    /// By circonscription.
    public let deputies: [DepartmentDeputy]
    public let splitVotes: [GroupDividedVote]

    public init(
        code: String, name: String, deputyCount: Int, composition: [DepartmentGroupCount],
        deputies: [DepartmentDeputy], splitVotes: [GroupDividedVote]
    ) {
        self.code = code
        self.name = name
        self.deputyCount = deputyCount
        self.composition = composition
        self.deputies = deputies
        self.splitVotes = splitVotes
    }
}

/// How many of the département's deputies sit in one group.
public struct DepartmentGroupCount: Hashable, Sendable, Identifiable {
    /// The group's full name; nil for deputies in no group.
    public let group: String?
    /// Its short label, from the département's own deputies.
    public let short: String?
    public let count: Int

    public var id: String { group ?? "" }

    public init(group: String?, short: String?, count: Int) {
        self.group = group
        self.short = short
        self.count = count
    }
}

/// A deputy and their participation in scrutins solennels, as the API computed it.
public struct DepartmentDeputy: Hashable, Sendable, Identifiable {
    public let deputy: DeputyItem
    public let solennelRate: Double?

    public var id: String { deputy.id }

    public init(deputy: DeputyItem, solennelRate: Double?) {
        self.deputy = deputy
        self.solennelRate = solennelRate
    }

    /// The circonscription as a number, to order the list; unknown last.
    var seat: Int { deputy.circonscription.flatMap(Int.init) ?? .max }

    /// "1re", "4e".
    var seatLabel: String? {
        deputy.circonscription.map { $0 == "1" ? "1re" : "\($0)e" }
    }
}

extension ReferenceData {
    /// The INSEE code of the département named `name` (a deputy's
    /// `department`), for a link to its page; nil when unknown.
    static func departmentCode(named name: String?) -> String? {
        guard let name else { return nil }
        return departmentsByName[name]
    }

    private static let departmentsByName: [String: String] = {
        let rows = (try? ReferenceData.departments()) ?? []
        return Dictionary(rows.map { ($0.name, $0.code) }, uniquingKeysWith: { first, _ in first })
    }()
}
