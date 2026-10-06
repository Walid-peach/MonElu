import MonEluCore
import SwiftUI

/// A deputy's position on a scrutin (`pour`, `contre`, `abstention`,
/// `nonVotant`). The label comes from the bundled `vote_positions.json`, the
/// same table the website checks itself against (ADR-041 §4).
public struct VotePositionBadge: View {
    public let position: String

    public init(position: String) {
        self.position = position
    }

    public var body: some View {
        let (foreground, background) = Self.colors(position)
        Badge(text: Self.label(position), foreground: foreground, background: background)
    }

    /// How to show a position, from the bundled table.
    public static func label(_ position: String) -> String {
        labels[position] ?? position
    }

    /// Mirrors `frontend/src/lib/vote-position.ts`: an unknown key renders like
    /// `nonVotant`.
    public static func colors(_ position: String) -> (Color, Color) {
        switch position {
        case "pour": (Palette.positiveText, Palette.positiveBackground)
        case "contre": (Palette.negativeText, Palette.negativeBackground)
        case "abstention": (Palette.textSecondary, Palette.trackBackground)
        default: (Palette.textMuted, Palette.trackBackground)
        }
    }

    private static let labels: [String: String] = {
        let rows = (try? ReferenceData.votePositions()) ?? []
        return Dictionary(uniqueKeysWithValues: rows.map { ($0.key, $0.label) })
    }()
}
