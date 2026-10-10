import SwiftUI

/// A bordered surface grouping related content, like the website's cards.
public struct Card<Content: View>: View {
    private let content: Content
    private let padding: CGFloat

    /// `padding` is the inner margin; a list of rows passes 0 and pads each
    /// row itself, so its dividers run under the whole row.
    public init(padding: CGFloat = 16, @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.content = content()
    }

    public var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(padding)
            .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(Palette.border, lineWidth: 1)
            )
    }
}
