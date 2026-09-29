/// The app's top-level sections, in tab-bar order.
///
/// Titles are the French labels shown in the tab bar; they match the website's
/// section names so a user moving between the two finds the same words.
public enum AppTab: String, CaseIterable, Identifiable, Sendable {
    case myDeputy = "my-deputy"
    case deputies
    case votes
    case ask
    case quiz

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .myDeputy: "Mon député"
        case .deputies: "Députés"
        case .votes: "Votes"
        case .ask: "Demander"
        case .quiz: "Quiz"
        }
    }

    /// SF Symbol name for the tab bar.
    public var systemImage: String {
        switch self {
        case .myDeputy: "person.crop.circle"
        case .deputies: "person.3"
        case .votes: "checkmark.seal"
        case .ask: "bubble.left.and.text.bubble.right"
        case .quiz: "questionmark.circle"
        }
    }
}
