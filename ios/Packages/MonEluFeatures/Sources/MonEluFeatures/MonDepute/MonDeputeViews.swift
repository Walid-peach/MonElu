import MonEluCore
import MonEluUI
import SwiftUI

/// The postal-code picker (design A, Trouver son député). Separate from the
/// screen so it can be snapshot-tested without a network. A tap selects a
/// deputy; `FollowSelectionBar`, pinned under the results, follows them.
struct PostalCodePickerContent: View {
    @Binding var postalCode: String
    let search: MonDeputeModel.Search
    let notice: String?
    var selection: DeputyItem?
    let onSearch: () -> Void
    let onSelect: (DeputyItem) -> Void
    @FocusState private var fieldFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Trouvez votre député")
                    .font(Typography.heading(.title))
                    .foregroundStyle(Palette.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Text("Pour suivre ses votes depuis l'accueil.")
                    .font(.subheadline)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let notice {
                Card {
                    Label(notice, systemImage: "exclamationmark.circle")
                        .font(.subheadline)
                        .foregroundStyle(Palette.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("Code postal")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Palette.textSecondary)
                    .accessibilityHidden(true)
                field
                CaveatNote(
                    "Il sert seulement à trouver votre département auprès de geo.api.gouv.fr ; il n'est ni conservé ni envoyé à MonÉlu."
                )
                .padding(.top, 4)
            }
            status
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("monDepute.picker")
    }

    private var field: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { textField; searchButton }
            VStack(alignment: .leading, spacing: 10) { textField; searchButton }
        }
    }

    private var textField: some View {
        TextField("Code postal", text: $postalCode)
            .keyboardType(.numberPad)
            .textContentType(.postalCode)
            .font(.title2.monospacedDigit())
            .tracking(3)
            .padding(.horizontal, 14)
            .frame(minHeight: 50)
            .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.textPrimary, lineWidth: 2)
            )
            .frame(minWidth: 140)
            .focused($fieldFocused)
            .onSubmit(submit)
            .accessibilityIdentifier("postal.field")
    }

    private var searchButton: some View {
        Button(action: submit) {
            Text("Rechercher")
                .font(.body.weight(.semibold))
                .padding(.horizontal, 18)
                .frame(minHeight: 50)
                .foregroundStyle(Palette.onAccent)
                .background(Palette.accent, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
            .disabled(search == .searching)
            .accessibilityIdentifier("postal.search")
    }

    /// The number pad has no return key and would stay over the results.
    private func submit() {
        fieldFocused = false
        onSearch()
    }

    @ViewBuilder private var status: some View {
        switch search {
        case .idle:
            EmptyView()
        case .invalid:
            message("Un code postal compte cinq chiffres.", systemImage: "exclamationmark.triangle")
        case .searching:
            ProgressView()
                .tint(Palette.accent)
                .frame(maxWidth: .infinity)
        case .unknown:
            message("Aucune commune ne correspond à ce code postal.", systemImage: "mappin.slash")
        case .failed(let failure):
            message(
                failure == .offline
                    ? "Hors connexion : la recherche n'a pas pu aboutir."
                    : "La recherche n'a pas pu aboutir. Réessayez dans un instant.",
                systemImage: failure == .offline ? "wifi.slash" : "exclamationmark.triangle"
            )
        case .found(let departments):
            VStack(alignment: .leading, spacing: 20) {
                ForEach(departments) { entry in
                    DepartmentResults(entry: entry, selection: selection, onSelect: onSelect)
                }
            }
        }
    }

    private func message(_ text: String, systemImage: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(.subheadline)
            .foregroundStyle(Palette.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// One département's deputies for the postal code: where the code is, then
/// each deputy by circonscription, the selected one checked.
struct DepartmentResults: View {
    let entry: DepartmentDeputies
    let selection: DeputyItem?
    let onSelect: (DeputyItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "mappin.and.ellipse")
                    .font(.title3)
                    .foregroundStyle(Palette.accent)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(Self.place(entry.department))
                        .font(.headline)
                        .foregroundStyle(Palette.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                    Text(Self.detail(entry))
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                NavigationLink(value: AppRoute.department(code: entry.department.code)) {
                    Text("Voir")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Palette.accent)
                }
                .accessibilityLabel("Voir le département")
                .accessibilityIdentifier("picker.department")
            }
            if !entry.deputies.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(Self.bySeat(entry.deputies).enumerated()), id: \.element.id) { index, deputy in
                        if index > 0 { Divider().overlay(Palette.border) }
                        PickerDeputyRow(deputy: deputy, isSelected: deputy.id == selection?.id) {
                            onSelect(deputy)
                        }
                    }
                }
                .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
            }
        }
    }

    /// The postal code's communes in this département, or its name when
    /// geo.api.gouv.fr returned none: "Saint-Denis", "Claret, Curbans".
    static func place(_ department: PostalDepartment) -> String {
        let communes = department.communes
        switch communes.count {
        case 0: return "\(department.name) (\(department.code))"
        case 1...3: return communes.joined(separator: ", ")
        default: return "\(communes.prefix(2).joined(separator: ", ")) et \(communes.count - 2) autres communes"
        }
    }

    /// "Seine-Saint-Denis · 12 députés · choisissez le vôtre".
    static func detail(_ entry: DepartmentDeputies) -> String {
        let count = entry.deputies.count
        let deputies = switch count {
        case 0: "aucun député en mandat"
        case 1: "1 député · choisissez-le"
        default: "\(count) députés · choisissez le vôtre"
        }
        let place = entry.department.communes.isEmpty ? nil : "\(entry.department.name) (\(entry.department.code))"
        return [place, deputies].compactMap { $0 }.joined(separator: " · ")
    }

    /// By circonscription number, as the département is drawn.
    static func bySeat(_ deputies: [DeputyItem]) -> [DeputyItem] {
        deputies.enumerated().sorted { a, b in
            let (x, y) = (a.element.circonscription.flatMap(Int.init), b.element.circonscription.flatMap(Int.init))
            switch (x, y) {
            case let (x?, y?) where x != y: return x < y
            case (_?, nil): return true
            case (nil, _?): return false
            default: return a.offset < b.offset
            }
        }
        .map(\.element)
    }
}

/// A deputy in the results: portrait, name, seat and group; checked when selected.
struct PickerDeputyRow: View {
    let deputy: DeputyItem
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                DeputyPortrait(name: deputy.name, url: deputy.photoURL, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(deputy.name)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Palette.textPrimary)
                    if let seat = deputy.seat {
                        Text(seat)
                            .font(.footnote)
                            .foregroundStyle(Palette.textSecondary)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                if let short = deputy.groupShort {
                    PartyChip(short: short)
                }
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.bold))
                        .foregroundStyle(Palette.accent)
                        .accessibilityHidden(true)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(minHeight: 44)
            .background(isSelected ? Palette.trackBackground : .clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityHint("Sélectionne ce député")
        .accessibilityIdentifier("picker.deputy")
    }
}

/// The pinned confirmation under the results: follows the selected deputy.
struct FollowSelectionBar: View {
    let deputy: DeputyItem
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text("Suivre \(deputy.name)")
                .font(.body.weight(.semibold))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, minHeight: 50)
                .padding(.horizontal, 18)
                .foregroundStyle(Palette.onAccent)
                .background(Palette.accent, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Palette.pageBackground.opacity(0.94))
        .overlay(alignment: .top) { Divider().overlay(Palette.border) }
        .accessibilityIdentifier("picker.follow")
    }
}
