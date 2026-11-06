import SwiftUI

/// The app's corner radii, named by role (#629). Three values only, so that
/// neighbouring surfaces never differ by a point or two for no reason.
///
/// This file is the one place a radius is written as a number:
/// `tests/unit/test_ios_design_tokens.py` fails on a `cornerRadius:` literal
/// anywhere else, and on a fourth value here.
public enum Radius {
    /// Tags, party chips, track pills, the quiz deck's stamps.
    public static let small: CGFloat = 6
    /// Cards, tiles nested in a card, buttons, inputs, nudges.
    public static let card: CGFloat = 12
    /// The large surfaces: the quiz deck card, the Ask composer and the
    /// identity (navy) panels.
    public static let large: CGFloat = 20

    /// The continuous rounded rectangle every surface uses.
    public static func shape(_ radius: CGFloat) -> RoundedRectangle {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
    }
}

/// The app's spacing scale, in points (#629). Page gutters, card padding and
/// the gaps between cards and rows come from it; a component's own optical
/// adjustments inside a control may still use another value.
public enum Spacing {
    public static let xxs: CGFloat = 4
    public static let xs: CGFloat = 8
    public static let s: CGFloat = 12
    public static let m: CGFloat = 16
    public static let l: CGFloat = 24

    /// The side margin of a page.
    public static let gutter: CGFloat = m
    /// The inner margin of a `Card`.
    public static let cardPadding: CGFloat = m
}

public extension View {
    /// A rounded surface: a fill and, by default, the 1 pt `Palette.border`
    /// stroke that `Card` and every card-like tile share. Pass
    /// `bordered: false` for a tinted surface (a caveat, an identity panel)
    /// whose fill already separates it from the page.
    func surface(
        _ background: Color = Palette.cardBackground,
        radius: CGFloat = Radius.card,
        bordered: Bool = true
    ) -> some View {
        self
            .background(background, in: Radius.shape(radius))
            .overlay {
                if bordered {
                    Radius.shape(radius).strokeBorder(Palette.border, lineWidth: 1)
                }
            }
    }
}
