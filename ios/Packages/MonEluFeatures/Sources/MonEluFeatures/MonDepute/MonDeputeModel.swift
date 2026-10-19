import Foundation
import MonEluCore
import Observation

/// The deputies of one département, for the picker.
public struct DepartmentDeputies: Hashable, Sendable, Identifiable {
    public let department: PostalDepartment
    public let deputies: [DeputyItem]
    public var id: String { department.code }

    public init(department: PostalDepartment, deputies: [DeputyItem]) {
        self.department = department
        self.deputies = deputies
    }
}

/// Accueil's postal-code picker (#463, #477, #585): the search that finds the
/// deputies of a département and adds the chosen one to those followed on
/// the device. `followedID` is the deputy it last chose or the first followed.
@MainActor
@Observable
public final class MonDeputeModel {
    public enum Search: Equatable, Sendable {
        case idle
        /// Not five digits; nothing was sent.
        case invalid
        case searching
        /// geo.api.gouv.fr knows no commune with this code.
        case unknown
        case failed(LoadFailure)
        case found([DepartmentDeputies])
    }

    public var postalCode = ""
    public private(set) var search: Search = .idle
    public private(set) var followedID: String?
    /// True while the user picks a deputy to add over the feed.
    public private(set) var isChanging = false
    /// The deputy picked in the results, followed once the user confirms.
    public private(set) var selection: DeputyItem?
    /// Why the picker is showing when the user did not ask for it.
    public private(set) var notice: String?

    private let deputies: any DeputiesService
    private let postalCodes: any PostalCodeService
    private let store: any FollowedDeputyStore
    private var searchID = 0

    public var showsPicker: Bool { followedID == nil || isChanging }

    public init(deputies: any DeputiesService, postalCodes: any PostalCodeService, store: any FollowedDeputyStore) {
        self.deputies = deputies
        self.postalCodes = postalCodes
        self.store = store
        followedID = store.deputyID
    }

    /// Looks the postal code up and lists the deputies of its départements.
    /// The code goes to geo.api.gouv.fr only, and is not kept.
    public func runSearch() async {
        guard let code = PostalCode.normalized(postalCode) else {
            search = .invalid
            return
        }
        searchID += 1
        let id = searchID
        selection = nil
        search = .searching
        let result: Search
        do {
            let departments = try await postalCodes.departments(forPostalCode: code)
            if departments.isEmpty {
                result = .unknown
            } else {
                result = .found(try await deputies(of: departments))
            }
        } catch {
            result = .failed(LoadFailure(error))
        }
        // A newer search started while this one ran.
        guard id == searchID else { return }
        search = result
    }

    /// Marks `deputy` as the one to follow; "Suivre" confirms it.
    public func select(_ deputy: DeputyItem) {
        selection = deputy
    }

    /// Follows the selected deputy.
    public func followSelection() {
        if let selection { choose(selection) }
    }

    /// Adds `deputy` to the followed deputies and closes the picker; at the
    /// cap the picker stays with a notice. All follows are equal (ADR-042
    /// amendment §6), so choosing never replaces another deputy (#585).
    public func choose(_ deputy: DeputyItem) {
        guard store.follow(deputy.id) else {
            notice = "Vous suivez déjà \(FollowedDeputies.cap) députés. Retirez-en un pour en suivre un autre."
            return
        }
        followedID = deputy.id
        isChanging = false
        notice = nil
        resetSearch()
    }

    /// Shows the picker to add a deputy; the followed ones stay.
    public func startChange() {
        isChanging = true
    }

    public func cancelChange() {
        isChanging = false
        resetSearch()
    }

    /// Stops following the shown deputy and forgets their reading position;
    /// the next followed deputy, if any, is shown instead.
    public func unfollow() {
        if let followedID { store.unfollow(followedID) }
        followedID = store.deputyID
        isChanging = false
        resetSearch()
    }

    /// The store's deputies, as another screen may have changed them (a
    /// profile's "Suivre", #576). `followedID` is the model's own copy so the
    /// picker and the feed change together; this brings both up to date. The
    /// shown deputy stays while still followed, so a change this model made
    /// itself, or a follow added elsewhere, does nothing.
    public func syncWithStore() {
        if let followedID, store.isFollowing(followedID) { return }
        let stored = store.deputyID
        guard stored != followedID else { return }
        followedID = stored
        isChanging = false
        notice = nil
        resetSearch()
    }

    private func resetSearch() {
        searchID += 1
        selection = nil
        postalCode = ""
        search = .idle
    }

    private func deputies(of departments: [PostalDepartment]) async throws -> [DepartmentDeputies] {
        try await withThrowingTaskGroup(of: (Int, DepartmentDeputies).self) { group in
            for (index, department) in departments.enumerated() {
                group.addTask { [deputies] in
                    (index, DepartmentDeputies(
                        department: department, deputies: try await deputies.departmentDeputies(code: department.code)
                    ))
                }
            }
            var found: [(Int, DepartmentDeputies)] = []
            for try await entry in group { found.append(entry) }
            return found.sorted { $0.0 < $1.0 }.map(\.1)
        }
    }
}
