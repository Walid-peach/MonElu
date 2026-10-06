import Foundation
import MonEluAPI
import MonEluCore

/// The bill page's data, behind a protocol so screens are tested with a stub
/// instead of the network.
public protocol LoisService: Sendable {
    /// Nil when the API has no page for this dossier: an unknown uid, or a
    /// bill with no scrutin (`has_scrutins` false), which is a 404 (ADR-035 §6).
    func loi(id: String) async throws -> Loi?
    /// The first séance item for this bill on the agenda from `now` on, if any.
    func nextSitting(dossierID: String, after now: Date) async throws -> LoiNextSitting?
    /// The amendment and article scrutins of the bill, or of one acte.
    func amendements(dossierID: String, acteID: String?) async throws -> LoiAmendements
}

extension LoisService {
    /// The bill and, when the agenda answers, its next séance. A failing
    /// agenda never hides the bill: the card is extra.
    func page(id: String, now: Date) async throws -> LoiPage? {
        async let sitting = try? nextSitting(dossierID: id, after: now)
        guard let loi = try await loi(id: id) else { return nil }
        return LoiPage(loi: loi, nextSitting: await sitting)
    }
}

/// `LoisService` on the generated client (`getLoi`, `getAgenda`, `listLoiAmendements`).
public struct LiveLoisService: LoisService {
    /// How far ahead the agenda is read for the next séance. The API allows
    /// up to 90 days; the AN publishes its order of business a few weeks out.
    static let agendaWindowDays = 28
    /// Enough for any one acte; the API caps a page at 500.
    static let amendementsPageSize = 500

    private let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func loi(id: String) async throws -> Loi? {
        let response = try await client.getLoi(path: .init(dossierUid: id))
        // A 404 is not in the spec, so the client reports it as undocumented.
        if case .undocumented(statusCode: 404, _) = response { return nil }
        return Loi(try response.ok.body.json)
    }

    public func nextSitting(dossierID: String, after now: Date) async throws -> LoiNextSitting? {
        let to = now.addingTimeInterval(TimeInterval(Self.agendaWindowDays * 86_400))
        let agenda = try await client.getAgenda(query: .init(from: MonEluFormat.isoDay(now), to: MonEluFormat.isoDay(to))).ok.body.json
        return agenda.days
            .flatMap(\.items)
            .filter { $0.dossierId == dossierID && $0.sittingStart >= now }
            .min { $0.sittingStart < $1.sittingStart }
            .map { LoiNextSitting(start: $0.sittingStart, pointType: $0.pointType) }
    }

    public func amendements(dossierID: String, acteID: String?) async throws -> LoiAmendements {
        let list = try await client.listLoiAmendements(
            path: .init(dossierUid: dossierID),
            query: .init(acteUid: acteID, limit: Self.amendementsPageSize)
        ).ok.body.json
        return LoiAmendements(total: list.total, items: list.items.map(LoiScrutin.init))
    }
}

extension Loi {
    init(_ loi: Components.Schemas.LoiDetail) {
        self.init(
            id: loi.dossierUid,
            title: loi.titre ?? loi.dossierUid,
            procedure: loi.procedureLabel,
            status: loi.status,
            statusLabel: loi.statusLabel,
            currentStage: loi.currentStage,
            anURL: loi.anDossierUrl.flatMap(URL.init(string:)),
            predatesCoverage: loi.parcoursPredatesCoverage ?? false,
            parcours: (loi.parcours ?? []).map(LoiActe.init),
            unattachedScrutins: (loi.unattachedScrutins ?? []).map(LoiScrutin.init)
        )
    }
}

extension LoiActe {
    init(_ acte: Components.Schemas.LoiActe) {
        self.init(
            id: acte.acteUid, parentID: acte.parentUid, depth: acte.depth, code: acte.codeActe,
            label: acte.libelle, date: acte.dateActe.flatMap(MonEluFormat.calendarDate),
            outcome: acte.statutLabel, scrutins: (acte.scrutins ?? []).map(LoiScrutin.init),
            amendementCount: acte.amendementCount ?? 0, articleCount: acte.articleCount ?? 0
        )
    }
}

extension LoiScrutin {
    init(_ scrutin: Components.Schemas.LoiScrutin) {
        self.init(
            id: scrutin.voteId, title: scrutin.voteTitle ?? scrutin.voteId, date: scrutin.votedAt,
            result: scrutin.result, votesFor: scrutin.votesFor, votesAgainst: scrutin.votesAgainst,
            abstentions: scrutin.abstentions
        )
    }

    init(_ scrutin: Components.Schemas.LoiAmendementScrutin) {
        self.init(
            id: scrutin.voteId, title: scrutin.voteTitle ?? scrutin.voteId, date: scrutin.votedAt,
            result: scrutin.result, votesFor: scrutin.votesFor, votesAgainst: scrutin.votesAgainst,
            abstentions: scrutin.abstentions
        )
    }
}
