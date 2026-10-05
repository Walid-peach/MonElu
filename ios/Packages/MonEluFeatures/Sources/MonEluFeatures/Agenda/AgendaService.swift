import Foundation
import MonEluAPI
import MonEluCore

/// The agenda's data, behind a protocol so screens are tested with a stub.
public protocol AgendaService: Sendable {
    /// The séance publique points between two Paris days, `YYYY-MM-DD`.
    func week(from: String, to: String) async throws -> AgendaWeek
}

/// `AgendaService` on the generated client (`getAgenda`).
public struct LiveAgendaService: AgendaService {
    private let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func week(from: String, to: String) async throws -> AgendaWeek {
        AgendaWeek(try await client.getAgenda(query: .init(from: from, to: to)).ok.body.json)
    }
}

extension AgendaWeek {
    init(_ week: Components.Schemas.AgendaResponse) {
        self.init(
            from: week.fromDate,
            to: week.toDate,
            days: week.days.map { day in
                AgendaDay(date: day.sittingDate, items: day.items.map(AgendaEntry.init))
            }
        )
    }
}

extension AgendaEntry {
    init(_ item: Components.Schemas.AgendaItem) {
        self.init(
            id: item.pointUid, start: item.sittingStart, pointType: item.pointType,
            summary: item.summaryPlain, objet: item.objet, theme: item.theme, voteID: item.voteId,
            result: item.result, dossierURL: item.dossierUrl.flatMap(URL.init(string:))
        )
    }
}
