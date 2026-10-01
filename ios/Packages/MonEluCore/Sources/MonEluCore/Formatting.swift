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

    /// The API's calendar dates (`mandate_start`, "2024-07-07"), which carry
    /// no time or zone: noon in Paris, so `day(_:)` shows the same day. Nil
    /// for anything else.
    public static func calendarDate(_ string: String) -> Date? {
        guard let match = string.wholeMatch(of: /(\d{4})-(\d{2})-(\d{2})/),
              let year = Int(match.1), let month = Int(match.2), let day = Int(match.3)
        else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = paris
        guard let date = calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12)),
              calendar.component(.day, from: date) == day
        else { return nil }
        return date
    }

    /// A count with French digit grouping: 5561 is "5 561".
    public static func count(_ value: Int) -> String {
        value.formatted(.number.locale(french))
    }

    /// A rate the API returns as 0 to 1, written as a whole French
    /// percentage: 0.86 is "86 %". Display only: the rate itself always
    /// comes from the API, never from a division in Swift.
    public static func percent(_ rate: Double) -> String {
        rate.formatted(.percent.precision(.fractionLength(0)).locale(french))
    }
}
