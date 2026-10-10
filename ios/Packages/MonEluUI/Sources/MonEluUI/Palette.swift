import SwiftUI
import UIKit

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
    /// Secondary copy: dates, counts, captions. Darker than the website's
    /// `--dp-text-secondary` in light mode so it reaches 4.5:1 on every
    /// surface (#480).
    public static let textSecondary = token("textSecondary")
    /// The lightest text. Still body copy, so it too reaches 4.5:1 on the
    /// page, card and track backgrounds in both themes (#480).
    public static let textMuted = token("textMuted")
    /// Adopté, pour, as a fill: hemicycle seats and bar segments.
    public static let positive = token("positive")
    /// Rejeté, contre, as a fill: hemicycle seats and bar segments.
    public static let negative = token("negative")
    public static let positiveBackground = token("positiveBackground")
    public static let negativeBackground = token("negativeBackground")
    /// Text on `positiveBackground`: darker than `positive` in light mode so
    /// a badge reaches 4.5:1 (the website's `--dp-badge-pos-text`).
    public static let positiveText = token("positiveText")
    /// Text on `negativeBackground` (the website's `--dp-badge-neg-text`).
    public static let negativeText = token("negativeText")
    /// Neutral fill behind non-votant badges and bar tracks.
    public static let trackBackground = token("trackBackground")
    /// An abstention badge's tint: amber, the hue of the abstention seat and
    /// bar segment (#516; the website's `--dp-badge-abst-bg`).
    public static let abstentionBackground = token("abstentionBackground")
    /// Text on `abstentionBackground`, and an abstention count written as a
    /// figure (`--dp-badge-abst-text`).
    public static let abstentionText = token("abstentionText")
    /// An abstention's seat in the hemicycle: the website's amber, the same in
    /// both themes (`POSITION_COLORS` in `HemicycleChart.tsx`).
    public static let seatAbstention = token("seatAbstention")
    /// A non-votant's seat and bar segment: the website's gray, the same in
    /// both themes (`POSITION_COLORS.nonVotant` in `HemicycleChart.tsx`).
    public static let seatNonVotant = token("seatNonVotant")
    /// The followed deputy's identity card: the website's fixed navy
    /// (`--dp-active-bg`), the same in both themes so white text stays legible.
    public static let identityBackground = token("identityBackground")
    /// Text and icons on `identityBackground`.
    public static let onIdentity = token("onIdentity")
    /// An eyebrow on `identityBackground` ("LE QUIZ", "VOUS VOTEZ CONTRE"):
    /// the design's salmon, the same in both themes like the navy under it.
    public static let onIdentityAccent = token("onIdentityAccent")
    /// The positive eyebrow on `identityBackground` ("VOUS VOTEZ POUR").
    public static let onIdentityPositive = token("onIdentityPositive")
    /// Civic red, for calls to action.
    public static let accent = token("accent")
    /// Text on an accent-filled button: white in light mode, navy in dark,
    /// where white on the lighter accent misses 4.5:1.
    public static let onAccent = token("onAccent")

    /// A parliamentary group's chip colors, keyed by the API's `party_short`.
    /// They mirror `partyColor()` in `frontend/src/lib/utils.ts` in light
    /// mode; in dark mode the pair is reversed (the dark shade behind the
    /// light one) so a chip never glows on the dark page. A group the website
    /// leaves uncolored (LIOT, UDR, GDR, non-inscrits) or an unknown code
    /// takes the neutral pair, as there.
    public static func party(_ short: String?) -> (background: Color, text: Color) {
        let code = short.flatMap { coloredParties.contains($0) ? $0 : nil } ?? "Other"
        return (token("party\(code)Background"), token("party\(code)Text"))
    }

    /// A group's solid color, for a bar segment (#528): the website's
    /// `--party-*` pair, lightened in dark mode (MON-197). A group without one
    /// (non-inscrits) or an unknown code takes the non-votant grey.
    public static func partyFill(_ short: String?) -> Color {
        let code = short.flatMap { filledParties.contains($0) ? $0 : nil } ?? "Other"
        return token("party\(code)Fill")
    }

    /// The groups with a solid color on the website (`--party-*`).
    static let filledParties: Set<String> = ["RN", "EPR", "LFI", "SOC", "DR", "ECS", "DEM", "HOR", "LIOT", "UDR", "GDR"]

    /// The groups `partyColor()` gives a color of their own.
    static let coloredParties: Set<String> = ["RN", "EPR", "LFI", "SOC", "DR", "ECS", "DEM", "HOR"]

    /// A token as a UIKit color, for the appearance proxies SwiftUI cannot
    /// reach (the navigation bar's title font). It keeps both its values.
    public static func uiColor(_ name: String) -> UIColor {
        UIColor(named: name, in: .module, compatibleWith: nil) ?? .label
    }

    private static func token(_ name: String) -> Color {
        Color(name, bundle: .module)
    }
}
