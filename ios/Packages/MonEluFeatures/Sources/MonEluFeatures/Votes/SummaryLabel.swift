import MonEluUI
import SwiftUI

/// How a generated summary is labelled (#634). The official title always leads;
/// a summary follows it with a short tag in front, and the vote screen shows
/// the full disclosure, whose wording comes from `GET /app/config`.
enum SummaryLabel {
    /// The word in front of a summary in a list or a card.
    static func tag(_ basis: String?) -> String {
        basis == "procedure" ? "Procédure" : "Résumé IA"
    }

    /// The caveat that discloses how the summary was written. Only a summary
    /// built from the official text may say so; a motion's sentence is written
    /// by code (ADR-046).
    static func caveatID(_ basis: String?) -> String {
        switch basis {
        case "official_text": "summary_official_text"
        case "procedure": "summary_procedure"
        default: "llm_generated"
        }
    }
}

/// A summary with its tag in front, below the official title.
struct LabeledSummary: View {
    let summary: String
    let basis: String?
    var font: Font = .subheadline
    var lineLimit: Int?

    var body: some View {
        (Text(SummaryLabel.tag(basis)).bold() + Text(" · ") + Text(summary))
            .font(font)
            .foregroundStyle(Palette.textSecondary)
            .lineLimit(lineLimit)
            .multilineTextAlignment(.leading)
    }
}
