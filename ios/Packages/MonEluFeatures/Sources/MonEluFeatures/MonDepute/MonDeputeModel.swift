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

/// Accueil's picker (#463, #477, #585, ADR-047): the address search that finds
/// the one deputy of the user's circonscription, the postal-code search that
/// finds the deputies of a département, and the list of the seats abroad. The
/// chosen deputy is added to those followed on the device. `followedID` is the
/// deputy it last chose or the first followed.
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

    /// The address search (ADR-047): suggestions from the Base Adresse
    /// Nationale, then the seat of the one the user picks.
    public enum AddressSearch: Equatable, Sendable {
        case idle
        case suggestions([AddressSuggestion])
        /// The suggestion service failed; the postal code still works.
        case suggestionsUnavailable
        case locating
        /// `address` is the label the user picked.
        case located(SeatLookup, address: String)
        /// The point is in no circonscription the API covers.
        case notFound(address: String)
        case failed(LoadFailure)
        case loadingAbroad
        case abroad([LocatedSeat])
    }

    public var postalCode = ""
    public private(set) var search: Search = .idle
    public var address = ""
    public private(set) var addressSearch: AddressSearch = .idle
    public private(set) var followedID: String?
    /// True while the user picks a deputy to add over the feed.
    public private(set) var isChanging = false
    /// The deputy picked in the results, followed once the user confirms.
    public private(set) var selection: DeputyItem?
    /// Why the picker is showing when the user did not ask for it.
    public private(set) var notice: String?

    private let deputies: any DeputiesService
    private let postalCodes: any PostalCodeService
    private let addresses: any AddressService
    private let circonscriptions: any CirconscriptionService
    private let store: any FollowedDeputyStore
    private var searchID = 0
    private var addressID = 0
    /// The label of the suggestion picked, so filling the field with it does
    /// not ask for suggestions again.
    private var pickedAddress: String?
    private var lastQueriedAddress: String?

    public var showsPicker: Bool { followedID == nil || isChanging }

    public init(
        deputies: any DeputiesService, postalCodes: any PostalCodeService,
        addresses: any AddressService, circonscriptions: any CirconscriptionService,
        store: any FollowedDeputyStore
    ) {
        self.deputies = deputies
        self.postalCodes = postalCodes
        self.addresses = addresses
        self.circonscriptions = circonscriptions
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
        resetAddressSearch()
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

    /// Asks for suggestions for `address`. The view calls it as the user types
    /// (debounced); the address goes to the Base Adresse Nationale only.
    public func suggestAddresses() async {
        let query = address.trimmingCharacters(in: .whitespacesAndNewlines)
        // Nothing new to ask: the label just picked, or the text last asked
        // about (the view's task runs again when the screen reappears).
        guard query != pickedAddress, query != lastQueriedAddress else { return }
        guard query.count >= LiveAddressService.minimumQueryLength else {
            if case .suggestions = addressSearch { addressSearch = .idle }
            return
        }
        lastQueriedAddress = query
        addressID += 1
        let id = addressID
        let next: AddressSearch
        do {
            next = .suggestions(try await addresses.suggestions(for: query))
        } catch let error where LoadFailure.isCancellation(error) {
            // The next keystroke cancelled this request: not a failure.
            if lastQueriedAddress == query { lastQueriedAddress = nil }
            return
        } catch {
            next = .suggestionsUnavailable
        }
        guard id == addressID else { return }
        // The user is typing a new address: what was found for the old one,
        // and the deputy picked from it, no longer apply.
        pickedAddress = nil
        selection = nil
        addressSearch = next
    }

    /// Finds the seat of a suggestion. Only its point goes to MonÉlu.
    public func pick(_ suggestion: AddressSuggestion) async {
        addressID += 1
        let id = addressID
        pickedAddress = suggestion.label
        address = suggestion.label
        selection = nil
        resetPostalSearch()
        addressSearch = .locating
        let next: AddressSearch
        do {
            if let lookup = try await circonscriptions.locate(
                latitude: suggestion.latitude, longitude: suggestion.longitude
            ) {
                next = .located(lookup, address: suggestion.label)
            } else {
                next = .notFound(address: suggestion.label)
            }
        } catch {
            next = .failed(LoadFailure(error))
        }
        guard id == addressID else { return }
        addressSearch = next
        if selection == nil, case .located(let lookup, _) = next, !lookup.uncertain,
           let deputy = lookup.seats.first?.deputy {
            // One sure seat: its deputy is the obvious choice; "Suivre" still confirms.
            selection = deputy
        }
    }

    /// Lists the 11 seats for French people abroad, by region.
    public func showAbroad() async {
        addressID += 1
        let id = addressID
        selection = nil
        resetPostalSearch()
        addressSearch = .loadingAbroad
        let next: AddressSearch
        do {
            next = .abroad(try await circonscriptions.abroad())
        } catch {
            next = .failed(LoadFailure(error))
        }
        guard id == addressID else { return }
        addressSearch = next
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
        selection = nil
        resetPostalSearch()
        postalCode = ""
        resetAddressSearch()
    }

    /// The two searches never show at once: starting one clears the other.
    private func resetPostalSearch() {
        searchID += 1
        search = .idle
    }

    private func resetAddressSearch() {
        addressID += 1
        address = ""
        pickedAddress = nil
        lastQueriedAddress = nil
        addressSearch = .idle
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
