import MonEluCore
import MonEluUI
import SwiftUI

/// The five top-level tabs, each with its own navigation stack driven by the
/// `Router`. Each tab is a placeholder until its feature ships (#432).
struct RootTabView: View {
    @State private var router: Router

    init(router: Router = Router()) {
        _router = State(initialValue: router)
    }

    var body: some View {
        TabView(selection: $router.selection) {
            ForEach(AppTab.allCases) { tab in
                NavigationStack(path: router.path(for: tab)) {
                    PlaceholderScreen(title: tab.title, systemImage: tab.systemImage)
                        .navigationTitle(tab.title)
                        // What Maestro flows assert after tapping a tab: the
                        // tab bar shows every label all the time, so a label
                        // alone cannot prove the screen changed.
                        .accessibilityIdentifier("screen.\(tab.rawValue)")
                        .navigationDestination(for: AppRoute.self) { RouteDestination(route: $0) }
                }
                .tabItem { Label(tab.title, systemImage: tab.systemImage) }
                .tag(tab)
            }
        }
        .onOpenURL { router.open(url: $0) }
    }
}

#Preview {
    RootTabView()
}
