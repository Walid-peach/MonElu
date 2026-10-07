import MonEluCore
import MonEluUI
import SwiftUI

/// The postal-code picker. Separate from the screen so it can be
/// snapshot-tested without a network.
struct PostalCodePickerContent: View {
    @Binding var postalCode: String
    let search: MonDeputeModel.Search
    let notice: String?
    let onSearch: () -> Void
    let onChoose: (DeputyItem) -> Void
    @FocusState private var fieldFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Trouvez votre député")
                    .font(Typography.heading(.title2))
                    .foregroundStyle(Palette.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Text("Saisissez votre code postal. Il sert seulement à trouver votre département auprès de geo.api.gouv.fr ; il n'est ni conservé ni envoyé à MonÉlu.")
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
            field
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
            .font(.title3.monospacedDigit())
            .padding(12)
            .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
            .frame(minWidth: 140)
            .focused($fieldFocused)
            .onSubmit(submit)
            .accessibilityIdentifier("postal.field")
    }

    private var searchButton: some View {
        Button("Rechercher", action: submit)
            .buttonStyle(.borderedProminent)
            .tint(Palette.accent)
            .controlSize(.large)
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
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeader(
                            "\(entry.department.name) (\(entry.department.code))",
                            subtitle: entry.deputies.isEmpty ? "Aucun député en mandat." : "Choisissez votre député."
                        ) {
                            NavigationLink(value: AppRoute.department(code: entry.department.code)) {
                                Text("Voir")
                            }
                            .accessibilityLabel("Voir le département")
                            .accessibilityIdentifier("picker.department")
                        }
                        ForEach(entry.deputies) { deputy in
                            Button { onChoose(deputy) } label: {
                                Card { DeputyRowView(deputy: deputy) }
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("picker.deputy")
                            .accessibilityHint("Suivre ce député")
                        }
                    }
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
