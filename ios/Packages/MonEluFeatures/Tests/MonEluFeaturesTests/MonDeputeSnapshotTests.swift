import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// The picker in light and dark, at the default and an accessibility text
/// size (#463, ADR-047), in each of its states: the address search first,
/// then the postal code. Accueil's home is in `HomeSnapshotTests`.
@MainActor
@Suite(.snapshots(record: .missing))
struct MonDeputeSnapshotTests {
    func picker(
        _ search: MonDeputeModel.Search = .idle, code: String = "", notice: String? = nil,
        selection: DeputyItem? = nil, address: String = "", addressSearch: MonDeputeModel.AddressSearch = .idle
    ) -> some View {
        PostalCodePickerContent(
            address: .constant(address), addressSearch: addressSearch,
            postalCode: .constant(code), search: search, notice: notice, selection: selection,
            onPickAddress: { _ in }, onAbroad: {}, onSearch: {}, onSelect: { _ in }
        )
        .padding(16)
    }

    static func deputy(_ id: String, _ name: String, _ short: String, _ department: String, _ seat: String) -> DeputyItem {
        DeputyItem(
            id: id, name: name, group: nil, groupShort: short,
            department: department, circonscription: seat, photoURL: nil
        )
    }

    /// Suggestions as the Base Adresse Nationale returned them for "1 rue nationale lille".
    @Test(arguments: Variant.all)
    func addressSuggestions(_ variant: Variant) {
        let suggestions = [
            AddressSuggestion(label: "1 Rue Nationale 59000 Lille", context: "59, Nord, Hauts-de-France", latitude: 50.6366, longitude: 3.0596),
            AddressSuggestion(label: "1 Rue Nationale 59800 Lille", context: "59, Nord, Hauts-de-France", latitude: 50.6368, longitude: 3.0590),
        ]
        checkSnapshot(
            picker(address: "1 rue nationale lille", addressSearch: .suggestions(suggestions)),
            variant
        )
    }

    /// One sure seat: its deputy is selected and "Suivre" is pinned under it.
    @Test(arguments: Variant.all)
    func addressLocated(_ variant: Variant) {
        let deputy = Self.deputy("PA1", "Une Députée du Nord", "EPR", "Nord", "1")
        let lookup = SeatLookup(uncertain: false, seats: [
            LocatedSeat(departmentCode: "59", circonscription: 1, label: "Nord, 1re circonscription", deputy: deputy),
        ])
        checkSnapshot(
            ScrollView {
                picker(
                    selection: deputy, address: "1 Rue Nationale 59000 Lille",
                    addressSearch: .located(lookup, address: "1 Rue Nationale 59000 Lille")
                )
            }
            .background(Palette.pageBackground)
            .safeAreaInset(edge: .bottom, spacing: 0) { FollowSelectionBar(deputy: deputy) {} },
            variant,
            height: variant.size.isAccessibilityCategory ? 2200 : 900
        )
    }

    /// Near a boundary: both seats, the voter-card hint and the official check;
    /// the second seat is vacant.
    @Test(arguments: Variant.all)
    func addressUncertain(_ variant: Variant) {
        let lookup = SeatLookup(uncertain: true, seats: [
            LocatedSeat(
                departmentCode: "59", circonscription: 1, label: "Nord, 1re circonscription",
                deputy: Self.deputy("PA1", "Une Députée du Nord", "EPR", "Nord", "1")
            ),
            LocatedSeat(departmentCode: "59", circonscription: 4, label: "Nord, 4e circonscription", deputy: nil),
        ])
        checkSnapshot(
            ScrollView {
                picker(
                    address: "2 Place du Général de Gaulle 59000 Lille",
                    addressSearch: .located(lookup, address: "2 Place du Général de Gaulle 59000 Lille")
                )
            }
            .background(Palette.pageBackground),
            variant,
            height: variant.size.isAccessibilityCategory ? 2400 : 1000
        )
    }

    /// The seats abroad, by region (two of the eleven, to keep the image small).
    @Test(arguments: Variant.all)
    func addressAbroad(_ variant: Variant) {
        let seats = [
            LocatedSeat(
                departmentCode: "99", circonscription: 4, label: "Français établis hors de France, 4e circonscription",
                deputy: Self.deputy("PA4", "Un Député du Benelux", "EPR", "Français établis hors de France", "4"),
                region: "Benelux"
            ),
            LocatedSeat(
                departmentCode: "99", circonscription: 6, label: "Français établis hors de France, 6e circonscription",
                deputy: Self.deputy("PA6", "Une Députée de Suisse", "DEM", "Français établis hors de France", "6"),
                region: "Suisse et Liechtenstein"
            ),
        ]
        checkSnapshot(
            ScrollView { picker(addressSearch: .abroad(seats)) }
                .background(Palette.pageBackground),
            variant,
            height: variant.size.isAccessibilityCategory ? 2400 : 1000
        )
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
            height: variant.size.isAccessibilityCategory ? 2800 : 1100
        )
    }
}
