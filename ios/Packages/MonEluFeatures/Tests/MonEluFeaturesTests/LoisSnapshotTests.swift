import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// The bill page in light and dark, at the default and an accessibility text
/// size (#482), from responses recorded from the production API. Views
/// holding links sit in a stack, as in the app, sized explicitly.
@MainActor
@Suite(.snapshots(record: .missing))
struct LoisSnapshotTests {
    static let configuration = AppConfiguration(
        minIOSVersion: "1.0.0",
        features: .init(chat: true, verify: true),
        dataHorizon: "2025-07-01",
        caveats: [
            .init(id: "bill_coverage", text: "L'Assemblée ne rattache ses scrutins au texte qu'ils concernent que depuis le **26 mars 2026** : les étapes antérieures du parcours d'un texte n'affichent aucun vote, ce qui ne veut pas dire qu'il n'y en a pas eu."),
        ]
    )

    /// 5 October 2026, so the 6 October séance is the next one.
    static let today = Date(timeIntervalSince1970: 1_791_180_000)

    func page() async throws -> LoiPage {
        let service = try LoisTests.service()
        return try #require(try await service.page(id: LoisTests.id, now: Self.today))
    }

    func stacked<V: View>(_ view: V) -> some View {
        NavigationStack {
            ScrollView { view.padding(16) }
                .background(Palette.pageBackground)
        }
    }

    /// Procedure, title, status with the AN's own wording, the strip with the
    /// Sénat current, and the next séance.
    @Test(arguments: Variant.all)
    func loiOverview(_ variant: Variant) async throws {
        checkSnapshot(LoiOverview(page: try await page()).padding(16), variant)
    }

    /// The first reading: grouping nodes, folded séances, amendment counts
    /// and the headline scrutin on the decision.
    @Test(arguments: Variant.all)
    func loiParcours(_ variant: Variant) async throws {
        let loi = try await page().loi
        checkSnapshot(
            stacked(ParcoursSectionView(loiID: loi.id, section: loi.sections[0], today: Self.today)),
            variant,
            height: variant.size.isAccessibilityCategory ? 4600 : 1080
        )
    }

    /// A promulgated bill whose parcours predates scrutin coverage: every
    /// step reached, the coverage caveat, an upcoming step, and no séance.
    @Test(arguments: Variant.all)
    func loiPromulgated(_ variant: Variant) {
        func acte(_ id: String, _ depth: Int, _ code: String, _ label: String, _ day: String?) -> LoiActe {
            LoiActe(
                id: id, parentID: depth == 0 ? nil : "root", depth: depth, code: code, label: label,
                date: day.flatMap(MonEluFormat.calendarDate), outcome: nil, scrutins: [],
                amendementCount: 0, articleCount: 0
            )
        }
        let loi = Loi(
            id: "DLR5L17N52746", title: "Moderniser la gestion du patrimoine immobilier de l'État",
            procedure: "Proposition de loi ordinaire", status: "promulguee", statusLabel: nil,
            currentStage: "PROM", anURL: URL(string: "https://www.assemblee-nationale.fr/dyn/17/dossiers/DLR5L17N52746"),
            predatesCoverage: true,
            parcours: [
                acte("a", 0, "AN1", "1ère lecture (1ère assemblée saisie)", nil),
                acte("b", 1, "AN1-DEPOT", "1er dépôt d'une initiative.", "2025-11-04"),
                acte("c", 0, "SN1", "1ère lecture (2ème assemblée saisie)", nil),
                acte("d", 1, "SN1-DEPOT", "Dépôt d'une initiative en navette", "2026-02-10"),
                acte("e", 0, "CMP", "Commission Mixte Paritaire", nil),
                acte("f", 1, "CMP-SAISIE", "Saisie de la commission mixte paritaire", "2026-06-30"),
                acte("g", 0, "PROM", "Promulgation de la loi", nil),
                acte("h", 1, "PROM-PUB", "Publication de la loi au Journal officiel", "2026-10-20"),
            ],
            unattachedScrutins: []
        )
        checkSnapshot(
            stacked(LoiContent(page: LoiPage(loi: loi, nextSitting: nil), configuration: Self.configuration, today: Self.today)),
            variant,
            height: variant.size.isAccessibilityCategory ? 3400 : 1000
        )
    }

    @Test(arguments: Variant.all)
    func loiAmendements(_ variant: Variant) async throws {
        let list = try await LoisTests.service().amendements(dossierID: LoisTests.id, acteID: "x")
        checkSnapshot(
            NavigationStack { LoiAmendementsList(amendements: list) },
            variant,
            height: variant.size.isAccessibilityCategory ? 2600 : 800
        )
    }
}
