import SwiftUI

/// MonÉlu's color tokens. Each is a color set in `Colors.xcassets` with a light
/// and a dark value mirroring the website's `--dp-*` variables in
/// `frontend/src/app/globals.css` (ADR-027 for the dark palette).
///
/// Components use these and nothing else: no literal color, no system color.
/// `tests/unit/test_ios_design_tokens.py` enforces both rules.
public enum Palette {
    public static let pageBackground = token("pageBackground")
    public static let cardBackground = token("cardBackground")
    public static let border = token("border")
    public static let textPrimary = token("textPrimary")
    public static let textSecondary = token("textSecondary")
    public static let textMuted = token("textMuted")
    /// Adopté, pour.
    public static let positive = token("positive")
    /// Rejeté, contre.
    public static let negative = token("negative")
    public static let positiveBackground = token("positiveBackground")
    public static let negativeBackground = token("negativeBackground")
    /// Neutral fill behind abstention and non-votant badges and bar tracks.
    public static let trackBackground = token("trackBackground")
    /// An abstention's seat in the hemicycle: the website's amber, the same in
    /// both themes (`POSITION_COLORS` in `HemicycleChart.tsx`).
    public static let seatAbstention = token("seatAbstention")
    /// Civic red, for calls to action.
    public static let accent = token("accent")

    private static func token(_ name: String) -> Color {
        Color(name, bundle: .module)
    }
}
