import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// The postal-code picker in light and dark, at the default and an
/// accessibility text size (#463), in each of its states. Accueil's home is in
/// `HomeSnapshotTests`.
@MainActor
@Suite(.snapshots(record: .missing))
struct MonDeputeSnapshotTests {
    func picker(_ search: MonDeputeModel.Search, code: String = "", notice: String? = nil) -> some View {
        PostalCodePickerContent(
            postalCode: .constant(code), search: search, notice: notice, onSearch: {}, onChoose: { _ in }
        )
        .padding(16)
    }

    /// First launch, here after a followed deputy disappeared from the data.
    @Test(arguments: Variant.all)
    func postalPicker(_ variant: Variant) {
        checkSnapshot(
            picker(.idle, notice: "Le député que vous suiviez n'est plus dans nos données. Choisissez-en un autre."),
            variant
        )
    }

    @Test(arguments: Variant.all)
    func postalPickerInvalid(_ variant: Variant) {
        checkSnapshot(picker(.invalid, code: "3300"), variant)
    }

    @Test(arguments: Variant.all)
    func postalPickerUnknown(_ variant: Variant) {
        checkSnapshot(picker(.unknown, code: "99999"), variant)
    }

    /// A code over two départements, each with its deputies.
    @Test(arguments: Variant.all)
    func postalPickerFound(_ variant: Variant) {
        // The two rosters as getDepartment returned them on 2026-10-01.
        func seat(_ id: String, _ name: String, _ group: String, _ department: String, _ seat: String) -> DeputyItem {
            DeputyItem(
                id: id, name: name, group: group, groupShort: nil,
                department: department, circonscription: seat, photoURL: nil
            )
        }
        let found: [DepartmentDeputies] = [
            DepartmentDeputies(
                department: PostalDepartment(code: "04", name: "Alpes-de-Haute-Provence"),
                deputies: [
                    seat("PA793102", "Christian Girard", "Rassemblement National", "Alpes-de-Haute-Provence", "1"),
                    seat(
                        "PA840657", "Sophie Ricourt Vaginay", "Union des droites pour la République",
                        "Alpes-de-Haute-Provence", "2"
                    ),
                ]
            ),
            DepartmentDeputies(
                department: PostalDepartment(code: "05", name: "Hautes-Alpes"),
                deputies: [
                    seat("PA840665", "Marie-José Allemand", "Socialistes et apparentés", "Hautes-Alpes", "1"),
                    seat("PA840673", "Valérie Rossi", "Socialistes et apparentés", "Hautes-Alpes", "2"),
                ]
            ),
        ]
        checkSnapshot(picker(.found(found), code: "05110"), variant)
    }
}
