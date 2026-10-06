import Foundation
import MonEluCore
import Testing

struct AppVersionTests {
    @Test(arguments: ["1.2.3", "0.0.0", "10.20.30"])
    func parsesSemanticVersions(_ string: String) {
        #expect(AppVersion(string)?.description == string)
    }

    @Test(arguments: ["", "1", "1.2", "1.2.3.4", "1.2.x", "v1.2.3", "1.2.3-beta", "1..3", " 1.2.3", "-1.2.3"])
    func rejectsAnythingElse(_ string: String) {
        #expect(AppVersion(string) == nil)
    }

    @Test func comparesNumericallyNotLexically() {
        #expect(AppVersion("1.9.0")! < AppVersion("1.10.0")!)
        #expect(AppVersion("2.0.0")! > AppVersion("1.99.99")!)
    }
}

struct ForcedUpdateTests {
    private func config(minimum: String) -> AppConfiguration {
        var config = AppConfiguration.defaults
        config.minIOSVersion = minimum
        return config
    }

    @Test func equalVersionDoesNotBlock() {
        #expect(config(minimum: "1.2.0").requiresUpdate(appVersion: "1.2.0") == false)
    }

    @Test func lowerVersionBlocks() {
        #expect(config(minimum: "1.2.0").requiresUpdate(appVersion: "1.1.9") == true)
        #expect(config(minimum: "1.10.0").requiresUpdate(appVersion: "1.9.0") == true)
    }

    @Test func higherVersionDoesNotBlock() {
        #expect(config(minimum: "1.2.0").requiresUpdate(appVersion: "1.3.0") == false)
    }

    @Test func malformedVersionsNeverBlock() {
        #expect(config(minimum: "not-a-version").requiresUpdate(appVersion: "1.0.0") == false)
        #expect(config(minimum: "9.9.9").requiresUpdate(appVersion: "garbage") == false)
    }

    @Test func defaultsBlockNothing() {
        #expect(AppConfiguration.defaults.requiresUpdate(appVersion: "0.0.1") == false)
        #expect(AppConfiguration.defaults.features == .init(chat: true, verify: true))
    }
}

struct MonEluFormatTests {
    /// 2026-10-05T14:00:00Z is 16 h in Paris (summer time).
    @Test func sittingIsParisWeekdayDayAndHour() {
        #expect(MonEluFormat.sitting(Date(timeIntervalSince1970: 1_791_208_800)) == "lundi 5 octobre à 16 h")
        #expect(MonEluFormat.sitting(Date(timeIntervalSince1970: 1_791_208_800 + 30 * 60)) == "lundi 5 octobre à 16 h 30")
    }

    @Test func shortDayAbbreviatesTheMonth() throws {
        let date = try #require(MonEluFormat.calendarDate("2026-10-01"))
        #expect(MonEluFormat.shortDay(date) == "1 oct. 2026")
    }

    /// Paris moves from summer to winter time on 25 October 2026: 14:00 UTC
    /// is 16 h before and 15 h after, and a 16 h séance is 15:00 UTC after.
    @Test func timeIsParisWallClockAcrossTheOctoberChange() throws {
        let iso = ISO8601DateFormatter()
        #expect(MonEluFormat.time(try #require(iso.date(from: "2026-10-23T14:00:00Z"))) == "16 h")
        #expect(MonEluFormat.time(try #require(iso.date(from: "2026-10-27T14:00:00Z"))) == "15 h")
        #expect(MonEluFormat.time(try #require(iso.date(from: "2026-10-27T15:00:00Z"))) == "16 h")
        #expect(MonEluFormat.time(try #require(iso.date(from: "2026-10-27T20:30:00Z"))) == "21 h 30")
        // 23:30 UTC on Saturday 24 October is already Sunday in Paris.
        #expect(MonEluFormat.isoDay(try #require(iso.date(from: "2026-10-24T23:30:00Z"))) == "2026-10-25")
    }

    @Test func dayHeadingsAndSpans() {
        #expect(MonEluFormat.weekday("2026-10-05") == "Lundi 5 octobre")
        #expect(MonEluFormat.span(from: "2026-10-05", to: "2026-10-11") == "5 au 11 octobre")
        #expect(MonEluFormat.span(from: "2026-09-28", to: "2026-10-04") == "28 septembre au 4 octobre")
    }

    @Test func daysAreWrittenInFrenchInParisTime() {
        // 2026-07-20T22:30:00Z is already 21 July in Paris.
        #expect(MonEluFormat.day(Date(timeIntervalSince1970: 1_784_586_600)) == "21 juillet 2026")
    }

    @Test func calendarDateIsTheSameDayInParis() throws {
        let date = try #require(MonEluFormat.calendarDate("2024-07-07"))
        #expect(MonEluFormat.day(date) == "7 juillet 2024")
    }

    @Test(arguments: ["", "2024-07", "2024-02-31", "07/07/2024", "2024-07-07T00:00:00"])
    func calendarDateRefusesAnythingElse(_ string: String) {
        #expect(MonEluFormat.calendarDate(string) == nil)
    }

    /// The quiz's percentages show exactly the value the API returned.
    @Test(arguments: [(88.9, "88,9%"), (70.0, "70%"), (11.1, "11,1%"), (100.0, "100%")])
    func percentagesKeepTheAPIsDecimal(_ value: Double, _ expected: String) {
        #expect(MonEluFormat.percentage(value).filter { !$0.isWhitespace } == expected)
    }

    @Test func countsAreGroupedTheFrenchWay() {
        #expect(MonEluFormat.count(349) == "349")
        let grouped = MonEluFormat.count(5_561)
        #expect(grouped.filter { !$0.isWhitespace } == "5561")
        #expect(!grouped.contains(" "))
    }

    @Test(arguments: [(0.86, "86%"), (0.0628, "6%"), (1, "100%")])
    func percentIsWholeAndFrench(_ rate: Double, _ expected: String) {
        let text = MonEluFormat.percent(rate)
        // French puts a space before "%"; it must be one that never wraps,
        // and ICU picks U+00A0 or U+202F depending on its version.
        #expect(text.filter { !$0.isWhitespace } == expected)
        #expect(!text.contains(" "))
        #expect(text.contains { $0 == "\u{00A0}" || $0 == "\u{202F}" })
    }
}
