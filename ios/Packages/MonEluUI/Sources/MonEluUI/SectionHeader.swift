import SwiftUI

/// A section title in Newsreader, with an optional line of context below it
/// and an optional trailing action ("Tout voir"). Title and subtitle wrap
/// rather than truncate, so nothing is cut at accessibility sizes.
public struct SectionHeader<Trailing: View>: View {
    public let title: String
    public let subtitle: String?
    private let trailing: Trailing

    /// A header with any trailing view, such as a `NavigationLink`. It is
    /// drawn in the accent color, like the website's section links.
    public init(_ title: String, subtitle: String? = nil, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.subtitle = subtitle
        self.trailing = trailing()
    }

    public var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(Typography.heading(.title2))
                    .foregroundStyle(Palette.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if let subtitle {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            trailing
                .font(.subheadline)
                .foregroundStyle(Palette.accent)
                .tint(Palette.accent)
                .fixedSize()
        }
    }
}

extension SectionHeader where Trailing == EmptyView {
    public init(_ title: String, subtitle: String? = nil) {
        self.init(title, subtitle: subtitle) { EmptyView() }
    }
}

extension SectionHeader where Trailing == SectionHeaderAction {
    /// A header whose trailing link runs `action` ("Tout voir").
    public init(_ title: String, subtitle: String? = nil, actionTitle: String, action: @escaping () -> Void) {
        self.init(title, subtitle: subtitle) { SectionHeaderAction(title: actionTitle, action: action) }
    }
}

/// The trailing link of a `SectionHeader`, with a 44-point tap target.
public struct SectionHeaderAction: View {
    let title: String
    let action: () -> Void

    public var body: some View {
        Button(action: action) {
            Text(title)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
