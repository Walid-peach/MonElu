import MonEluUI
import SwiftUI

/// The blocks of an answer's Markdown. The assistant writes paragraphs,
/// lists, headings and tables; SwiftUI's own Markdown covers inline styling
/// only, so blocks are split here and each is rendered natively.
enum MarkdownBlock: Hashable {
    case paragraph(String)
    case heading(String)
    case bullets([String])
    case numbered([String])
    /// A table becomes one card per row on a phone screen.
    case table(header: [String], rows: [[String]])

    static func parse(_ text: String) -> [MarkdownBlock] {
        // The model sometimes leaves citation markers ("【source】") inline.
        let cleaned = text.replacingOccurrences(of: #"\s*【[^】]*】"#, with: "", options: .regularExpression)
        var blocks: [MarkdownBlock] = []
        var paragraph: [String] = []
        var bullets: [String] = []
        var numbered: [String] = []
        var table: [[String]] = []

        func flush() {
            if !paragraph.isEmpty { blocks.append(.paragraph(paragraph.joined(separator: "\n"))) }
            if !bullets.isEmpty { blocks.append(.bullets(bullets)) }
            if !numbered.isEmpty { blocks.append(.numbered(numbered)) }
            if let header = table.first { blocks.append(.table(header: header, rows: Array(table.dropFirst()))) }
            paragraph = []; bullets = []; numbered = []; table = []
        }

        for raw in cleaned.components(separatedBy: "\n") {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.isEmpty {
                flush()
            } else if line.hasPrefix("|") {
                if table.isEmpty { flush() }
                let cells = cells(of: line)
                // The `|---|:---:|` row under the header carries no content.
                if !cells.allSatisfy({ $0.range(of: #"^:?-+:?$"#, options: .regularExpression) != nil }) {
                    table.append(cells)
                }
            } else if let match = line.firstMatch(of: /^#{1,6}\s+(.+)$/) {
                flush()
                blocks.append(.heading(String(match.1)))
            } else if let match = line.firstMatch(of: /^[-*•]\s+(.+)$/) {
                if bullets.isEmpty { flush() }
                bullets.append(String(match.1))
            } else if let match = line.firstMatch(of: /^\d+[.)]\s+(.+)$/) {
                if numbered.isEmpty { flush() }
                numbered.append(String(match.1))
            } else {
                if !bullets.isEmpty || !numbered.isEmpty || !table.isEmpty { flush() }
                paragraph.append(line)
            }
        }
        flush()
        return blocks
    }

    private static func cells(of line: String) -> [String] {
        var row = line
        if row.hasPrefix("|") { row.removeFirst() }
        if row.hasSuffix("|") { row.removeLast() }
        return row.components(separatedBy: "|").map { $0.trimmingCharacters(in: .whitespaces) }
    }
}

/// An answer's Markdown, rendered block by block.
struct ChatMarkdownView: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(MarkdownBlock.parse(text).enumerated()), id: \.offset) { _, block in
                view(for: block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private func view(for block: MarkdownBlock) -> some View {
        switch block {
        case .paragraph(let text):
            inline(text)
        case .heading(let text):
            inline(text)
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
        case .bullets(let items):
            list(items.map { ("•", $0) })
        case .numbered(let items):
            list(items.enumerated().map { ("\($0.offset + 1).", $0.element) })
        case .table(let header, let rows):
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    Card {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(Array(zip(header, row).enumerated()), id: \.offset) { _, pair in
                                if !pair.1.isEmpty {
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(pair.0)
                                            .font(.caption.weight(.semibold))
                                            .foregroundStyle(Palette.textMuted)
                                        inline(pair.1)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func list(_ items: [(String, String)]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(item.0)
                        .foregroundStyle(Palette.textSecondary)
                        .accessibilityHidden(true)
                    inline(item.1)
                }
            }
        }
    }

    private func inline(_ text: String) -> some View {
        Text(CaveatNote.attributed(text))
            .font(.body)
            .foregroundStyle(Palette.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
    }
}
