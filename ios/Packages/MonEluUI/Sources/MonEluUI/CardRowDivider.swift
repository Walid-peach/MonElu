import SwiftUI

/// The hairline between two rows of a card that lists rows (#629), the
/// grouped-list pattern of the system's own lists. One colour and one inset
/// everywhere, so no screen draws its separators its own way.
///
/// It goes between rows only: a card's edge already separates its first and
/// last rows from the page.
public struct CardRowDivider: View {
    private let inset: CGFloat

    /// `inset` is the leading indent: the rows' own horizontal padding, so
    /// the line starts under the text rather than at the card's edge.
    public init(inset: CGFloat = Spacing.m) {
        self.inset = inset
    }

    public var body: some View {
        Divider()
            .overlay(Palette.border)
            .padding(.leading, inset)
    }
}
