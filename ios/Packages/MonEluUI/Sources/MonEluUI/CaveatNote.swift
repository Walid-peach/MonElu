import MonEluCore
import SwiftUI

/// A reading note beside a figure: one of the caveats `GET /app/config`
/// serves, in French with inline Markdown (ADR-041 §4). The text is never
/// written in Swift; a screen looks it up by id and shows nothing when the
/// configuration has not been fetched yet.
public struct CaveatNote: View {
    let text: String

    public init(_ text: String) {
        self.text = text
    }

    /// The caveat with `id` from `configuration`, or nil when it is absent.
    public init?(id: String, in configuration: AppConfiguration) {
        guard let caveat = configuration.caveats.first(where: { $0.id == id }) else { return nil }
        self.init(caveat.text)
    }

    public var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "info.circle")
                .foregroundStyle(Palette.textMuted)
                .accessibilityHidden(true)
            Text(Self.attributed(text))
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(.footnote)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Inline Markdown (bold, code spans) rendered; plain text if it does not parse.
    static func attributed(_ text: String) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        return (try? AttributedString(markdown: text, options: options)) ?? AttributedString(text)
    }
}
