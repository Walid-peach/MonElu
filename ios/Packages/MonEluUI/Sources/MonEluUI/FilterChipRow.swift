import SwiftUI

/// One chip of a `FilterChipRow`. The screen owns the filter state and says
/// which chips are selected; `opensSheet` adds a chevron for a chip that
/// opens a picker ("Thème").
public struct FilterChip: Identifiable, Hashable, Sendable {
    public let id: String
    public let title: String
    public let isSelected: Bool
    public let opensSheet: Bool

    public init(id: String, title: String, isSelected: Bool, opensSheet: Bool = false) {
        self.id = id
        self.title = title
        self.isSelected = isSelected
        self.opensSheet = opensSheet
    }
}

/// A horizontally scrolling row of selectable chips ("Tous", "Adoptés",
/// "Rejetés"…). Tapping a chip calls `onSelect` with its id; what that
/// selects or clears is the screen's decision.
public struct FilterChipRow: View {
    public let chips: [FilterChip]
    public let inset: CGFloat
    private let onSelect: (FilterChip.ID) -> Void

    public init(_ chips: [FilterChip], inset: CGFloat = 16, onSelect: @escaping (FilterChip.ID) -> Void) {
        self.chips = chips
        self.inset = inset
        self.onSelect = onSelect
    }

    public var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(chips) { chip in
                    Button {
                        onSelect(chip.id)
                    } label: {
                        ChipLabel(chip: chip)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(chip.isSelected ? .isSelected : [])
                }
            }
            .padding(.horizontal, inset)
            // The row is as tall as its chips at every text size, instead of
            // clipping them to the scroll view's first measured height.
            .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct ChipLabel: View {
    let chip: FilterChip

    var body: some View {
        HStack(spacing: 4) {
            Text(chip.title)
            if chip.opensSheet {
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.semibold))
                    .accessibilityHidden(true)
            }
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(chip.isSelected ? Palette.cardBackground : Palette.textPrimary)
        .padding(.horizontal, 14)
        .frame(minHeight: 34)
        // A circular capsule: the default continuous one renders stray
        // vertical slivers beside a stroked border.
        .background(chip.isSelected ? Palette.textPrimary : Palette.cardBackground, in: Capsule(style: .circular))
        .overlay(Capsule(style: .circular).strokeBorder(chip.isSelected ? Palette.textPrimary : Palette.border, lineWidth: 1))
        // A 44-point tap target around the 34-point chip.
        .padding(.vertical, 5)
        .contentShape(Rectangle())
    }
}
