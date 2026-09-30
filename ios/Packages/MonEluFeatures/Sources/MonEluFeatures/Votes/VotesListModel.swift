import MonEluCore
import Observation

/// The vote list's state: the search and filter the user set, the loaded
/// pages, and the cursor for the next one.
@MainActor
@Observable
public final class VotesListModel {
    public enum ResultFilter: String, CaseIterable, Identifiable, Sendable {
        case all, adopted, rejected

        public var id: String { rawValue }

        public var label: String {
            switch self {
            case .all: "Tous"
            case .adopted: "Adoptés"
            case .rejected: "Rejetés"
            }
        }

        /// The API's `result` parameter.
        var apiValue: String? {
            switch self {
            case .all: nil
            case .adopted: "adopté"
            case .rejected: "rejeté"
            }
        }
    }

    public var searchText = ""
    public var filter: ResultFilter = .all
    public private(set) var isLoadingMore = false
    /// Set when the next page failed to load; the list offers a retry.
    public private(set) var loadMoreFailure: LoadFailure?
    public let loader: Loader<[VoteItem]>

    private let service: any VotesService
    private var nextCursor: String?
    /// The criteria the loaded list was fetched with.
    private var applied = Criteria(search: "", filter: .all)

    struct Criteria: Hashable {
        var search: String
        var filter: ResultFilter
    }

    /// What the user has set; the screen reloads when it differs from `applied`.
    var criteria: Criteria {
        Criteria(search: searchText.trimmingCharacters(in: .whitespacesAndNewlines), filter: filter)
    }

    var needsReload: Bool { criteria != applied }

    public init(service: any VotesService) {
        self.service = service
        let box = ModelBox()
        loader = Loader(isEmpty: { $0.isEmpty }, fetch: { try await box.firstPage() })
        box.model = self
    }

    /// Reloads from the first page with the current search and filter.
    public func reload() async {
        await loader.load()
    }

    /// Appends the next page, if there is one and none is already loading.
    public func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore, loader.state.value != nil else { return }
        isLoadingMore = true
        loadMoreFailure = nil
        defer { isLoadingMore = false }
        let criteria = applied
        do {
            let page = try await service.votes(query(criteria, cursor: cursor))
            // The search or filter changed while this page was loading.
            guard criteria == applied else { return }
            nextCursor = page.nextCursor
            loader.update { $0 += page.items }
        } catch {
            loadMoreFailure = LoadFailure(error)
        }
    }

    fileprivate func firstPage() async throws -> [VoteItem] {
        let criteria = criteria
        let page = try await service.votes(query(criteria, cursor: nil))
        applied = criteria
        nextCursor = page.nextCursor
        loadMoreFailure = nil
        return page.items
    }

    private func query(_ criteria: Criteria, cursor: String?) -> VoteQuery {
        VoteQuery(search: criteria.search, result: criteria.filter.apiValue, cursor: cursor)
    }
}

/// Lets the loader's fetch closure reach the model it belongs to, which does
/// not exist yet when the closure is created.
@MainActor
private final class ModelBox {
    weak var model: VotesListModel?

    func firstPage() async throws -> [VoteItem] {
        try await model?.firstPage() ?? []
    }
}
