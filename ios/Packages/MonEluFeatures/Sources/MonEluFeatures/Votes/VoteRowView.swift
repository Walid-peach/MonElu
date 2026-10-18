import MonEluCore
import MonEluUI
import SwiftUI

/// One scrutin in the list: what was voted, when, and how it ended.
struct VoteRowView: View {
    @Environment(\.today) private var today
    let vote: VoteItem

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                if let result = vote.result {
                    VoteResultBadge(result: result)
                }
                if let date = vote.date {
                    Text(MonEluFormat.listDay(date, today: today))
                        .font(.caption)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            Text(vote.title.capitalizingFirstLetter)
                .font(.headline)
                .foregroundStyle(Palette.textPrimary)
                .lineLimit(3)
            if let summary = vote.summary, !summary.isEmpty {
                Text(summary)
                    .font(.subheadline)
                    .foregroundStyle(Palette.textSecondary)
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 4)
    }
}

extension String {
    /// AN scrutin titles start lower-case ("l'ensemble de…"); show them as a
    /// sentence without changing the rest.
    var capitalizingFirstLetter: String {
        guard let first else { return self }
        return first.uppercased() + dropFirst()
    }
}
