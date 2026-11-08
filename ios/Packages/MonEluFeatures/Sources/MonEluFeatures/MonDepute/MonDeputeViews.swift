import MonEluCore
import MonEluUI
import SwiftUI

/// The picker (design A, Trouver son député): the address first (ADR-047),
/// then the postal code. Separate from the screen so it can be
/// snapshot-tested without a network. A tap selects a deputy;
/// `FollowSelectionBar`, pinned under the results, follows them.
struct PostalCodePickerContent: View {
    @Binding var address: String
    let addressSearch: MonDeputeModel.AddressSearch
    @Binding var postalCode: String
    let search: MonDeputeModel.Search
    let notice: String?
    var selection: DeputyItem?
    let onPickAddress: (AddressSuggestion) -> Void
    let onAbroad: () -> Void
    let onSearch: () -> Void
    let onSelect: (DeputyItem) -> Void
    @FocusState private var fieldFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: Spacing.xxs) {
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
            AddressSearchSection(
                address: $address, search: addressSearch, selection: selection,
                onPick: onPickAddress, onAbroad: onAbroad, onSelect: onSelect
            )
            VStack(alignment: .leading, spacing: 6) {
                Text("Ou par code postal, pour la liste des députés du département")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityHidden(true)
                field
                CaveatNote(
                    "Il sert seulement à trouver votre département auprès de geo.api.gouv.fr ; il n'est ni conservé ni envoyé à MonÉlu."
                )
                .padding(.top, Spacing.xxs)
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
            .padding(.horizontal, Spacing.m)
            .frame(minHeight: 50)
            .background(Palette.cardBackground, in: Radius.shape(Radius.card))
            .overlay(
                Radius.shape(Radius.card).strokeBorder(Palette.textPrimary, lineWidth: 2)
            )
            .frame(minWidth: 140)
            .focused($fieldFocused)
            .onSubmit(submit)
            .accessibilityIdentifier("postal.field")
    }

    private var searchButton: some View {
        Button(action: submit) {
            Text("Rechercher")
        }
        .buttonStyle(PrimaryButtonStyle(fullWidth: false))
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

/// The address search (ADR-047): the field, its suggestions, then the seat
/// found, every seat near a boundary, or the 11 seats abroad.
struct AddressSearchSection: View {
    @Binding var address: String
    let search: MonDeputeModel.AddressSearch
    let selection: DeputyItem?
    let onPick: (AddressSuggestion) -> Void
    let onAbroad: () -> Void
    let onSelect: (DeputyItem) -> Void
    /// The keyboard goes away once an address is picked, so the result and
    /// the pinned "Suivre" are not hidden under it.
    @FocusState private var fieldFocused: Bool

    /// The official check of one's polling station and circonscription.
    static let situationElectorale = URL(
        string: "https://www.service-public.gouv.fr/particuliers/vosdroits/services-en-ligne-et-formulaires/ISE"
    )!

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Votre adresse")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Palette.textSecondary)
                    .accessibilityHidden(true)
                // Vertical so a long address wraps at large text sizes.
                TextField("Ex. 8 boulevard du Port, Amiens", text: $address, axis: .vertical)
                    .lineLimit(1...4)
                    .textContentType(.fullStreetAddress)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .focused($fieldFocused)
                    .onSubmit { fieldFocused = false }
                    .font(.body)
                    .padding(.horizontal, Spacing.m)
                    .padding(.vertical, Spacing.s)
                    .frame(minHeight: 50)
                    .background(Palette.cardBackground, in: Radius.shape(Radius.card))
                    .overlay(Radius.shape(Radius.card).strokeBorder(Palette.textPrimary, lineWidth: 2))
                    .accessibilityLabel("Votre adresse")
                    .accessibilityIdentifier("address.field")
                CaveatNote(
                    "Votre adresse est envoyée à la Base Adresse Nationale, un service public, pour trouver ses coordonnées. MonÉlu ne reçoit que ces coordonnées et ne les conserve pas."
                )
                .padding(.top, Spacing.xxs)
            }
            result
            Button("J'habite à l'étranger") {
                fieldFocused = false
                onAbroad()
            }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Palette.accent)
                .frame(minHeight: 44)
                .accessibilityIdentifier("address.abroad")
        }
    }

    @ViewBuilder private var result: some View {
        switch search {
        case .idle:
            EmptyView()
        case .suggestions(let suggestions):
            if suggestions.isEmpty {
                message(
                    "Indiquez le numéro, la rue et la commune, par exemple « 8 boulevard du Port, Amiens ».",
                    systemImage: "mappin.slash"
                )
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(suggestions.enumerated()), id: \.element.id) { index, suggestion in
                        if index > 0 { CardRowDivider() }
                        Button {
                            fieldFocused = false
                            onPick(suggestion)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(suggestion.label)
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(Palette.textPrimary)
                                if !suggestion.context.isEmpty {
                                    Text(suggestion.context)
                                        .font(.footnote)
                                        .foregroundStyle(Palette.textSecondary)
                                }
                            }
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            .padding(.horizontal, Spacing.m)
                            .padding(.vertical, Spacing.xs)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("address.suggestion")
                    }
                }
                .clipShape(Radius.shape(Radius.card))
                .surface()
            }
        case .suggestionsUnavailable:
            message(
                "Les suggestions d'adresse sont indisponibles pour le moment. Cherchez par code postal ci-dessous.",
                systemImage: "exclamationmark.triangle"
            )
        case .locating, .loadingAbroad:
            ProgressView()
                .tint(Palette.accent)
                .frame(maxWidth: .infinity)
                .accessibilityLabel(search == .locating ? "Recherche de votre circonscription" : "Chargement")
        case .located(let lookup, let address):
            VStack(alignment: .leading, spacing: Spacing.s) {
                if lookup.uncertain {
                    VStack(alignment: .leading, spacing: Spacing.xxs) {
                        Text(
                            "« \(address) » est tout près de la limite entre \(lookup.seats.count) circonscriptions, et notre carte n'est pas assez précise pour trancher. Votre circonscription est indiquée sur votre carte électorale."
                        )
                        .font(.subheadline)
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        Link("Interroger sa situation électorale", destination: Self.situationElectorale)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Palette.accent)
                    }
                }
                SeatResults(seats: lookup.seats, selection: selection, onSelect: onSelect)
            }
        case .notFound(let address):
            message(
                "Nous n'avons pas trouvé de circonscription pour « \(address) ». Pour la Nouvelle-Calédonie, la Polynésie française, Wallis-et-Futuna, Saint-Barthélemy et Saint-Martin, cherchez par code postal.",
                systemImage: "mappin.slash"
            )
        case .failed(let failure):
            message(
                failure == .offline
                    ? "Hors connexion : la recherche n'a pas pu aboutir."
                    : "La recherche n'a pas pu aboutir. Réessayez dans un instant.",
                systemImage: failure == .offline ? "wifi.slash" : "exclamationmark.triangle"
            )
        case .abroad(let seats):
            VStack(alignment: .leading, spacing: Spacing.s) {
                Text(
                    "Les Français établis hors de France élisent \(seats.count) députés, chacun pour une région du monde. En cas de doute sur la vôtre, votre consulat vous l'indique."
                )
                .font(.subheadline)
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
                SeatResults(seats: seats, selection: selection, onSelect: onSelect)
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

/// The seats an address or the abroad list found, each with its deputy, or
/// saying it is vacant.
struct SeatResults: View {
    let seats: [LocatedSeat]
    let selection: DeputyItem?
    let onSelect: (DeputyItem) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(seats.enumerated()), id: \.element.id) { index, seat in
                if index > 0 { CardRowDivider() }
                VStack(alignment: .leading, spacing: 0) {
                    Text(seat.region ?? seat.label)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, Spacing.m)
                        .padding(.top, Spacing.s)
                    if !seat.vacant, let deputy = seat.deputy {
                        PickerDeputyRow(deputy: deputy, isSelected: deputy.id == selection?.id) {
                            onSelect(deputy)
                        }
                    } else {
                        Text("Ce siège est vacant : aucun député ne le représente jusqu'à une élection partielle.")
                            .font(.subheadline)
                            .foregroundStyle(Palette.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, Spacing.m)
                            .padding(.vertical, Spacing.s)
                    }
                }
                .accessibilityElement(children: .contain)
            }
        }
        .clipShape(Radius.shape(Radius.card))
        .surface()
        .accessibilityIdentifier("address.results")
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
            HStack(alignment: .top, spacing: Spacing.xs) {
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
                        if index > 0 { CardRowDivider() }
                        PickerDeputyRow(deputy: deputy, isSelected: deputy.id == selection?.id) {
                            onSelect(deputy)
                        }
                    }
                }
                .clipShape(Radius.shape(Radius.card))
                .surface()
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
            HStack(spacing: Spacing.s) {
                DeputyPortrait(name: deputy.name, url: deputy.photoURL, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(deputy.name)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Palette.textPrimary)
                        .multilineTextAlignment(.leading)
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
            .padding(.horizontal, Spacing.m)
            .padding(.vertical, Spacing.s)
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
        // The bar's margins and background belong to a container, not to the
        // button: on the button they made its frame reach down behind the
        // floating tab bar, so its centre - where Maestro and VoiceOver tap -
        // was the Explorer tab (#518).
        VStack(spacing: 0) {
            Button(action: action) {
                Text("Suivre \(deputy.name)")
            }
            .buttonStyle(.monEluPrimary)
            .accessibilityIdentifier("picker.follow")
        }
        .padding(.horizontal, Spacing.gutter)
        .padding(.vertical, Spacing.s)
        // A blur tinted with the page colour: the list scrolls behind it
        // softened, so the bar needs no rule (#629). The system `.bar` alone
        // is a neutral grey that clashes with the cream and navy pages.
        // Two shape styles rather than a view, so both reach under the
        // floating tab bar into the safe area, as the plain fill did.
        .background(Palette.pageBackground.opacity(0.8))
        .background(.ultraThinMaterial)
        .accessibilityElement(children: .contain)
    }
}
