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
                .tabItem { Label(tab.title, systemImage: tab.systemImage) }
                .tag(tab)
            }
        }
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
    /// time, so a label alone cannot prove the screen changed. Explorer's are
    /// its lists' (`screen.votes`, `screen.deputies`).
    @ViewBuilder
    private func root(for tab: AppTab) -> some View {
        switch tab {
        case .home:
            HomeScreen(
                deputies: services.deputies, votes: services.votes, postalCodes: services.postalCodes,
                agenda: services.agenda, store: services.followedDeputy
            )
        case .explore:
            ExploreScreen(votes: services.votes, deputies: services.deputies)
        case .quiz:
            QuizScreen(service: services.quiz)
        case .ask:
            AskScreen(service: services.ask)
        }
    }
}
