import Foundation
import MonEluCore
import Testing

struct FormattingTests {
    /// 2026-10-10, noon UTC.
    let today = Date(timeIntervalSince1970: 1_791_633_600)

    @Test func listDayLeavesOutTheCurrentYear() throws {
        let date = try #require(MonEluFormat.calendarDate("2026-07-21"))
        #expect(MonEluFormat.listDay(date, today: today) == "21 juil.")
    }

    @Test func listDayWritesAnotherYear() throws {
        let date = try #require(MonEluFormat.calendarDate("2025-12-03"))
        #expect(MonEluFormat.listDay(date, today: today) == "3 déc. 2025")
    }

    /// 31 December at 23:30 UTC is already New Year's Day in Paris.
    @Test func listDayReadsTheYearInParis() {
        let newYear = Date(timeIntervalSince1970: 1_798_759_800)
        #expect(MonEluFormat.listDay(newYear, today: today) == "1 janv. 2027")
    }
}
