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

    /// The italic Newsreader heading, for a word set apart in a title
    /// (Comparer's "et", a quoted claim). Its own face, not `.italic()`,
    /// which slants the roman face when it finds no italic.
    public static func headingItalic(_ style: Font.TextStyle = .title2) -> Font {
        Font.custom(headingItalicFace, size: baseSize(style), relativeTo: style)
    }

    /// Registers the bundled Newsreader fonts (roman and italic) with the
    /// process. Call once at launch, before any heading renders; later calls
    /// do nothing.
    public static func registerFonts() {
        _ = registration
    }

    static let headingFace = "NewsreaderRoman-SemiBold"
    static let headingItalicFace = "NewsreaderItalic-SemiBold"

    private static let registration: Void = {
        for name in ["Newsreader", "Newsreader-Italic"] {
            guard let url = Bundle.module.url(forResource: name, withExtension: "ttf", subdirectory: "Fonts")
                ?? Bundle.module.url(forResource: name, withExtension: "ttf")
            else { continue }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }()

    /// The extra space between the lines of a long Newsreader title, which
    /// otherwise nearly touch: about 1.25 line height, as the design sets it
    /// (#519).
    public static let headingLineSpacing: CGFloat = 3

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

extension View {
    /// Line spacing for a Newsreader title that can run over several lines
    /// (a scrutin, a bill, a group): `Typography.headingLineSpacing`.
    public func headingLineSpacing() -> some View {
        lineSpacing(Typography.headingLineSpacing)
    }
}
