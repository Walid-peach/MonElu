import MonEluCore
import MonEluFeatures
import MonEluUI
import SwiftUI

/// The five top-level tabs (#477, #718), each with its own navigation stack driven
/// by the `Router`.
struct RootTabView: View {
    let services: AppServices
    @State private var router: Router

    init(services: AppServices, router: Router = Router()) {
        self.services = services
        _router = State(initialValue: router)
    }

    var body: some View {
        TabView(selection: $router.selection) {
            ForEach(AppTab.allCases) { tab in
                NavigationStack(path: router.path(for: tab)) {
                    root(for: tab)
                        .navigationDestination(for: AppRoute.self) {
                            RouteDestination(route: $0, services: services)
                        }
                }
                .tag(tab)
            }
        }
        // The system bar cannot draw one larger item, so it is hidden and
        // `MonEluTabBar` stands in for it, reading and setting the router's
        // selection (#718).
        .toolbar(.hidden, for: .tabBar)
        .safeAreaInset(edge: .bottom, spacing: 0) { MonEluTabBar(selection: $router.selection) }
        // The selected tab, back chevrons, toolbar buttons, toggles and links
        // take MonÉlu's red rather than the system blue (#516).
        .tint(Palette.accent)
        // Accueil's invitations switch tabs through this, never the router.
        .environment(\.openTab, OpenTabAction { [router] in router.selection = $0 })
        .onOpenURL { router.open(url: $0) }
        #if DEBUG
        .task {
            if let link = Router.launchLink() { router.open(url: link) }
        }
        #endif
    }

    /// Each root screen carries a `screen.<name>` accessibility id Maestro
    /// flows assert after tapping a tab: the tab bar shows every label all the
    /// time, so a label alone cannot prove the screen changed.
    @ViewBuilder
    private func root(for tab: AppTab) -> some View {
        switch tab {
        case .home:
            HomeScreen(
                deputies: services.deputies, postalCodes: services.postalCodes,
                addresses: services.addresses, circonscriptions: services.circonscriptions,
                feed: services.feed, store: services.followedDeputy, themesStore: services.followedThemes
            )
        case .explore:
            ExploreScreen(
                deputies: services.deputies, votes: services.votes, lois: services.lois, groups: services.groups,
                postalCodes: services.postalCodes, store: services.followedDeputy
            )
        case .election:
            Election2027Screen(
                service: services.election, deputies: services.deputies, store: services.followedDeputy,
                postalCodes: services.postalCodes, addresses: services.addresses,
                circonscriptions: services.circonscriptions, pendingClaim: services.pendingClaim
            )
        case .quiz:
            QuizScreen(service: services.quiz)
        case .ask:
            AskScreen(service: services.ask, pendingClaim: services.pendingClaim)
        }
    }
}
