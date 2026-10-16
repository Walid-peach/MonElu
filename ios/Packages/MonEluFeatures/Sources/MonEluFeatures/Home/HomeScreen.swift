import MonEluCore
import MonEluUI
import SwiftUI

/// The Accueil tab (#565, ADR-042, design « Accueil V1 »): the row of
/// follows, then the feed the API builds for them, in two tabs. Before a
/// deputy is chosen, the postal-code search beside the Assembly's latest
/// votes, so a first visit already shows something.
public struct HomeScreen: View {
    @State private var model: MonDeputeModel
    @State private var latestVotes: Loader<[VoteItem]>
    @State private var themeSlugs: [String]
    @State private var tab: FeedTab = .pourVous
    @State private var filter: FeedFilter = .all
    @State private var showsFollows = false
    private let feed: any FeedService
    private let themesStore: any FollowedThemesStore
    private let themes = (try? ReferenceData.themes()) ?? []

    public init(
        deputies: any DeputiesService, votes: any VotesService, postalCodes: any PostalCodeService,
        feed: any FeedService, store: any FollowedDeputyStore, themesStore: any FollowedThemesStore
    ) {
        _model = State(initialValue: MonDeputeModel(deputies: deputies, postalCodes: postalCodes, store: store))
        _latestVotes = State(initialValue: Loader(isEmpty: { $0.isEmpty }) {
            Array(try await votes.votes(VoteQuery()).items.prefix(HomeLatestVotesSection.count))
        })
        _themeSlugs = State(initialValue: themesStore.themeSlugs)
        self.feed = feed
        self.themesStore = themesStore
    }

    public var body: some View {
        Group {
            if showsPicker {
                picker
            } else {
                FeedLoaderView(
                    query: query, service: feed, tab: tab, deputyID: model.followedID,
                    onOpenRecap: { tab = .assemblee },
                    onFindDeputy: { model.startChange() }
                ) {
                    feedHeader
                }
                // A new query is a new loader; a new identity starts its load.
                .id(query)
                .task { await model.home?.loadIfNeeded() }
            }
        }
        .background(Palette.pageBackground)
        .navigationTitle("Accueil")
        .toolbar { toolbar }
        .sheet(isPresented: $showsFollows) { followsSheet }
        .accessibilityIdentifier("screen.home")
    }

    /// The postal-code picker shows while the user changes deputy, and on a
    /// first visit with nothing followed. Themes alone are enough for a feed,
    /// which then offers to find the deputy (#566).
    private var showsPicker: Bool {
        model.isChanging || (model.followedID == nil && themeSlugs.isEmpty)
    }

    /// What the feed is asked for: the tab, and in « Pour vous » the follows,
    /// narrowed to one when a circle is selected.
    private var query: FeedQuery {
        switch tab {
        case .pourVous: FeedQuery.pourVous(deputyID: model.followedID, themes: themeSlugs, filter: filter)
        case .assemblee: FeedQuery(tab: .assemblee, deputyID: model.followedID, themes: [])
        }
    }

    /// The followed deputy once their home loaded; the circle waits for it.
    private var followedDeputy: DeputyItem? {
        model.home?.state.value?.profile.deputy
    }

    private var circles: [FollowCircle] {
        // The deputy's ring uses the existing reading position: votes held
        // after the newest one shown on the previous visit.
        let deputyNews: Bool = {
            guard case .votes(let votes, _)? = model.home?.state.value?.sinceLastVisit else { return false }
            return !votes.isEmpty
        }()
        return FollowCircle.circles(
            deputy: followedDeputy, themeSlugs: themeSlugs, themes: themes,
            news: deputyNews ? ["deputy"] : []
        )
    }

    @ViewBuilder private var feedHeader: some View {
        HomeTagline()
            .padding(.horizontal, 16)
        FollowsRow(circles: circles, filter: $filter, onAdd: { showsFollows = true })
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
            deputyName: followedDeputy?.name, themes: themes, followed: Set(themeSlugs),
            onToggle: { slug in
                themesStore.toggle(slug)
                themeSlugs = themesStore.themeSlugs
                // A theme no longer followed cannot stay the filter.
                if case .theme(let selected) = filter, !themeSlugs.contains(selected) { filter = .all }
            },
            onChooseDeputy: {
                showsFollows = false
                model.startChange()
            },
            onDone: { showsFollows = false }
        )
    }

    /// While the user changes deputy, only the search shows; before any
    /// deputy is chosen, the Assembly's latest votes and the quiz follow it.
    private var picker: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                if !model.isChanging { HomeTagline() }
                PostalCodePickerContent(
                    postalCode: $model.postalCode,
                    search: model.search,
                    notice: model.notice,
                    selection: model.selection,
                    onSearch: { Task { await model.runSearch() } },
                    onSelect: { model.select($0) }
                )
                if !model.isChanging {
                    HomeLatestVotesSection(state: latestVotes.state) {
                        Task { await latestVotes.load() }
                    }
                    .task { await latestVotes.loadIfNeeded() }
                    HomeQuizInvitation()
                }
            }
            .padding([.horizontal, .bottom], 16)
            // The tagline belongs to the title; without it the search needs
            // its own margin.
            .padding(.top, model.isChanging ? 16 : 0)
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
        } else if model.followedID != nil {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("Changer de député", systemImage: "arrow.left.arrow.right") { model.startChange() }
                    Button("Ne plus suivre", systemImage: "person.badge.minus", role: .destructive) { model.unfollow() }
                } label: {
                    Label("Options", systemImage: "ellipsis.circle")
                }
                .accessibilityIdentifier("monDepute.options")
            }
        }
    }
}

/// One feed query's loader and its page, under the header that chooses it.
/// Rebuilt for every new query (`.id(query)` at the call site).
private struct FeedLoaderView<Header: View>: View {
    /// One query's feed and, in « Pour vous », the recap card's week.
    struct Screen: Sendable {
        let page: FeedPage
        let week: FeedWeek?
    }

    @State private var loader: Loader<Screen>
    let tab: FeedTab
    let deputyID: String?
    let onOpenRecap: () -> Void
    let onFindDeputy: () -> Void
    let header: Header

    init(
        query: FeedQuery, service: any FeedService, tab: FeedTab, deputyID: String?,
        onOpenRecap: @escaping () -> Void, onFindDeputy: @escaping () -> Void,
        @ViewBuilder header: () -> Header
    ) {
        _loader = State(initialValue: Loader {
            async let page = service.feed(query)
            async let week = HomeScreenRecap.recap(for: query, service: service)
            return Screen(page: try await page, week: await week)
        })
        self.tab = tab
        self.deputyID = deputyID
        self.onOpenRecap = onOpenRecap
        self.onFindDeputy = onFindDeputy
        self.header = header()
    }

    var body: some View {
        LoadStateView(
            loader,
            empty: EmptyStateView(title: "Rien cette semaine", message: "Aucun scrutin à montrer pour l'instant.")
        ) { screen in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    FeedContent(
                        page: screen.page, tab: tab, deputyID: deputyID, week: screen.week,
                        showsFindDeputy: deputyID == nil,
                        onOpenRecap: onOpenRecap, onFindDeputy: onFindDeputy
                    )
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 16)
            }
        }
    }
}

enum HomeScreenRecap {
    /// The recap card's week, in « Pour vous » with a deputy only. It is a
    /// bonus: when it fails, the feed still shows without it.
    static func recap(for query: FeedQuery, service: any FeedService) async -> FeedWeek? {
        guard query.tab == .pourVous, let deputyID = query.deputyID else { return nil }
        return try? await service.week(deputyID: deputyID)
    }
}
