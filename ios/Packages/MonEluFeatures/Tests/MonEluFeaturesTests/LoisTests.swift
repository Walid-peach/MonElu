import Foundation
import MonEluCore
@testable import MonEluFeatures
import Testing

/// The bill page's mapping from recorded responses, its 404, and the
/// display grouping of the parcours (#482).
struct LoisTests {
    static let id = "DLR5L17N54372"

    static func service() throws -> LiveLoisService {
        LiveLoisService(client: operationClient([
            "getLoi": try fixture("loi"),
            "getAgenda": try fixture("agenda"),
            "listLoiAmendements": try fixture("loi_amendements"),
        ]))
    }

    static func loi() async throws -> Loi {
        try #require(try await service().loi(id: id))
    }

    @Test func mapsTheBill() async throws {
        let loi = try await Self.loi()
        #expect(loi.title == "Projet de loi relatif à la protection des enfants")
        #expect(loi.status == "en_navette")
        #expect(loi.statusLabel == "adopté")
        #expect(loi.currentStage == "SN1")
        #expect(loi.predatesCoverage == false)
        #expect(loi.parcours.count == 20)
        let decision = try #require(loi.parcours.first { $0.code == "AN1-DEBATS-DEC" })
        #expect(decision.outcome == "adopté")
        #expect(decision.scrutins.map(\.id) == ["VTANR5L17V8430"])
        #expect(decision.scrutins.first?.votesFor == 378)
        #expect(decision.amendementCount == 2)
    }

    @Test func anUnknownOrUnpublishedBillIsNil() async throws {
        let service = LiveLoisService(client: stubClient(Data(#"{"detail":"Not found"}"#.utf8), status: .notFound))
        #expect(try await service.loi(id: "DLR5L17N1") == nil)
    }

    @Test func aMissingBillShowsTheNotFoundState() async throws {
        let service = LiveLoisService(client: stubClient(Data(#"{"detail":"Not found"}"#.utf8), status: .notFound))
        let loader = await Loader<LoiPage?>(isEmpty: { $0 == nil }) { try await service.page(id: "DLR5L17N1", now: .now) }
        await loader.load()
        #expect(await loader.state.isEmptyState)
    }

    @Test func theNextSittingIsTheEarliestItemForThisBillFromNow() async throws {
        let service = try Self.service()
        let now = try #require(ISO8601DateFormatter().date(from: "2026-10-05T08:00:00Z"))
        let sitting = try #require(try await service.nextSitting(dossierID: Self.id, after: now))
        #expect(sitting.pointType == "Discussion")
        #expect(MonEluFormat.sitting(sitting.start) == "mardi 6 octobre à 15 h")

        let later = try #require(ISO8601DateFormatter().date(from: "2026-10-07T00:00:00Z"))
        #expect(try await service.nextSitting(dossierID: Self.id, after: later)?.pointType == "Suite de la discussion")
        #expect(try await service.nextSitting(dossierID: "DLR5L17N1", after: now) == nil)
    }

    /// The agenda is extra: when it fails, the bill still shows.
    @Test func aFailingAgendaKeepsTheBill() async throws {
        let service = LiveLoisService(client: operationClient(["getLoi": try fixture("loi")]))
        let page = try #require(try await service.page(id: Self.id, now: .now))
        #expect(page.nextSitting == nil)
        #expect(page.loi.id == Self.id)
    }

    @Test func mapsTheAmendements() async throws {
        let list = try await Self.service().amendements(dossierID: Self.id, acteID: "x")
        #expect(list.total == 5)
        #expect(list.items.first?.result == "rejeté")
    }

    @Test func theParcoursSplitsIntoItsTopLevelStages() async throws {
        let sections = try await Self.loi().sections
        #expect(sections.map { $0.stage?.code } == ["AN1", "SN1"])
        #expect(sections[1].rows.map(\.acte.code) == ["SN1-DEPOT", "SN1-COM", "SN1-COM-FOND", "SN1-COM-FOND-SAISIE"])
    }

    /// Two "Discussion en séance publique" on 16 July with no vote fold into
    /// one row; the ones carrying amendment votes stay on their own.
    @Test func identicalStepsWithoutVotesFold() async throws {
        let rows = try await Self.loi().sections[0].rows
        let seances = rows.compactMap { row -> (LoiActe, Int)? in
            guard case .acte(let acte, let repeats) = row, acte.code == "AN1-DEBATS-SEANCE" else { return nil }
            return (acte, repeats.count)
        }
        #expect(seances.map(\.1) == [0, 0, 1, 0])
        #expect(seances.map(\.0.amendementCount) == [0, 9, 0, 66])
    }

    @Test func theStripShowsTheSenateAsCurrentAfterTheAssembly() async throws {
        let strip = try #require(LoiStageStrip(currentStage: "SN1", parcours: try await Self.loi().parcours))
        #expect(strip.steps.map(\.state) == [.reached, .current, .upcoming, .upcoming])
        #expect(strip.steps.map(\.label) == ["1re lecture", "1re lecture", nil, nil])
    }

    /// A debate (AN21) is not a step of the sequence: no strip at all.
    @Test func noStripOffTheSequence() {
        #expect(LoiStageStrip(currentStage: "AN21", parcours: []) == nil)
        #expect(LoiStageStrip(currentStage: nil, parcours: []) == nil)
    }

    @Test func collapsedVotesAreCountedInFrench() {
        #expect(LoiActe.collapsedVotesLabel(amendements: 9, articles: 0) == "9 amendements votés")
        #expect(LoiActe.collapsedVotesLabel(amendements: 1, articles: 0) == "1 amendement voté")
        #expect(LoiActe.collapsedVotesLabel(amendements: 0, articles: 1) == "1 article voté")
        #expect(LoiActe.collapsedVotesLabel(amendements: 66, articles: 4) == "66 amendements et 4 articles votés")
        #expect(LoiActe.collapsedVotesLabel(amendements: 0, articles: 0) == nil)
    }

    @Test func statusesReadInWords() {
        #expect(LoiStatus.label("en_navette") == "En navette parlementaire")
        #expect(LoiStatus.label("nouveau") == "nouveau")
    }
}
