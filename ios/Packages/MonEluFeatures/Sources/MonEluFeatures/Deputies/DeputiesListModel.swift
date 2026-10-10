import MonEluCore
import Observation

/// The deputy list's state: the search and chips the user set, the loaded
/// pages, and where the next one starts.
@MainActor
@Observable
public final class DeputiesListModel {
    public var searchText = ""
    /// The selected group's slug; nil for every group.
    public var groupSlug: String?
    /// "Mon département": only the followed deputy's département.
    public var onlyMyDepartment = false
    /// "En mandat": only current mandates. On by default (#523): the list
    /// opens on the sitting Assembly, as Explorer's tile counts it; former
    /// deputies are one tap away.
    public var inMandateOnly = true
    /// The followed deputy's département, which the "Mon département" chip
    /// needs; nil while unknown, and the chip is not offered.
    public private(set) var myDepartment: String?
    /// How many deputies match the loaded criteria in all.
    public private(set) var total: Int?
    public private(set) var isLoadingMore = false
    /// Set when the next page failed to load; the list offers a retry.
    public private(set) var loadMoreFailure: LoadFailure?
    public let loader: Loader<[DeputyItem]>
    /// The filter's choices, from the bundled `groups.json` (ADR-041 §4).
    public let groups: [ReferenceData.Group]

    private let service: any DeputiesService
    private var nextOffset: Int?
    /// The criteria the loaded list was fetched with.
    private var applied = Criteria(search: "", groupSlug: nil, department: nil, inMandateOnly: false)
    private let followedDeputyID: String?

    struct Criteria: Hashable {
        var search: String
        var groupSlug: String?
        var department: String?
        var inMandateOnly: Bool
    }

    /// What the user has set; the screen reloads when it differs from `applied`.
    var criteria: Criteria {
        Criteria(
            search: searchText.trimmingCharacters(in: .whitespacesAndNewlines),
            groupSlug: groupSlug,
            department: onlyMyDepartment ? myDepartment : nil,
            inMandateOnly: inMandateOnly
        )
    }

    var needsReload: Bool { criteria != applied }

    /// The selected group's name, for the filter's label.
    public var groupName: String? {
        groups.first { $0.slug == groupSlug }?.name
    }

    public init(
        service: any DeputiesService, groups: [ReferenceData.Group] = (try? ReferenceData.groups()) ?? [],
        followedDeputyID: String? = nil
    ) {
        self.service = service
        self.groups = groups
        self.followedDeputyID = followedDeputyID
        let box = ModelBox()
        loader = Loader(isEmpty: { $0.isEmpty }, fetch: { try await box.firstPage() })
        box.model = self
    }

    /// Reloads from the first page with the current search and chips.
    public func reload() async {
        await loader.load()
    }

    /// Looks up the followed deputy's département, for the "Mon département"
    /// chip. Without a followed deputy, or when the profile fails, the chip
    /// is not offered.
    public func loadMyDepartment() async {
        guard myDepartment == nil, let followedDeputyID else { return }
        myDepartment = try? await service.profile(id: followedDeputyID).deputy.department
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
        total = page.total
        nextOffset = page.nextOffset
        loadMoreFailure = nil
        return page.items
    }

    /// `listDeputies` filters on the group's full name, which `groups.json`
    /// holds for each slug.
    private func query(_ criteria: Criteria, offset: Int) -> DeputyQuery {
        let group = groups.first { $0.slug == criteria.groupSlug }?.name
        return DeputyQuery(
            search: criteria.search, group: group, department: criteria.department,
            active: criteria.inMandateOnly ? true : nil, offset: offset
        )
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
