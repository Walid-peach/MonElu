import MonEluCore
import MonEluUI
import SwiftUI

/// The Mon député tab (web: `/mon-depute`): find your deputy from a postal
/// code once, then open on what they voted since your last visit.
public struct MonDeputeScreen: View {
    @State private var model: MonDeputeModel
    @Environment(\.appConfiguration) private var configuration

    public init(deputies: any DeputiesService, postalCodes: any PostalCodeService, store: any FollowedDeputyStore) {
        _model = State(initialValue: MonDeputeModel(deputies: deputies, postalCodes: postalCodes, store: store))
    }

    public var body: some View {
        Group {
            if model.showsPicker {
                picker
            } else if let home = model.home {
                LoadStateView(
                    home,
                    empty: EmptyStateView(title: "Député introuvable", message: "Ce député n'existe pas ou plus.")
                ) { home in
                    ScrollView {
                        MonDeputeHomeContent(home: home, configuration: configuration)
                            .padding(16)
                    }
                }
            }
        }
        .background(Palette.pageBackground)
        .navigationTitle("Mon député")
        .toolbar { toolbar }
        .accessibilityIdentifier("screen.my-deputy")
    }

    private var picker: some View {
        ScrollView {
            PostalCodePickerContent(
                postalCode: $model.postalCode,
                search: model.search,
                notice: model.notice,
                onSearch: { Task { await model.runSearch() } },
                onChoose: { model.choose($0) }
            )
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        if model.isChanging {
            ToolbarItem(placement: .cancellationAction) {
                Button("Annuler") { model.cancelChange() }
            }
        } else if model.followedID != nil {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("Changer de député", systemImage: "arrow.left.arrow.right") { model.startChange() }
                    Button("Ne plus suivre", systemImage: "person.badge.minus", role: .destructive) { model.unfollow() }
                } label: {
                    Label("Options", systemImage: "ellipsis.circle")
                }
                .accessibilityIdentifier("monDepute.options")
            }
        }
    }
}
