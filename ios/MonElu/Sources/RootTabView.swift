import MonEluCore
import MonEluFeatures
import MonEluUI
import SwiftUI

/// The five top-level tabs, each with its own navigation stack driven by the
/// `Router`.
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
        .onOpenURL { router.open(url: $0) }
        #if DEBUG
        .task {
            if let link = Router.launchLink() { router.open(url: link) }
        }
        #endif
    }

    /// Each root screen carries the `screen.<tab>` accessibility id Maestro
    /// flows assert after tapping a tab: the tab bar shows every label all the
    /// time, so a label alone cannot prove the screen changed.
    @ViewBuilder
    private func root(for tab: AppTab) -> some View {
        switch tab {
        case .votes:
            VotesListScreen(service: services.votes)
        case .deputies:
            DeputiesListScreen(service: services.deputies)
        case .myDeputy:
            MonDeputeScreen(
                deputies: services.deputies, postalCodes: services.postalCodes, store: services.followedDeputy
            )
        case .ask:
            AskScreen(service: services.ask)
        case .quiz:
            QuizScreen(service: services.quiz)
        }
    }
}
