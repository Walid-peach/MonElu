import CoreText
import SwiftUI

/// The app's type roles, after the website's font contract (`frontend/design.md`):
/// Newsreader for editorial headings, the system font (SF Pro) for everything
/// else so Dynamic Type works without custom scaling.
public enum Typography {
    /// A Newsreader heading that scales with Dynamic Type like `style`.
    public static func heading(_ style: Font.TextStyle = .title2) -> Font {
        Font.custom(headingFace, size: baseSize(style), relativeTo: style)
    }

    /// Registers the bundled Newsreader font with the process. Call once at
    /// launch, before any heading renders; later calls do nothing.
    public static func registerFonts() {
        _ = registration
    }

    static let headingFace = "NewsreaderRoman-SemiBold"

    private static let registration: Void = {
        guard let url = Bundle.module.url(forResource: "Newsreader", withExtension: "ttf", subdirectory: "Fonts")
            ?? Bundle.module.url(forResource: "Newsreader", withExtension: "ttf")
        else { return }
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }()

    /// Point sizes at the default text size, from Apple's type ramp.
    private static func baseSize(_ style: Font.TextStyle) -> CGFloat {
        switch style {
        case .largeTitle: 34
        case .title: 28
        case .title2: 22
        case .title3: 20
        case .headline, .body: 17
        case .callout: 16
        case .subheadline: 15
        case .footnote: 13
        case .caption: 12
        case .caption2: 11
        @unknown default: 17
        }
    }
}
