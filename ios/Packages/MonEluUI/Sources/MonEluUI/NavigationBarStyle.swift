import UIKit

/// The navigation bar's titles in the app's type (#516): large titles in
/// Newsreader, as the design sets every tab root, and inline titles in the
/// system's semibold headline, both in `textPrimary`.
///
/// SwiftUI has no API for a navigation title's font, so this styles the
/// system bar through its appearance proxy instead of replacing it: Dynamic
/// Type, the collapse on scroll and the glass back button keep working.
public enum NavigationBarStyle {
    /// Applies the title styles. Call once at launch, after
    /// `Typography.registerFonts()`, and again when the text size changes,
    /// since a scaled font is resolved for the size in effect at the time.
    @MainActor
    public static func apply() {
        let color = Palette.uiColor("textPrimary")
        let large: [NSAttributedString.Key: Any] = [.font: largeTitleFont(), .foregroundColor: color]
        let inline: [NSAttributedString.Key: Any] = [
            .font: UIFont.preferredFont(forTextStyle: .headline), .foregroundColor: color,
        ]
        let bar = UINavigationBar.appearance()
        bar.largeTitleTextAttributes = large
        bar.titleTextAttributes = inline
        let appearance = UINavigationBarAppearance()
        appearance.configureWithDefaultBackground()
        appearance.largeTitleTextAttributes = large
        appearance.titleTextAttributes = inline
        let edge = UINavigationBarAppearance()
        edge.configureWithTransparentBackground()
        edge.largeTitleTextAttributes = large
        edge.titleTextAttributes = inline
        bar.standardAppearance = appearance
        bar.compactAppearance = appearance
        bar.scrollEdgeAppearance = edge
    }

    /// Newsreader SemiBold at the large title's size, scaled like it.
    static func largeTitleFont() -> UIFont {
        let metrics = UIFontMetrics(forTextStyle: .largeTitle)
        guard let face = UIFont(name: Typography.headingFace, size: 34) else {
            return UIFont.preferredFont(forTextStyle: .largeTitle)
        }
        return metrics.scaledFont(for: face)
    }
}
