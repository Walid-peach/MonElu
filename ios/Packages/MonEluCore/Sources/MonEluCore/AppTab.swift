/// The app's top-level sections, in tab-bar order (#477).
///
/// Four stable destinations, after the 04 October 2026 design review: a home
/// that works before and after a deputy is chosen, one place to browse the
/// records, the quiz as an invitation to take part, and the assistant. A fifth,
/// "2027", sits in the middle as a raised button (#718): the record before the
/// presidential election.
public enum AppTab: String, CaseIterable, Identifiable, Sendable {
    case home
    case explore
    case election
    case quiz
    case ask

    public var id: String { rawValue }

    /// The French label shown in the tab bar.
    public var title: String {
        switch self {
        case .home: "Accueil"
        case .explore: "Explorer"
        case .election: "2027"
        case .quiz: "Quiz"
        case .ask: "Demander"
        }
    }

    /// SF Symbol name for the tab bar, drawn outlined in both states (#516):
    /// a compass to browse rather than a magnifying glass, which promises a
    /// search field, and a checklist for the quiz rather than a question
    /// mark, which reads as Help.
    public var systemImage: String {
        switch self {
        case .home: "house"
        case .explore: "safari"
        // Only a stand-in: the tab bar draws its own ballot-box glyph.
        case .election: "archivebox"
        case .quiz: "checklist"
        case .ask: "bubble.left"
        }
    }
}
