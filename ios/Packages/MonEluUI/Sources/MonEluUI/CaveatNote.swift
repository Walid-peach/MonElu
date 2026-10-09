import MonEluCore
import SwiftUI

/// A reading note beside a figure: one of the caveats `GET /app/config`
/// serves, in French with inline Markdown (ADR-041 §4). The text is never
/// written in Swift; a screen looks it up by id and shows nothing when the
/// configuration has not been fetched yet.
///
/// It sits in its own grey box (#516), so a reading note never passes for a
/// line of the content around it.
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
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.trackBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    /// Inline Markdown rendered; plain text if it does not parse. Shared by
    /// every view that shows text the API wrote in Markdown.
    ///
    /// A code span (`nonVotant`) names a term of the data, not code, so it is
    /// set in the surrounding font with strong emphasis rather than monospace.
    public static func attributed(_ text: String) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        guard var attributed = try? AttributedString(markdown: text, options: options) else {
            return AttributedString(text)
        }
        for run in attributed.runs {
            guard var intent = run.inlinePresentationIntent, intent.contains(.code) else { continue }
            intent.remove(.code)
            intent.insert(.stronglyEmphasized)
            attributed[run.range].inlinePresentationIntent = intent
        }
        return attributed
    }
}
