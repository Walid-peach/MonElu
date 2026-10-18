import MonEluCore
import MonEluUI
import SwiftUI

/// The Accueil tab (#565, ADR-042, design « Accueil V1 »): the row of
/// follows, then the feed the API builds for them, in two tabs. A first
/// visit with nothing followed opens on the feed too, on « À l'Assemblée »
/// (#575); the postal-code search shows only while adding a deputy. Every
/// followed deputy is sent to the feed and has a circle (#585).
public struct HomeScreen: View {
    @State private var model: MonDeputeModel
    @State private var followed: FollowedDeputiesModel
    @State private var themeSlugs: [String]
    @State private var tab: FeedTab
    @State private var filter: FeedFilter = .all
    @State private var showsFollows = false
    private let feed: any FeedService
    private let store: any FollowedDeputyStore
    private let themesStore: any FollowedThemesStore
    private let themes = (try? ReferenceData.themes()) ?? []

    public init(
        deputies: any DeputiesService, postalCodes: any PostalCodeService,
        feed: any FeedService, store: any FollowedDeputyStore, themesStore: any FollowedThemesStore
    ) {
        _model = State(initialValue: MonDeputeModel(deputies: deputies, postalCodes: postalCodes, store: store))
        _followed = State(initialValue: FollowedDeputiesModel(service: deputies, store: store))
        _themeSlugs = State(initialValue: themesStore.themeSlugs)
        _tab = State(initialValue: HomeTabDefault.tab(
            followsNothing: store.deputyIDs.isEmpty && themesStore.themeSlugs.isEmpty
        ))
        self.feed = feed
        self.store = store
        self.themesStore = themesStore
    }

    public var body: some View {
        Group {
            if model.isChanging {
                picker
            } else {
                FeedLoaderView(
                    query: query, service: feed, tab: tab, deputyIDs: store.deputyIDs,
                    deputyNames: followed.deputies.mapValues(\.name), followsNothing: followsNothing,
                    onOpenRecap: { tab = .assemblee },
                    onFindDeputy: { model.startChange() }
                ) {
                    feedHeader
                }
                // A new query is a new loader; a new identity starts its load.
                .id(query)
                // Keyed on the deputies: the feed stays on screen when one is
                // followed (#575), so a plain `.task` would never run for a
                // deputy followed after it appeared, and their circle, which
                // waits for their profile, would never show.
                .task(id: store.deputyIDs) { await followed.load() }
            }
        }
        .background(Palette.pageBackground)
        .navigationTitle("Accueil")
        .toolbar { toolbar }
        .sheet(isPresented: $showsFollows) { followsSheet }
        // A deputy followed or unfollowed on another screen, such as their
        // profile (#576), picked up on coming back. Not in `onChange`: Accueil
        // stays alive behind the other tabs, where its loads would only start
        // to be cancelled, and load again on return anyway (#579).
        .onAppear { model.syncWithStore() }
        // The first follow, from the prompt, the follows sheet or a profile,
        // opens « Pour vous » on what was just followed. Only a tab changes
        // here; the load waits for the feed's own `.task`.
        .onChange(of: followsNothing) { _, nothing in
            if !nothing { tab = .pourVous }
        }
        .accessibilityIdentifier("screen.home")
    }

    /// No deputy and no theme followed: « Pour vous » is empty and shows its
    /// follow prompt (ADR-042 §4). The postal-code picker is never the
    /// default screen, only what the prompt or « + Suivre » opens (#575).
    private var followsNothing: Bool {
        store.deputyIDs.isEmpty && themeSlugs.isEmpty
    }

    /// The selected circle, or everything once that follow is gone.
    private var activeFilter: FeedFilter {
        switch filter {
        case .deputy(let id) where !store.isFollowing(id): .all
        case .theme(let slug) where !themeSlugs.contains(slug): .all
        default: filter
        }
    }

