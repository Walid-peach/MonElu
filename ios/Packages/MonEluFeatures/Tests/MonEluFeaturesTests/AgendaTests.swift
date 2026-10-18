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

    /// A point opens the bill's page in the app only when the API gives it a
    /// `lois_url` (#511); the recorded week has none, so this one adds it to
    /// the third point, whose dossier has no scrutin yet in the recording.
    @Test func aBillWithAPageIsOpenedInTheApp() async throws {
        var json = try #require(JSONSerialization.jsonObject(with: fixture("agenda_week")) as? [String: Any])
        var days = try #require(json["days"] as? [[String: Any]])
        var items = try #require(days[1]["items"] as? [[String: Any]])
        items[0]["lois_url"] = "https://monelu.fr/lois/DLR5L17N54777"
        days[1]["items"] = items
        json["days"] = days
        let week = try await LiveAgendaService(client: stubClient(try JSONSerialization.data(withJSONObject: json)))
            .week(from: "2026-09-28", to: "2026-10-04")
        let entries = week.days.flatMap(\.items)
        #expect(entries.map(\.loiID) == [nil, nil, "DLR5L17N54777"])
        // The recording itself: no page anywhere, so the AN links stay.
        #expect(try await Self.week().days.flatMap(\.items).allSatisfy { $0.loiID == nil })
    }

    /// Accueil shows the week from today on, a sitting held earlier today
    /// included, and at most five items.
    @Test func accueilShowsTheNextItemsOnly() async throws {
        let items = try await Self.week().days.flatMap(\.items)
        let secondDay = try #require(ISO8601DateFormatter().date(from: "2026-10-02T08:00:00Z"))
        #expect(HomeAgendaSection.upcoming(items, now: secondDay).map(\.id) == [items[2].id])
        let many = (0..<7).map {
            AgendaEntry(
                id: "\($0)", start: secondDay.addingTimeInterval(Double($0) * 3600), pointType: nil, summary: nil,
                objet: "Point \($0)", theme: nil, voteID: nil, result: nil, dossierURL: nil
            )
        }
        #expect(HomeAgendaSection.upcoming(many.reversed(), now: secondDay).map(\.id) == ["0", "1", "2", "3", "4"])
    }

    /// The bill's title leads with the one-liner under it (#525); without a
    /// dossier title the AN's wording leads; with neither, a fixed line.
    @Test func headlineLeadsWithTheBillTitle() async throws {
        let items = try await Self.week().days.flatMap(\.items)
        // A dossier the API knows: its title, then the one-liner.
        #expect(items[1].headline.lead.hasPrefix("Apporter une réponse intégrale"))
        #expect(items[1].headline.detail?.hasPrefix("Le texte propose un dispositif") == true)
        // No dossier title: the point's wording leads, the one-liner follows.
        #expect(items[0].headline.lead == "Ouverture de la session ordinaire")
        #expect(items[0].headline.detail?.hasPrefix("Le texte porte simplement") == true)
        let objetOnly = AgendaEntry(
            id: "y", start: .now, pointType: "Ouverture et clôture de session", summary: nil,
            objet: "Nomination du Bureau", theme: nil, voteID: nil, result: nil, dossierURL: nil
        )
        #expect(objetOnly.headline.lead == "Nomination du Bureau")
        #expect(objetOnly.headline.detail == nil)
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
    /// The week a date falls in, counted from the current one in Paris ISO
    /// weeks (#512), across the end of summer time on 25 October 2026.
    @Test func offsetCountsParisWeeks() throws {
        let iso = ISO8601DateFormatter()
        func date(_ s: String) throws -> Date { try #require(iso.date(from: s)) }
        let tuesday = try date("2026-10-06T10:00:00Z")
        #expect(AgendaWindow.offset(toWeekOf: try date("2026-10-15T13:00:00Z"), now: tuesday) == 1)
        // Monday 00:30 and Sunday 23:30 in Paris both belong to this week.
        #expect(AgendaWindow.offset(toWeekOf: try date("2026-10-04T22:30:00Z"), now: tuesday) == 0)
        #expect(AgendaWindow.offset(toWeekOf: try date("2026-10-11T21:30:00Z"), now: tuesday) == 0)
        #expect(AgendaWindow.offset(toWeekOf: try date("2026-09-29T08:00:00Z"), now: tuesday) == -1)
        #expect(AgendaWindow.offset(toWeekOf: try date("2026-10-27T14:00:00Z"), now: try date("2026-10-20T10:00:00Z")) == 1)
    }

    /// The bill page's next sitting opens the agenda on that week (#512).
    @MainActor @Test func opensOnTheWeekOfADate() async throws {
        let recorder = RecordingAgendaService()
        let iso = ISO8601DateFormatter()
        let now = try #require(iso.date(from: "2026-10-06T10:00:00Z"))
        let sitting = try #require(iso.date(from: "2026-10-15T13:00:00Z"))
        let model = AgendaModel(service: recorder, weekOf: sitting, now: { now })
        #expect(model.window.offset == 1)
        await model.loader.load()
        #expect(recorder.windows == [["2026-10-12", "2026-10-18"]])
        #expect(model.window.relativeLabel == "Semaine prochaine")
    }

    @MainActor @Test func movingAWeekAsksForThatWeek() async throws {
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
