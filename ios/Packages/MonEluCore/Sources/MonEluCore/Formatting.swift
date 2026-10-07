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

    /// "1 oct. 2026": a date in a dense list, such as a bill's parcours.
    public static func shortDay(_ date: Date) -> String {
        var style = Date.FormatStyle(locale: french).day().month(.abbreviated).year()
        style.timeZone = paris
        return date.formatted(style)
    }

    /// "lundi 5 octobre à 16 h": when a séance starts, in Paris time. Minutes
    /// show only when they are not zero ("16 h 30").
    public static func sitting(_ date: Date) -> String {
        var dayStyle = Date.FormatStyle(locale: french).weekday(.wide).day().month(.wide)
        dayStyle.timeZone = paris
        return "\(date.formatted(dayStyle)) à \(time(date))"
    }

    /// "Jeudi 1er octobre 2026": a day heading over a list of scrutins, in
    /// Paris time, with the French ordinal for the first of the month.
    public static func fullDay(_ date: Date) -> String {
        var style = Date.FormatStyle(locale: french).weekday(.wide).day().month(.wide).year()
        style.timeZone = paris
        let parts = parisCalendar.dateComponents([.day], from: date)
        var text = date.formatted(style)
        if parts.day == 1, let range = text.range(of: " 1 ") { text.replaceSubrange(range, with: " 1er ") }
        return text.prefix(1).uppercased() + text.dropFirst()
    }

    /// "Lun. 5 oct. · 16 h": a séance's start on a small card, in Paris time.
    public static func shortSitting(_ date: Date) -> String {
        var dayStyle = Date.FormatStyle(locale: french).weekday(.abbreviated).day().month(.abbreviated)
        dayStyle.timeZone = paris
        let day = date.formatted(dayStyle)
        return "\(day.prefix(1).uppercased() + day.dropFirst()) · \(time(date))"
    }

    /// A count with French digit grouping: 5561 is "5 561".
    public static func count(_ value: Int) -> String {
        value.formatted(.number.locale(french))
    }

    /// A percentage the API already returns on a 0 to 100 scale, written as
    /// it came: 88.9 is "88,9 %", 70 is "70 %". The quiz's `agreement_pct`.
    public static func percentage(_ value: Double) -> String {
        (value / 100).formatted(.percent.precision(.fractionLength(0...1)).locale(french))
    }

    /// A rate the API returns as 0 to 1, written as a French percentage:
    /// 0.86 is "86 %", or with `decimals: 1`, 0.0092 is "0,9 %" where a
    /// whole number would round a small rate away. Display only: the rate
    /// itself always comes from the API, never from a division in Swift.
    public static func percent(_ rate: Double, decimals: Int = 0) -> String {
        rate.formatted(.percent.precision(.fractionLength(decimals)).locale(french))
    }

    /// A séance's start as the Paris wall clock: "16 h", or "21 h 30".
    /// The API's timestamps are UTC; summer and winter time are Paris's.
    public static func time(_ date: Date) -> String {
        let parts = parisCalendar.dateComponents([.hour, .minute], from: date)
        let hour = parts.hour ?? 0, minute = parts.minute ?? 0
        return minute == 0 ? "\(hour) h" : "\(hour) h \(String(format: "%02d", minute))"
    }

    /// "2026-10-05": the Paris day of `date`, as the API's `from`/`to` take it.
    public static func isoDay(_ date: Date) -> String {
        let parts = parisCalendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// An API calendar date ("2026-10-05") as "Lundi 5 octobre", for a day heading.
    public static func weekday(_ string: String) -> String {
        guard let date = calendarDate(string) else { return string }
        var style = Date.FormatStyle(locale: french).weekday(.wide).day().month(.wide)
        style.timeZone = paris
        let text = date.formatted(style)
        return text.prefix(1).uppercased() + text.dropFirst()
    }

    /// Two API calendar dates as a span: "5 au 11 octobre", or
    /// "28 septembre au 4 octobre" across a month.
    public static func span(from: String, to: String) -> String {
        guard let start = calendarDate(from), let end = calendarDate(to) else { return "\(from) au \(to)" }
        var dayMonth = Date.FormatStyle(locale: french).day().month(.wide)
        dayMonth.timeZone = paris
        let sameMonth = parisCalendar.component(.month, from: start) == parisCalendar.component(.month, from: end)
        let first = sameMonth ? "\(parisCalendar.component(.day, from: start))" : start.formatted(dayMonth)
        return "\(first) au \(end.formatted(dayMonth))"
    }

    /// The Gregorian calendar in Paris, weeks starting on Monday (ISO).
    public static let parisCalendar: Calendar = {
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = paris
        calendar.locale = french
        return calendar
    }()
}
