import Foundation

/// How the app writes dates: in French, in Paris time, whatever the device's
/// own settings. A scrutin dated 21 July is 21 July for every reader; the
/// API's timestamps are UTC (`APIDateTranscoder`).
public enum MonEluFormat {
    static let paris = TimeZone(identifier: "Europe/Paris")!
    static let french = Locale(identifier: "fr_FR")

    /// "21 juillet 2026"
    public static func day(_ date: Date) -> String {
        var style = Date.FormatStyle(date: .long, time: .omitted, locale: french)
        style.timeZone = paris
        return date.formatted(style)
    }
}
