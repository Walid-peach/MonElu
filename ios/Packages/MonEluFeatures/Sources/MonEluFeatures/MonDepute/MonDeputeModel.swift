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

/// What the home says about the votes since the previous visit.
public enum SinceLastVisit: Hashable, Sendable {
    /// No previous visit on this device: nothing to compare with yet.
    case firstVisit
    /// The scrutins held after the newest vote shown last time.
    case votes([DeputyVote], after: Date)
    /// The request failed; the rest of the home still shows.
    case unavailable
}

/// Everything the home shows.
public struct MonDeputeHome: Hashable, Sendable {
    public let page: DeputyProfilePage
    public let sinceLastVisit: SinceLastVisit

    public init(page: DeputyProfilePage, sinceLastVisit: SinceLastVisit) {
        self.page = page
        self.sinceLastVisit = sinceLastVisit
    }
}

/// The Mon député tab's state: the followed deputy, kept on the device, the
/// postal-code search that chooses one, and the home that loads them.
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
    /// True while the user picks another deputy over the one they follow.
    public private(set) var isChanging = false
    /// Why the picker is showing when the user did not ask for it.
    public private(set) var notice: String?
    /// The followed deputy's home; nil while no deputy is followed.
    public private(set) var home: Loader<MonDeputeHome>?

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
        if let followedID { home = makeHome(followedID) }
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

    /// Follows `deputy` and opens their home.
    public func choose(_ deputy: DeputyItem) {
        if let current = followedID, current != deputy.id { store.clear() }
        store.follow(deputy.id)
        followedID = deputy.id
        isChanging = false
        notice = nil
        resetSearch()
        home = makeHome(deputy.id)
    }

    /// Shows the picker over the followed deputy, who stays until another is chosen.
    public func startChange() {
        isChanging = true
    }

    public func cancelChange() {
        isChanging = false
        resetSearch()
    }

    /// Forgets the followed deputy and their reading position.
    public func unfollow() {
        store.clear()
        followedID = nil
        isChanging = false
        home = nil
        resetSearch()
    }

    private func resetSearch() {
        searchID += 1
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

    private func makeHome(_ id: String) -> Loader<MonDeputeHome> {
        let deputies = deputies, store = store
        return Loader { [weak self] in
            do {
                return try await Self.loadHome(id: id, deputies: deputies, store: store)
            } catch let error as DeputyNotFound {
                await self?.deputyDisappeared(error.id)
                throw error
            }
        }
    }

    /// The stored deputy no longer exists: back to the picker, saying why,
    /// rather than a home that can never load.
    private func deputyDisappeared(_ id: String) {
        guard followedID == id else { return }
        unfollow()
        notice = "Le député que vous suiviez n'est plus dans nos données. Choisissez-en un autre."
    }

    /// Loads the home, then advances the reading position to the newest vote
    /// it showed.
    ///
    /// The position is a scrutin's `voted_at`, not the time of the visit: the
    /// API compares `voted_at > since`, scrutins are dated at midnight and
    /// arrive the next morning, so a wall-clock timestamp would hide every
    /// scrutin held on the day of a visit.
    nonisolated static func loadHome(
        id: String, deputies: any DeputiesService, store: any FollowedDeputyStore, now: Date = Date()
    ) async throws -> MonDeputeHome {
        let lastSeen = store.lastSeenVote(for: id)
        async let page = deputies.profilePage(id: id)
        async let newVotes = votes(of: id, since: lastSeen, deputies: deputies)
        let home: MonDeputeHome
        switch (lastSeen, await newVotes) {
        case (nil, _): home = MonDeputeHome(page: try await page, sinceLastVisit: .firstVisit)
        case let (lastSeen?, votes?): home = MonDeputeHome(page: try await page, sinceLastVisit: .votes(votes, after: lastSeen))
        case (_?, nil): home = MonDeputeHome(page: try await page, sinceLastVisit: .unavailable)
        }
        if let position = readingPosition(after: home, lastSeen: lastSeen, now: now) {
            store.setLastSeenVote(position, for: id)
        }
        return home
    }

    /// The votes after `since`; nil on a first visit or when the request fails.
    nonisolated private static func votes(
        of id: String, since: Date?, deputies: any DeputiesService
    ) async -> [DeputyVote]? {
        guard let since else { return nil }
        return try? await deputies.votes(id: id, since: since)
    }

    /// Where the next visit's "since" starts, or nil to keep the current one
    /// (when a list it depends on failed to load).
    nonisolated static func readingPosition(after home: MonDeputeHome, lastSeen: Date?, now: Date) -> Date? {
        guard let recent = home.page.recentVotes else { return nil }
        if case .unavailable = home.sinceLastVisit { return nil }
        var shown = recent.compactMap(\.date)
        if case .votes(let votes, _) = home.sinceLastVisit { shown += votes.compactMap(\.date) }
        if let newest = shown.max() { return max(newest, lastSeen ?? newest) }
        if let lastSeen { return lastSeen }
        // A deputy with no vote yet: from the start of today (scrutin dates
        // are midnight UTC), so a scrutin held later today still counts.
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar.startOfDay(for: now).addingTimeInterval(-1)
    }
}
