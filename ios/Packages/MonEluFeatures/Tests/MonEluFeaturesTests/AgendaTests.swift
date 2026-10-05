import Foundation
import MonEluCore
@testable import MonEluFeatures
import Testing

/// The agenda's mapping from a recorded week, its headline rules (mirroring
/// `frontend/src/lib/agenda.ts`), the theme filter and the Paris weeks (#483).
struct AgendaTests {
    static func week() async throws -> AgendaWeek {
        try await LiveAgendaService(client: stubClient(try fixture("agenda_week"))).week(from: "2026-09-28", to: "2026-10-04")
    }

    @Test func mapsTheWeek() async throws {
        let week = try await Self.week()
        #expect(week.from == "2026-09-28")
        #expect(week.days.map(\.date) == ["2026-10-01", "2026-10-02"])
        #expect(week.days.map(\.items.count) == [2, 1])
        let vote = try #require(week.days[0].items.first { $0.voteID != nil })
        #expect(vote.voteID == "VTANR5L17V8438")
        #expect(vote.result == "adopté")
        #expect(MonEluFormat.time(vote.start) == "15 h")
    }

    /// A one-liner leads, with the official wording under it; without one
    /// the wording leads alone; with neither, a fixed line.
    @Test func headlineFollowsTheWebsite() async throws {
        let items = try await Self.week().days[0].items
        #expect(items[0].headline.official == "Ouverture de la session ordinaire")
        let objetOnly = AgendaEntry(
            id: "y", start: .now, pointType: "Ouverture et clôture de session", summary: nil,
            objet: "Nomination du Bureau", theme: nil, voteID: nil, result: nil, dossierURL: nil
        )
        #expect(objetOnly.headline.lead == "Nomination du Bureau")
        #expect(objetOnly.headline.official == nil)
        let blank = AgendaEntry(
            id: "x", start: .now, pointType: "Discussion", summary: " ", objet: nil, theme: nil,
            voteID: nil, result: nil, dossierURL: nil
        )
        #expect(blank.headline.lead == "Point inscrit à l'ordre du jour")
    }

    /// "Questions au Gouvernement" is not printed twice.
    @Test func pointTypeIsDroppedWhenItRepeatsTheHeadline() {
        let stub = AgendaEntry(
            id: "x", start: .now, pointType: "Questions au Gouvernement", summary: nil,
            objet: "Questions au gouvernement", theme: nil, voteID: nil, result: nil, dossierURL: nil
        )
        #expect(stub.pointTypeLabel == nil)
    }

    @Test func themesFollowTheReferenceOrderAndFilter() async throws {
        let week = try await Self.week()
        #expect(week.themes == ["Justice & Sécurité", "Institutions"])
        let filtered = week.filtered(theme: "Institutions")
        #expect(filtered.map(\.date) == ["2026-10-01"])
        #expect(filtered[0].items.count == 1)
        #expect(week.filtered(theme: nil) == week.days)
    }

    /// The ISO week in Paris, Monday to Sunday, across the October change.
    @Test func windowsAreParisIsoWeeks() throws {
        let iso = ISO8601DateFormatter()
        // Sunday 25 October, 23:30 UTC: already Monday 26 in Paris, which
        // is UTC+1 since that morning.
        let now = try #require(iso.date(from: "2026-10-25T23:30:00Z"))
        let current = AgendaWindow(offset: 0, now: now)
        #expect((current.from, current.to) == ("2026-10-26", "2026-11-01"))
        let previous = AgendaWindow(offset: -1, now: now)
        #expect((previous.from, previous.to) == ("2026-10-19", "2026-10-25"))
        #expect(current.relativeLabel == "Cette semaine")
        #expect(AgendaWindow(offset: 2, now: now).relativeLabel == nil)
    }

    @MainActor
    @Test func movingAWeekAsksForThatWeek() async throws {
        let recorder = RecordingAgendaService()
        let iso = ISO8601DateFormatter()
        let now = try #require(iso.date(from: "2026-10-06T10:00:00Z"))
        let model = AgendaModel(service: recorder, now: { now })
        await model.loader.load()
        model.move(by: 1)
        await model.loader.load()
        #expect(recorder.windows == [["2026-10-05", "2026-10-11"], ["2026-10-12", "2026-10-18"]])
        #expect(model.loader.state.isEmptyState)
    }
}

final class RecordingAgendaService: AgendaService, @unchecked Sendable {
    private let lock = NSLock()
    private(set) var windows: [[String]] = []

    func week(from: String, to: String) async throws -> AgendaWeek {
        lock.withLock { windows.append([from, to]) }
        return AgendaWeek(from: from, to: to, days: [])
    }
}
