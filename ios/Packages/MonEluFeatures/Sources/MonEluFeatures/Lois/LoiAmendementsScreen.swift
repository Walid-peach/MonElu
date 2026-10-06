import MonEluCore
import MonEluUI
import SwiftUI

/// The amendment and article scrutins of a bill, or of one step of its
/// parcours. The bill page only counts them (ADR-035 §4); this lists them.
public struct LoiAmendementsScreen: View {
    @State private var loader: Loader<LoiAmendements>

    public init(id: String, acteID: String?, service: any LoisService) {
        _loader = State(initialValue: Loader(isEmpty: { $0.items.isEmpty }) {
            try await service.amendements(dossierID: id, acteID: acteID)
        })
    }

    public var body: some View {
        LoadStateView(
            loader,
            empty: EmptyStateView(
                title: "Aucun amendement voté",
                message: "Aucun scrutin sur un amendement ou un article n'est rattaché à cette étape.",
                systemImage: "list.bullet"
            )
        ) { amendements in
            LoiAmendementsList(amendements: amendements)
        }
        .navigationTitle("Amendements et articles")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The loaded list, separate from loading so it can be snapshot-tested.
struct LoiAmendementsList: View {
    let amendements: LoiAmendements

    var body: some View {
        List {
            Section {
                ForEach(amendements.items) { scrutin in
                    NavigationLink(value: AppRoute.vote(id: scrutin.id)) {
                        LoiScrutinRow(scrutin: scrutin)
                            .padding(.vertical, 4)
                    }
                    .listRowBackground(Palette.cardBackground)
                    .accessibilityIdentifier("loi.amendement")
                }
            } header: {
                Text("\(MonEluFormat.count(amendements.total)) scrutin\(amendements.total > 1 ? "s" : "")")
                    .font(.footnote)
                    .foregroundStyle(Palette.textSecondary)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Palette.pageBackground)
        .accessibilityIdentifier("screen.loiAmendements")
    }
}
