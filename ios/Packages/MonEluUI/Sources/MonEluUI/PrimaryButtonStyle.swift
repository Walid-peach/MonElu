import SwiftUI

/// The app's one call-to-action style (#629): white text on the accent,
/// `Radius.card`, 50 pt tall at the default text size, full width unless the
/// button sits beside a field. The label wraps rather than truncates at large
/// text sizes.
///
/// Use it as `.buttonStyle(.monEluPrimary)`, never by styling a plain button
/// with the accent by hand.
public struct PrimaryButtonStyle: ButtonStyle {
    private let fullWidth: Bool

    /// `fullWidth: false` sizes the button to its label, for a button beside
    /// a field ("Rechercher").
    public init(fullWidth: Bool = true) {
        self.fullWidth = fullWidth
    }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, Spacing.m)
            // 15 pt above and below a 20 pt body line makes the 50 pt button at the
            // default size. Padding rather than a `minHeight` frame, which
            // measures the label at its one-line ideal height and lets a
            // wrapped label overflow the button.
            .padding(.vertical, 15)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .foregroundStyle(Palette.onAccent)
            .background(Palette.accent, in: Radius.shape(Radius.card))
            .contentShape(Radius.shape(Radius.card))
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

public extension ButtonStyle where Self == PrimaryButtonStyle {
    static var monEluPrimary: PrimaryButtonStyle { PrimaryButtonStyle() }
}
