import SwiftUI

public extension View {
    /// A tab root's title, kept but never drawn (#657): the tab bar already
    /// names the tab, so the root opens on its content instead of a large
    /// title. The title still labels the back button of every screen pushed
    /// from the tab.
    ///
    /// `showsBar` keeps the system bar, without a title, for a root with
    /// toolbar buttons (Accueil). Otherwise the bar is hidden and the content
    /// starts under the status bar; pushed screens show their own bar as
    /// before, since a toolbar's visibility belongs to the view that sets it.
    func tabRootTitle(_ title: String, showsBar: Bool = false) -> some View {
        modifier(TabRootTitle(title: title, showsBar: showsBar))
    }
}

private struct TabRootTitle: ViewModifier {
    let title: String
    let showsBar: Bool

    func body(content: Content) -> some View {
        content
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // An empty principal item replaces the inline title; the bar
                // keeps its buttons and the stack keeps the title.
                ToolbarItem(placement: .principal) {
                    Color.clear
                        .frame(width: 1, height: 1)
                        .accessibilityHidden(true)
                }
            }
            .toolbar(showsBar ? .automatic : .hidden, for: .navigationBar)
    }
}
