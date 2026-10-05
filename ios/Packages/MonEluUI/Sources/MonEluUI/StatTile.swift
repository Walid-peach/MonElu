import SwiftUI

/// One figure on a card: a serif value, what it measures, and an optional
/// detail ("92 %", "Scrutins solennels", "46 sur 50"). The value arrives
/// formatted from what the API returned (`MonEluFormat`); the tile never
/// computes it.
public struct StatTile: View {
    public let value: String
    public let label: String
    public let detail: String?

    public init(value: String, label: String, detail: String? = nil) {
        self.value = value
        self.label = label
        self.detail = detail
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(Typography.heading(.title))
                .monospacedDigit()
                .foregroundStyle(Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            Text(label)
                .font(.footnote)
                .foregroundStyle(Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            if let detail {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(12)
        .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Palette.border, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }
}

/// A row of `StatTile`s of equal height, stacked one per line at the
/// accessibility text sizes so a figure never breaks mid-word.
public struct StatTileGrid<Content: View>: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    private let content: Content

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(spacing: 8) { content }
        } else {
            HStack(alignment: .top, spacing: 8) { content }
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
