import MonEluCore
import MonEluUI
import SwiftUI

/// Explorer's deputy list: every deputy, by name, with search and a group
/// filter (web: `/deputes`). Explorer owns the model, so the search and
/// filter survive switching to the votes and back.
public struct DeputiesListScreen: View {
    @Bindable private var model: DeputiesListModel

    public init(model: DeputiesListModel) {
        self.model = model
    }

    public var body: some View {
        // The filter sits above the list rather than in a top safe-area
        // inset: an inset over a List leaves the large title blank (#477).
        VStack(spacing: 0) {
            GroupFilter(groups: model.groups, selection: $model.groupSlug, selectedName: model.groupName)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            LoadStateView(
                model.loader,
                empty: EmptyStateView(
                    title: "Aucun député",
                    message: "Aucun député ne correspond à cette recherche.",
                    systemImage: "magnifyingglass"
                )
            ) { deputies in
                DeputiesList(
                    deputies: deputies, isLoadingMore: model.isLoadingMore, loadMoreFailure: model.loadMoreFailure
                ) {
                    await model.loadMore()
                }
            }
        }
        .background(Palette.pageBackground)
        .searchable(text: $model.searchText, prompt: "Rechercher un député")
        .autocorrectionDisabled()
        // Reload when the search or group changes, after a pause so typing
        // does not send one request per letter.
        .task(id: model.criteria) {
            guard model.needsReload else { return }
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            await model.reload()
        }
        .accessibilityIdentifier("screen.deputies")
    }
}

/// The group filter: a menu, since twelve groups do not fit a segmented control.
struct GroupFilter: View {
    let groups: [ReferenceData.Group]
    @Binding var selection: String?
    let selectedName: String?

    var body: some View {
        Menu {
            Picker("Groupe", selection: $selection) {
                Text("Tous les groupes").tag(String?.none)
                ForEach(groups) { Text($0.name).tag(Optional($0.slug)) }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "line.3.horizontal.decrease.circle")
                    .accessibilityHidden(true)
                Text(selectedName ?? "Tous les groupes")
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Image(systemName: "chevron.down")
                    .font(.caption.weight(.semibold))
                    .accessibilityHidden(true)
            }
            .font(.subheadline.weight(.medium))
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .tint(Palette.accent)
        .accessibilityLabel("Groupe")
        .accessibilityValue(selectedName ?? "Tous les groupes")
        .accessibilityIdentifier("deputies.group-filter")
    }
}

/// The loaded list. Separate from the screen so it can be snapshot-tested
/// without a network.
struct DeputiesList: View {
    let deputies: [DeputyItem]
    let isLoadingMore: Bool
    var loadMoreFailure: LoadFailure?
    let loadMore: () async -> Void

    var body: some View {
        List {
            ForEach(deputies) { deputy in
                NavigationLink(value: AppRoute.deputy(id: deputy.id)) {
                    DeputyRowView(deputy: deputy)
                }
                .listRowBackground(Palette.cardBackground)
                .accessibilityIdentifier("deputy.row")
                .task {
                    // Not after a failure: the footer's retry decides, so a
                    // dead connection is not retried on every scroll.
                    if deputy.id == deputies.last?.id, loadMoreFailure == nil { await loadMore() }
                }
            }
            if let loadMoreFailure {
                VStack(alignment: .leading, spacing: 8) {
                    Text(
                        loadMoreFailure == .offline
                            ? "Hors connexion : la suite n'a pas pu être chargée."
                            : "La suite n'a pas pu être chargée."
                    )
                    .font(.footnote)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    Button("Charger la suite") { Task { await loadMore() } }
                        .buttonStyle(.bordered)
                        .tint(Palette.accent)
                }
                .listRowBackground(Palette.pageBackground)
                .accessibilityIdentifier("deputies.load-more-failed")
            }
            if isLoadingMore {
                ProgressView()
                    .tint(Palette.accent)
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Palette.pageBackground)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Palette.pageBackground)
        .accessibilityIdentifier("deputies.list")
    }
}
