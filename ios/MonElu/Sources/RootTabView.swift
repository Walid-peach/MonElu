import MonEluCore
import MonEluFeatures
import MonEluUI
import SwiftUI

/// The four top-level tabs (#477), each with its own navigation stack driven
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
                .tabItem {
                    // Outlined when selected too, as the design draws them;
                    // iOS fills a tab's symbol by default.
                    Label(tab.title, systemImage: tab.systemImage)
                        .environment(\.symbolVariants, .none)
                }
                .tag(tab)
            }
        }
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
                deputies: services.deputies, votes: services.votes, postalCodes: services.postalCodes,
                agenda: services.agenda, store: services.followedDeputy
            )
        case .explore:
            ExploreScreen(
                deputies: services.deputies, votes: services.votes, lois: services.lois, groups: services.groups,
                postalCodes: services.postalCodes, store: services.followedDeputy
            )
        case .quiz:
            QuizScreen(service: services.quiz)
        case .ask:
            AskScreen(service: services.ask)
        }
    }
}
