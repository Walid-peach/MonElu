/// The app's top-level sections, in tab-bar order (#477).
///
/// Four stable destinations, after the 04 October 2026 design review: a home
/// that works before and after a deputy is chosen, one place to browse the
/// records, the quiz as an invitation to take part, and the assistant.
public enum AppTab: String, CaseIterable, Identifiable, Sendable {
    case home
    case explore
    case quiz
    case ask

    public var id: String { rawValue }

    /// The French label shown in the tab bar.
    public var title: String {
        switch self {
        case .home: "Accueil"
        case .explore: "Explorer"
        case .quiz: "Quiz"
        case .ask: "Demander"
        }
    }

    /// SF Symbol name for the tab bar. The quiz is a stack of cards rather
    /// than a question mark, which reads as Help.
    public var systemImage: String {
        switch self {
        case .home: "house"
        case .explore: "magnifyingglass"
        case .quiz: "rectangle.stack"
        case .ask: "bubble.left.and.text.bubble.right"
        }
    }
}
