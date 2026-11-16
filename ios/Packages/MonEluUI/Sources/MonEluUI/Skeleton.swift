import SwiftUI

/// What a loading screen shows, by how long it has been loading (#697).
///
/// The website's policy, `frontend/src/lib/loadingPolicy.ts` (MON-207): no
/// indicator for the first `LOADING_NO_INDICATOR_MS`, so an answer that comes
/// back quickly never flashes a placeholder, then a placeholder shaped like the
/// page.
public enum LoadingIndicator: Equatable, Sendable {
    /// Nothing but the page background.
    case none
    /// The generic spinner, for a screen that has no placeholder of its own.
    case spinner
    /// The screen's own content over placeholder models, under `.skeleton()`.
    case placeholder

    /// How long a load runs before its placeholder shows: the website's
    /// `LOADING_NO_INDICATOR_MS`.
    public static let revealDelay: Duration = .milliseconds(200)

    /// A screen with a placeholder waits `revealDelay` before showing it; one
    /// without keeps the spinner it always had, shown at once.
    public static func shown(hasPlaceholder: Bool, delayElapsed: Bool) -> LoadingIndicator {
        guard hasPlaceholder else { return .spinner }
        return delayElapsed ? .placeholder : .none
    }
}

extension View {
    /// Draws this view as a loading placeholder: its text and shapes become
    /// grey blocks that pulse, as the website's skeletons shimmer, and nothing
    /// in it can be tapped.
    ///
    /// Build it from the screen's own content view over placeholder models, so
    /// it has the page's real shape. VoiceOver hears one "Chargement…" for the
    /// whole placeholder and nothing of the made-up rows inside it, as the
    /// website's `ContentSkeleton` announces itself once.
    public func skeleton(label: String = "Chargement…") -> some View {
        modifier(SkeletonModifier(label: label))
    }
}

struct SkeletonModifier: ViewModifier {
    let label: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dimmed = false

    /// One full cycle takes 1.6 s, the website's `dp-skeleton-shimmer`.
    static let halfCycle = 0.8
    static let dimmedOpacity = 0.5

    func body(content: Content) -> some View {
        content
            .redacted(reason: .placeholder)
            .opacity(dimmed ? Self.dimmedOpacity : 1)
            .allowsHitTesting(false)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .accessibilityIdentifier("state.loading")
            .onAppear {
                // Reduce Motion keeps the blocks still, as the website's
                // prefers-reduced-motion rule stops its shimmer.
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: Self.halfCycle).repeatForever(autoreverses: true)) {
                    dimmed = true
                }
            }
    }
}

/// True while the view is drawn by `.skeleton()`: a component with a coloured
/// fill (a badge, a chip, a split bar) draws it in the neutral track colour
/// instead, since redaction greys text but keeps fills. A screen's own
/// coloured surface (the recap card's navy) reads it the same way.
extension EnvironmentValues {
    public var isPlaceholder: Bool { redactionReasons.contains(.placeholder) }
}
