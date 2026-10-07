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
    func picker(
        _ search: MonDeputeModel.Search, code: String = "", notice: String? = nil, selection: DeputyItem? = nil
    ) -> some View {
        PostalCodePickerContent(
            postalCode: .constant(code), search: search, notice: notice, selection: selection,
            onSearch: {}, onSelect: { _ in }
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

    /// A code over two départements, each with its communes and deputies by
    /// seat, one selected and the pinned "Suivre" under them.
    @Test(arguments: Variant.all)
    func postalPickerFound(_ variant: Variant) {
        // The two rosters as getDepartment returned them on 2026-10-01.
        func seat(
            _ id: String, _ name: String, _ group: String, _ short: String, _ department: String, _ seat: String
        ) -> DeputyItem {
            DeputyItem(
                id: id, name: name, group: group, groupShort: short,
                department: department, circonscription: seat, photoURL: nil
            )
        }
        let found: [DepartmentDeputies] = [
            DepartmentDeputies(
                department: PostalDepartment(
                    code: "04", name: "Alpes-de-Haute-Provence", communes: ["Claret", "Curbans"]
                ),
                deputies: [
                    seat(
                        "PA840657", "Sophie Ricourt Vaginay", "Union des droites pour la République", "UDR",
                        "Alpes-de-Haute-Provence", "2"
                    ),
                    seat("PA793102", "Christian Girard", "Rassemblement National", "RN", "Alpes-de-Haute-Provence", "1"),
                ]
            ),
            DepartmentDeputies(
                department: PostalDepartment(code: "05", name: "Hautes-Alpes", communes: ["Barcillonnette"]),
                deputies: [
                    seat("PA840665", "Marie-José Allemand", "Socialistes et apparentés", "SOC", "Hautes-Alpes", "1"),
                    seat("PA840673", "Valérie Rossi", "Socialistes et apparentés", "SOC", "Hautes-Alpes", "2"),
                ]
            ),
        ]
        // Each département links to its page, so the picker sits in a stack
        // (outside one a link renders disabled), sized explicitly.
        let selected = found[1].deputies[0]
        checkSnapshot(
            NavigationStack {
                ScrollView { picker(.found(found), code: "05110", selection: selected) }
                    .background(Palette.pageBackground)
                    .safeAreaInset(edge: .bottom, spacing: 0) { FollowSelectionBar(deputy: selected) {} }
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 2200 : 900
        )
    }
}
