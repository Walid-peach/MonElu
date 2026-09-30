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
                        // What Maestro flows assert after tapping a tab: the
                        // tab bar shows every label all the time, so a label
                        // alone cannot prove the screen changed.
                        .accessibilityIdentifier("screen.\(tab.rawValue)")
                }
                .tabItem { Label(tab.title, systemImage: tab.systemImage) }
                .tag(tab)
            }
        }
    }
}

#Preview {
    RootTabView()
}
