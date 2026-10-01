import MonEluCore
import Observation

/// The deputy list's state: the search and group the user set, the loaded
/// pages, and where the next one starts.
@MainActor
@Observable
public final class DeputiesListModel {
    public var searchText = ""
    /// The selected group's slug; nil for every group.
    public var groupSlug: String?
    public private(set) var isLoadingMore = false
    /// Set when the next page failed to load; the list offers a retry.
    public private(set) var loadMoreFailure: LoadFailure?
    public let loader: Loader<[DeputyItem]>
    /// The filter's choices, from the bundled `groups.json` (ADR-041 §4).
    public let groups: [ReferenceData.Group]

    private let service: any DeputiesService
    private var nextOffset: Int?
    /// The criteria the loaded list was fetched with.
    private var applied = Criteria(search: "", groupSlug: nil)

    struct Criteria: Hashable {
        var search: String
        var groupSlug: String?
    }

    /// What the user has set; the screen reloads when it differs from `applied`.
    var criteria: Criteria {
        Criteria(search: searchText.trimmingCharacters(in: .whitespacesAndNewlines), groupSlug: groupSlug)
    }

    var needsReload: Bool { criteria != applied }

    /// The selected group's name, for the filter's label.
    public var groupName: String? {
        groups.first { $0.slug == groupSlug }?.name
    }

    public init(service: any DeputiesService, groups: [ReferenceData.Group] = (try? ReferenceData.groups()) ?? []) {
        self.service = service
        self.groups = groups
        let box = ModelBox()
        loader = Loader(isEmpty: { $0.isEmpty }, fetch: { try await box.firstPage() })
        box.model = self
    }

    /// Reloads from the first page with the current search and group.
    public func reload() async {
        await loader.load()
    }

    /// Appends the next page, if there is one and none is already loading.
    public func loadMore() async {
        guard let offset = nextOffset, !isLoadingMore, loader.state.value != nil else { return }
        isLoadingMore = true
        loadMoreFailure = nil
        defer { isLoadingMore = false }
        let criteria = applied
        do {
            let page = try await service.deputies(query(criteria, offset: offset))
            // The search or group changed while this page was loading.
            guard criteria == applied else { return }
            nextOffset = page.nextOffset
            loader.update { $0 += page.items }
        } catch {
            loadMoreFailure = LoadFailure(error)
        }
    }

    fileprivate func firstPage() async throws -> [DeputyItem] {
        let criteria = criteria
        let page = try await service.deputies(query(criteria, offset: 0))
        applied = criteria
        nextOffset = page.nextOffset
        loadMoreFailure = nil
        return page.items
    }

    /// `listDeputies` filters on the group's full name, which `groups.json`
    /// holds for each slug.
    private func query(_ criteria: Criteria, offset: Int) -> DeputyQuery {
        let group = groups.first { $0.slug == criteria.groupSlug }?.name
        return DeputyQuery(search: criteria.search, group: group, offset: offset)
    }
}

/// Lets the loader's fetch closure reach the model it belongs to, which does
/// not exist yet when the closure is created.
@MainActor
private final class ModelBox {
    weak var model: DeputiesListModel?

    func firstPage() async throws -> [DeputyItem] {
        try await model?.firstPage() ?? []
    }
}
