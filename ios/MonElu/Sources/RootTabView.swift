import MonEluCore
import MonEluUI
import SwiftUI

/// The five top-level tabs. Each one is a placeholder until its feature ships (#432).
struct RootTabView: View {
    @State private var selection: AppTab = .myDeputy

    var body: some View {
        TabView(selection: $selection) {
            ForEach(AppTab.allCases) { tab in
                NavigationStack {
                    PlaceholderScreen(title: tab.title, systemImage: tab.systemImage)
                        .navigationTitle(tab.title)
                }
                .tabItem { Label(tab.title, systemImage: tab.systemImage) }
                .tag(tab)
                .accessibilityIdentifier("tab.\(tab.rawValue)")
            }
        }
    }
}

#Preview {
    RootTabView()
}