    /// What the feed is asked for: the tab, and in « Pour vous » the follows,
    /// narrowed to one when a circle is selected. « À l'Assemblée » sends the
    /// deputies too, so its cards carry their positions.
    private var query: FeedQuery {
        switch tab {
        case .pourVous: FeedQuery.pourVous(deputyIDs: store.deputyIDs, themes: themeSlugs, filter: activeFilter)
        case .assemblee: FeedQuery(tab: .assemblee, deputyIDs: store.deputyIDs, themes: [])
        }
    }

    private var circles: [FollowCircle] {
        // A deputy's ring uses their reading position: votes held after the
        // newest one shown on the previous visit.
        FollowCircle.circles(
            deputies: followed.loaded, themeSlugs: themeSlugs, themes: themes,
            news: Set(followed.news.map { "deputy:\($0)" })
        )
    }

    private func unfollow(_ id: String) {
        store.unfollow(id)
        model.syncWithStore()
    }

    @ViewBuilder private var feedHeader: some View {
        HomeTagline()
            .padding(.horizontal, 16)
        FollowsRow(
            circles: circles,
            filter: Binding(get: { activeFilter }, set: { filter = $0 }),
            onAdd: { showsFollows = true }
        )
        Picker("Fil", selection: $tab) {
            ForEach(FeedTab.allCases, id: \.self) { tab in
                Text(tab.title).tag(tab)
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 16)
        .accessibilityIdentifier("feed.tabs")
    }

    private var followsSheet: some View {
        FollowsSheet(
            deputies: followed.loaded, themes: themes, followed: Set(themeSlugs),
            canAddDeputy: store.canFollowMore,
            onToggle: { slug in
                themesStore.toggle(slug)
                themeSlugs = themesStore.themeSlugs
                // A theme no longer followed cannot stay the filter.
                if case .theme(let selected) = filter, !themeSlugs.contains(selected) { filter = .all }
            },
            onUnfollowDeputy: { unfollow($0) },
            onChooseDeputy: {
                showsFollows = false
                model.startChange()
            },
            onDone: { showsFollows = false }
        )
    }

    /// The postal-code search, while the user chooses or changes deputy.
    private var picker: some View {
        ScrollView {
            PostalCodePickerContent(
                postalCode: $model.postalCode,
                search: model.search,
                notice: model.notice,
                selection: model.selection,
                onSearch: { Task { await model.runSearch() } },
                onSelect: { model.select($0) }
            )
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let selection = model.selection {
                FollowSelectionBar(deputy: selection) { model.followSelection() }
            }
        }
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        if !model.isChanging {
            ToolbarItem(placement: .topBarLeading) {
                AgendaToolbarLink()
            }
            // Réglages lives here until accounts give it a home (#434).
            ToolbarItem(placement: .topBarLeading) {
                NavigationLink(value: AppRoute.settings) {
                    Label("Réglages", systemImage: "gearshape")
                }
                .accessibilityIdentifier("open.settings")
            }
        }
        if model.isChanging {
            ToolbarItem(placement: .cancellationAction) {
                Button("Annuler") { model.cancelChange() }
            }
        } else if !store.deputyIDs.isEmpty {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("Ajouter un député", systemImage: "person.badge.plus") { model.startChange() }
                        .disabled(!store.canFollowMore)
                    ForEach(followed.loaded) { deputy in
                        Button("Ne plus suivre \(deputy.name)", systemImage: "person.badge.minus", role: .destructive) {
                            unfollow(deputy.id)
                        }
                    }
                } label: {
                    Label("Options", systemImage: "ellipsis.circle")
                }
                .accessibilityIdentifier("monDepute.options")
            }
        }
    }
}

/// The tab Accueil opens on: « Pour vous » once something is followed, and
/// « À l'Assemblée » before, so a first screen has content. The app chooses
/// the tab; the API never substitutes one (ADR-042 §4).
enum HomeTabDefault {
    static func tab(followsNothing: Bool) -> FeedTab {
        followsNothing ? .assemblee : .pourVous
    }
}

/// One query's feed and, in « Pour vous », the recap card's week.
struct FeedScreen: Sendable {
    let page: FeedPage
    var week: FeedWeek?
}

