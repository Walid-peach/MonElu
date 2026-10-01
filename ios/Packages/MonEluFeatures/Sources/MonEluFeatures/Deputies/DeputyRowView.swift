import MonEluUI
import SwiftUI

/// One deputy in the list: portrait, name, group and constituency.
struct DeputyRowView: View {
    let deputy: DeputyItem

    var body: some View {
        HStack(spacing: 12) {
            DeputyPortrait(name: deputy.name, url: deputy.photoURL)
            VStack(alignment: .leading, spacing: 3) {
                Text(deputy.name)
                    .font(.headline)
                    .foregroundStyle(Palette.textPrimary)
                if let group = deputy.group {
                    Text(group)
                        .font(.subheadline)
                        .foregroundStyle(Palette.textSecondary)
                }
                if let constituency = deputy.constituency {
                    Text(constituency)
                        .font(.caption)
                        .foregroundStyle(Palette.textMuted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}
