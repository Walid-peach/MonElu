import MonEluCore
import SwiftUI

/// The app's tab bar (#718): four ordinary tabs and, in the middle, the 2027
/// tab as a raised round button, a little bigger than the rest.
///
/// The system `TabView` cannot draw one larger item, so the app hides its bar
/// and puts this one in its place. `selection` stays the single source of
/// truth (the `Router`'s); this view only reads and sets it.
public struct MonEluTabBar: View {
    @Binding private var selection: AppTab
    private let tabs: [AppTab]

    public init(selection: Binding<AppTab>, tabs: [AppTab] = AppTab.allCases) {
        _selection = selection
        self.tabs = tabs
    }

    /// How far the 2027 disc rises above the bar, and its size.
    static let raise: CGFloat = 26
    static let discSize: CGFloat = 64

    public var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            ForEach(Array(tabs.enumerated()), id: \.element) { index, tab in
                Button { selection = tab } label: {
                    Group {
                        if tab == .election {
                            ElectionTabItem(isSelected: selection == tab)
                        } else {
                            OrdinaryTabItem(tab: tab, isSelected: selection == tab)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(tab.title), onglet, \(index + 1) sur \(tabs.count)")
                .accessibilityAddTraits(selection == tab ? [.isButton, .isSelected] : .isButton)
                .accessibilityIdentifier("tab.\(tab.rawValue)")
            }
        }
        .padding(.top, Spacing.xxs)
        .background(alignment: .top) {
            Palette.cardBackground.opacity(0.96)
                .overlay(alignment: .top) { Palette.border.frame(height: 1) }
                .ignoresSafeArea(edges: .bottom)
        }
    }
}

private struct OrdinaryTabItem: View {
    let tab: AppTab
    let isSelected: Bool

    var body: some View {
        VStack(spacing: 3) {
            Image(systemName: tab.systemImage)
                .symbolVariant(.none)
                .font(.title3)
                .frame(height: 26)
            Text(tab.title)
                .font(.caption2.weight(isSelected ? .semibold : .medium))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .foregroundStyle(isSelected ? Palette.accent : Palette.textSecondary)
    }
}

/// The raised disc and its "2027" label.
private struct ElectionTabItem: View {
    let isSelected: Bool

    var body: some View {
        VStack(spacing: 3) {
            ZStack {
                Circle().fill(isSelected ? Palette.accent : Palette.identityBackground)
                BallotBoxGlyph()
                    .stroke(
                        isSelected ? Palette.onAccent : Palette.onIdentity,
                        style: StrokeStyle(lineWidth: 1.8 * 30 / 24, lineCap: .round, lineJoin: .round)
                    )
                    .frame(width: 30, height: 30)
            }
            .frame(width: MonEluTabBar.discSize, height: MonEluTabBar.discSize)
            .overlay(Circle().strokeBorder(Palette.pageBackground, lineWidth: 4))
            .shadow(color: Palette.textPrimary.opacity(0.25), radius: 8, y: 4)
            // The disc sticks up out of the bar; the label stays inside it.
            .offset(y: -MonEluTabBar.raise)
            .padding(.bottom, -MonEluTabBar.raise)
            Text("2027")
                .font(.caption2.weight(.bold))
                .foregroundStyle(isSelected ? Palette.accent : Palette.textSecondary)
        }
        .padding(.top, 14)
    }
}

/// A ballot box with a ticked paper above it, drawn on a 24-point grid so it
/// scales with its frame.
public struct BallotBoxGlyph: Shape {
    public init() {}

    public func path(in rect: CGRect) -> Path {
        let unit = min(rect.width, rect.height) / 24
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + x * unit, y: rect.minY + y * unit)
        }
        var path = Path()
        // The box.
        path.addRoundedRect(
            in: CGRect(x: rect.minX + 3.5 * unit, y: rect.minY + 11 * unit, width: 17 * unit, height: 9.5 * unit),
            cornerSize: CGSize(width: 2 * unit, height: 2 * unit)
        )
        // The slot.
        path.move(to: point(8, 11))
        path.addLine(to: point(16, 11))
        // The paper going in.
        path.move(to: point(8.5, 13))
        path.addLine(to: point(8.5, 3.5))
        path.addLine(to: point(15.5, 3.5))
        path.addLine(to: point(15.5, 13))
        // The tick.
        path.move(to: point(10.3, 8))
        path.addLine(to: point(11.6, 9.3))
        path.addLine(to: point(14, 6.7))
        return path
    }
}