/// One feed query's loader, under the header that chooses it. Rebuilt for
/// every new query (`.id(query)` at the call site).
private struct FeedLoaderView<Header: View>: View {
    @State private var loader: Loader<FeedScreen>
    let tab: FeedTab
    let deputyIDs: [String]
    let deputyNames: [String: String]
    let followsNothing: Bool
    let onOpenRecap: () -> Void
    let onFindDeputy: () -> Void
    let header: Header

    init(
        query: FeedQuery, service: any FeedService, tab: FeedTab, deputyIDs: [String],
        deputyNames: [String: String], followsNothing: Bool,
        onOpenRecap: @escaping () -> Void, onFindDeputy: @escaping () -> Void,
        @ViewBuilder header: () -> Header
    ) {
        _loader = State(initialValue: Loader {
            async let page = service.feed(query)
            async let week = HomeScreenRecap.recap(tab: query.tab, deputyIDs: deputyIDs, service: service)
            return FeedScreen(page: try await page, week: await week)
        })
        self.tab = tab
        self.deputyIDs = deputyIDs
        self.deputyNames = deputyNames
        self.followsNothing = followsNothing
        self.onOpenRecap = onOpenRecap
        self.onFindDeputy = onFindDeputy
        self.header = header()
    }

    var body: some View {
        FeedPageView(
            state: loader.state, refreshFailure: loader.refreshFailure, tab: tab, deputyIDs: deputyIDs,
            deputyNames: deputyNames,
            followsNothing: followsNothing, retry: { await loader.load() },
            onOpenRecap: onOpenRecap, onFindDeputy: onFindDeputy
        ) {
            header
        }
        .refreshable { await loader.refresh() }
        .task { await loader.loadIfNeeded() }
    }
}

/// The header, then one query's state below it. The header stays in every
/// state, so the tabs and the follows row can still be used while the feed
/// loads or after it failed; the states are `LoadStateView`'s own views.
struct FeedPageView<Header: View>: View {
    let state: LoadState<FeedScreen>
    var refreshFailure: LoadFailure?
    let tab: FeedTab
    var deputyIDs: [String] = []
    /// Followed deputies' names by id, once their profiles loaded.
    var deputyNames: [String: String] = [:]
    var followsNothing = false
    var retry: () async -> Void = {}
    var onOpenRecap: () -> Void = {}
    var onFindDeputy: () -> Void = {}
    @ViewBuilder let header: Header

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                content
                    .padding(.horizontal, 16)
            }
            .padding(.bottom, 16)
        }
        .background(Palette.pageBackground)
    }

    @ViewBuilder private var content: some View {
        switch state {
        case .idle, .loading:
            LoadingStateView()
                .padding(.vertical, 48)
        case .empty:
            EmptyStateView(title: "Rien cette semaine", message: "Aucun scrutin à montrer pour l'instant.")
        case .failed(let failure):
            FailureStateView(failure: failure, retry: retry)
        case .loaded(let screen):
            if let refreshFailure {
                RefreshFailureBanner(failure: refreshFailure)
            }
            FeedContent(
                page: screen.page, tab: tab, deputyIDs: deputyIDs, deputyNames: deputyNames, week: screen.week,
                showsFindDeputy: deputyIDs.isEmpty, followsNothing: followsNothing,
                onOpenRecap: onOpenRecap, onFindDeputy: onFindDeputy
            )
        }
    }
}

enum HomeScreenRecap {
    /// The recap card's week, in « Pour vous » with a deputy only. It is a
    /// bonus: when it fails, the feed still shows without it.
    /// Keyed on the followed deputies, not on the query: a circle narrows the
    /// feed, but the recap is still every followed deputy's week, one card each.
    static func recap(tab: FeedTab, deputyIDs: [String], service: any FeedService) async -> FeedWeek? {
        guard tab == .pourVous, !deputyIDs.isEmpty else { return nil }
        return try? await service.week(deputyIDs: deputyIDs)
    }
}
